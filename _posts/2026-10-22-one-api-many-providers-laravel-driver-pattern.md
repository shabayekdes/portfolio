---
title: "One API, many providers: the driver pattern in Laravel"
date: 2026-10-22 09:00:00 +0300
description: How to put SMS, payment or storage providers behind a single clean interface using Laravel's Manager class, with failover and painless testing.
tags: [Laravel, PHP, Architecture]
---

Sooner or later every SaaS product integrates with a provider it will eventually want to replace. The SMS gateway gets expensive in one country, the payment provider doesn't support a new market, or a client insists on their own account. If provider calls are scattered across controllers and jobs, that switch turns into a rewrite.

Laravel itself solves this problem many times over: `Mail`, `Cache`, `Queue`, `Filesystem` and `Session` all let you change the backend with one line of config. They share a small, reusable base class, `Illuminate\Support\Manager`, and you can use the same pattern in your own code. It's the approach behind open-source packages like [laravel-sms](https://github.com/shabayekdes/laravel-sms) and [laravel-payment](https://github.com/shabayekdes/laravel-payment), which put several providers behind one API.

This post builds an SMS module step by step, but the shape is identical for payments, KYC, maps, or anything else with more than one vendor.

## 1. Start with the contract, not the provider

The interface is the most important decision, so design it around what *your application* needs, not around the first provider's SDK.

```php
namespace App\Sms;

interface SmsDriver
{
    public function send(string $to, string $message): SmsResult;
}
```

```php
namespace App\Sms;

final class SmsResult
{
    public function __construct(
        public readonly bool $ok,
        public readonly ?string $providerId = null,
        public readonly ?string $error = null,
    ) {}
}
```

Two rules keep the contract honest:

- **Return your own types.** If `send()` returns a Twilio response object, every caller now depends on Twilio.
- **Keep it small.** Add a method only when a second provider can implement it too. Provider-specific extras belong on the concrete driver, not the interface.

## 2. Write one driver per provider

Each driver translates the contract into one vendor's API. Laravel's HTTP client keeps them short:

```php
namespace App\Sms\Drivers;

use App\Sms\SmsDriver;
use App\Sms\SmsResult;
use Illuminate\Support\Facades\Http;

final class TwilioDriver implements SmsDriver
{
    public function __construct(private array $config) {}

    public function send(string $to, string $message): SmsResult
    {
        $sid = $this->config['sid'];

        $response = Http::withBasicAuth($sid, $this->config['token'])
            ->asForm()
            ->timeout(10)
            ->post("https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json", [
                'To' => $to,
                'From' => $this->config['from'],
                'Body' => $message,
            ]);

        return new SmsResult(
            ok: $response->successful(),
            providerId: $response->json('sid'),
            error: $response->failed() ? $response->json('message') : null,
        );
    }
}
```

A `LogDriver` that just writes the message to the log is worth adding on day one. It's what local development and CI use, and it means nobody accidentally texts a real customer from a laptop.

## 3. Let `Manager` do the wiring

`Manager` resolves drivers by name, caches the instances, and forwards unknown method calls to the default driver. You only describe how to build each one:

```php
namespace App\Sms;

use App\Sms\Drivers\LogDriver;
use App\Sms\Drivers\TwilioDriver;
use App\Sms\Drivers\VonageDriver;
use Illuminate\Support\Manager;
use Psr\Log\LoggerInterface;

class SmsManager extends Manager
{
    public function getDefaultDriver(): string
    {
        return $this->config->get('sms.default', 'log');
    }

    protected function createTwilioDriver(): SmsDriver
    {
        return new TwilioDriver($this->config->get('sms.drivers.twilio'));
    }

    protected function createVonageDriver(): SmsDriver
    {
        return new VonageDriver($this->config->get('sms.drivers.vonage'));
    }

    protected function createLogDriver(): SmsDriver
    {
        return new LogDriver($this->container->make(LoggerInterface::class));
    }
}
```

The naming convention does the rest: `driver('twilio')` calls `createTwilioDriver()`.

The config file mirrors Laravel's own:

```php
// config/sms.php
return [
    'default' => env('SMS_DRIVER', 'log'),

    'drivers' => [
        'twilio' => [
            'sid' => env('TWILIO_SID'),
            'token' => env('TWILIO_TOKEN'),
            'from' => env('TWILIO_FROM'),
        ],
        'vonage' => [
            'key' => env('VONAGE_KEY'),
            'secret' => env('VONAGE_SECRET'),
            'from' => env('VONAGE_FROM'),
        ],
    ],
];
```

Register the manager as a singleton and, if you like, add a facade:

```php
// AppServiceProvider::register()
$this->app->singleton(SmsManager::class, fn ($app) => new SmsManager($app));
```

```php
namespace App\Sms\Facades;

use Illuminate\Support\Facades\Facade;

class Sms extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return \App\Sms\SmsManager::class;
    }
}
```

Application code now looks like this, and never mentions a vendor:

```php
Sms::send($user->phone, "Your code is {$code}");

// or pick one explicitly
Sms::driver('vonage')->send($user->phone, $message);
```

## 4. Add providers without touching the manager

`Manager` also supports runtime extension, which is how a package lets its users plug in a provider it doesn't ship:

```php
// in any service provider's boot()
Sms::extend('local-gateway', function ($app) {
    return new LocalGatewayDriver(config('sms.drivers.local-gateway'));
});
```

## 5. Failover is just another driver

Because every driver implements the same contract, cross-provider behaviour can be built *out of* drivers. A failover driver tries each provider in order:

```php
final class FailoverDriver implements SmsDriver
{
    /** @param SmsDriver[] $drivers */
    public function __construct(private array $drivers) {}

    public function send(string $to, string $message): SmsResult
    {
        $result = new SmsResult(ok: false, error: 'No drivers configured');

        foreach ($this->drivers as $driver) {
            $result = $driver->send($to, $message);

            if ($result->ok) {
                return $result;
            }
        }

        return $result;
    }
}
```

```php
protected function createFailoverDriver(): SmsDriver
{
    $names = $this->config->get('sms.failover', ['twilio', 'vonage']);

    return new FailoverDriver(array_map(fn ($name) => $this->driver($name), $names));
}
```

Routing by country, A/B testing two vendors, or picking the cheapest provider per region follow the same idea: they're drivers made of drivers, and callers don't change.

## 6. Testing gets easy

Tests should never hit a real provider. Swap in a fake that records what was sent:

```php
final class FakeSmsDriver implements SmsDriver
{
    public array $sent = [];

    public function send(string $to, string $message): SmsResult
    {
        $this->sent[] = compact('to', 'message');

        return new SmsResult(ok: true, providerId: 'fake-'.count($this->sent));
    }
}
```

```php
public function test_login_code_is_texted(): void
{
    $fake = new FakeSmsDriver();
    Sms::extend('fake', fn () => $fake);
    config(['sms.default' => 'fake']);

    $this->post('/login/code', ['phone' => '+201000000000']);

    $this->assertCount(1, $fake->sent);
    $this->assertStringContainsString('Your code is', $fake->sent[0]['message']);
}
```

Each real driver gets its own small test using `Http::fake()`, which checks the request it sends and how it maps the response, without going over the network.

## When it's worth it

This pattern costs a handful of small classes. It pays off as soon as you have, or can see coming, a second provider, a per-tenant provider choice, or a need for failover. For a single provider you'll never replace, a well-named service class is enough. You can introduce the interface later, as long as callers already go through one class instead of calling the SDK directly.

The real win isn't the `Manager` class. It's that the decision of *which vendor* lives in one config value instead of being spread across the codebase.
