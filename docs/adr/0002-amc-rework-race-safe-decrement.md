---
adr-number: 0002
title: AMC rework and race-safe decrement
status: Accepted
decision-date: 2026-06-13
deciders: Sagnik Mitra, Arnab
verified-against: dfb9bec098b598ecddefb1b3324ec18d882a1782
---

# ADR-0002: AMC rework and race-safe decrement

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** Sagnik Mitra, Arnab
- **Verified against:** `dfb9bec098b598ecddefb1b3324ec18d882a1782`

## Context

The shop sells Annual Maintenance Contracts (AMCs) that bundle a fixed number of services on a vehicle over a fixed window. Each AMC contract has a `servicesRemaining` counter that starts at the plan quota and decrements by one every time a job-card invoice is finalised against the vehicle. When the counter reaches zero the contract is used up. When `endDate` passes the contract is expired regardless of remaining count.

Early deploys had two problems.

- **Negative counts.** Two concurrent invoice finalisations against the same contract could both read `servicesRemaining=1`, both compute `0`, and both write `0`. In practice the shop hit worse: a stuck job card retried after a network blip alongside the operator finalising a new one, producing counts as low as `-2`.
- **Premature activation.** Contracts were being activated on the plan-purchase invoice as soon as it was created, before the customer had paid. Refunds or cancelled purchases left active contracts hanging.

Contract state was also under-modelled. There was no clean distinction between an active contract, a manually cancelled contract, and a contract whose `endDate` had simply passed.

## Decision

Rework the AMC pipeline around three rules.

1. **Race-safe decrement via `updateMany` with a WHERE guard.** Never read then write. The decrement is a single conditional update:

   ```ts
   const { count } = await tx.amcContract.updateMany({
     where: { id, servicesRemaining: { gt: 0 } },
     data: { servicesRemaining: { decrement: 1 } },
   });
   if (count === 0) {
     // caller handles: contract exhausted or already decremented by a concurrent writer
   }
   ```

   The row-level guard `servicesRemaining: { gt: 0 }` collapses the check-and-decrement into one database operation. Two concurrent writers can each observe `servicesRemaining > 0`, but only one `updateMany` returns `count === 1`; the other returns `count === 0`.

2. **Activation only on full payment.** A contract is created in a non-active state when the plan-purchase invoice is drafted, and is only transitioned to `ACTIVE` when that invoice reaches `paymentStatus === 'PAID'`. Payment mutations run through `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts` and finalisation through `apps/web/src/app/api/admin/invoices/[id]/finalize/route.ts`.

3. **Explicit contract statuses with self-healing expiry.** A contract has one of `ACTIVE`, `EXPIRED`, `CANCELLED`. `ACTIVE` past `endDate` auto-transitions to `EXPIRED` on read, so a background job is not required. `CANCELLED` is a terminal admin state and never auto-transitions.

## Consequences

**Positive.**

- No more negative counts. The row-level WHERE guard is the primitive; the transaction wrapping it is convenience, not correctness.
- The decrement is atomic across concurrent finalisations and retries.
- Expired contracts self-heal on read, so an operator opening a stale contract sees the truth without a nightly job.
- Payment gating removes the class of ghost-active contracts on unpaid plan invoices.

**Negative.**

- The `count === 0` branch is now a business error the caller must interpret. It is not automatically a bug: it also fires when a contract is genuinely exhausted or when another writer just decremented. Callers must decide whether to surface "AMC service already used for this job card" or a lower-level conflict.
- The auto-transition on read means listing pages that touch many contracts do many small updates. Fine at current scale, worth watching if AMC volume grows.
- Contract state now lives partly in `status` and partly in the `endDate` clock, so any external reader must apply the same expiry rule.

## References

- `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts`, contract read and update, self-healing expiry.
- `apps/web/src/app/api/admin/invoices/[id]/finalize/route.ts`, the invoice-finalise path that triggers the guarded decrement.
- `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts`, the payment path that activates a contract on full payment.
- Commits `a80098c`, `a78bfd9` (2026-06-13), AMC rework batches.
- PR #50, feature/amc-rework: Gold and Platinum tiers, plan-level discounts.
- PR #51, feature/amc-mrp-quicklines: MRP strikethrough, quick line items.
