---
title: "Multi-tenant SaaS in Laravel: isolation that fails closed"
date: 2026-10-22 10:00:00 +0300
description: Picking a tenancy model, scoping every query to the current tenant, and the places tenant data quietly leaks — queues, cache, files and raw queries.
tags: [Laravel, SaaS, Architecture, PostgreSQL]
---

In a multi-tenant product, the worst bug isn't downtime. It's customer A seeing customer B's invoices. Most tenant-isolation bugs aren't clever. They happen when a query, job or cache key simply forgets which tenant it belongs to.

This post covers how to choose a tenancy model, how to make tenant scoping the default instead of something each developer has to remember, and the less obvious places where data leaks between tenants.

## Choosing a tenancy model

There are three common designs, and each one trades isolation against operational cost:

| Model | Isolation | Cost to operate | Good fit |
|-------|-----------|-----------------|----------|
| Shared database, `tenant_id` column | Logical only | Lowest: one schema, one migration run | Many small tenants, self-serve SaaS |
| Schema per tenant (PostgreSQL) | Stronger | Medium: migrations run per schema | Hundreds of mid-size tenants |
| Database per tenant | Strongest | Highest: connections, backups and migrations multiply | Few large or regulated customers |

Most products should **start with a shared database and a `tenant_id` column**. It's the simplest to run, reporting across tenants is just a query, and you can still move a large customer to a dedicated database later. The rest of this post assumes that model, because it's also the one where isolation depends entirely on your code.

## Know who the current tenant is, in one place

Resolve the tenant once per request and store it in a small, container-scoped object:

```php
namespace App\Tenancy;

use App\Models\Tenant;
use RuntimeException;

final class CurrentTenant
{
    private ?Tenant $tenant = null;

    public function set(?Tenant $tenant): void
    {
        $this->tenant = $tenant;
    }

    public function get(): ?Tenant
    {
        return $this->tenant;
    }

    public function idOrFail(): int
    {
        return $this->tenant?->id
            ?? throw new RuntimeException('No tenant set for this context.');
    }
}
```

```php
// AppServiceProvider::register()
$this->app->scoped(CurrentTenant::class);
```

`scoped()` rather than `singleton()` matters: scoped bindings are reset between requests under Octane and between jobs on a queue worker. A singleton would carry one request's tenant into the next one.

A middleware fills it in, for example from the subdomain:

```php
public function handle(Request $request, Closure $next): Response
{
    $slug = explode('.', $request->getHost())[0];

    $tenant = Tenant::where('slug', $slug)->firstOrFail();
    app(CurrentTenant::class)->set($tenant);

    return $next($request);
}
```

## Make scoping automatic and fail closed

A trait with a global scope applies the tenant filter to every Eloquent query on a model, and stamps `tenant_id` on create:

```php
namespace App\Tenancy;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

trait BelongsToTenant
{
    protected static function bootBelongsToTenant(): void
    {
        static::addGlobalScope('tenant', function (Builder $query) {
            $query->where(
                $query->getModel()->qualifyColumn('tenant_id'),
                app(CurrentTenant::class)->idOrFail(),
            );
        });

        static::creating(function (Model $model) {
            $model->tenant_id ??= app(CurrentTenant::class)->idOrFail();
        });
    }
}
```

The important detail is `idOrFail()`. A common version of this trait only adds the `where` clause *if* a tenant is set. That fails **open**: in a console command, a queued job, or a request that skipped the middleware, the scope does nothing and the query returns every tenant's rows. Failing **closed** turns that silent leak into a loud exception you'll catch in development.

When you genuinely need data across tenants, such as in an admin panel or a billing report, opt out explicitly so it's easy to spot in code review:

```php
Invoice::withoutGlobalScope('tenant')->where('status', 'overdue')->get();
```

## Where tenant data quietly leaks

Global scopes only protect Eloquent queries. These are the places they don't reach.

### Queued jobs

A job runs in a worker process with no HTTP request and no middleware, so the current tenant is empty. Pass the tenant explicitly and set it before doing any work:

```php
final class SendInvoiceReminders implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public int $tenantId) {}

    public function handle(CurrentTenant $current): void
    {
        $current->set(Tenant::findOrFail($this->tenantId));

        Invoice::where('status', 'overdue')->each(/* ... */);
    }
}
```

Once you have more than a few jobs, move this into a job middleware or a base class so new jobs can't forget it.

### Cache keys

`Cache::remember('dashboard-stats', ...)` is shared by every tenant, so the first tenant to warm the cache shows its numbers to everyone. Always include the tenant in the key:

```php
$key = 'tenant:'.app(CurrentTenant::class)->idOrFail().':dashboard-stats';
```

The same goes for rate-limiter keys, locks, and anything else stored in Redis.

### Raw queries and the query builder

`DB::table('invoices')` and `DB::select(...)` skip Eloquent, so global scopes never run. Treat any raw query against a tenant table as a code-review flag and add the `tenant_id` condition by hand.

### Unique constraints

A unique index on `email` stops two *different* tenants from each having a user `admin@example.com`, and the validation error tells one tenant that the other exists. Make tenant-owned uniqueness composite:

```php
$table->unique(['tenant_id', 'email']);
```

```php
Rule::unique('users')->where('tenant_id', app(CurrentTenant::class)->idOrFail());
```

### Files

Prefix storage paths with the tenant (`tenants/{id}/invoices/...`) and generate signed or temporary URLs, rather than serving files by a guessable path.

## Defence in depth: PostgreSQL row-level security

Application scoping can still be bypassed by a raw query or a forgotten `withoutGlobalScope`. On PostgreSQL you can add a second, database-level guard with row-level security:

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON invoices
    USING (tenant_id = current_setting('app.tenant_id')::bigint);
```

Set the variable on the connection whenever the tenant is resolved:

```php
DB::select("select set_config('app.tenant_id', ?, false)", [(string) $tenant->id]);
```

Two gotchas. Table owners bypass RLS unless you add `FORCE ROW LEVEL SECURITY`, as above. And with pooled or persistent connections, the setting must be reset for each request or job, or one tenant's value carries over into the next. Admin and migration tasks should use a separate database role with `BYPASSRLS`.

## Test the boundary, not just the feature

Tenant isolation deserves its own tests, because no feature test will notice a leak:

```php
public function test_tenants_cannot_see_each_others_invoices(): void
{
    [$a, $b] = Tenant::factory()->count(2)->create();

    app(CurrentTenant::class)->set($a);
    $invoice = Invoice::factory()->create();

    app(CurrentTenant::class)->set($b);
    $this->assertNull(Invoice::find($invoice->id));
}

public function test_queries_without_a_tenant_fail(): void
{
    app(CurrentTenant::class)->set(null);

    $this->expectException(RuntimeException::class);
    Invoice::count();
}
```

The second test is the one that guards everything else: it proves the system fails closed.

## Summary

- Start with a shared database and `tenant_id` unless isolation or compliance requirements say otherwise.
- Resolve the tenant once, in a `scoped` binding, and make every query depend on it.
- Throw when no tenant is set instead of quietly returning everything.
- Treat jobs, cache keys, raw queries, unique indexes and files as tenant-aware by default.
- On PostgreSQL, add row-level security as a second line of defence.
