You are a senior Next.js / Prisma / TypeScript engineer applying audit fixes to the gearup codebase. GO-LIVE TOMORROW. Fixes must be surgical, correct, no regressions.

Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup

## Context
- Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- All admin routes use `requirePermission(req, PERMISSIONS.X)` from `apps/web/src/lib/auth.ts`. Permissions enum at `packages/types/src/auth.ts`.
- DB: `import { prisma } from '@/lib/prisma'`. Multi-table writes MUST use `prisma.$transaction(async (tx) => ...)`.
- Errors: `handleApiError(err)` in `apps/web/src/lib/errors.ts`. Throw `new AppError(code, msg, status)`.
- Activity log: `logActivity({adminUserId, action, entityType, entityId, metadata})` from `apps/web/src/lib/activity-logger.ts`.
- Gold pattern for race-free stock: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts` uses tx + `updateMany` with `gte` guard.

## Rules
1. **Read the file first** before editing.
2. **Apply EVERY finding** listed below. None are optional.
3. **Preserve unrelated code.** Don't reformat or refactor outside scope.
4. **Race-fixes**: use `prisma.$transaction` + conditional `updateMany({where:{...guard},data:...})` then assert `result.count === 1`, else throw `new AppError('CONFLICT', '...', 409)`.
5. **Permission fixes**: if a new PERMISSIONS.X is needed, the shared-infra agent has added/will add it to `packages/types/src/auth.ts`. Just import + use.
6. **Mass-assignment**: replace `data: body as any` with explicit field picks.
7. **No backward-compat shims** — fix it right.
8. **Imports**: add what you need; don't remove ones still used.
9. **Schema changes**: if a Zod schema changes, ensure all callers match.
10. **Don't run build** — coordinator does that.

## Verify after edit
Re-Read the file. Confirm syntax. Mention any cascading changes needed.

Return JSON only: {"file": "...", "applied": ["id1","id2"], "skipped": [{"id":"","reason":""}], "cascading_changes": ["path: note"], "notes": "2-5 sentences"}.

Target file: `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts`

## Findings to fix in this file (2)

### 1. [P0 · BLOCKER] AMC contract number generated via count()+1 — race + collision
- _id_: `amc-contract-number-race` · _category_: race-condition
- _location_: `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:74-77`
- _evidence_:
```
const count = await tx.amcContract.count();
const contract = await tx.amcContract.create({
  data: {
    contractNumber: `AMC-${String(count + 1).padStart(5, '0')}`,
    ...
```
- _impact_: Two concurrent final payments on different invoices will both read count=N and both try to insert AMC-N+1, producing a unique-constraint collision (assuming contractNumber is unique) or silent duplicates (if not). Same anti-pattern even inside the tx because the transactions use READ COMMITTED by default in Postgres — count() is not a lock.
- _proposed fix_: Use the same id-generator pattern as `generateInvoiceNumber` (cuid + prefix, or a Postgres sequence: `nextval('amc_contract_seq')`), or wrap in a serializable retry loop. Don't compute monotonic ids from count().
- _verifier said_: real=True, Verified at apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:74-77. The code computes `contractNumber = AMC-${count+1}` from `tx.amcContract.count()`, and `contractNumber` is declared `@unique` in prisma/schema.prisma. Postgres default isolation is READ COMMITTED, so two concurrent final-payment transactions on different invoices that each create an AMC contract will both observe the same count and one insert will fail the unique constraint, rolling back the entire payment-record transaction. This is a genuine race that can block payment recording during concurrent activations; severity P0/go-live blocker stands.

### 2. [P1] Payment handler updates invoice twice; second write can clobber a concurrent payment
- _id_: `payment-double-update-window` · _category_: race-condition
- _location_: `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:22-56`
- _evidence_:
```
const updated = await tx.invoice.updateMany({
  where: { id, invoiceStatus: 'FINALIZED', paymentStatus: { not: 'PAID' }, amountDue: { gte: body.amount } },
  data: { amountPaid: { increment: body.amount }, amountDue: { decrement: body.amount } },
});
...
const invoice = await tx.invoice.findUniqueOrThrow(...);
...
await tx.invoice.update({ where: { id }, data: { amountDue: Math.max(0, newDue), paymentStatus } });
```
- _impact_: The conditional updateMany correctly prevents overpayment. But the SECOND update unconditionally writes `amountDue: Math.max(0, newDue)` (where newDue is the value AFTER the first decrement). If two payments are interleaved at this point (READ COMMITTED), the second handler's second write can overwrite the first handler's amountDue with stale data. The Math.max(0,...) is also dead: the first updateMany already guaranteed amountDue >= 0.
- _proposed fix_: Collapse to a single updateMany that sets paymentStatus conditionally (use raw SQL CASE) or compute paymentStatus from `newDue === 0` and use a second conditional updateMany with `where: { id, amountPaid: <expected> }` (optimistic lock).