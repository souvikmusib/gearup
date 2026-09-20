---
mode: reference
updated: 2026-09-20
verified_against: bb1ba1c
---

# Product and domain

> **This describes the code as it stands on `bb1ba1c`, not the plan.** gearup runs in production for a paying freelance client under a Pvt Ltd workspace. The invariants named below are the ones a new contributor will break if they do not know them; each is cited to the file that enforces it.

> **Method.** I read `apps/web/prisma/schema.prisma` (1,061 lines, 34 models, 20 enums) in full. I read the RBAC source of truth `packages/types/src/domain.ts` (204 lines) in full and reconciled it against `docs/rbac.md`. I read `README.md`, `docs/architecture.md`, `docs/CODEBASE_CONTEXT.md`, `docs/notifications.md`, `docs/deployment.md`. For the lifecycle trace I read `apps/web/src/app/api/admin/job-cards/route.ts` (POST), `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts` (POST + `syncPartToInvoiceInTx`), `apps/web/src/app/api/admin/invoices/route.ts`, `apps/web/src/app/api/admin/invoices/[id]/finalize/route.ts` (POST + DELETE), `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts` (POST), and `apps/web/src/lib/hsn-rate.ts`, `apps/web/src/lib/time.ts`, `apps/web/src/lib/date-boundaries.ts`. Cross-cutting invariants were confirmed with `grep -rn` for `servicesRemaining`, `timeout:`, `IST_OFFSET_MS`, `syncPartToInvoiceInTx`. The HEAD sha was captured with `git rev-parse HEAD`.

> **What this pass did NOT do.** It did not read `apps/api/` (the old Express backend named in `docs/architecture.md`; the running app is Next.js Route Handlers, see §7). It did not read the full 47 admin page components, only the API layer that owns the invariants. It did not open `.env` or verify production secrets. It did not read every worker/leave/expense/report/notification route, only the routes that carry the canonical lifecycle. It did not run tests, typecheck, or the build. It did not audit `docs/audit/`, `docs/requirements/`, `docs/handoff.md`, `docs/RESTORE.md`, `docs/WORKFLOW_DETAILS.md`. It did not enumerate every migration in `apps/web/prisma/migrations/`. It did not open `apps/web/src/lib/invoice-calc.ts`, `apps/web/src/lib/id-generators.ts`, or `apps/web/src/lib/activity-logger.ts` beyond their public call sites.

---

## 1. What the product is

gearup is a vehicle-servicing operations SaaS for a single Indian garage business. It runs end-to-end shop workflow: a customer submits a service request from the public site, the shop confirms an appointment, opens a job card, reserves parts from inventory, drafts an invoice, finalises it, records payments, and marks the vehicle delivered. It also carries the surrounding accounting a garage needs to run: GST-aware invoicing with HSN codes, an Annual Maintenance Contract product with per-service decrement, salary slips for workers, and an activity log for every mutation.

The `README.md` names it "Production-grade vehicle servicing management system" and `docs/CODEBASE_CONTEXT.md` records the live domain as `gearup.sgnk.ai`. The stack is Next.js 14 (App Router) on Vercel, Supabase Postgres via Prisma, custom JWT + RBAC, Sentry, pnpm workspaces + Turborepo. `docs/architecture.md` still describes an Express backend under `apps/api/`; the running application does NOT use that. Every route lives under `apps/web/src/app/api/**` as a Next.js Route Handler. See §7 for the reconciliation.

The product is single-tenant. There is no organisation, no workspace, no tenant column on any table. Every `AdminUser`, `Customer`, `Vehicle`, `JobCard`, `Invoice`, `Payment` in the database belongs to one garage.

## 2. Actors

The system serves six actor classes. Five are administrative roles issued from `packages/types/src/domain.ts`; the sixth is the public customer who authenticates only by a phone + reference-id pair.

| Role | Source | What they do |
|---|---|---|
| `SUPER_ADMIN` | `PERMISSIONS` in `packages/types/src/domain.ts` | Everything, plus the four `SUPER_ADMIN_ONLY_PERMISSIONS` that are destructive or irreversible: `job-cards.delete`, `data.export`, `inventory.hard-delete`, `inventory.view-cost`. |
| `ADMIN` | same | Everything except the four super-admin-only permissions. This is the day-to-day owner role. |
| `RECEPTIONIST` | same | Front-desk workflow: customers, vehicles, service requests, appointments (view/confirm/check-in/no-show), job cards (create, view own, update status, assign workers), inventory (view/edit), invoices (view/create/finalize), payments, AMC contracts/plans, notifications, worker leave requests, data export. The busiest role. |
| `MECHANIC` | same | Read-heavy on the shop floor: dashboard, vehicles (view), appointments (view), job cards they are assigned to (view own + update status), inventory (view). Cannot see costs, cannot touch invoices. |
| `INVENTORY_MANAGER` | same | Inventory-first: full inventory including stock movements, plus customers/vehicles read+write, job-card creation, and invoice view+create. Cannot finalize invoices or record payments. |
| Public customer | `apps/web/src/app/api/public/**` (no auth) | Submits a service request through `/api/public/service-requests`, reads available slots through `/api/public/available-slots`, tracks a request by `(referenceId, phoneNumber)` through `/api/public/track`, and looks themselves up through `/api/public/customer-lookup`. Never logs in. |

**Docs discrepancy.** `docs/rbac.md` lists a different set of five roles: `SUPER_ADMIN`, `ADMIN`, `SERVICE_MANAGER`, `WORKER`, `BILLING`. The running code has never contained those three role keys. Trust `packages/types/src/domain.ts`; treat `docs/rbac.md` as stale from before the RBAC rewrite. Same doc uses tick marks in a permission matrix; the actual live permissions per role are what `ROLE_PERMISSIONS` in `domain.ts` returns.

The JWT payload defined in `packages/types/src/auth.ts` carries `roles: string[]` and `permissions: string[]` denormalised at login; every admin route calls `requirePermission()` from `apps/web/src/lib/auth.ts` to gate access.

## 3. Core domain concepts

The Prisma schema at `apps/web/prisma/schema.prisma` defines 34 models. The thirteen that make up the business domain are described here in business terms.

### Customer

A person, keyed by full name and phone number. `phoneNumber` is NOT yet unique at the database level; a `TODO(go-live+1): @unique` comment in the schema flags the dedupe migration, and the public service-request handler has an application-level guard until the migration runs. Carries optional email, alternate phone, address, and a soft-delete `archivedAt`. The `source` field notes how the customer entered the system (public form, walk-in, imported). Owns vehicles, service requests, appointments, job cards, invoices, AMC contracts, estimates.

### Vehicle

A physical vehicle owned by exactly one Customer (`onDelete: Cascade`; deleting a customer cascades their vehicles). Typed by `VehicleType` (CAR, BIKE, SCOOTY, OTHER), described by brand, model, optional variant, year of manufacture, fuel type, transmission, colour, VIN, chassis and engine numbers, engine CC, and current odometer reading. `registrationNumber` is the everyday key; it is also flagged `TODO(go-live+1): @unique` and not yet enforced. A vehicle can accumulate many service requests, appointments, job cards, invoices, and AMC contracts over its lifetime.

### ServiceRequest

An inbound request for work, either submitted through the public booking form or created by shop staff. Carries a customer-visible `referenceId` (unique), the service category, an issue description, an optional preferred date and slot label, urgency, whether pickup-drop is required, and free-text notes. Moves through `ServiceRequestStatus`: `SUBMITTED`, `UNDER_REVIEW`, `APPOINTMENT_PENDING`, `APPOINTMENT_CONFIRMED`, `CONVERTED_TO_JOB`, `CANCELLED`, `CLOSED`. Has an optional one-to-one Appointment and one-to-many JobCards.

### Appointment

A time slot booked for a vehicle. Carries `referenceId` (unique), a UTC `appointmentDate`, `slotStart` and `slotEnd`, a `bookingSource` string, an optional confirmation mode and confirming admin, an optional assigned worker and bay id, and reasons for reschedule or cancellation. Moves through `AppointmentStatus`: `REQUESTED`, `PENDING_REVIEW`, `CONFIRMED`, `RESCHEDULED`, `CANCELLED`, `NO_SHOW`, `CHECKED_IN`, `COMPLETED`. Slot availability is governed by `AppointmentSlotRule` (day-of-week, open/close time, slot duration, max capacity), `BlockedSlot` (one-off time-range block), and `Holiday`.

### JobCard

The work order. The single most important entity in the shop. Carries a unique `jobCardNumber` (see §5 on ID generation), optional links to the originating Appointment and ServiceRequest, mandatory Customer and Vehicle, `intakeDate`, odometer at intake, fuel indicator, optional `estimatedDeliveryAt` and `actualDeliveryAt`, a mandatory `issueSummary`, customer complaints, diagnosis and estimate notes, an `ApprovalStatus` on the estimate, priority, and a `JobCardStatus` running through thirteen values from `CREATED` to `DELIVERED`/`CLOSED`. Carries denormalised money on the row itself (`estimatedPartsCost`, `estimatedLaborCost`, `estimatedOtherCost`, `estimatedTotal`, and mirrored `final*` columns) as Postgres `Decimal(12, 2)`. Owns Tasks (`JobCardTask`), Parts (`JobCardPart`), Worker Assignments, one or more Invoices (see §5 on uniqueness), and AMC Service Usages. An estimate can be shared through a signed `estimateToken` link with an `estimateTokenExpiresAt`.

### Invoice

The billing document for a job card, or, for over-the-counter parts sale, standalone. Carries a unique `invoiceNumber`, mandatory `customerId`, optional `vehicleId`, optional `jobCardId` (comment in schema: `TODO(go-live+1): @unique`; see §5 on how the code compensates), optional `appointmentId`, invoice and due dates, a full running set of totals as `Decimal(12, 2)` (`subtotal`, `discountAmount`, `taxTotal`, `grandTotal`, `amountPaid`, `amountDue`), two status axes (`InvoiceStatus`: `DRAFT`/`FINALIZED`/`CANCELLED` and `PaymentStatus`: `UNPAID`/`PARTIALLY_PAID`/`PAID`/`REFUNDED`/`WAIVED`), a `showGst` flag that governs HSN rate resolution (see §5), and a `createdByAdminId`. The FK to Customer/Vehicle/JobCard/AdminUser is `onDelete: Restrict` so financial parents cannot be silently orphaned. Owns InvoiceLineItems and Payments.

### InvoiceLineItem (LineItem)

A single billable row. Typed by `InvoiceLineType`: `PART`, `LABOR`, `SERVICE_CHARGE`, `CUSTOM_CHARGE`, `DISCOUNT_ADJUSTMENT`, `AMC`. Carries optional `referenceItemId` (points to an `InventoryItem`, a `Worker`, an `AmcContract`, or an `AmcPlan` depending on `lineType`), optional `hsnCode`, `quantity`, `unitPrice`, `discountPercent`, `taxRate`, `taxAmount`, `lineTotal`, and `sortOrder` for display. `DISCOUNT_ADJUSTMENT` lines are excluded from `subtotal`/`taxTotal` and tracked separately in the invoice's `discountAmount`; see the line-item calculation notes in `apps/web/src/app/api/admin/invoices/route.ts`.

### Payment

Money received against an invoice. Carries mandatory `invoiceId`, `amount`, `paymentMode` (`CASH`/`CARD`/`UPI`/`BANK_TRANSFER`/`CHEQUE`/`OTHER`), `paymentDate`, optional `referenceNumber` and notes, and the receiving admin (`receivedByAdminId`). Cascade-deletes with the parent invoice. See §5 for the optimistic-lock rule that prevents two concurrent payments from clobbering `amountPaid`.

### InventoryItem

A stocked SKU. Carries `sku` (unique), `itemName`, `categoryId`, optional `supplierId`, brand, description, compatible vehicle types, unit, `taxRate` and `hsnCode` (used for GST resolution), `costPrice`, optional `mrp`, `sellingPrice`, optional `discountPercent` and `amcDiscountPercent`, `quantityInStock`, `reservedQuantity`, optional `reorderLevel` and `reorderQuantity`, storage location, barcode, and boolean flags for `isActive`, `variablePrice`, `isBranded`. Money is `Decimal(12, 2)`; quantities are `Decimal(12, 2)` too (fractional units are legal). Related to VehicleModels through `InventoryItemModel` for parts compatibility. Owns many StockBatches and appears on JobCardParts, EstimateItems, and StockMovements.

### StockBatch

A single purchase lot of an inventory item. Carries `batchNumber`, optional `supplierId`, per-batch `costPrice`, `sellingPrice`, optional `mrp`, `initialQty`, `remainingQty`, `purchaseDate`, optional `expiryDate`, purchase reference, and notes. FIFO consumption is governed by `purchaseDate ASC`; see the parts-reservation logic in `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts`. Customer pricing does NOT come from the batch; it comes from the parent `InventoryItem`. The recent commit `04ddc51` ("fix: use inventory item price for invoice lines, not batch price") on 2026-09-20 tightened this rule; the code comment now reads "Batches track cost/quantity for FIFO, not customer pricing."

### AmcContract

An Annual Maintenance Contract sold to a Customer against a Vehicle for a fixed number of services over a fixed number of months, at a fixed extra-discount percent and labour-discount percent (default 100%, i.e. labour is free under AMC). Carries a unique `contractNumber`, `customerId`, `vehicleId`, `amcPlanId`, `startDate`, `endDate`, `totalServices`, `servicesUsed`, `servicesRemaining`, discount percents, `amountPaid`, optional `paymentMode` and `paymentDate`, and status (`ACTIVE`/`EXPIRED`/`CANCELLED`). Owns AmcServiceUsage records (one per redemption). FKs to Customer/Vehicle/Plan are `onDelete: Restrict`.

### AmcPlan

The template a contract is sold against. Carries `planName`, description, `vehicleType`, optional `ccRange`, `durationMonths`, `totalServicesIncluded`, `price`, optional `mrpPrice`, `extraDiscountPercent`, `laborDiscountPercent` (default 100), a JSON `coveredItems` blob, free-text `exclusions`, and `isActive`.

### HsnRate

The GST rate lookup by HSN code, seeded and administered separately. Carries `hsnCode` (unique), `rate` (`Decimal(5, 2)`), and optional description. `apps/web/src/lib/hsn-rate.ts` caches this in-process; unknown HSNs default to 18%; empty HSN means 0% GST.

### Additional entities the schema names (not on the ask list)

Worth surfacing because a new developer will meet them: `AdminUser` + `Role` + `Permission` + `AdminUserRole` + `RolePermission` (auth), `Worker` + `WorkerLeave` + `WorkerAssignment` + `JobCardTask` (labour), `InventoryCategory`, `Supplier`, `StockMovement`, `ExpenseCategory`, `Expense`, `NotificationTemplate`, `Notification`, `ActivityLog`, `Setting`, `AppointmentSlotRule`, `BlockedSlot`, `Holiday`, `DocumentSequence` (see §5), `VehicleBrand`, `VehicleModel`, `InventoryItemModel`, `Estimate`, `EstimateItem` (a recent feature, see the `feat/estimates` commits).

## 4. The lifecycle

The canonical journey. Each step names the route that owns it.

**1. Customer submits a public service request.**
`POST /api/public/service-requests` (`apps/web/src/app/api/public/service-requests/route.ts`). In one transaction: upsert a Customer keyed on `phoneNumber` (application-level guard until the `@unique` migration lands), upsert a Vehicle keyed on `registrationNumber`, create a `ServiceRequest` with `status: SUBMITTED` and a fresh `referenceId`, optionally create an `Appointment` with `status: REQUESTED` if a preferred date and slot are supplied. A `SERVICE_REQUEST_CREATED` WHATSAPP notification is queued.

**2. Shop confirms the appointment.**
Receptionist or admin reviews the queue (`GET /api/admin/service-requests`, `GET /api/admin/appointments`), then either creates a fresh Appointment (`POST /api/admin/appointments`, permission `appointments.confirm`) linked to the ServiceRequest, or updates the existing one (`PATCH /api/admin/appointments/[id]`) to `status: CONFIRMED` with a `confirmedByAdminId`. `APPOINTMENT_CONFIRMED` notification is queued. The customer's arrival is recorded as `CHECKED_IN`.

**3. Job card is opened.**
`POST /api/admin/job-cards` (`apps/web/src/app/api/admin/job-cards/route.ts`, permission `job-cards.create`). In one transaction: generate a fresh `jobCardNumber` through `generateJobCardNumber(tx)`, create the JobCard with `status: CREATED`, set the linked ServiceRequest's status to `CONVERTED_TO_JOB`, snapshot the vehicle's odometer reading, AND auto-create a companion DRAFT Invoice with a fresh `invoiceNumber` linked back to the same job card. From this point onwards the invoice grows in place; a job card and its draft invoice are one-to-one.

**4. Parts are added and reserved from inventory.**
`POST /api/admin/job-cards/[id]/parts` (`apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts`). Before opening the transaction, the route pre-resolves HSN and GST rate through `resolveHsnAndRate()` (see §5 on why); then in one 30-second transaction it: (a) reserves stock through `adjustStock()` with a FIFO walk over `StockBatch` ordered by `purchaseDate ASC`, guarded by a `where: { quantityInStock: { gte: qty } }` `updateMany` so an oversell fails atomically; (b) creates the `JobCardPart` row; (c) writes a `StockMovement` audit row; (d) recomputes the job card's `estimatedPartsCost` and `estimatedTotal`; (e) calls `syncPartToInvoiceInTx()` which appends a matching `PART` line item to the DRAFT invoice, priced from the InventoryItem (mrp then sellingPrice), taxed at the pre-resolved GST rate, and then recomputes the invoice's `subtotal`, `taxTotal`, `grandTotal`, `amountDue`.

**5. Invoice draft grows.**
Alongside the auto-added part lines, staff can add labour, service charges, custom charges, AMC lines, and discount adjustments through `POST /api/admin/invoices/[id]/line-items` (`apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts`), and edit or remove them. Every mutation recomputes totals through `recalcTotalsTx` (the same math as the initial create in `apps/web/src/app/api/admin/invoices/route.ts`, keyed on `computeLineTotal` and `nonDiscountPreSubtotal` from `apps/web/src/lib/invoice-calc.ts`). Parts and labour are individually taxed at HSN-resolved rates; discount adjustments are not taxed and are held separately from `subtotal`.

**6. Invoice is finalized.**
`POST /api/admin/invoices/[id]/finalize` (`apps/web/src/app/api/admin/invoices/[id]/finalize/route.ts`, permission `invoices.finalize`). One transaction: (a) `tx.invoice.updateMany({ where: { id, invoiceStatus: 'DRAFT' } })` flips status to `FINALIZED` and stamps `finalizedAt`; the `updateMany` returning `count !== 1` throws 409, which is the atomic guard against double-finalize; (b) any `AMC` line items whose `referenceItemId` points to an existing `AmcContract` (i.e. redemption of an existing plan) run the race-safe decrement described in §5. The mirror route `DELETE /api/admin/invoices/[id]/finalize` reverts a FINALIZED, UNPAID invoice back to DRAFT and rolls back the AMC decrements.

**7. Payment is recorded.**
`POST /api/admin/invoices/[id]/payments` (`apps/web/src/app/api/admin/invoices/[id]/payments/route.ts`, permission `payments.record`). One transaction: (a) `tx.invoice.updateMany` conditional on `invoiceStatus: 'FINALIZED'` AND `paymentStatus != 'PAID'` AND `amountDue >= body.amount` atomically increments `amountPaid` and decrements `amountDue`; the `count === 0` branch classifies the failure (not finalized, already paid, overpayment) and throws; (b) the Payment row is created; (c) a second `updateMany` guarded on the previously observed `amountPaid` value optimistically locks the status update to `PAID` or `PARTIALLY_PAID`; a lost race throws 409 "Concurrent payment detected".

**8. AMC contract usage decrements (if applicable).**
Two paths, both covered above and both race-safe. Existing-contract redemption fires inside the finalize transaction. New-plan purchase (invoice line where `referenceItemId` points to an `AmcPlan`) fires inside the payments transaction on full payment: it creates a fresh `AmcContract` with `contractNumber` from `generateAmcContractNumber()`, `startDate: now`, `endDate: now + plan.durationMonths`, `servicesUsed: 1`, `servicesRemaining: plan.totalServicesIncluded - 1` (the invoice itself counts as the first service), and one `AmcServiceUsage` row.

**9. Job card marked delivered.**
Same transaction as step 7. When the payment fully clears the invoice (`paymentStatus === 'PAID'`) AND `invoice.jobCardId` is set, the job card's status is set to `DELIVERED` and `actualDeliveryAt: new Date()` in the same transaction. `FULL_PAYMENT_RECEIVED` notification is queued.

The mirror lifecycle for counter parts sales (no job card) skips steps 3, 4, 5's part-sync, and 9; the invoice is created directly through `POST /api/admin/invoices` with `saleType: 'COUNTER'`, then finalized and paid the same way.

## 5. Domain rules that matter

Rules a new developer will break if they do not know them. Every claim is cited to the file that enforces it.

**Draft vs Finalized invoice is a one-way door.** A DRAFT can be freely edited (line items added, removed, priced). A FINALIZED invoice is locked; the only reversal is `DELETE /api/admin/invoices/[id]/finalize`, and only while `paymentStatus === 'UNPAID'`. See `finalize/route.ts` lines 12-18 (POST) and lines 62-71 (DELETE). Never bypass this with a direct `tx.invoice.update` on a FINALIZED row.

**One invoice per job card, sort of.** The schema currently reads `jobCardId String?` without `@unique` and a `TODO(go-live+1): @unique - needs dedupe migration` comment. The write path in `apps/web/src/app/api/admin/invoices/route.ts` nevertheless catches Prisma's `P2002` on `jobCardId` and returns a 409 with "Invoice already exists for this job card", and `apps/web/src/app/api/admin/job-cards/route.ts` (line 68) auto-creates exactly one DRAFT invoice when a job card is opened. So the invariant is honoured by the application and by an implied database constraint that must exist in a migration ahead of the current schema view, but the schema.prisma comment says otherwise. Treat "one draft invoice per job card" as the rule; verify the underlying constraint before assuming `P2002` will fire.

**`syncPartToInvoiceInTx` runs inside the parts-add transaction, and HSN resolution runs OUTSIDE it.** `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts` (lines 167-215) defines `syncPartToInvoiceInTx(tx, jobCardId, inventoryItemId, quantity, unitPrice, preResolved)`. The caller MUST pre-resolve HSN and tax rate through `resolveHsnAndRate()` before opening the transaction, then pass the resolved pair in. The reason is in the file comment (lines 158-165 and 218-221): on Vercel serverless + Supabase pooler, `resolveHsnAndRate` opens separate connections for `HsnRate.findMany` and `InventoryItem.findUnique` which routinely took 5-10s under load, causing `P2028` "Transaction already closed" 500s. The same pattern is repeated in `apps/web/src/app/api/admin/invoices/route.ts` (lines 84-92): resolve every line item's HSN outside the tx, then open the tx.

**Transaction timeouts are 30s / maxWait 10s on every multi-step write; the global default is 15s.** `apps/web/src/lib/prisma.ts` line 46 sets `transactionOptions: { maxWait: 10000, timeout: 15000 }` globally. The routes that carry the big lifecycle transactions override this: `invoices/route.ts` POST (line 118), `invoices/[id]/line-items/route.ts` (line 270), `job-cards/[id]/parts/route.ts` (line 229), and `estimates/[id]/convert/route.ts` (line 108) all pass `{ timeout: 30000, maxWait: 10000 }`. Never open a lifecycle write with the default; assume any lifecycle transaction needs 30s under real network conditions.

**HSN and GST resolution has a documented default.** `apps/web/src/lib/hsn-rate.ts` `getGstRate()`: `if (!hsnCode) return 0` (no HSN means no GST); `return rates.get(hsnCode) ?? 18` (unknown HSN falls back to 18%). The full resolver `resolveHsnAndRate(lineType, showGst, inventoryItemId?, explicitHsn?)`: an explicit HSN wins; else for a `PART` line the HSN comes from the linked `InventoryItem.hsnCode`; else null. If `showGst` is false the returned `taxRate` is 0 regardless. Rates are cached in module-scope; the cache is invalidated through `invalidateHsnRateCache()` after any HsnRate mutation.

**AMC `servicesRemaining` decrement is race-safe by construction.** Every decrement goes through `tx.amcContract.updateMany({ where: { id, servicesRemaining: { gt: 0 } }, data: { servicesUsed: { increment: 1 }, servicesRemaining: { decrement: 1 } } })` and checks `count === 0` to detect a lost race. Instances: `apps/web/src/app/api/admin/invoices/[id]/finalize/route.ts` line 32-38, `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts` line 173-183. The mirror decrement on payments (`apps/web/src/app/api/admin/invoices/[id]/payments/route.ts` line 97) writes the fresh contract's `servicesRemaining = plan.totalServicesIncluded - 1` in the same transaction that creates the contract; there is no race window.

**Concurrent payment guard uses an optimistic-lock `updateMany`.** `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts` lines 54-63: after the atomic increment on `amountPaid`, the follow-up `paymentStatus` update is keyed on the exact `amountPaid` value observed a moment earlier; a concurrent second payment shifts that value and the second write's `count !== 1` throws 409. Do not replace it with a plain `tx.invoice.update`.

**Currency and quantity are Postgres `Decimal(12, 2)`, never `Float`.** Every money column in the schema is `@db.Decimal(12, 2)`; every quantity column is `@db.Decimal(12, 2)` (fractional units are legal because the shop stocks fluids by litre); tax rates and discount percents are `@db.Decimal(5, 2)`. In application code these become Prisma `Decimal` instances; the arithmetic sites (`invoice-calc.ts`, the recalculators) coerce through `Number()` and round with `Math.round(x * 100) / 100`. Never introduce `parseFloat` on a money value.

**IST timezone is applied at query-boundary, not stored.** All timestamps in the database are UTC. The application converts to IST (`UTC + 5:30`) at three places: (a) `apps/web/src/lib/date-boundaries.ts` returns UTC boundaries for "today in IST" and "date range in IST" for queries; (b) `apps/web/src/lib/time.ts` `istDayStart` / `istDayEnd` / `formatIST` / `formatTimeIST` for the report and PDF layer; (c) `apps/web/src/app/api/admin/invoices/route.ts` line 55, `apps/web/src/app/api/admin/job-cards/route.ts` line 44, and equivalent list endpoints parse user-supplied date filters as `new Date(from + 'T00:00:00+05:30')` and `new Date(to + 'T23:59:59+05:30')`. Never format a date without an explicit IST helper.

**FK delete policy is deliberate.** The file header of `schema.prisma` states it. Financial parents (Customer/Vehicle/JobCard/AmcPlan under Invoice, Payment, AmcContract, AmcServiceUsage) are `onDelete: Restrict` so an accidental cascade cannot silently orphan accounting state. Ownership children (`AdminUserRole`, `RolePermission`, `Vehicle` under Customer, `WorkerLeave`/`WorkerAssignment`/`JobCardTask`/`JobCardPart`/`InvoiceLineItem`/`Payment`) are `onDelete: Cascade` because the child has no meaning without the parent. Optional informational links (`Appointment.confirmedBy`, `JobCardTask.assignedWorker`, `Notification.createdBy`) are nullable and left implicit at Prisma's `SetNull` default. Do not "clean up" a `Restrict` by loosening it.

**IDs are generated through `DocumentSequence` and nanoid, not database sequences.** `apps/web/src/lib/id-generators.ts` (referenced by `job-cards/route.ts` `generateJobCardNumber(tx)`, `invoices/route.ts` `generateInvoiceNumber(tx)`, and equivalents) uses a `DocumentSequence` table keyed on `(kind, businessDate)` where `businessDate` is IST `YYYY-MM-DD`, transactionally incremented per business day. The header comment in `schema.prisma` also notes that `INV-${nanoid(8)}` is fine for single-garage scale but should migrate to `INV-YYYY-NNNNNN` for GST compliance ahead of ~100k invoices; treat the current scheme as sufficient for today, insufficient at scale.

**Every mutation writes an `ActivityLog` row.** `apps/web/src/lib/activity-logger.ts` `logActivity({ entityType, entityId, action, previousValue, newValue, actorType, actorId, tx? })` is called after every write path. The log is immutable; do not mutate `ActivityLog` rows and do not skip the call in a new route.

**Public routes NEVER read data across customer boundaries.** `apps/web/src/app/api/public/track/route.ts` requires `(referenceId, phoneNumber)` and only returns matching rows; `apps/web/src/app/api/public/customer-lookup/route.ts` is the same. No public endpoint takes only an id.

## 6. What is out of scope for gearup

Stated plainly because "we should also do X" is the fastest way to break the domain model.

- **General ledger accounting.** No double-entry, no chart of accounts, no journals. The `Expense` model tracks money going out at a categorical level; that is not accounting.
- **CRM beyond the Customer table.** No leads, no opportunities, no pipelines, no marketing campaigns, no email sequences beyond the ~20 transactional notification templates in `docs/notifications.md`.
- **E-commerce.** No online payments, no shopping cart, no shipping. `Payment.paymentMode` records money the shop received in person or by transfer, it does NOT execute a charge. There is no payment-gateway integration.
- **HR beyond salary slips.** `Worker`, `WorkerLeave`, `WorkerAssignment`, `Worker.monthlySalary`, and the salary-slip template in `apps/web/src/lib/salary-slip-template.ts` are the whole HR surface. No recruiting, no PF/ESI compliance modules, no performance reviews, no employee self-service portal.
- **Delivery routing.** No maps, no vehicle tracking, no route optimisation, no pickup-drop dispatch. `ServiceRequest.pickupDropRequired` is a boolean flag on the request; the shop handles the logistics offline.
- **Multi-tenant / multi-garage.** No tenant column anywhere. Every deploy is one garage.
- **Public customer login.** Customers authenticate to `/track` by `(referenceId, phoneNumber)` only. No accounts, no passwords, no self-serve portal beyond track/book.

## 7. Existing docs that already cover parts of this

Where to go for depth on a specific slice. Confidences vary; use with the caveats named.

- **`README.md`**. Stack summary and getting-started commands. Accurate.
- **`docs/architecture.md`**. High-level layer/stack table and RBAC + cron summary. Load-bearing caveat: it describes a two-app monorepo with `apps/web` (Next.js) + `apps/api` (Express) on Render, with cron jobs in the backend process. The running application is Next.js Route Handlers only; `apps/api` is not the deployed backend. Treat the Express references as outdated. The RBAC role list here is stale in the same way `docs/rbac.md` is.
- **`docs/CODEBASE_CONTEXT.md`**. The single densest reference. Repository structure, environment variables, database schema at a glance, auth flow, full endpoint list, business workflow prose, frontend layout, key library files, performance profile, production data as of 2026-04-19, test results, known issues. Load-bearing caveats: (a) also names the stale role set `SERVICE_MANAGER`/`WORKER`/`BILLING`; (b) the `VehicleType` enum listed here omits `SCOOTY` which the schema does have; (c) `InvoiceLineType` here omits `SERVICE_CHARGE` and `AMC` which the schema has; (d) the entity counts and endpoint counts (31 API routes, 47 pages, 31 models, 17 enums) are from April 2026 and the code has grown since (schema at HEAD has 34 models and 20 enums). Trust the code over the counts here.
- **`docs/rbac.md`**. The permission matrix at grain, but the role keys are stale (`SERVICE_MANAGER`/`WORKER`/`BILLING` instead of the live `RECEPTIONIST`/`MECHANIC`/`INVENTORY_MANAGER`). The permission list is a useful reference but should be cross-checked against `packages/types/src/domain.ts`.
- **`docs/notifications.md`**. Channel list, event-type-to-template mapping, template interpolation, delivery pipeline with `QUEUED`/`SENT`/`FAILED`/`DEAD_LETTER` and deduplication note. The mapping matches the enums in `schema.prisma`; treat this as the current source for what the shop sends and when.
- **`docs/deployment.md`**. Prerequisites, GitHub / Supabase / Sentry / Render / Vercel bootstrap, post-deploy verification, custom-domain notes. Same caveat as `architecture.md`: the Render + `apps/api` steps describe a topology the live deploy does not use; only the Vercel + Supabase + Sentry steps apply. Also carries stale env-var names (`NEXT_PUBLIC_API_BASE_URL`, `CORS_ALLOWED_ORIGINS`) that a same-origin Next.js Route Handler deploy does not need.
- **`docs/env.md`, `docs/timezone_plan.md`, `docs/qa-matrix.md`, `docs/api-contracts.json`, `docs/TEST_PLAN.md`, `docs/E2E_TESTING_REPORT.md`, `docs/TESTING_CHECKLIST.md`, `docs/WORKFLOW_DETAILS.md`, `docs/handoff.md`, `docs/RESTORE.md`, `docs/CALENDAR_RESEARCH.md`, `docs/audit/`, `docs/requirements/`, mockup HTML files**. Not read for this pass. Present in the tree; consult per topic. Their freshness is unverified.

## Where to go next

- The next doc in this series (once written) should be `docs/02-CODEBASE-MAP.md`: the file-tree at HEAD, the running app boundary (Next.js Route Handlers only), and the correct location of each concern named above.
- To rebuild trust in the older docs (`architecture.md`, `rbac.md`, `deployment.md`, `CODEBASE_CONTEXT.md`), stamp each with a fresh `verified_against` sha and rewrite the sections flagged in §7. Do not delete them; they carry decisions that are still correct alongside the stale references.
