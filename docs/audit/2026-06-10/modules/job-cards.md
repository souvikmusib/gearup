# Job cards, tasks, parts, worker assignment, appointments — module audit

_Module key:_ `job-cards`

## Summary

Module covers job cards (header + parts + tasks + worker assignments), appointments, and worker/leave management. Auth + RBAC are present on every route via requirePermission / requireAnyPermission, and Zod schemas wrap inputs. The biggest go-live risks are: (1) job-card POST mixes prisma.create + serviceRequest.update + vehicle.update + invoice.create with NO transaction, so partial failures leave inconsistent state; (2) DELETE /job-cards/[id] performs a hand-rolled multi-table cascade without a transaction AND it requires only JOB_CARDS_CREATE (any creator can delete any job card incl. its invoice + payments — privilege/IDOR-ish concern); (3) job-card-part POST does the stock reservation inside a transaction but the invoice-sync block runs outside it, so an invoice line can be created with stock half-adjusted, and the totals math ignores per-line discount; (4) workers/[id] PATCH leaks mass-assignment via `data: body as any` (the permission also allows promoting status); (5) workers/[id]/leave PATCH approves a leave and force-sets the worker status to ON_LEAVE without checking dates, and never reverts on expiry. There is no rate limiting, no Sentry init (dir is empty), no double-booking guard on appointments, and JWT is read only from the Authorization header (cookie/middleware mismatch worth re-checking). UI pages have several no-disable-during-submit patterns and rely on `window.confirm` for destructive deletes.

## Routes audited

- `GET /api/admin/job-cards`
- `POST /api/admin/job-cards`
- `GET /api/admin/job-cards/[id]`
- `PATCH /api/admin/job-cards/[id]`
- `DELETE /api/admin/job-cards/[id]`
- `POST /api/admin/job-cards/[id]/parts`
- `PATCH /api/admin/job-cards/[id]/parts`
- `DELETE /api/admin/job-cards/[id]/parts`
- `POST /api/admin/job-cards/[id]/tasks`
- `PATCH /api/admin/job-cards/[id]/tasks`
- `DELETE /api/admin/job-cards/[id]/tasks`
- `POST /api/admin/job-cards/[id]/workers`
- `DELETE /api/admin/job-cards/[id]/workers`
- `GET /api/admin/appointments`
- `POST /api/admin/appointments`
- `GET /api/admin/appointments/[id]`
- `PATCH /api/admin/appointments/[id]`
- `GET /api/admin/workers`
- `POST /api/admin/workers`
- `GET /api/admin/workers/[id]`
- `PATCH /api/admin/workers/[id]`
- `POST /api/admin/workers/[id]/leave`
- `PATCH /api/admin/workers/[id]/leave`
- `GET /api/admin/workers/calendar`

## Files audited

- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/job-cards/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/job-cards/[id]/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/job-cards/[id]/tasks/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/job-cards/[id]/workers/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/appointments/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/appointments/[id]/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/workers/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/workers/[id]/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/workers/[id]/leave/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/workers/calendar/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/job-cards/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/job-cards/[id]/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/appointments/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/appointments/[id]/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/workers/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/workers/[id]/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/auth.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/errors.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/prisma/schema.prisma`

## Coupling

Depends on: lib/auth.ts (Bearer-only JWT), lib/errors.ts (handleApiError), lib/activity-logger.ts (fire-and-forget), lib/id-generators.ts (job-card/appointment/worker codes), lib/pagination.ts, lib/prisma.ts, @gearup/types (PERMISSIONS, AuthTokenPayload). Tightly coupled to Invoice module: POST /job-cards auto-creates a DRAFT invoice; parts route mutates invoice line items and invoice totals; DELETE /job-cards wipes invoices + payments transitively. Coupled to Inventory module via InventoryItem stock/reservedQuantity + StockMovement. Worker model is referenced by Appointment (assignedWorkerId), WorkerAssignment (jobCard fan-out), JobCardTask. ServiceRequest is mutated to CONVERTED_TO_JOB by job-card POST. Cascade: WorkerAssignment, WorkerLeave, JobCardPart, JobCardTask are onDelete: Cascade from JobCard / Worker, so the manual deleteMany loop in DELETE /job-cards is partly redundant.

## Findings

### [P0 · BLOCKER] POST /job-cards creates job card + invoice + service-request update + vehicle odo update without a transaction
_id:_ `jobcard-create-no-transaction` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/job-cards/route.ts:46-53`

```
const jc = await prisma.jobCard.create({ ... });
if (body.serviceRequestId) await prisma.serviceRequest.update({ where: { id: body.serviceRequestId }, data: { status: 'CONVERTED_TO_JOB' } });
if (body.odometerAtIntake) await prisma.vehicle.update({ where: { id: body.vehicleId }, data: { odometerReading: body.odometerAtIntake } });
...
await prisma.invoice.create({ data: invData });
```
**Impact.** If invoice.create or serviceRequest.update fails (FK / unique violation), the job card is persisted but the DRAFT invoice the rest of the UI assumes exists is missing, leaving the job card un-billable and the service-request status stale. Re-submitting causes a second job-card-number with no auto-invoice. Goes live tomorrow with money flow depending on this invariant.

**Fix.** Wrap all four writes in prisma.$transaction(async (tx) => { ... }). Validate referenced ids (customerId/vehicleId/serviceRequestId/appointmentId) inside the tx so FK errors surface before the JobCard row is created.

  _Adversarial verify:_ **CONFIRMED** (now P0) — Confirmed at apps/web/src/app/api/admin/job-cards/route.ts lines 46-51: four independent prisma writes (jobCard.create, serviceRequest.update, vehicle.update, invoice.create) run sequentially with no $transaction wrapper. If invoice.create throws (e.g., unique invoiceNumber collision, FK violation on customerId/vehicleId/createdBy connect), the JobCard row is already persisted but has no companion DRAFT invoice — the rest of the UI assumes this invariant. Retrying the POST burns a second job-card-number and may leave service-request status mis-set. P0 is appropriate given the system goes live tomorrow with money flow depending on the JobCard-Invoice pairing.

### [P0 · BLOCKER] DELETE /job-cards/[id] gated by JOB_CARDS_CREATE, not a destructive permission
_id:_ `jobcard-delete-wrong-permission` · _category:_ auth · _file:_ `apps/web/src/app/api/admin/job-cards/[id]/route.ts:36-53`

```
export async function DELETE(_req, { params }) {
  const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
  // deletes invoices, payments, parts, tasks, assignments, jobCard
```
**Impact.** Any user who can create a job card can also nuke any job card (and its invoice + all customer payments) for any other user/tenant. There is no ownership check, no status check, no archive — a destructive, money-touching, audit-relevant operation hidden behind the create permission. Privileged data loss on day one.

**Fix.** Add a dedicated PERMISSIONS.JOB_CARDS_DELETE (or JOB_CARDS_HARD_DELETE) and gate this route on it. Reject delete when status === 'DELIVERED' or when any non-DRAFT invoice/payment exists; otherwise soft-delete. Wrap the cascade in a transaction.

  _Adversarial verify:_ **CONFIRMED** (now P0) — Confirmed at apps/web/src/app/api/admin/job-cards/[id]/route.ts:38 — DELETE is gated by PERMISSIONS.JOB_CARDS_CREATE rather than a dedicated delete permission. The handler unconditionally cascades deletes across invoices, payments, invoice line items, tasks, parts, worker assignments, and the job card itself, with no ownership/tenant check, no status guard (e.g. DELIVERED), no check on paid invoices, and no Prisma transaction wrapping the cascade. Anyone with create rights can permanently destroy money-touching, audit-relevant records for any job card, and a mid-cascade failure leaves orphaned/partial state. P0 go-live blocker as claimed.

### [P0 · BLOCKER] DELETE /job-cards/[id] cascades across 5 tables without prisma.$transaction
_id:_ `jobcard-delete-no-transaction` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/job-cards/[id]/route.ts:39-50`

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
**Impact.** A failure mid-loop (e.g. invoice has an FK from a Sentry-tracked AmcServiceUsage, or DB timeout) leaves orphan invoices/payments or orphan parts referencing a deleted job card via cascade rules. Also note JobCardPart deletion does NOT release reservedQuantity on InventoryItem nor write StockMovement rows — silent inventory corruption.

**Fix.** Wrap in prisma.$transaction. Before deleting JobCardPart rows, iterate them and call adjustStock(tx, item, qty, 'RELEASED', jobCardId). Rely on schema cascades for the rest (parts/tasks/assignments are already onDelete:Cascade).

  _Adversarial verify:_ **CONFIRMED** (now P1) — Verified at apps/web/src/app/api/admin/job-cards/[id]/route.ts:36-54. The DELETE handler executes 6+ sequential prisma calls (payment, invoiceLineItem, invoice, jobCardTask, jobCardPart, workerAssignment, jobCard) with no $transaction wrapper, so a mid-sequence failure leaves orphan rows. Additionally, jobCardPart.deleteMany never releases reservedQuantity on InventoryItem or writes StockMovement rows — confirmed silent inventory corruption risk. Downgrading from P0 to P1 because deletion is admin-gated (requirePermission JOB_CARDS_CREATE) and not a high-frequency path, but it is a real data-integrity bug that should be fixed before go-live.

### [P0 · BLOCKER] Part POST invoice sync runs outside the stock-adjusting transaction
_id:_ `part-invoice-sync-outside-tx` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:62-81`

```
const part = await prisma.$transaction(async (tx) => { ... });
// Sync to invoice if one exists (draft only)
const invoice = await prisma.invoice.findFirst({ where: { jobCardId: params.id, invoiceStatus: 'DRAFT' } });
if (invoice) {
  ...
  await prisma.invoiceLineItem.create(...);
  ...
  await prisma.invoice.update(...);
}
```
**Impact.** Stock is reserved + JobCardPart row exists, but if the invoice line/totals write fails, stock stays held and the invoice subtotal/taxes drift permanently. Concurrent part-adds will also race on invoice totals (read-modify-write of grandTotal/amountDue with no row lock).

**Fix.** Move invoice-sync logic inside the transaction. Read the invoice with tx, write line item with tx, then recompute totals from tx-queried lines and update invoice in the same tx.

  _Adversarial verify:_ **CONFIRMED** (now P0) — Confirmed at apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:50-81. The prisma.$transaction closes at line 59 (committing stock reservation + JobCardPart row), and invoice sync at lines 63-79 uses top-level prisma client, not tx. If invoiceLineItem.create or invoice.update fails, stock stays reserved and JobCardPart persists while the invoice never reflects it — permanent drift. Additionally, the read-modify-write of grandTotal/amountDue (findMany lines -> reduce -> update) has no row lock, so concurrent POSTs will race and produce stale totals. Real P0 data-integrity blocker.

### [P1] Part->invoice sync recomputes invoice totals but ignores per-line discountAmount/discountPercent
_id:_ `part-invoice-totals-ignore-discount` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:73-79`

```
await prisma.invoiceLineItem.create({ data: { ..., quantity: body.requiredQty, unitPrice, taxRate, taxAmount, lineTotal: subtotal + taxAmount, ... } });
const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId: invoice.id } });
const invSubtotal = lines.reduce((s, l) => s + Number(l.lineTotal) - Number(l.taxAmount), 0);
const invTaxTotal = lines.reduce((s, l) => s + Number(l.taxAmount), 0);
const grandTotal = invSubtotal + invTaxTotal - Number(invoice.discountAmount);
```
**Impact.** InventoryItem.discountPercent is applied to the JobCardPart.unitPrice (line 54), but the new line is written with that price as if there was no discount, while the invoice screen renders the discount column from the item. Totals shown on invoice vs job-card cost summary will disagree, and tax is computed on the post-discount unit price, not the schema's expected subtotal-then-discount flow used elsewhere in the invoice module. This will surface as wrong customer totals at billing.

**Fix.** Centralise line-total math in one helper used by both invoice POST/PATCH and this sync path; persist discountPercent on the line and compute subtotal/tax/lineTotal identically. Add a unit test fixture for the part->invoice flow.

### [P1] PATCH /parts accepts consumedQty but never adjusts stock or writes StockMovement
_id:_ `part-patch-allows-setting-consumed-without-stock-move` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:87-108`

```
const body = z.object({
  partId: z.string(),
  requiredQty: z.number().min(0.01).optional(), consumedQty: z.number().optional(),
  unitPrice: z.number().optional(), notes: z.string().nullable().optional(),
}).parse(await req.json());
... // only requiredQty branches adjust stock; consumedQty just gets written
```
**Impact.** When a mechanic marks a part as consumed, the inventory's reservedQuantity should drop and stock should be permanently deducted (a CONSUMED movement). Right now JobCardPart.consumedQty grows but reservedQuantity stays held forever, so stock counts and reservation reports diverge from reality. consumedQty also has no upper bound vs requiredQty.

**Fix.** In the same transaction, when consumedQty increases by delta>0, call a new adjustStock variant that decrements reservedQuantity by delta (no increment to quantityInStock) and writes a 'CONSUMED' StockMovement. Validate consumedQty <= requiredQty in Zod (z.refine).

### [P1] DELETE /parts releases reservedQty OR requiredQty fallback can over-release stock
_id:_ `part-delete-double-release` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:119-125`

```
const part = await tx.jobCardPart.findUniqueOrThrow({ where: { id: partId, jobCardId: params.id } });
const releaseQty = Number(part.reservedQty) > 0 ? Number(part.reservedQty) : Number(part.requiredQty);
await tx.jobCardPart.delete({ where: { id: partId } });
await adjustStock(tx, part.inventoryItemId, releaseQty, 'RELEASED', params.id);
```
**Impact.** If consumedQty > 0 (some already consumed), reservedQty should be requiredQty - consumedQty, but the row still has reservedQty == requiredQty because PATCH never decrements it (see prior finding). Releasing the full reservedQty will inflate quantityInStock by parts that have already been physically consumed.

**Fix.** Once consumedQty handling is fixed, releaseQty must be only the still-reserved (uncommitted) portion. Add an assertion: releaseQty = max(0, reservedQty - consumedQty).

### [P1] No unique constraint or upsert: same inventory item can be added twice to a job card with race condition on duplicate-line check
_id:_ `part-post-race-double-add-no-unique` · _category:_ race-condition · _file:_ `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:63-72`

```
const exists = await prisma.invoiceLineItem.findFirst({ where: { invoiceId: invoice.id, referenceItemId: body.inventoryItemId } });
if (!exists) {
  ...
  await prisma.invoiceLineItem.create({ data: { ... } });
```
**Impact.** Two concurrent POSTs (admin double-clicks Add) both see exists=null, both reserve stock, both append an invoice line, but only one JobCardPart row will visually show the qty — invoice double-charges. Schema has no @@unique([jobCardId, inventoryItemId]) on JobCardPart either.

**Fix.** Add @@unique([jobCardId, inventoryItemId]) on JobCardPart and rely on P2002 from handleApiError. Use upsert(create-or-increment-qty) semantics; or wrap the invoice-line check in the same tx + SELECT FOR UPDATE on invoice row.

### [P1] PATCH /job-cards/[id] accepts any string status with no enum validation or transition guard
_id:_ `jobcard-patch-status-no-transition-validation` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/job-cards/[id]/route.ts:20-30`

```
const body = z.object({
  status: z.string().optional(), approvalStatus: z.string().optional(), ...
}).parse(await req.json());
const data: Record<string, unknown> = { ...body };
if (body.status === 'DELIVERED') data.actualDeliveryAt = new Date();
const jc = await prisma.jobCard.update({ where: { id: params.id }, data });
```
**Impact.** Caller can set status to any string; Prisma will only reject if it isn't in JobCardStatus. A bad string returns 500. More importantly there is no transition validation — a DELIVERED job can be reverted to CREATED, an admin can skip ESTIMATE_PREPARED, and actualDeliveryAt is reset only when transitioning to DELIVERED (re-delivering overwrites the original date). UI relies on toDbStatus/toSimpleStatus but the API is the authority.

**Fix.** Use z.nativeEnum(JobCardStatus) for status/approvalStatus. Add a transition table (CREATED→ESTIMATE_PREPARED|CANCELLED, etc.) checked server-side. Only set actualDeliveryAt when current status !== DELIVERED.

### [P1] PATCH /job-cards/[id] lets clients edit estimated/final cost fields regardless of status
_id:_ `jobcard-patch-cost-fields-can-edit-when-locked` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/job-cards/[id]/route.ts:20-30`

```
estimatedPartsCost: z.number().optional(), estimatedLaborCost: z.number().optional(), estimatedTotal: z.number().optional(),
finalPartsCost: z.number().optional(), finalLaborCost: z.number().optional(), finalTotal: z.number().optional(),
```
**Impact.** UI hides cost editing for delivered/cancelled jobs (canEditCosts), but the API enforces nothing. A direct API call can rewrite finalTotal of a delivered job after invoice payment, causing reconciliation drift. Also estimatedPartsCost is recomputed from parts in recalcEstimates() — letting the client set it directly creates two sources of truth.

**Fix.** Reject cost-field writes when status in DELIVERED/CANCELLED. Drop the client-settable estimatedPartsCost/Total (compute server-side). Use Decimal-safe numeric handling (z.number().nonnegative()).

### [P2] PATCH /job-cards spreads validated body but Zod schema is permissive and 'as any' casts hide drift
_id:_ `jobcard-patch-spread-body-mass-assignment` · _category:_ type-safety · _file:_ `apps/web/src/app/api/admin/job-cards/route.ts:46`

```
const jc = await prisma.jobCard.create({ data: { jobCardNumber: generateJobCardNumber(), ...body, intakeDate: new Date(), estimatedDeliveryAt: body.estimatedDeliveryAt ? new Date(body.estimatedDeliveryAt) : undefined } as any });
```
**Impact.** `as any` lets unknown fields (priority as untrusted string, fuelIndicator) flow into Prisma. If a schema field changes the cast hides it. priority is z.string() with no enum — UI offers HIGH/URGENT but API accepts anything, breaking workerFilter aggregation.

**Fix.** Type via Prisma.JobCardUncheckedCreateInput; constrain priority with z.enum(['HIGH','MEDIUM','LOW','URGENT']).optional(). Same fix needed in workers POST/PATCH (line 42 and 28) and appointments POST (line 44).

### [P0 · BLOCKER] POST /appointments has no overlap/capacity check against existing appointments, leaves, or AppointmentSlotRule
_id:_ `appointment-no-double-booking-guard` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/appointments/route.ts:39-49`

```
const appt = await prisma.appointment.create({
  data: { referenceId: generateAppointmentRef(), ...body, appointmentDate: new Date(body.appointmentDate), slotStart: new Date(body.slotStart), slotEnd: new Date(body.slotEnd), status: 'CONFIRMED', confirmedByAdminId: user.sub } as any,
});
```
**Impact.** Two admins can book the same worker into the same slot, or a customer-facing booking can land on an approved worker leave. UI from appointments/page.tsx hardcodes slotEnd = slotStart + 30min with no per-day capacity check — appointment double-bookings will hit go-live.

**Fix.** Before insert, query: (a) overlapping appointment for the same worker/bay where status NOT IN (CANCELLED, NO_SHOW); (b) overlapping WorkerLeave for assignedWorkerId with status APPROVED; (c) AppointmentSlotRule capacity for that weekday. Wrap insert + check in a serializable transaction (or unique index on (assignedWorkerId, slotStart) excluding cancelled).

  _Adversarial verify:_ **CONFIRMED** (now P0) — Verified in apps/web/src/app/api/admin/appointments/route.ts:39-49: POST does only a Zod parse then prisma.appointment.create with no overlap, leave, or capacity check. Schema (prisma/schema.prisma:308-339) has no unique constraint on (assignedWorkerId, slotStart) or any partial index excluding cancelled — only @unique on referenceId and serviceRequestId. AppointmentSlotRule.maxCapacity and WorkerLeave exist in the schema but are never consulted. Two concurrent confirmations can therefore double-book the same worker/slot or land on an approved leave; this is a go-live blocker for a booking-driven workshop app.

### [P2] PATCH /appointments/[id] status is z.string() — any string accepted
_id:_ `appointment-patch-status-no-enum` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/appointments/[id]/route.ts:20`

```
const body = z.object({ status: z.string().optional(), appointmentDate: z.string().optional(), slotStart: z.string().optional(), slotEnd: z.string().optional(), rescheduleReason: z.string().optional(), cancellationReason: z.string().optional(), assignedWorkerId: z.string().optional() }).parse(await req.json());
```
**Impact.** Invalid status strings yield 500 via Prisma rather than 400. No transition rules — a CANCELLED appointment can be moved back to CONFIRMED bypassing audit.

**Fix.** z.nativeEnum(AppointmentStatus). Add a transition map and reject illegal jumps. Also accept assignedWorkerId: z.string().nullable() so the UI's `null` unassign value works.

### [P2] PATCH /appointments/[id] allows CANCELLED without cancellationReason and RESCHEDULED without new slot
_id:_ `appointment-patch-cancel-no-reason-required` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/appointments/[id]/route.ts:20-26`

```
const body = z.object({ status: z.string().optional(), ..., cancellationReason: z.string().optional() }).parse(...);
const appt = await prisma.appointment.update({ where: { id: params.id }, data });
```
**Impact.** Customer can be marked CANCELLED with no reason captured for the audit log/CRM. RESCHEDULED with no slot change is allowed.

**Fix.** z.refine: if status==='CANCELLED' require cancellationReason; if status==='RESCHEDULED' require slotStart+slotEnd+rescheduleReason.

### [P2] slotEnd is not validated to be after slotStart
_id:_ `appointment-no-validation-end-after-start` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/appointments/route.ts:11-15`

```
const createSchema = z.object({
  ..., appointmentDate: z.string(), slotStart: z.string(), slotEnd: z.string(), ...
});
```
**Impact.** A bad client can send slotEnd < slotStart; downstream calendar queries and worker capacity reports will compute negative durations. UI always sends +30min but admin can craft requests.

**Fix.** z.refine ensuring new Date(slotEnd) > new Date(slotStart) and both >= now-tolerance. Same on PATCH.

### [P1] PATCH /workers/[id] accepts status writes under WORKERS_MANAGE without lifecycle invariants
_id:_ `worker-patch-status-self-assigned` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/workers/[id]/route.ts:26-28`

```
status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']).optional(), notes: z.string().nullable().optional(), monthlySalary: z.number().nullable().optional(),
}).parse(await req.json());
const worker = await prisma.worker.update({ where: { id: params.id }, data: body as any });
```
**Impact.** Setting status='INACTIVE' is allowed even when the worker still has open WorkerAssignments — those assignments silently remain on active job cards while filters hide the worker, producing 'orphan-assigned' jobs. No event hook updates the open assignments.

**Fix.** Block INACTIVE when prisma.workerAssignment.count({ where: { workerId, jobCard: { status: { notIn: ['DELIVERED','CANCELLED'] } } } }) > 0, or auto-unassign in a transaction with audit log.

### [P1] PATCH /workers/[id]/leave APPROVED forces worker.status='ON_LEAVE' regardless of leave dates
_id:_ `worker-leave-approval-sets-status-blindly` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/workers/[id]/leave/route.ts:27-29`

```
const leave = await prisma.workerLeave.update({ where: { id: body.leaveId, workerId: params.id }, data: { status: body.status, approvedByAdminId: user.sub } });
if (body.status === 'APPROVED') await prisma.worker.update({ where: { id: params.id }, data: { status: 'ON_LEAVE' } });
```
**Impact.** Approving a leave for next month immediately flips the worker to ON_LEAVE today, removing them from the workers/calendar 'available' list and from worker filter dropdowns. Nothing flips them back to ACTIVE when the leave ends — manual cleanup forever.

**Fix.** Only flip status if today is between startDate and endDate. Add a daily cron (or compute status dynamically from active leave) and revert when leave window passes.

### [P2] POST /workers/[id]/leave does not check overlap with existing leaves or open assignments
_id:_ `worker-leave-overlap-not-checked` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/workers/[id]/leave/route.ts:9-20`

```
const body = z.object({
  leaveType: z.string().min(1), startDate: z.string(), endDate: z.string(), reason: z.string().optional(),
}).parse(await req.json());
const leave = await prisma.workerLeave.create({ data: { workerId: params.id, leaveType: body.leaveType, startDate: new Date(body.startDate), endDate: new Date(body.endDate), reason: body.reason } });
```
**Impact.** Same worker can have 5 overlapping APPROVED leaves; endDate before startDate is accepted. Leave doesn't check appointments already assigned to that worker in the window.

**Fix.** Validate endDate >= startDate. Refuse overlap with status in (PENDING,APPROVED). Warn if appointments exist in the window.

### [P2] GET /workers/calendar returns at most 200 assignments with no filter, no date range
_id:_ `workers-calendar-take-200-no-pagination` · _category:_ performance · _file:_ `apps/web/src/app/api/admin/workers/calendar/route.ts:13`

```
prisma.workerAssignment.findMany({ include: { worker: { select: { fullName: true } }, jobCard: { select: { jobCardNumber: true, status: true, intakeDate: true, estimatedDeliveryAt: true } } }, orderBy: { assignedAt: 'desc' }, take: 200 }),
```
**Impact.** Hardcoded take:200 silently truncates after the shop has even a few months of activity; calendar will look empty for older slots. No date-range query, so the page always over-fetches. No index on assignedAt either.

**Fix.** Accept ?from=&to= query params, filter assignments by jobCard.intakeDate/estimatedDeliveryAt within range, drop take. Add index on WorkerAssignment(jobCardId, assignedAt) if hot.

### [P1] GET /appointments date filter uses equality on appointmentDate (DateTime) — never matches
_id:_ `appointment-list-date-filter-equality` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/appointments/route.ts:29`

```
if (date) where.appointmentDate = new Date(date);
```
**Impact.** appointmentDate is a DateTime stored with the time component, but the filter binds the YYYY-MM-DD midnight; queries with ?date=2026-06-10 only match appointments whose appointmentDate is exactly midnight UTC. Day-view UI will look empty.

**Fix.** Convert to range: const d = new Date(date); where.appointmentDate = { gte: startOfDay(d), lt: addDays(startOfDay(d),1) }. Use a small date helper to avoid TZ drift.

### [P2] Job-card search joins customer.fullName + jobCardNumber on every keystroke without DB-level FTS
_id:_ `jobcard-search-customer-no-index` · _category:_ performance · _file:_ `apps/web/src/app/api/admin/job-cards/route.ts:29-37`

```
if (search) where.OR = [{ jobCardNumber: { contains: search, mode: 'insensitive' } }, { customer: { fullName: { contains: search, mode: 'insensitive' } } }];
```
**Impact.** `contains insensitive` triggers a sequential scan in Postgres without a trigram index. Combined with page.tsx firing on every onChange (no debounce, unlike workers/page.tsx which debounces 300ms), this hits the DB on every keystroke. Will brown out on a few hundred job cards.

**Fix.** Debounce search input (use the same useRef pattern from workers page). Add pg_trgm GIN indexes on JobCard.jobCardNumber and Customer.fullName, or move to dedicated search.

### [P2] Task status field is free-form string in DB and accepted as z.string() in PATCH
_id:_ `jobcard-tasks-no-status-enum` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/job-cards/[id]/tasks/route.ts:29-32`

```
const body = z.object({
  taskId: z.string(), status: z.string().optional(), taskName: z.string().optional(),
  assignedWorkerId: z.string().nullable().optional(), actualMinutes: z.number().optional(),
}).parse(await req.json());
```
**Impact.** UI uses PENDING/IN_PROGRESS/DONE but the DB column is String (not enum) and the API accepts anything. Typos break the StatusBadge color mapping and analytics queries that group by task.status.

**Fix.** Either migrate to an enum (recommended) or z.enum(['PENDING','IN_PROGRESS','DONE','BLOCKED','SKIPPED']) in both POST and PATCH. Same applies to JobCardTask creation (line 18 forces 'PENDING' fine).

### [P2] POST /job-cards/[id]/workers allows duplicate assignment of same worker to same job card
_id:_ `worker-assignment-duplicate-no-unique` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/job-cards/[id]/workers/route.ts:12-17`

```
const body = z.object({ workerId: z.string(), assignmentRole: z.string().optional() }).parse(await req.json());
const assignment = await prisma.workerAssignment.create({
  data: { jobCardId: params.id, workerId: body.workerId, assignmentRole: body.assignmentRole },
  include: { worker: true },
});
```
**Impact.** Same worker can be assigned twice to the same job card with a double-click (no idempotency, no unique constraint). Worker dropdown does not exclude already-assigned workers. activeCount displayed in job-cards/page.tsx then double-counts.

**Fix.** @@unique([jobCardId, workerId]) on WorkerAssignment + handleApiError already maps P2002 to 409. Also disable submit while pending in the UI.

### [P2] No rate limiting on any admin route; no IP throttle
_id:_ `jobcard-routes-no-rate-limit` · _category:_ security · _file:_ `apps/web/src/app/api/admin/job-cards/route.ts:18-55`

```
export async function GET(req: NextRequest) { try { const user = requireAnyPermission(...); ... }
export async function POST(req: NextRequest) { try { const user = requirePermission(...); ... }
```
**Impact.** Authenticated admins are trusted absolutely. A leaked token or a buggy script (e.g. a debounce regression) can hammer /job-cards or create thousands of job cards instantly, exhausting jobCardNumber sequence and creating thousands of DRAFT invoices.

**Fix.** Add edge-rate-limit middleware (e.g. @upstash/ratelimit or a simple in-memory token bucket per user.sub for mutations).

### [P1] Sentry directory is empty — unhandled errors only go to console.error
_id:_ `sentry-not-initialized` · _category:_ observability · _file:_ `apps/web/src/lib/sentry/`

```
ls apps/web/src/lib/sentry/ -> (empty)
lib/errors.ts:91 console.error('Unhandled API error:', error);
```
**Impact.** For tomorrow's go-live, every 500 (and there will be some, given missing transactions above) is invisible — no alerting, no stack trace, no user repro. Activity logger is fire-and-forget too.

**Fix.** Install @sentry/nextjs, init server + edge configs, call Sentry.captureException(error) inside handleApiError before the 500 response. Even a free tier is sufficient for day 1.

### [P1] lib/auth.ts only reads Authorization: Bearer header; cookie-based session not parsed here
_id:_ `auth-bearer-only-no-cookie` · _category:_ auth · _file:_ `apps/web/src/lib/auth.ts:7-12`

```
export function getAuthToken(): string {
  const h = headers();
  const auth = h.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token');
  return auth.slice(7);
}
```
**Impact.** The audit scope mentions JWT in cookie + middleware-parsed. Here every admin API route demands the client to set Authorization manually. If a browser navigation/SSR call lacks the header (e.g. a Next server-component fetching server-side), it will 401. Confirm the middleware actually proxies cookie->Authorization; otherwise admin pages may silently fail or rely on client-only auth (the .tsx pages all use api.get from the client, suggesting yes — but document this).

**Fix.** If cookie auth is intended, parse cookies too: const c = cookies().get('token')?.value. Document the contract. Ensure cookies set with httpOnly + secure + sameSite=Lax (audit middleware/login route — out of scope here).

### [P2] UI uses window.confirm for destructive delete; no in-app modal, no double-confirm of consequences
_id:_ `jobcard-detail-window-confirm` · _category:_ ux · _file:_ `apps/web/src/app/admin/job-cards/[id]/page.tsx:241-243`

```
if (!confirm(msg)) return;
const res = await api.delete(`/admin/job-cards/${id}`);
if (res.success) router.push('/admin/job-cards');
```
**Impact.** window.confirm is blocked by some browsers, doesn't follow dark theme, and a fat-finger 'Enter' confirms it. For a destructive action that wipes invoices + payments, this is too thin.

**Fix.** Use the existing Modal component with a typed-confirmation ('type DELETE to confirm') for any job card with payments > 0.

### [P3] Several mutating buttons (assign worker, add task, update part qty, save notes) don't disable while in-flight
_id:_ `jobcard-detail-no-disable-on-save` · _category:_ ux · _file:_ `apps/web/src/app/admin/job-cards/[id]/page.tsx:152-174`

```
const assignWorker = async () => { if (!workerForm.workerId) return; const res = await api.post(...); if (res.success) { ... } };
const addTask = async () => { if (!taskForm.taskName) return; const res = await api.post(...); if (res.success) { ... } };
```
**Impact.** Double-click creates duplicate tasks / duplicate assignments / racing onBlur calls when typing fast in parts qty (each updatePart issues a PATCH+reload).

**Fix.** Add per-action saving state and disable the button. Coalesce onBlur PATCHes (only PATCH if the value actually changed, mirror the pattern used in details section).

### [P3] Appointments page load() does not reset page to 1 on filter change
_id:_ `appointment-page-load-not-paged-on-filter` · _category:_ ux · _file:_ `apps/web/src/app/admin/appointments/page.tsx:96-101`

```
<input ... value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value, statusFilter); }} />
<select ... onChange={(e) => { setStatusFilter(e.target.value); load(search, e.target.value); }}>
```
**Impact.** User on page 4, applies a status filter that has 2 result pages — sees empty results and thinks nothing matches.

**Fix.** setPage(1) before calling load on filter/search change; also debounce the search input.

### [P3] job-cards/page.tsx worker dropdown shows 'active' count computed only from the current paginated page
_id:_ `jobcard-page-active-count-from-current-page-only` · _category:_ business-logic · _file:_ `apps/web/src/app/admin/job-cards/page.tsx:156-159`

```
const activeCount = data.filter((jc: any) => jc.assignments?.some((a: any) => a.worker?.fullName === w.fullName) && !['DELIVERED','CANCELLED'].includes(jc.status)).length;
```
**Impact.** Counts are misleading — only counts what's in the current 20-row page. Also matches by fullName (could collide on duplicate names).

**Fix.** Either drop the active count or fetch a real aggregate from /admin/workers (already returns _count.assignments). Match by id, not name.

### [P3] Job-cards list status filter sends raw DB enum values; UI display uses simplified statuses elsewhere — inconsistent
_id:_ `jobcard-list-status-filter-uses-db-values` · _category:_ consistency · _file:_ `apps/web/src/app/admin/job-cards/page.tsx:151-153`

```
{['CREATED','ESTIMATE_PREPARED','WORK_IN_PROGRESS','READY_FOR_DELIVERY','DELIVERED','CANCELLED'].map((s) => <option key={s} value={s}>{s === 'CREATED' ? 'OPEN' : ...
```
**Impact.** Detail page uses 6 SIMPLE_STATUSES (and toSimpleStatus collapses many DB enum values like APPROVED, PARTS_PENDING, QUALITY_CHECK to IN_PROGRESS). The list filter omits those — a job card in QUALITY_CHECK is invisible when filtering by 'In Progress'.

**Fix.** Build the filter on top of the simple status set and map back to where: { status: { in: [...] } } server-side, OR run a migration that collapses to the simple set.

### [P2] None of these admin routes enforce a tenant/organization scope on the queried entities
_id:_ `jobcard-no-tenant-scope` · _category:_ auth · _file:_ `apps/web/src/app/api/admin/job-cards/[id]/route.ts:9-15`

```
requireAnyPermission(PERMISSIONS.JOB_CARDS_CREATE, PERMISSIONS.JOB_CARDS_VIEW_OWN);
const jc = await prisma.jobCard.findUniqueOrThrow({ where: { id: params.id }, include: { ... } });
```
**Impact.** PERMISSIONS.JOB_CARDS_VIEW_OWN suggests an 'own' scope is intended, but the route doesn't filter by createdById/assignedTo. A user with VIEW_OWN can read any job card if they know the id. Same for parts/tasks/workers routes — they only check the user can act on job cards in general, never that this particular jobCardId belongs to them.

**Fix.** For VIEW_OWN, AND a clause like { OR: [{ createdById: user.sub }, { assignments: { some: { workerId: user.workerId } } }] }. For mutating routes that should be scoped, verify ownership before mutating.

### [P3] Auto-created DRAFT invoice has no subtotal/grandTotal init — relies on Prisma defaults being 0
_id:_ `jobcard-invoice-create-decimal-defaults` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/job-cards/route.ts:50-51`

```
const invData: any = { invoiceNumber: generateInvoiceNumber(), jobCard: { connect: { id: jc.id } }, customer: { connect: { id: body.customerId } }, vehicle: { connect: { id: body.vehicleId } }, createdBy: { connect: { id: user.sub } }, invoiceDate: new Date(), invoiceStatus: 'DRAFT', paymentStatus: 'UNPAID' };
await prisma.invoice.create({ data: invData });
```
**Impact.** Works today (schema defaults), but `as any` (the cast through invData: any) hides the next time someone adds a required field. Also no audit log entry for the implicit invoice creation, so the audit trail will show a job card created and an invoice appearing 'from nowhere'.

**Fix.** Type with Prisma.InvoiceCreateInput; emit a second logActivity for the invoice creation referencing actorId=user.sub and parent jobCardId.

### [P3] generateJobCardNumber/generateInvoiceNumber/generateAppointmentRef collisions not covered by retry
_id:_ `jobcard-id-generator-collision-risk` · _category:_ data-integrity · _file:_ `apps/web/src/lib/id-generators.ts`

```
jobCardNumber: generateJobCardNumber()  // unique in schema
invoiceNumber: generateInvoiceNumber()  // unique
referenceId: generateAppointmentRef()   // unique
```
**Impact.** If the generators are time- or random-based and two requests collide, P2002 is mapped to 409 by handleApiError and the user sees 'A record with this jobCardNumber already exists' — confusing for an admin creating a job card. Worse, the auto-invoice in the same POST is created after the job card row exists, so a collision on invoiceNumber leaves an orphan job card with no invoice (compounds finding jobcard-create-no-transaction).

**Fix.** Audit id-generators.ts (out of scope but flag). At minimum, retry up to 3 times on P2002 for these synthetic ids inside the (to-be-added) transaction.
