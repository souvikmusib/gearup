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

Target file: `apps/web/src/app/api/admin/job-cards/[id]/route.ts`

## Findings to fix in this file (4)

### 1. [P0 · BLOCKER] DELETE /job-cards/[id] gated by JOB_CARDS_CREATE, not a destructive permission
- _id_: `jobcard-delete-wrong-permission` · _category_: auth
- _location_: `apps/web/src/app/api/admin/job-cards/[id]/route.ts:36-53`
- _evidence_:
```
export async function DELETE(_req, { params }) {
  const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
  // deletes invoices, payments, parts, tasks, assignments, jobCard
```
- _impact_: Any user who can create a job card can also nuke any job card (and its invoice + all customer payments) for any other user/tenant. There is no ownership check, no status check, no archive — a destructive, money-touching, audit-relevant operation hidden behind the create permission. Privileged data loss on day one.
- _proposed fix_: Add a dedicated PERMISSIONS.JOB_CARDS_DELETE (or JOB_CARDS_HARD_DELETE) and gate this route on it. Reject delete when status === 'DELIVERED' or when any non-DRAFT invoice/payment exists; otherwise soft-delete. Wrap the cascade in a transaction.
- _verifier said_: real=True, Confirmed at apps/web/src/app/api/admin/job-cards/[id]/route.ts:38 — DELETE is gated by PERMISSIONS.JOB_CARDS_CREATE rather than a dedicated delete permission. The handler unconditionally cascades deletes across invoices, payments, invoice line items, tasks, parts, worker assignments, and the job card itself, with no ownership/tenant check, no status guard (e.g. DELIVERED), no check on paid invoices, and no Prisma transaction wrapping the cascade. Anyone with create rights can permanently destroy money-touching, audit-relevant records for any job card, and a mid-cascade failure leaves orphaned/partial state. P0 go-live blocker as claimed.

### 2. [P0 · BLOCKER] DELETE /job-cards/[id] cascades across 5 tables without prisma.$transaction
- _id_: `jobcard-delete-no-transaction` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/job-cards/[id]/route.ts:39-50`
- _evidence_:
```
const invoices = await prisma.invoice.findMany(...);
for (const inv of invoices) {
  await prisma.payment.deleteMany({ where: { invoiceId: inv.id } });
  await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: inv.id } });
}
await prisma.invoice.deleteMany({ where: { jobCardId: params.id } });
await prisma.jobCardTask.deleteMany(...);
await prisma.jobCardPart.deleteMany(...);
await prisma.workerAssignment.deleteMany(...);
await prisma.jobCard.delete(...);
```
- _impact_: A failure mid-loop (e.g. invoice has an FK from a Sentry-tracked AmcServiceUsage, or DB timeout) leaves orphan invoices/payments or orphan parts referencing a deleted job card via cascade rules. Also note JobCardPart deletion does NOT release reservedQuantity on InventoryItem nor write StockMovement rows — silent inventory corruption.
- _proposed fix_: Wrap in prisma.$transaction. Before deleting JobCardPart rows, iterate them and call adjustStock(tx, item, qty, 'RELEASED', jobCardId). Rely on schema cascades for the rest (parts/tasks/assignments are already onDelete:Cascade).
- _verifier said_: real=True, Verified at apps/web/src/app/api/admin/job-cards/[id]/route.ts:36-54. The DELETE handler executes 6+ sequential prisma calls (payment, invoiceLineItem, invoice, jobCardTask, jobCardPart, workerAssignment, jobCard) with no $transaction wrapper, so a mid-sequence failure leaves orphan rows. Additionally, jobCardPart.deleteMany never releases reservedQuantity on InventoryItem or writes StockMovement rows — confirmed silent inventory corruption risk. Downgrading from P0 to P1 because deletion is admin-gated (requirePermission JOB_CARDS_CREATE) and not a high-frequency path, but it is a real data-integrity bug that should be fixed before go-live.

### 3. [P1] PATCH /job-cards/[id] accepts any string status with no enum validation or transition guard
- _id_: `jobcard-patch-status-no-transition-validation` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/job-cards/[id]/route.ts:20-30`
- _evidence_:
```
const body = z.object({
  status: z.string().optional(), approvalStatus: z.string().optional(), ...
}).parse(await req.json());
const data: Record<string, unknown> = { ...body };
if (body.status === 'DELIVERED') data.actualDeliveryAt = new Date();
const jc = await prisma.jobCard.update({ where: { id: params.id }, data });
```
- _impact_: Caller can set status to any string; Prisma will only reject if it isn't in JobCardStatus. A bad string returns 500. More importantly there is no transition validation — a DELIVERED job can be reverted to CREATED, an admin can skip ESTIMATE_PREPARED, and actualDeliveryAt is reset only when transitioning to DELIVERED (re-delivering overwrites the original date). UI relies on toDbStatus/toSimpleStatus but the API is the authority.
- _proposed fix_: Use z.nativeEnum(JobCardStatus) for status/approvalStatus. Add a transition table (CREATED→ESTIMATE_PREPARED|CANCELLED, etc.) checked server-side. Only set actualDeliveryAt when current status !== DELIVERED.

### 4. [P1] PATCH /job-cards/[id] lets clients edit estimated/final cost fields regardless of status
- _id_: `jobcard-patch-cost-fields-can-edit-when-locked` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/job-cards/[id]/route.ts:20-30`
- _evidence_:
```
estimatedPartsCost: z.number().optional(), estimatedLaborCost: z.number().optional(), estimatedTotal: z.number().optional(),
finalPartsCost: z.number().optional(), finalLaborCost: z.number().optional(), finalTotal: z.number().optional(),
```
- _impact_: UI hides cost editing for delivered/cancelled jobs (canEditCosts), but the API enforces nothing. A direct API call can rewrite finalTotal of a delivered job after invoice payment, causing reconciliation drift. Also estimatedPartsCost is recomputed from parts in recalcEstimates() — letting the client set it directly creates two sources of truth.
- _proposed fix_: Reject cost-field writes when status in DELIVERED/CANCELLED. Drop the client-settable estimatedPartsCost/Total (compute server-side). Use Decimal-safe numeric handling (z.number().nonnegative()).