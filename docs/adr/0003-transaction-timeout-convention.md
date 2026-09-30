---
adr-number: 0003
title: Transaction timeout convention (30s + 10s maxWait)
status: Accepted
decision-date: 2026-07-01
deciders: Sagnik Mitra, Arnab
verified-against: dfb9bec098b598ecddefb1b3324ec18d882a1782
---

# ADR-0003: Transaction timeout convention (30s + 10s maxWait)

- **Status:** Accepted
- **Date:** 2026-07-01
- **Deciders:** Sagnik Mitra, Arnab
- **Verified against:** `dfb9bec098b598ecddefb1b3324ec18d882a1782`

## Context

Prisma's `$transaction` has a default timeout of 5 seconds and a default `maxWait` of 2 seconds. Locally, against a warm Postgres, those defaults are comfortable. In production the stack is different: a Vercel serverless function on a cold start, calling Supabase through the transaction pooler, opening a Prisma transaction that in turn runs a small handful of writes plus a lookup or two.

Under that composition the 5-second budget was routinely blown. The failure mode was Prisma's `P2028 Transaction already closed`, returned as a 500 to the client mid-write. The two routes that produced the alerts were the invoice line-item creation route and the job-card parts route. Both had a common shape: inside a `$transaction`, call `resolveHsnAndRate` (which under some paths reads the inventory item to find the HSN, see ADR-0001), then compute a line total, then insert one or more rows, then recompute the invoice totals.

Two structural mistakes made the failure worse than a slow query.

1. Some code paths called top-level `prisma.*` inside the transaction callback rather than the passed `tx` client. That effectively opened a second connection from inside a transaction and doubled the exposure to pool starvation.
2. `resolveHsnAndRate` was called inside the transaction. Its cache miss is a database read; on a cold worker with an empty cache and multiple lines, it stacked reads inside the transaction's ticking budget.

## Decision

Adopt two rules for every route that uses `$transaction`.

1. **Never call top-level `prisma.*` inside a `$transaction` callback. Always use the passed `tx` client.** The callback signature is `(tx) => {...}`. If a helper needs database access inside the transaction, it must take `tx` as a parameter. This is enforced by review and by convention on the affected routes.

2. **Pass explicit timeouts to every non-trivial write transaction.** The convention is:

   ```ts
   prisma.$transaction(async (tx) => {
     // ...work with tx...
   }, { timeout: 30_000, maxWait: 10_000 });
   ```

   - `timeout: 30_000` gives the callback 30 seconds to complete once it starts.
   - `maxWait: 10_000` gives Prisma 10 seconds to acquire a pool slot before it gives up.

   Read-only or single-statement transactions do not need the override.

3. **Slow, non-transactional helpers must be pre-computed before the transaction opens.** In particular, `resolveHsnAndRate` runs before `$transaction`, and the resolved `{ hsnCode, taxRate }` is passed into the callback as data.

## Consequences

**Positive.**

- The P2028 family stopped firing on the affected routes after commits `a5cbaee` and `0bf6479` shipped in PRs #58 and #59. Line-item creation and parts addition are back to a normal error profile.
- The rule is short enough to review at PR time: check `$transaction` calls for the timeout options and for the `tx` client.
- Pre-computing slow lookups outside the transaction shrinks the critical section, which is the right direction independent of the timeout number.

**Negative.**

- A 30-second transaction is longer than the connection pool typically wants to hold a slot. Under load, a single slow request can pin a connection for up to 30 seconds. This is a ceiling, not a target: the point is to survive cold-start spikes, not to run 30-second transactions routinely.
- The `tx`-only rule is a convention, not a compiler check. New helpers can drift by accepting a plain `PrismaClient` and quietly reaching for the top-level `prisma` singleton. Reviewer awareness is the current control.

**Follow-up debt.**

- Batch long loops into `updateMany` where possible, to keep the transaction body short. Tracked in `docs/06-BACKEND-SPEC.md` section 13.
- Audit any remaining `$transaction` calls without explicit timeouts; add them where the callback does more than one write.
- Consider a lint rule that flags a `prisma.` identifier inside a `$transaction` callback.

## References

- `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts`, invoice line-item creation and edit paths.
- `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts`, job-card parts addition path.
- `apps/web/src/app/api/admin/invoices/route.ts`, invoice creation with lines.
- Commit `a5cbaee` (2026-07-01), fix(P0): move HSN resolution outside tx + bump timeout 15s to 30s.
- Commit `0bf6479` (2026-07-01), fix(P0): move HSN resolution outside tx in invoice creation route.
- PR #58, fix/parts-500-and-pdf-part-number.
- PR #59, fix/parts-500-tx-timeout.
- ADR-0001, HSN and GST rate system (the resolver whose in-transaction call was the trigger).
- `docs/06-BACKEND-SPEC.md` section 13, follow-up on batching long loops into `updateMany`.
