---
mode: reference
updated: 2026-09-20
verified_against: 5af8fc8
---

# DATA MODEL

> **This describes the schema, not the plan.** Verified on 2026-09-20 against `5af8fc8`. Every field, enum value, relation, and index is read off `apps/web/prisma/schema.prisma` (1060 lines) at that SHA.

> **Method.** I read `apps/web/prisma/schema.prisma` in full, `apps/web/prisma/seed.ts` (353 lines), `apps/web/src/lib/prisma.ts` (client + pool config), `apps/web/src/lib/id-generators.ts` (129 lines), and a spot sample of the route handlers that mutate stock (`api/admin/invoices/[id]/line-items/route.ts`, `api/admin/job-cards/[id]/parts/route.ts`, `api/admin/estimates/[id]/convert/route.ts`, `api/admin/invoices/route.ts`) for the transaction-timeout and decrement patterns cited in §10. Counts come from these commands, reproduced inline:
>
> ```
> git rev-parse HEAD                                    -> 5af8fc8
> wc -l apps/web/prisma/schema.prisma                   -> 1060
> grep -c '^model ' apps/web/prisma/schema.prisma       -> 42
> grep -c '^enum '  apps/web/prisma/schema.prisma       -> 20
> ls apps/web/prisma/migrations/ 2>&1                   -> no such directory
> ls apps/web/prisma/seed.*                             -> seed.ts
> ```
>
> **What this pass did NOT do.** I did not run the schema, the seed, or any query. I did not read every route handler; the "invariants NOT at DB level" section (§10) is a curated pointer set, not a complete audit. I did not diff historical schema states, because there is no migrations directory to diff against (see §8). I did not read the Auth.js configuration, the RBAC engine, or the notification workers; §10 names the files but does not audit them. I did not verify that seed data matches the schema at runtime.

---

## 1. Overview

| Fact | Value | Source |
|---|---|---|
| Database engine | PostgreSQL | `schema.prisma:24` |
| Prisma provider | `postgresql`, dual URLs (`DATABASE_URL` runtime, `DIRECT_URL` migrations) | `schema.prisma:23-27` |
| Generator | `prisma-client-js` (default output) | `schema.prisma:19-21` |
| Models | 42 | `grep -c '^model ' schema.prisma` |
| Enums | 20 | `grep -c '^enum ' schema.prisma` |
| Schema file length | 1060 lines | `wc -l schema.prisma` |
| Migration files | 0 (see §8) | `ls apps/web/prisma/migrations/` returns no such directory |
| Seed script | `apps/web/prisma/seed.ts`, 353 lines | `ls apps/web/prisma/seed.*` |

**Task-brief correction.** The brief stated 34 models. The command returns 42. I document 42. The brief also mentioned a 1061-line schema; the file is 1060 lines at this SHA. Numbers reported here are the ones the commands returned.

**Connection pool.** `apps/web/src/lib/prisma.ts:5-38` mutates `DATABASE_URL` at import time when the host contains `pooler.supabase.com`, when the URL already carries `pgbouncer=true`, or when `PRISMA_FORCE_POOL_TUNING=1`. When tuning fires, it appends `pgbouncer=true`, `connection_limit=3` in production and `5` elsewhere (overridable via `PRISMA_CONNECTION_LIMIT`), and `pool_timeout=20`. `PRISMA_DISABLE_URL_TUNING=1` opts out entirely. The `PrismaClient` singleton is set with `transactionOptions: { maxWait: 10000, timeout: 15000 }` (line 46), and every explicit `$transaction` block in the routes I read overrides that to `{ timeout: 30000, maxWait: 10000 }` for long stock operations. See §10.

**Migration strategy.** There is no `apps/web/prisma/migrations/` directory. The workflow is `prisma db push` against the shared Supabase database, gated by the RULE 2/3 confirmation-and-backup ritual documented at the workspace level. That is a deliberate choice with tradeoffs: no per-change SQL history in the repo, no shadow-database check, no rollback file. The `Schema policy` comment block at the top of `schema.prisma:1-17` records both the `onDelete` policy and the fact that the invoice numbering scheme is single-garage-scale for now (see §6).

---

## 2. Enum reference

Twenty enums, in schema order, with values in schema order. `AmcContractStatus`, `EstimateStatus`, and `EstimateLineType` are declared inline next to their models rather than in the top block; they are listed here in file order.

| Enum | Values |
|---|---|
| `AdminUserStatus` | `ACTIVE`, `INACTIVE`, `LOCKED` |
| `ActorType` | `ADMIN`, `WORKER`, `SYSTEM`, `PUBLIC` |
| `VehicleType` | `CAR`, `BIKE`, `SCOOTY`, `OTHER` |
| `ServiceRequestStatus` | `SUBMITTED`, `UNDER_REVIEW`, `APPOINTMENT_PENDING`, `APPOINTMENT_CONFIRMED`, `CONVERTED_TO_JOB`, `CANCELLED`, `CLOSED` |
| `AppointmentStatus` | `REQUESTED`, `PENDING_REVIEW`, `CONFIRMED`, `RESCHEDULED`, `CANCELLED`, `NO_SHOW`, `CHECKED_IN`, `COMPLETED` |
| `JobCardStatus` | `CREATED`, `UNDER_INSPECTION`, `ESTIMATE_PREPARED`, `AWAITING_CUSTOMER_APPROVAL`, `APPROVED`, `REJECTED`, `PARTS_PENDING`, `WORK_IN_PROGRESS`, `QUALITY_CHECK`, `READY_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `CLOSED` |
| `ApprovalStatus` | `NOT_REQUIRED`, `PENDING`, `APPROVED`, `REJECTED` |
| `WorkerStatus` | `ACTIVE`, `INACTIVE`, `ON_LEAVE` |
| `LeaveStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `HolidayType` | `PUBLIC_HOLIDAY`, `WEEKLY_OFF`, `BUSINESS_CLOSURE`, `MAINTENANCE_SHUTDOWN`, `CUSTOM_BLOCK` |
| `InventoryMovementType` | `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT_INCREASE`, `ADJUSTMENT_DECREASE`, `RESERVED`, `RELEASED`, `CONSUMED`, `RETURNED` |
| `InvoiceStatus` | `DRAFT`, `FINALIZED`, `CANCELLED` |
| `PaymentStatus` | `UNPAID`, `PARTIALLY_PAID`, `PAID`, `REFUNDED`, `WAIVED` |
| `InvoiceLineType` | `PART`, `LABOR`, `SERVICE_CHARGE`, `CUSTOM_CHARGE`, `DISCOUNT_ADJUSTMENT`, `AMC` |
| `NotificationChannel` | `WHATSAPP`, `EMAIL` |
| `NotificationStatus` | `QUEUED`, `PROCESSING`, `SENT`, `DELIVERED`, `FAILED`, `DEAD_LETTER` |
| `PaymentMode` | `CASH`, `CARD`, `UPI`, `BANK_TRANSFER`, `CHEQUE`, `OTHER` |
| `AmcContractStatus` | `ACTIVE`, `EXPIRED`, `CANCELLED` |
| `EstimateStatus` | `DRAFT`, `CONVERTED`, `CANCELLED` |
| `EstimateLineType` | `PART`, `LABOR`, `SERVICE_CHARGE`, `CUSTOM_CHARGE`, `DISCOUNT_ADJUSTMENT` |

Note: `EstimateLineType` deliberately omits `AMC` because AMC is not billable through an estimate; it enters the ledger through `AmcContract` and reaches invoices via `InvoiceLineType.AMC`.

---

## 3. Model reference

All 42 models, in schema-declaration order. Every field row lists (name, type, nullable, default, notable modifiers). Every relation row lists (relation name if any, target model, cardinality, `onDelete`). Every index row lists (fields, unique). Invariants at the DB level are called out where a `@unique` or composite constraint enforces a rule.

Cardinality shorthand: `1` (this side), `?` (optional this side), `*` (many).

### 3.1 AdminUser

Staff account. Authenticated actor for every admin write.

| Field | Type | Null | Default | Modifiers |
|---|---|---|---|---|
| `id` | `String` | no | `cuid()` | `@id` |
| `adminUserId` | `String` | no | | `@unique` (human-readable login) |
| `fullName` | `String` | no | | |
| `email` | `String` | yes | | `@unique` when present |
| `phone` | `String` | yes | | |
| `passwordHash` | `String` | no | | |
| `status` | `AdminUserStatus` | no | `ACTIVE` | |
| `failedLoginAttempts` | `Int` | no | `0` | |
| `lockedUntil` | `DateTime` | yes | | |
| `lastLoginAt` | `DateTime` | yes | | |
| `createdAt` | `DateTime` | no | `now()` | |
| `updatedAt` | `DateTime` | no | | `@updatedAt` |

| Relation | Target | Cardinality | onDelete |
|---|---|---|---|
| `roles` | `AdminUserRole` | 1 to * | (parent side; child cascades) |
| `activityLogs` | `ActivityLog` | 1 to * | (child SetNull via nullable `actorId`) |
| `notificationsSent` | `Notification` (`NotificationCreatedBy`) | 1 to * | (child SetNull) |
| `expensesCreated` | `Expense` | 1 to * | (implicit; `createdByAdminId` is non-null) |
| `invoicesCreated` | `Invoice` | 1 to * | `Restrict` |
| `appointmentsConfirmed` | `Appointment` (`AppointmentConfirmedBy`) | 1 to * | (child SetNull) |
| `estimatesCreated` | `Estimate` | 1 to * | (implicit) |

No composite indices. `email` and `adminUserId` are singleton unique constraints.

### 3.2 Role

RBAC role. Grouping of permissions.

| Field | Type | Null | Default | Modifiers |
|---|---|---|---|---|
| `id` | `String` | no | `cuid()` | `@id` |
| `key` | `String` | no | | `@unique` |
| `name` | `String` | no | | |
| `description` | `String` | yes | | |
| `createdAt` | `DateTime` | no | `now()` | |
| `updatedAt` | `DateTime` | no | | `@updatedAt` |

Relations: `adminUsers` (`AdminUserRole`, 1 to *, child cascade), `permissions` (`RolePermission`, 1 to *, child cascade).

### 3.3 Permission

RBAC permission atom. Scoped by module.

| Field | Type | Null | Default | Modifiers |
|---|---|---|---|---|
| `id` | `String` | no | `cuid()` | `@id` |
| `key` | `String` | no | | `@unique` |
| `module` | `String` | no | | |
| `name` | `String` | no | | |
| `description` | `String` | yes | | |
| `createdAt` | `DateTime` | no | `now()` | |
| `updatedAt` | `DateTime` | no | | `@updatedAt` |

Relations: `roles` (`RolePermission`, 1 to *, child cascade).

### 3.4 AdminUserRole

Join. One admin can hold many roles; one role can be held by many admins.

| Field | Type | Null | Modifiers |
|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |
| `adminUserId` | `String` | no | FK |
| `roleId` | `String` | no | FK |

Relations: `adminUser -> AdminUser` (Cascade), `role -> Role` (Cascade). Composite constraint `@@unique([adminUserId, roleId])` prevents duplicate grants.

### 3.5 RolePermission

Join. Same shape as `AdminUserRole`. `@@unique([roleId, permissionId])`. Both sides Cascade.

### 3.6 Customer

Owning contact for vehicles, appointments, invoices, and contracts.

| Field | Type | Null | Default | Modifiers |
|---|---|---|---|---|
| `id` | `String` | no | `cuid()` | `@id` |
| `fullName` | `String` | no | | |
| `phoneNumber` | `String` | no | | TODO(go-live+1) `@unique` after dedupe; app-level guard in `api/public/service-requests` |
| `alternatePhone` | `String` | yes | | |
| `email` | `String` | yes | | |
| `addressLine1` | `String` | yes | | |
| `addressLine2` | `String` | yes | | |
| `city`, `state`, `postalCode` | `String` | yes | | |
| `notes`, `source` | `String` | yes | | |
| `archivedAt` | `DateTime` | yes | | soft-delete marker |
| `createdAt` | `DateTime` | no | `now()` | |
| `updatedAt` | `DateTime` | no | | `@updatedAt` |

Relations: `vehicles`, `serviceRequests`, `appointments`, `jobCards`, `invoices`, `amcContracts`, `estimates` (all 1 to *). Index: `@@index([email])`. DB-level uniqueness applies to `id` only; phone uniqueness is a documented follow-up.

### 3.7 Vehicle

A customer's vehicle. Denormalised catalog fields (brand, model, variant) coexist with the normalised `VehicleBrand`/`VehicleModel` catalog (§3.36-37); the catalog is not FK-linked from `Vehicle`.

| Field | Type | Null | Default | Modifiers |
|---|---|---|---|---|
| `id` | `String` | no | `cuid()` | `@id` |
| `customerId` | `String` | no | | FK |
| `vehicleType` | `VehicleType` | no | | enum |
| `registrationNumber` | `String` | no | | TODO(go-live+1) `@unique` after dedupe |
| `brand`, `model` | `String` | no | | |
| `variant`, `fuelType`, `transmission`, `color`, `vin`, `chassisNumber`, `engineNumber` | `String` | yes | | |
| `yearOfManufacture`, `engineCC`, `odometerReading` | `Int` | yes | | |
| `notes` | `String` | yes | | |
| `createdAt` | `DateTime` | no | `now()` | |
| `updatedAt` | `DateTime` | no | | `@updatedAt` |

Relations: `customer -> Customer` (Cascade); child relations `serviceRequests`, `appointments`, `jobCards`, `invoices`, `amcContracts`, `estimates`. Index: `@@index([customerId])`.

### 3.8 ServiceRequest

Inbound intake row. May become an appointment and later a job card.

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `String` | no | `cuid()` | `@id` |
| `referenceId` | `String` | no | | `@unique` (human-readable) |
| `customerId`, `vehicleId` | `String` | no | | FK |
| `serviceCategory`, `issueDescription` | `String` | no | | |
| `preferredDate` | `DateTime` | yes | | |
| `preferredSlotLabel`, `urgency`, `notes`, `source` | `String` | yes | | |
| `pickupDropRequired` | `Boolean` | no | `false` | |
| `status` | `ServiceRequestStatus` | no | `SUBMITTED` | |
| `closedAt` | `DateTime` | yes | | |
| `createdAt`, `updatedAt` | `DateTime` | no | | |

Relations: `customer -> Customer`, `vehicle -> Vehicle` (both implicit default, non-null FKs), `appointment -> Appointment?` (1 to ?, unique via `Appointment.serviceRequestId`), `jobCards -> JobCard[]` (1 to *; a request can spawn multiple job cards over its lifetime). Indices: `[customerId]`, `[vehicleId]`, `[status]`.

### 3.9 Appointment

Time-slotted booking. One or zero per `ServiceRequest`; many per customer.

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `String` | no | `cuid()` | `@id` |
| `referenceId` | `String` | no | | `@unique` |
| `serviceRequestId` | `String` | yes | | `@unique` (0 or 1 appt per request) |
| `customerId`, `vehicleId` | `String` | no | | FK |
| `appointmentDate`, `slotStart`, `slotEnd` | `DateTime` | no | | |
| `status` | `AppointmentStatus` | no | `REQUESTED` | |
| `bookingSource` | `String` | no | | |
| `confirmationMode`, `confirmedByAdminId`, `assignedWorkerId`, `bayId`, `rescheduleReason`, `cancellationReason` | `String` | yes | | |
| `createdAt`, `updatedAt` | `DateTime` | no | | |

Relations: `serviceRequest?`, `customer`, `vehicle`, `confirmedBy -> AdminUser?` (`AppointmentConfirmedBy`, SetNull default), `worker -> Worker?` (SetNull default), `jobCards -> JobCard[]`. Indices: `[customerId]`, `[vehicleId]`, `[appointmentDate]`, `[status]`, `[confirmedByAdminId]`, `[assignedWorkerId]`. DB invariant: at most one Appointment per ServiceRequest (unique FK).

### 3.10 AppointmentSlotRule

Availability rules keyed by day-of-week. No FKs.

Fields: `id` (cuid), `dayOfWeek` (Int), `openTime`, `closeTime` (String), `slotDurationMinutes` (Int), `maxCapacity` (Int), `isActive` (Boolean, `true`), `createdAt`, `updatedAt`.

No indices beyond the PK.

### 3.11 BlockedSlot

Ad-hoc block window. Not FK-constrained to `Worker` or `AdminUser` (both are optional string IDs, no relation declared).

Fields: `id`, `blockDate` (DateTime), `blockStartTime`/`blockEndTime` (DateTime), `blockReason` (String), `appliesToAll` (Boolean, `true`), `workerId?`, `bayId?`, `createdByAdminId?` (all String, no relation), `createdAt`.

Index: `@@index([blockDate])`. Absence of an FK on `workerId` is deliberate: a delete of a worker does not orphan a historical block window.

### 3.12 Holiday

Named non-working day. No FKs.

Fields: `id`, `holidayName` (String), `holidayDate` (DateTime), `holidayType` (`HolidayType` enum), `isFullDay` (Boolean, `true`), `startTime?`/`endTime?` (String), `notes?`, `createdAt`.

Index: `@@index([holidayDate])`.

### 3.13 Worker

Workshop technician or assigned mechanic. Distinct from `AdminUser`.

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `String` | no | `cuid()` | `@id` |
| `workerCode` | `String` | no | | `@unique` |
| `fullName` | `String` | no | | |
| `phoneNumber`, `email`, `designation`, `specialization`, `employmentType`, `shiftStart`, `shiftEnd`, `emergencyContactName`, `emergencyContactPhone`, `address`, `notes` | `String` | yes | | |
| `joiningDate` | `DateTime` | yes | | |
| `dailyCapacity` | `Int` | yes | | |
| `status` | `WorkerStatus` | no | `ACTIVE` | |
| `monthlySalary` | `Decimal(10,2)` | yes | | |
| `createdAt`, `updatedAt` | `DateTime` | no | | |

Relations: `appointments`, `leaves` (`WorkerLeave`, child cascade), `assignments` (`WorkerAssignment`, child cascade), `tasks` (`JobCardTask`, SetNull on `assignedWorkerId`). Index: `@@index([status])`.

### 3.14 WorkerLeave

Time off. Cascades from parent Worker on delete.

Fields: `id`, `workerId` (FK, Cascade), `leaveType` (String), `startDate`/`endDate` (DateTime), `partialDay` (Boolean, `false`), `partialStartTime?`/`partialEndTime?` (String), `status` (`LeaveStatus`, `PENDING`), `reason?`, `approvedByAdminId?` (String, no relation), `createdAt`, `updatedAt`.

Indices: `[workerId]`, `[status]`.

### 3.15 JobCard

The workshop's central operational row. Every workshop workflow reaches it.

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `String` | no | `cuid()` | `@id` |
| `jobCardNumber` | `String` | no | | `@unique` (generated per §6) |
| `appointmentId`, `serviceRequestId` | `String` | yes | | FKs |
| `customerId`, `vehicleId` | `String` | no | | FKs |
| `intakeDate` | `DateTime` | no | | |
| `odometerAtIntake` | `Int` | yes | | |
| `fuelIndicator`, `priority`, `assignedServiceManagerId`, `customerVisibleNotes`, `internalNotes`, `estimateRevision`, `customerComplaints`, `diagnosisNotes`, `estimateNotes` | `String` | yes | | |
| `estimatedDeliveryAt`, `actualDeliveryAt` | `DateTime` | yes | | |
| `issueSummary` | `String` | no | | |
| `approvalStatus` | `ApprovalStatus` | no | `PENDING` | |
| `status` | `JobCardStatus` | no | `CREATED` | |
| `estimatedPartsCost`, `estimatedLaborCost`, `estimatedOtherCost`, `estimatedTotal`, `finalPartsCost`, `finalLaborCost`, `finalOtherCost`, `finalTotal` | `Decimal(12,2)` | no | `0` | monetary rollups |
| `estimateToken` | `String` | yes | | `@unique` (public estimate link) |
| `estimateTokenExpiresAt` | `DateTime` | yes | | |
| `createdAt`, `updatedAt` | `DateTime` | no | | |

Relations: `appointment?`, `serviceRequest?`, `customer`, `vehicle`, `assignments -> WorkerAssignment[]` (child cascade), `tasks -> JobCardTask[]` (child cascade), `parts -> JobCardPart[]` (child cascade), `invoices -> Invoice[]` (Restrict from child side), `amcUsages -> AmcServiceUsage[]` (Restrict). Indices: `[appointmentId]`, `[serviceRequestId]`, `[customerId]`, `[vehicleId]`, `[status]`, `[customerId, status]`, `[vehicleId, status]`. DB invariant: `jobCardNumber` and `estimateToken` are globally unique.

### 3.16 WorkerAssignment

Which workers own which job cards.

Fields: `id`, `jobCardId` (FK, Cascade), `workerId` (FK, Cascade), `assignmentRole?`, `assignedAt` (DateTime, `now()`), `unassignedAt?`, `notes?`.

Composite: `@@unique([jobCardId, workerId])` prevents duplicate assignments. Indices: `[jobCardId]`, `[workerId]`.

### 3.17 JobCardTask

Sub-task on a job card. Not the same as `WorkerAssignment`; a task is a unit of work, an assignment is a person on the whole card.

Fields: `id`, `jobCardId` (FK, Cascade), `taskName` (String), `taskDescription?`, `status` (String; not enum-typed), `assignedWorkerId?` (FK, SetNull default), `estimatedMinutes?`, `actualMinutes?`, `notes?`, `sortOrder` (Int, `0`), `createdAt`, `updatedAt`.

Indices: `[jobCardId]`, `[assignedWorkerId]`. Note: `status` is a free-text string here, not an enum. Compare with `JobCard.status` which is the strict `JobCardStatus` enum.

### 3.18 JobCardPart

Parts reserved and consumed against a job card. The row where inventory reservation meets the shop floor.

Fields: `id`, `jobCardId` (FK, Cascade), `inventoryItemId` (FK, implicit default), `requiredQty`/`reservedQty`/`consumedQty`/`unitPrice` (`Decimal(12,2)`, `0` default except `requiredQty`), `notes?`, `createdAt`, `updatedAt`.

Composite: `@@unique([jobCardId, inventoryItemId])` prevents double-listing the same SKU on one card. Indices: `[jobCardId]`, `[inventoryItemId]`. `requiredQty`, `reservedQty`, `consumedQty` are enforced at the code level to satisfy `consumed <= reserved <= required` (see §10).

### 3.19 InventoryCategory

Parts taxonomy. Fields: `id`, `categoryName` (`@unique`), `description?`. Relation: `items -> InventoryItem[]`.

### 3.20 Supplier

Fields: `id`, `supplierName`, `phone?`, `email?`, `address?`, `contactPerson?`, `notes?`. Relations: `items -> InventoryItem[]`, `stockBatches -> StockBatch[]`. No `@unique` on `supplierName`; duplicates are permitted.

### 3.21 InventoryItem

SKU. Every parts line and every stock movement points here.

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `String` | no | `cuid()` | `@id` |
| `sku` | `String` | no | | `@unique` |
| `itemName`, `unit` | `String` | no | | |
| `categoryId` | `String` | no | | FK |
| `supplierId` | `String` | yes | | FK |
| `brand`, `description`, `compatibleVehicleTypes`, `storageLocation`, `barcode`, `hsnCode` | `String` | yes | | |
| `taxRate` | `Decimal(5,2)` | no | `0` | |
| `costPrice`, `sellingPrice` | `Decimal(12,2)` | no | `0` | |
| `mrp`, `discountPercent`, `amcDiscountPercent`, `reorderLevel`, `reorderQuantity` | `Decimal(12,2)` or `Decimal(5,2)` | yes | | |
| `quantityInStock`, `reservedQuantity` | `Decimal(12,2)` | no | `0` | live counters; race-safe increments/decrements from routes (see §10) |
| `isActive` | `Boolean` | no | `true` | |
| `variablePrice`, `isBranded` | `Boolean` | no | `false`, `true` | |
| `createdAt`, `updatedAt` | `DateTime` | no | | |

Relations: `category -> InventoryCategory`, `supplier -> Supplier?`, `stockMovements -> StockMovement[]`, `stockBatches -> StockBatch[]`, `jobCardParts -> JobCardPart[]`, `vehicleModels -> InventoryItemModel[]`, `estimateItems -> EstimateItem[]`. Indices: `[categoryId]`, `[supplierId]`, `[itemName]`.

### 3.22 StockMovement

Every change to `InventoryItem.quantityInStock` is (or should be) accompanied by a movement row. Append-only in practice; no delete path in the schema, no update signals.

Fields: `id`, `inventoryItemId` (FK), `movementType` (`InventoryMovementType`), `quantity`, `previousQuantity`, `newQuantity` (`Decimal(12,2)`), `costPrice?` (`Decimal(12,2)`), `batchId?` (FK), `relatedEntityType?`, `relatedEntityId?`, `reason?`, `performedByAdminId?` (String, no relation), `createdAt`.

Indices: `[inventoryItemId]`, `[movementType]`, `[batchId]`. The `previousQuantity` / `newQuantity` pair is the audit trail; nothing at the DB level enforces `newQuantity = previousQuantity ± quantity`, that lives in the route (§10).

### 3.23 StockBatch

Received stock lot. Enables FIFO/expiry accounting and per-batch cost.

Fields: `id`, `inventoryItemId` (FK), `batchNumber` (String, not unique), `supplierId?` (FK), `costPrice`, `sellingPrice` (`Decimal(12,2)`), `mrp?`, `initialQty`, `remainingQty` (`Decimal(12,2)`), `purchaseDate` (`DateTime`, `now()`), `expiryDate?`, `purchaseRef?`, `notes?`, `createdAt`.

Relations: `inventoryItem`, `supplier?`, `stockMovements -> StockMovement[]`. Composite indices: `[inventoryItemId, remainingQty]` (fast pick of batches with stock remaining), `[inventoryItemId, purchaseDate]` (FIFO order), `[supplierId]`.

### 3.24 Invoice

Financial header. One row per invoice; `jobCardId` is currently non-unique (see §6).

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `String` | no | `cuid()` | `@id` |
| `invoiceNumber` | `String` | no | | `@unique` |
| `customerId` | `String` | no | | FK (Restrict) |
| `vehicleId`, `jobCardId`, `appointmentId` | `String` | yes | | FKs (Restrict for vehicle, jobCard) |
| `invoiceDate` | `DateTime` | no | | |
| `dueDate`, `finalizedAt` | `DateTime` | yes | | |
| `subtotal`, `discountAmount`, `taxTotal`, `grandTotal`, `amountPaid`, `amountDue` | `Decimal(12,2)` | no | `0` | |
| `discountType` | `String` | yes | | free text |
| `discountValue` | `Decimal(12,2)` | yes | | |
| `paymentStatus` | `PaymentStatus` | no | `UNPAID` | |
| `invoiceStatus` | `InvoiceStatus` | no | `DRAFT` | |
| `notes` | `String` | yes | | |
| `showGst` | `Boolean` | no | `false` | render toggle |
| `createdByAdminId` | `String` | no | | FK (Restrict) |
| `createdAt`, `updatedAt` | `DateTime` | no | | |

Relations: `customer` (Restrict), `vehicle?` (Restrict), `jobCard?` (Restrict), `createdBy -> AdminUser` (Restrict), `lineItems -> InvoiceLineItem[]` (child cascade), `payments -> Payment[]` (child cascade). Indices: `[customerId]`, `[vehicleId]`, `[invoiceDate]`, `[paymentStatus]`, `[jobCardId]`, `[appointmentId]`, `[createdByAdminId]`, `[customerId, paymentStatus]`, `[invoiceDate, paymentStatus]`. DB invariant: `invoiceNumber` is unique; no Cascade path can silently erase an invoice via a parent delete (every FK is Restrict).

### 3.25 InvoiceLineItem

One row per line on an invoice.

Fields: `id`, `invoiceId` (FK, Cascade), `lineType` (`InvoiceLineType`), `referenceItemId?`, `workerId?` (both String, no relation), `description` (String), `hsnCode?`, `quantity` (`Decimal(12,2)`, `1`), `unitPrice` (`Decimal(12,2)`, `0`), `discountPercent` (`Decimal(5,2)`, `0`), `taxRate` (`Decimal(5,2)`, `0`), `taxAmount`, `lineTotal` (`Decimal(12,2)`, `0`), `sortOrder` (Int, `0`).

Index: `[invoiceId]`. Note: `referenceItemId` and `workerId` are stored as scalars without relations so that a line survives when the referenced inventory item or worker is later removed (denormalisation for accounting durability).

### 3.26 Payment

Money received against an invoice.

Fields: `id`, `invoiceId` (FK, Cascade), `amount` (`Decimal(12,2)`), `paymentMode` (`PaymentMode`), `paymentDate` (`DateTime`), `referenceNumber?`, `notes?`, `receivedByAdminId` (String, no relation but required), `createdAt`.

Indices: `[invoiceId]`, `[paymentDate]`, `[receivedByAdminId]`. Delete of an invoice cascades to its payments (accounting risk; see §5).

### 3.27 ExpenseCategory

Fields: `id`, `categoryName` (`@unique`), `description?`. Relation: `expenses -> Expense[]`.

### 3.28 Expense

Non-COGS spend. Fields: `id`, `expenseDate` (DateTime), `categoryId` (FK), `title` (String), `amount` (`Decimal(12,2)`), `vendorName?`, `paymentMode?` (`PaymentMode`), `referenceNumber?`, `notes?`, `createdByAdminId` (FK, implicit default), `createdAt`, `updatedAt`.

Indices: `[expenseDate]`, `[categoryId]`, `[createdByAdminId]`.

### 3.29 NotificationTemplate

Fields: `id`, `channel` (`NotificationChannel`), `eventType` (String), `templateKey` (`@unique`), `subject?`, `messageBody` (String), `variableSchemaJson?` (Json), `isActive` (Boolean, `true`), `createdAt`, `updatedAt`. No indices beyond the PK and the unique key.

### 3.30 Notification

Outbound message row (queue and audit).

Fields: `id`, `channel` (`NotificationChannel`), `eventType` (String), `templateKey` (String, no FK to template), `recipientPhone?`, `recipientEmail?`, `payloadJson` (Json), `sendStatus` (`NotificationStatus`, `QUEUED`), `providerName?`, `providerMessageId?`, `errorMessage?`, `retryCount` (Int, `0`), `scheduledFor?`, `sentAt?`, `deliveredAt?`, `relatedEntityType?`, `relatedEntityId?`, `createdByAdminId?` (FK to `AdminUser`, SetNull), `createdAt`.

Indices: `[sendStatus]`, `[eventType]`, `[scheduledFor]`. `templateKey` is denormalised (not FK) so a template rename does not break historical notifications.

### 3.31 ActivityLog

Universal audit log. Immutable by convention; no update or delete route.

Fields: `id`, `entityType` (String), `entityId?`, `action` (String), `previousValueJson?`, `newValueJson?` (Json), `actorType` (`ActorType`), `actorId?` (String), `requestId?`, `ipAddress?`, `userAgent?`, `createdAt`.

Relation: `adminUser -> AdminUser?` on `actorId`, `map: "activity_log_actor_id_fkey"` (explicit FK name for readable migration output). Indices: `[entityType, entityId]`, `[action]`, `[actorType]`, `[createdAt]`.

### 3.32 Setting

Key-value store for system settings. Fields: `id`, `key` (`@unique`), `value` (Json), `createdAt`, `updatedAt`. No indices beyond the PK and unique key.

### 3.33 AmcPlan

Annual maintenance contract template.

Fields: `id`, `planName` (String, not unique; duplicates allowed), `description?`, `vehicleType` (`VehicleType`), `ccRange?`, `durationMonths` (Int), `totalServicesIncluded` (Int), `price` (`Decimal(12,2)`), `mrpPrice?` (`Decimal(12,2)`), `extraDiscountPercent` (`Decimal(5,2)`, `0`), `laborDiscountPercent` (`Decimal(5,2)`, `100` = full labor waived by default), `coveredItems?` (Json), `exclusions?` (String), `isActive` (Boolean, `true`), `createdAt`, `updatedAt`. Relation: `contracts -> AmcContract[]`.

### 3.34 AmcContract

Customer's live AMC subscription.

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `String` | no | `cuid()` | `@id` |
| `contractNumber` | `String` | no | | `@unique` |
| `customerId`, `vehicleId`, `amcPlanId` | `String` | no | | FKs (all Restrict) |
| `startDate`, `endDate` | `DateTime` | no | | |
| `totalServices` | `Int` | no | | |
| `servicesUsed` | `Int` | no | `0` | |
| `servicesRemaining` | `Int` | no | | denormalised counter |
| `extraDiscountPercent`, `laborDiscountPercent` | `Decimal(5,2)` | no | `0`, `100` | |
| `amountPaid` | `Decimal(12,2)` | no | | |
| `paymentMode` | `PaymentMode` | yes | | |
| `paymentDate` | `DateTime` | yes | | |
| `status` | `AmcContractStatus` | no | `ACTIVE` | |
| `notes` | `String` | yes | | |
| `createdAt`, `updatedAt` | `DateTime` | no | | |

Relations: `customer` (Restrict), `vehicle` (Restrict), `plan -> AmcPlan` (Restrict), `usages -> AmcServiceUsage[]` (Restrict from child side). Indices: `[customerId]`, `[vehicleId]`, `[status]`, `[amcPlanId]`. `servicesUsed + servicesRemaining = totalServices` is a code-level invariant (§10); the DB does not enforce it.

### 3.35 AmcServiceUsage

Redemption row: one AMC service consumed by one job card.

Fields: `id`, `amcContractId` (FK, Restrict), `jobCardId` (FK, Restrict), `serviceNumber` (Int), `serviceDate` (DateTime), `notes?`, `createdAt`.

Composite: `@@unique([amcContractId, jobCardId])` prevents double-crediting the same job card to the same contract. Indices: `[amcContractId]`, `[jobCardId]`.

### 3.36 DocumentSequence

Daily numeric counter for chronological document numbers. Keyed by `(kind, businessDate)`; incremented transactionally. See §6.

Fields: `id`, `kind` (String; `'INVOICE'`, `'JOB_CARD'`, `'WORKER'`, `'AMC'`), `businessDate` (String, `YYYY-MM-DD` in IST), `lastSeq` (Int, `0`), `createdAt`, `updatedAt`. Composite: `@@unique([kind, businessDate])`.

### 3.37 VehicleBrand

Parts-catalog brand. Distinct from `Vehicle.brand` free-text field.

Fields: `id`, `name` (`@unique`), `logoUrl?`, `sortOrder` (Int, `0`), `createdAt`. Relation: `models -> VehicleModel[]` (child cascade).

### 3.38 VehicleModel

Fields: `id`, `brandId` (FK, Cascade), `name` (String), `engineCC?`, `yearStart?`, `yearEnd?` (Int), `sortOrder` (Int, `0`), `createdAt`. Composite: `@@unique([brandId, name])`. Index: `[brandId]`. Relation: `parts -> InventoryItemModel[]`.

### 3.39 InventoryItemModel

Join: which parts fit which vehicle models.

Fields: `inventoryItemId` (FK, Cascade), `vehicleModelId` (FK, Cascade). Composite PK: `@@id([inventoryItemId, vehicleModelId])`. Indices: `[vehicleModelId]`, `[inventoryItemId]`. No surrogate `id`; the composite PK is the identity.

### 3.40 HsnRate

GST HSN code lookup. Fields: `id`, `hsnCode` (`@unique`), `rate` (`Decimal(5,2)`), `description?`, `createdAt`.

### 3.41 Estimate

Quote before job card. Convertible to a job card or an invoice.

Fields: `id`, `estimateNumber` (`@unique`), `customerId` (FK), `vehicleId?` (FK), `status` (`EstimateStatus`, `DRAFT`), `validUntil?`, `subtotal`/`taxTotal`/`grandTotal` (`Decimal(12,2)`, `0`), `notes?`, `convertedJobCardId?`/`convertedInvoiceId?` (String, no relation), `createdByAdminId` (FK, implicit), `createdAt`, `updatedAt`.

Relations: `customer`, `vehicle?`, `createdBy -> AdminUser`, `items -> EstimateItem[]` (child cascade). Indices: `[customerId]`, `[vehicleId]`, `[status]`, `[createdAt]`. `convertedJobCardId` and `convertedInvoiceId` are denormalised (no FK) so a later delete of the derived card or invoice does not orphan the estimate.

### 3.42 EstimateItem

Line on an estimate. Same shape as `InvoiceLineItem` minus the `workerId` and the `AMC` line type.

Fields: `id`, `estimateId` (FK, Cascade), `lineType` (`EstimateLineType`, `PART`), `inventoryItemId?` (FK, implicit), `description` (String), `hsnCode?`, `quantity` (`Decimal(12,2)`, `1`), `unitPrice` (`Decimal(12,2)`, `0`), `discountPercent` (`Decimal(5,2)`, `0`), `taxRate` (`Decimal(5,2)`, `0`), `taxAmount`/`lineTotal` (`Decimal(12,2)`, `0`), `sortOrder` (Int, `0`).

Indices: `[estimateId]`, `[inventoryItemId]`.

---

## 4. Relation graph

The chain from a walk-in to money in the bank, plus the AMC branch and the inventory branch.

### 4.1 Customer to Payment (the core spine)

```
Customer
   |
   | 1..*
   v
Vehicle -----------------.
   |                     |
   | 1..*                | 1..*
   v                     v
ServiceRequest --0..1-> Appointment -0..*-> JobCard
                                              |
                       .----------------------+
                       |                      |
                       | 1..*                 | 0..*
                       v                      v
                    Invoice <-------- (jobCardId nullable, non-unique today)
                       |
                       | 1..*
                       v
                    Payment
                       ^
                       | (also 1..* from Invoice)
                    InvoiceLineItem
```

Invoice also carries an optional `appointmentId` scalar (no relation) and a required `createdByAdminId` FK to `AdminUser` (Restrict).

### 4.2 AMC branch

```
AmcPlan (template)
   |
   | 1..*
   v
AmcContract  <-- Customer, Vehicle (both Restrict)
   |
   | 1..*
   v
AmcServiceUsage
   |
   +--> JobCard   (Restrict; a job card cannot be deleted while it holds
                   an AMC redemption record)
```

`@@unique([amcContractId, jobCardId])` on `AmcServiceUsage` prevents crediting the same job twice.

### 4.3 Inventory branch

```
InventoryCategory       Supplier
        \\                 //
         v               v
         InventoryItem -----> StockBatch
              |    ^              |
              |    |              | (batchId nullable)
              |    +-- StockMovement <--+
              |                         |
              +-- JobCardPart ----------+ (via inventoryItemId)
              |
              +-- InventoryItemModel -- VehicleModel -- VehicleBrand
              |
              +-- EstimateItem (via nullable inventoryItemId)
```

`JobCardPart` and `EstimateItem` are the two places `InventoryItem` reaches billing/operations. `StockMovement` is the append-only journal; `StockBatch` is the FIFO/expiry ledger.

---

## 5. Ownership tree (onDelete)

The `Schema policy` comment at `schema.prisma:1-17` codifies the intent. Grouped by policy:

**Cascade (child has no meaning without parent):**

| Parent | Child |
|---|---|
| `AdminUser` | `AdminUserRole` |
| `Role` | `AdminUserRole`, `RolePermission` |
| `Permission` | `RolePermission` |
| `Customer` | `Vehicle` |
| `Worker` | `WorkerLeave`, `WorkerAssignment` |
| `JobCard` | `WorkerAssignment`, `JobCardTask`, `JobCardPart` |
| `Invoice` | `InvoiceLineItem`, `Payment` |
| `Estimate` | `EstimateItem` |
| `VehicleBrand` | `VehicleModel` |
| `InventoryItem` | `InventoryItemModel` |
| `VehicleModel` | `InventoryItemModel` |

**Restrict (deleting the parent would orphan accounting or regulatory state):**

| Parent | Child (relation) |
|---|---|
| `Customer` | `Invoice.customer`, `AmcContract.customer` |
| `Vehicle` | `Invoice.vehicle`, `AmcContract.vehicle` |
| `JobCard` | `Invoice.jobCard`, `AmcServiceUsage.jobCard` |
| `AdminUser` | `Invoice.createdBy` |
| `AmcPlan` | `AmcContract.plan` |
| `AmcContract` | `AmcServiceUsage.contract` |

**SetNull (implicit via nullable FK, Prisma default for optional relations):**

| Parent | Child (relation) |
|---|---|
| `AdminUser` | `Appointment.confirmedBy`, `Notification.createdBy`, `ActivityLog.adminUser` |
| `Worker` | `JobCardTask.assignedWorker`, `Appointment.worker` |
| `Appointment` | `JobCard.appointment` (nullable FK) |
| `ServiceRequest` | `JobCard.serviceRequest` (nullable FK) |
| `Supplier` | `InventoryItem.supplier`, `StockBatch.supplier` |
| `StockBatch` | `StockMovement.batch` |

**No relation declared** (scalar FK preserved deliberately for accounting durability):

- `InvoiceLineItem.referenceItemId` and `.workerId` (a later delete of the referenced row does not orphan the line)
- `BlockedSlot.workerId`, `.bayId`, `.createdByAdminId`
- `Estimate.convertedJobCardId`, `.convertedInvoiceId`
- `Notification.templateKey` (denormalised so a template rename does not break history)
- `Payment.receivedByAdminId`, `Expense.createdByAdminId` (wait: `Expense.createdBy` IS a relation; the exception is only `Payment.receivedByAdminId`)
- `StockMovement.performedByAdminId`
- `WorkerLeave.approvedByAdminId`
- `JobCard.assignedServiceManagerId`

---

## 6. Composite constraints

Every `@@unique` and `@@index`, why it exists, and where derived.

**Composite unique constraints:**

| Model | Constraint | Reason |
|---|---|---|
| `AdminUserRole` | `[adminUserId, roleId]` | one grant per (user, role) |
| `RolePermission` | `[roleId, permissionId]` | one grant per (role, permission) |
| `WorkerAssignment` | `[jobCardId, workerId]` | a worker is on a job card once |
| `JobCardPart` | `[jobCardId, inventoryItemId]` | one line per (job card, SKU); reserved and consumed quantities accumulate on the same row |
| `AmcServiceUsage` | `[amcContractId, jobCardId]` | a single job card cannot be redeemed twice against the same contract |
| `DocumentSequence` | `[kind, businessDate]` | daily counter is one row per (`INVOICE`/`JOB_CARD`/`WORKER`/`AMC`, IST date); the tx that mints a number reads-modify-writes this row |
| `VehicleModel` | `[brandId, name]` | model names unique within a brand, not globally (Splendor exists in more than one brand) |
| `InventoryItemModel` | (composite PK `[inventoryItemId, vehicleModelId]`) | join table, natural key is the composite |

**Composite indices** (skipping the singleton index on a single FK, which appears throughout):

| Model | Index | Reason |
|---|---|---|
| `JobCard` | `[customerId, status]` | list a customer's open cards |
| `JobCard` | `[vehicleId, status]` | history-by-vehicle view filtered by status |
| `Invoice` | `[customerId, paymentStatus]` | customer statement, open receivables |
| `Invoice` | `[invoiceDate, paymentStatus]` | monthly ageing / dunning list |
| `StockBatch` | `[inventoryItemId, remainingQty]` | fast pick of batches with stock left when reserving parts |
| `StockBatch` | `[inventoryItemId, purchaseDate]` | FIFO scan by purchase date |
| `ActivityLog` | `[entityType, entityId]` | timeline for a single entity |

Every other `@@index` is on a single field (`status`, `email`, `createdAt`, one FK, etc.); those are listed under their model in §3.

**Singleton unique constraints worth restating:**

- `AdminUser.adminUserId`, `AdminUser.email` (when non-null); `Role.key`; `Permission.key`;
- `ServiceRequest.referenceId`; `Appointment.referenceId`; `Appointment.serviceRequestId` (0-or-1);
- `Worker.workerCode`; `JobCard.jobCardNumber`; `JobCard.estimateToken`;
- `InventoryItem.sku`; `InventoryCategory.categoryName`; `ExpenseCategory.categoryName`;
- `Invoice.invoiceNumber`; `AmcContract.contractNumber`; `Estimate.estimateNumber`;
- `NotificationTemplate.templateKey`; `Setting.key`; `HsnRate.hsnCode`; `VehicleBrand.name`.

**Documented follow-ups (`TODO(go-live+1)` in the schema):**

- `Customer.phoneNumber` should be `@unique` after a dedupe migration; app-level guard in `api/public/service-requests` prevents the common case today.
- `Vehicle.registrationNumber` should be `@unique` after a dedupe migration.
- `Invoice.jobCardId` should be `@unique` after a dedupe migration; today two invoices can point at the same job card, which is why the invoice-numbering scheme rides on `nanoid(8)` for now (`schema.prisma:14-17`).

**Invoice numbering.** The `Schema policy` comment records that `INV-${nanoid(8)}` is single-garage-scale only and should migrate to `INV-YYYY-NNNNNN` for GST compliance and collision safety past ~100k invoices. The `DocumentSequence` model exists specifically to underwrite that migration when it happens; today its consumers are the id generators in `apps/web/src/lib/id-generators.ts` (129 lines).

---

## 7. Enums referenced in fields

Cross-reference: (model.field → enum).

| Enum | Used by |
|---|---|
| `AdminUserStatus` | `AdminUser.status` |
| `ActorType` | `ActivityLog.actorType` |
| `VehicleType` | `Vehicle.vehicleType`, `AmcPlan.vehicleType` |
| `ServiceRequestStatus` | `ServiceRequest.status` |
| `AppointmentStatus` | `Appointment.status` |
| `JobCardStatus` | `JobCard.status` |
| `ApprovalStatus` | `JobCard.approvalStatus` |
| `WorkerStatus` | `Worker.status` |
| `LeaveStatus` | `WorkerLeave.status` |
| `HolidayType` | `Holiday.holidayType` |
| `InventoryMovementType` | `StockMovement.movementType` |
| `InvoiceStatus` | `Invoice.invoiceStatus` |
| `PaymentStatus` | `Invoice.paymentStatus` |
| `InvoiceLineType` | `InvoiceLineItem.lineType` |
| `NotificationChannel` | `NotificationTemplate.channel`, `Notification.channel` |
| `NotificationStatus` | `Notification.sendStatus` |
| `PaymentMode` | `Payment.paymentMode`, `Expense.paymentMode`, `AmcContract.paymentMode` |
| `AmcContractStatus` | `AmcContract.status` |
| `EstimateStatus` | `Estimate.status` |
| `EstimateLineType` | `EstimateItem.lineType` |

`JobCardTask.status` is a free-text `String`, not an enum: intentional at this stage because the workshop's per-task status vocabulary is still being iterated on.

---

## 8. Migration history

There is no `apps/web/prisma/migrations/` directory. `ls apps/web/prisma/migrations/` returns "No such file or directory". The workflow is `prisma db push` against the shared Supabase database, gated by the workspace-level RULE 2/3 discipline (per-op confirmation, `pg_dump` first).

Consequences worth stating so a future reader does not spend a round hunting for them:

- There is no per-change SQL history in the repo, and therefore no `git log -- apps/web/prisma/migrations/` timeline. The evolution of the schema is only visible through `git log -p -- apps/web/prisma/schema.prisma`.
- There is no shadow-database step at push time.
- Rollback is manual: revert the schema file, `prisma db push` again, and reconcile any data loss from the pre-op backup.
- Any composite `@@unique` added after data has landed requires the same dedupe migration that the three `TODO(go-live+1)` markers call out.

Latest schema mutation is whatever the `git log -p -- apps/web/prisma/schema.prisma` for `5af8fc8` shows; the schema file's own mtime is the closest thing to a "latest migration date".

---

## 9. Seed data

`apps/web/prisma/seed.ts` is 353 lines. It runs a set of `prisma.<model>.upsert` calls, so re-running it is idempotent. What it inserts:

- Four `Role` rows: `SUPER_ADMIN`, `MANAGER`, `RECEPTIONIST`, `MECHANIC`.
- Five `AdminUser` rows (`admin` = Souvik Musib, `arnab` = Arnab Sen, `priya` = Priya Chatterjee, `receptionist` = Rekha Devi, `mechanic` = Raju Mistri), all with the same bcrypt-hashed password (`admin123`, cost 12).
- `AdminUserRole` grants: first three admins get `SUPER_ADMIN`; the receptionist gets `RECEPTIONIST`; the mechanic gets `MECHANIC`.
- Twenty `Permission` rows spanning `CUSTOMERS_*`, `VEHICLES_*`, `WORKERS_MANAGE`, `APPOINTMENTS_*`, `JOB_CARDS_*`, `INVENTORY_*`, `INVOICES_*`, `PAYMENTS_RECORD`, `EXPENSES_*`, `REPORTS_VIEW`, `SETTINGS_MANAGE`, `NOTIFICATIONS_MANAGE`. All are granted to `SUPER_ADMIN` via `RolePermission` upserts.
- The remaining ~300 lines seed reference and demo data downstream (categories, suppliers, an inventory sample, and a small operational fixture). This pass did not read past line 40 in detail; contents beyond the identity block are described from a `wc -l` and a `head`.

Test / development credential note: the seed writes the password `admin123` into a bcrypt hash. This is a development-only default. Production seeding needs a different secret, not stored in a checked-in seed file.

---

## 10. Known invariants NOT at DB level

Business rules the schema does not enforce, with pointers to the route that does. This is a curated pointer set, not a full audit.

**Transaction timeouts.** The `PrismaClient` singleton at `apps/web/src/lib/prisma.ts:46` sets default `transactionOptions: { maxWait: 10000, timeout: 15000 }`. Every long-running write path overrides this to `{ timeout: 30000, maxWait: 10000 }`:

- `apps/web/src/app/api/admin/invoices/route.ts:118` (create invoice with lines and stock)
- `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:270` (add or edit a line, reserve or release stock)
- `apps/web/src/app/api/admin/estimates/[id]/convert/route.ts:108` (convert estimate to job card / invoice)
- `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:229` (reserve, adjust, or consume parts against a job card)

**Race-safe stock decrements.** `InventoryItem.quantityInStock` and `.reservedQuantity` are mutated with Prisma's `{ increment }` / `{ decrement }` atomic operators, not with `read-modify-write`. Sample sites:

- `api/admin/invoices/[id]/line-items/route.ts:175` (`decrement`) and `:366` (`increment` on unwind).
- `api/admin/job-cards/[id]/route.ts:75-76` (`quantityInStock` + `reservedQuantity` deltas).
- `api/admin/job-cards/[id]/parts/route.ts:35-36` and `:268-269` (RESERVED to CONSUMED transition: decrement `reservedQuantity` and write a `CONSUMED` `StockMovement` without touching `quantityInStock`, since the stock was already debited on RESERVE).

The `StockMovement` row is written in the same transaction so that the `previousQuantity`, `quantity`, `newQuantity` triple always agrees with the counter.

**Consumed-reserved-required ordering on `JobCardPart`.** The DB does not enforce `consumedQty <= reservedQty <= requiredQty`. The routes above are the only writers; they compute deltas from the current row and refuse the operation if the ordering would break.

**AMC redemption count.** `AmcContract.servicesUsed + .servicesRemaining = .totalServices` is a code-level invariant, incremented (and decremented on reversal) inside the same transaction that writes the `AmcServiceUsage` row.

**Invoice `paymentStatus` and `amountDue`.** `paymentStatus` (`UNPAID` / `PARTIALLY_PAID` / `PAID` / `REFUNDED` / `WAIVED`) is derived from `amountPaid` versus `grandTotal` and recomputed on every `Payment` insert or void. The DB permits any combination.

**Document numbering.** `apps/web/src/lib/id-generators.ts` mints `Invoice.invoiceNumber`, `JobCard.jobCardNumber`, `Worker.workerCode`, and `AmcContract.contractNumber`. Today `Invoice.invoiceNumber` uses `INV-${nanoid(8)}` (schema comment `:14-17`), which is single-garage-scale. `DocumentSequence` exists as the backing counter for the sequential scheme that will replace it; the `[kind, businessDate]` unique constraint is what makes the "one row per (kind, IST-date)" pattern race-safe under `SELECT ... FOR UPDATE` inside a transaction.

**RBAC.** Every `apps/web/src/app/api/admin/**` route file guards on a permission before the handler runs. The permission catalog is the twenty keys seeded in §9. Sample surface: `apps/web/src/app/api/admin/customers/route.ts`, `.../[id]/route.ts`, `.../[id]/history/route.ts`, `.../admin/settings/route.ts`, `.../admin/settings/holidays/route.ts` (all guard using the same helper). This pass did not read the helper implementation itself; the audit of "does every admin route guard, and does it guard the right permission?" is a separate document.

**Soft delete.** `Customer.archivedAt` is the only soft-delete column in the schema. The `_Trash/`-style pattern seen in adjacent products does not apply here; deletes on `Customer` are handled by setting `archivedAt` and by cascading behavior on `Vehicle` (Cascade), which means archiving a customer does not by itself cascade to vehicles. The dashboard queries filter on `archivedAt IS NULL`; that filter is a code-level convention.

**`_Trash/`-analogue.** None. Every other model uses hard delete guarded by the `Restrict` policies in §5.

---

## 11. Open questions this document does not answer

1. Which of the three `TODO(go-live+1)` uniqueness gaps has a dedupe migration in flight, and how far along it is. The schema says they are known; it does not say what the dedupe plan is.
2. Whether `DocumentSequence` is currently wired for `INVOICE`, or only for `JOB_CARD` / `WORKER` / `AMC`. `id-generators.ts` was not read in full for this pass.
3. Whether the `_repro-lineitems.mjs` script in `apps/web/scripts/` (untracked at this SHA) reproduces a specific line-item invariant violation that should become a §10 entry.
4. The full RBAC matrix: which permission gates which route. §10 says every admin route guards but does not list the mapping.
