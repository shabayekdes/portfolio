---
title: "Laravel queue jobs that don't bite: idempotency, retries and timeouts"
date: 2026-10-22 11:00:00 +0300
description: Why queued jobs run twice, charge customers twice, or vanish silently, and the handful of settings and habits that prevent it.
tags: [Laravel, Queues, Reliability]
---

Moving work to a queue makes requests fast, but it also changes what you can assume. A queued job can run **more than once**, run **before** the data it needs is committed, or fail quietly at 3 a.m. Laravel gives you tools for all of these. You just have to use them on purpose.

Here's a checklist of the things I look at when a job touches money, messages, or anything else a customer would notice.

## 1. Assume every job runs at least twice

Queues guarantee *at-least-once* delivery, not exactly-once. A worker can finish the work and then crash before acknowledging the job, a deploy can kill a worker mid-run, or a timeout can release the job back onto the queue while the first attempt is still running. In each case the job runs again.

So the question to ask about every job is: **what happens if `handle()` runs twice?** If the answer is "the customer gets charged twice", the job has to be idempotent.

```php
public function handle(PaymentGateway $gateway): void
{
    $order = $this->order->fresh();

    if ($order->paid_at !== null) {
        return; // already done on a previous attempt
    }

    $charge = $gateway->charge(
        amount: $order->total,
        idempotencyKey: "order-{$order->id}",
    );

    $order->update(['paid_at' => now(), 'charge_id' => $charge->id]);
}
```

Two layers protect this job:

- **A state check** at the top (`paid_at`), re-read with `fresh()` so it isn't stale.
- **An idempotency key** sent to the provider. Most payment APIs (Stripe, for example) accept one and return the original result instead of charging again. This covers the gap where the charge succeeded but the update afterwards didn't.

`ShouldBeUnique` is related but different. It stops the *same job from being queued twice* while one copy is still waiting. It doesn't make `handle()` safe to re-run, so you need both.

## 2. Don't dispatch inside an open transaction

This is one of the most common queue bugs, and it's easy to miss in review:

```php
DB::transaction(function () use ($data) {
    $order = Order::create($data);
    SendOrderConfirmation::dispatch($order); // ⚠️
});
```

A fast worker can pick up the job *before the transaction commits*. The job then looks up an order that doesn't exist yet and fails, or it sends a confirmation for an order that later gets rolled back.

Dispatch only after the commit:

```php
SendOrderConfirmation::dispatch($order)->afterCommit();
```

Or make it the default for the whole connection in `config/queue.php`:

```php
'redis' => [
    // ...
    'after_commit' => true,
],
```

## 3. Get timeouts in the right order

There are three timeouts in play, and their *order* matters more than their values:

```
HTTP call timeout  <  job $timeout  <  queue retry_after
```

- **`retry_after`** (in `config/queue.php`) is how long the queue waits before assuming a job is lost and handing it to another worker.
- **`$timeout`** on the job (or `--timeout` on the worker) is how long a worker lets the job run before killing it.
- **HTTP timeouts** decide how long a single outgoing call can hang.

If `$timeout` is *longer* than `retry_after`, a slow job gets handed to a second worker while the first is still running it, and you get duplicates even with no crash at all. If outgoing calls have no timeout, one slow provider can hold a worker for the whole job timeout.

```php
final class SyncInvoiceToErp implements ShouldQueue
{
    public int $timeout = 120; // retry_after for this queue is 180

    public function handle(): void
    {
        Http::timeout(15)->connectTimeout(5)->post(/* ... */);
    }
}
```

If some jobs are much slower than others, give them their own queue and connection with a larger `retry_after`, rather than raising it for everything.

## 4. Retry the right failures, the right way

Not every exception should be retried. A provider returning 503 will probably recover. A validation error or "card declined" won't, and retrying it just wastes attempts and spams logs.

In the example below, `SmsGateway` and its response methods stand in for your own provider wrapper. The Laravel parts are `$tries`, `backoff()`, `release()`, `fail()` and `failed()`.

```php
final class SendSms implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;

    public function backoff(): array
    {
        return [10, 60, 300, 900]; // seconds between attempts
    }

    public function handle(SmsGateway $sms): void
    {
        $response = $sms->send($this->phone, $this->message);

        if ($response->isRateLimited()) {
            $this->release($response->retryAfter() ?? 30);
            return;
        }

        if ($response->isPermanentFailure()) {
            $this->fail(new InvalidRecipient($this->phone));
            return;
        }

        $response->throwIfServerError(); // transient: let the retry policy handle it
    }

    public function failed(Throwable $e): void
    {
        // the last word: alert, mark the record, notify the user
    }
}
```

- `backoff()` spaces retries out instead of hammering a struggling provider.
- `release()` puts the job back on the queue with a delay, for rate limits that tell you how long to wait.
- `fail()` stops retrying immediately for failures that will never succeed.
- `failed()` runs once when the job is finally given up on. It's the place to record the failure somewhere a human will see it.

For time-sensitive work, `retryUntil()` is often better than a fixed `$tries`: a login code that arrives 40 minutes late is worse than useless.

```php
public function retryUntil(): DateTime
{
    return now()->addMinutes(5);
}
```

## 5. Use job middleware for cross-cutting rules

Laravel ships middleware that keeps these concerns out of `handle()`:

```php
use Illuminate\Queue\Middleware\RateLimited;
use Illuminate\Queue\Middleware\ThrottlesExceptions;
use Illuminate\Queue\Middleware\WithoutOverlapping;

public function middleware(): array
{
    return [
        new WithoutOverlapping($this->order->id),   // one job per order at a time
        new RateLimited('sms'),                     // respects a named RateLimiter
        new ThrottlesExceptions(5, 10 * 60),        // back off after repeated errors
    ];
}
```

`ThrottlesExceptions` is especially useful for third-party outages. After a few failures it stops calling the provider for a while, instead of burning through every job's retries in a few seconds.

## 6. Watch out for models that disappear

`SerializesModels` stores only the model's ID and re-fetches it when the job runs. If the record was deleted in the meantime, the job throws `ModelNotFoundException` and fails. When that's expected (a user deleted their account, so skip the welcome email), say so:

```php
public bool $deleteWhenMissingModels = true;
```

The same re-fetch also means the job sees the model as it is *when the job runs*, not as it was when dispatched. That's usually what you want. If it isn't, pass the specific values the job needs instead.

## 7. Make failures visible

A queue you can't see is a queue that fails silently. At a minimum:

- Keep the `failed_jobs` table, and alert when it grows.
- Use [Horizon](https://laravel.com/docs/horizon) for Redis queues to see throughput, wait times and failures per queue.
- Monitor **queue wait time**, not just failures. A job that succeeds 20 minutes late is still a problem for a password reset.

## The checklist

Before merging a new job, ask:

1. Is `handle()` safe to run twice?
2. Is it dispatched after the transaction commits?
3. Is `HTTP timeout < job timeout < retry_after`?
4. Are permanent failures failed immediately, and transient ones backed off?
5. Does `failed()` leave a trace a human will see?
6. Is there a queue dashboard or alert that would show this job falling behind?

Six questions, and most of the 3 a.m. queue incidents disappear.
