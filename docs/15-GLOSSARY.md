---
mode: reference
updated: 2026-09-20
verified_against: 81a04bb
---

# Glossary

> **This describes the code, not the plan.** Every term below is one a reader will hit inside this repository. If a business word appears in the shop but not in the code, it is not here.

> **Method.** Every entry was written from a file this pass opened: `apps/web/prisma/schema.prisma` (all 31 models and 17 enums, read whole), `packages/types/src/domain.ts` (RBAC enums and permission map, read whole), `apps/web/src/middleware.ts` and `apps/web/src/lib/auth.ts` for the auth stack, `apps/web/src/lib/id-generators.ts` for document numbering, `apps/web/src/lib/hsn-rate.ts` for tax lookup, `apps/web/src/lib/time.ts` for timezone handling, `apps/web/src/lib/activity-logger.ts` for audit writes, and the file headers of every route that touches the terms below. The docs consulted: `docs/CODEBASE_CONTEXT.md`, `docs/rbac.md`, `docs/architecture.md`, `docs/notifications.md`, and the recent 30 commits of `main`. Where a term is a business word, the definition is the shop's, then how the code models it.
>
> **What this pass did NOT do.** It did not open every route handler under `apps/web/src/app/api/**`, did not read the seed data or the migration folder, did not open the packages under `packages/ui` or `packages/tsconfig`, and did not open the Sentry or notifications-provider adapters. It did not verify the docs' role list against the code role list beyond flagging the drift: `docs/rbac.md` names `SERVICE_MANAGER`, `WORKER`, `BILLING`, the code names `RECEPTIONIST`, `MECHANIC`, `INVENTORY_MANAGER`, and the code is the source of truth (`packages/types/src/domain.ts`).

Terms specific to this codebase are marked **[repo]**. Business terms a shop uses that a new developer would otherwise stall on are marked **[shop]**. Wider technical acronyms are given only when a newcomer would otherwise reach for a search.

---

## Domain models and enums

| Term | Aliases | Definition |
|---|---|---|
| **ActivityLog** | audit log | Append-only row written on every state change. `entityType`, `entityId`, `action`, `previousValueJson`, `newValueJson`, `actorType`, `actorId`. Written by `apps/web/src/lib/activity-logger.ts`; fire-and-forget when no tx is passed, atomic when a tx is. See **actorType**, **logActivity**. |
| **actorType** | ActorType | Who caused a row change. Four values: `ADMIN` (an AdminUser), `WORKER` (a Worker), `SYSTEM` (a cron or scheduled job), `PUBLIC` (an unauthenticated public route). Stored on every `ActivityLog`. |
| **AdminUser** | admin, staff account | A person who can sign in to the admin area. Has an email or `adminUserId`, a bcrypt password hash, a status, and a set of `AdminUserRole` links. Login attempts and lockouts are counted here. |
| **AdminUserStatus** | | `ACTIVE`, `INACTIVE`, `LOCKED`. `LOCKED` is set after too many failed logins; unlocked by clearing `lockedUntil`. |
| **AdminUserRole** | | Join table between `AdminUser` and `Role`. Cascade delete on both sides. |
| **AmcContract** | contract, plan instance | An `AmcPlan` sold to one customer for one vehicle. Tracks `startDate`, `endDate`, `totalServices`, `servicesUsed`, `servicesRemaining`, and the two discount percentages copied from the plan at sale time. See **AmcServiceUsage**, **AMC** [shop]. |
| **AmcContractStatus** | | `ACTIVE`, `EXPIRED`, `CANCELLED`. Rolled forward by the AMC expiry cron, not by manual edits. |
| **AmcPlan** | plan | A sellable maintenance package: name, vehicle type, duration in months, service count, price, MRP, extra discount percent, labor discount percent, covered items, exclusions. See **AMC** [shop]. |
| **AmcServiceUsage** | AMC usage, redemption | One redemption of one AMC contract's included service against one `JobCard`. Unique on `(amcContractId, jobCardId)` so the same job cannot double-consume a service. |
| **Appointment** | booking | A time-boxed visit for one customer and vehicle. `slotStart`, `slotEnd`, `status`, `bookingSource` (`ONLINE` or `WALK_IN`), optional `serviceRequestId`, `assignedWorkerId`, `bayId`. Can produce zero or more `JobCard`s. |
| **AppointmentStatus** | | `REQUESTED`, `PENDING_REVIEW`, `CONFIRMED`, `RESCHEDULED`, `CANCELLED`, `NO_SHOW`, `CHECKED_IN`, `COMPLETED`. |
| **AppointmentSlotRule** | slot rule, hours rule | The recurring weekly rule for a day of week: open time, close time, slot duration, max capacity. Feeds the available-slots computation. |
| **ApprovalStatus** | | `NOT_REQUIRED`, `PENDING`, `APPROVED`, `REJECTED`. Stored on `JobCard` for the estimate-approval gate. |
| **BlockedSlot** | | A one-off block on the calendar: date, start, end, reason, optional worker or bay scope. Complements `Holiday` (all-day) and `AppointmentSlotRule` (weekly recurrence). |
| **Customer** | | A person the shop serves. `phoneNumber` is not yet unique in the schema (a `TODO(go-live+1)` dedupe migration is pending); the public service-request route enforces uniqueness at the app layer. Owns `Vehicle`, `ServiceRequest`, `Appointment`, `JobCard`, `Invoice`, `AmcContract`, `Estimate`. |
| **DocumentSequence** | daily sequence | Per-kind, per-IST-day counter used to number invoices, job cards, workers, and AMC contracts chronologically. Unique on `(kind, businessDate)`, incremented transactionally via upsert in `lib/id-generators.ts`. See **IST** [shop]. |
| **Estimate** | quote | A priced proposal created before a `JobCard`. Can be converted to a `JobCard` and/or an `Invoice`, recorded via `convertedJobCardId` and `convertedInvoiceId`. Line items live in `EstimateItem`. |
| **EstimateStatus** | | `DRAFT`, `CONVERTED`, `CANCELLED`. |
| **EstimateItem** | | One line on an `Estimate`. Same shape as `InvoiceLineItem` minus the AMC line type. |
| **EstimateLineType** | | `PART`, `LABOR`, `SERVICE_CHARGE`, `CUSTOM_CHARGE`, `DISCOUNT_ADJUSTMENT`. |
| **Expense** | | A recorded outflow: date, category, amount, vendor, payment mode. Salary slips are stored as `Expense` rows under the category named `Salary`, not as a separate model. |
| **ExpenseCategory** | | Unique-named grouping for `Expense` rows. The literal `Salary` category is what `SalarySlip` [alias] hangs off. |
| **Holiday** | | An all-day (or timed) closure: public holiday, weekly off, business closure, maintenance shutdown, custom block. |
| **HolidayType** | | `PUBLIC_HOLIDAY`, `WEEKLY_OFF`, `BUSINESS_CLOSURE`, `MAINTENANCE_SHUTDOWN`, `CUSTOM_BLOCK`. |
| **HsnRate** | tax rate row | The GST rate for one HSN or SAC code. Keyed by `hsnCode`, value in `rate`. Read through the **HSN rate cache** [repo]. |
| **InventoryCategory** | | Unique-named grouping for `InventoryItem`. |
| **InventoryItem** | part, item, SKU | A stockable part or service the shop sells. Holds `costPrice`, `mrp`, `sellingPrice`, `quantityInStock`, `reservedQuantity`, and tax fields. See **on-hand stock** [shop], **reserved stock** [shop]. |
| **InventoryItemModel** | part-model compatibility | Join between `InventoryItem` and `VehicleModel` recording which parts fit which model. Composite key on both ids. |
| **InventoryMovementType** | movement type | `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT_INCREASE`, `ADJUSTMENT_DECREASE`, `RESERVED`, `RELEASED`, `CONSUMED`, `RETURNED`. Every quantity change writes one `StockMovement` of one of these types. |
| **Invoice** | bill | A customer's charge sheet. Carries `subtotal`, `discountAmount`, `taxTotal`, `grandTotal`, `amountPaid`, `amountDue`, plus `paymentStatus` and `invoiceStatus`. Numbered via `DocumentSequence`. |
| **InvoiceLineItem** | line item | One row on an `Invoice`. `lineType` chooses the tax and HSN default. Cascade-deleted with its `Invoice`. |
| **InvoiceLineType** | | `PART`, `LABOR`, `SERVICE_CHARGE`, `CUSTOM_CHARGE`, `DISCOUNT_ADJUSTMENT`, `AMC`. |
| **InvoiceStatus** | | `DRAFT`, `FINALIZED`, `CANCELLED`. See **DRAFT invoice** [shop], **FINALIZED invoice** [shop]. |
| **JobCard** | job, work order | The in-shop record of one repair. Owns intake data, diagnosis, estimate and final costs, `approvalStatus`, `status`, `assignedServiceManagerId`, worker `assignments`, `tasks`, `parts`, `invoices`, `amcUsages`. Numbered by `DocumentSequence` under kind `JOB_CARD`. |
| **JobCardStatus** | | `CREATED`, `UNDER_INSPECTION`, `ESTIMATE_PREPARED`, `AWAITING_CUSTOMER_APPROVAL`, `APPROVED`, `REJECTED`, `PARTS_PENDING`, `WORK_IN_PROGRESS`, `QUALITY_CHECK`, `READY_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `CLOSED`. UI screens project this onto a simpler set via `dbToSimple` / `simpleToDb` mappers. |
| **JobCardTask** | task | A named sub-step on a `JobCard`: description, status, `assignedWorkerId`, `estimatedMinutes`, `actualMinutes`. |
| **JobCardPart** | required part | The parts a job needs: `requiredQty`, `reservedQty`, `consumedQty`, `unitPrice`. Cascade-deleted with its `JobCard`; releases reserved stock on delete. |
| **LeaveStatus** | | `PENDING`, `APPROVED`, `REJECTED`. Stored on `WorkerLeave`. |
| **Notification** | | One queued or delivered message: channel, event type, template key, recipient, payload, `sendStatus`, provider ids, retry count. See **NotificationStatus**. |
| **NotificationChannel** | | `WHATSAPP` or `EMAIL`. |
| **NotificationStatus** | | `QUEUED`, `PROCESSING`, `SENT`, `DELIVERED`, `FAILED`, `DEAD_LETTER`. `DEAD_LETTER` after three failed retries. |
| **NotificationTemplate** | template | Channel + event type + `templateKey` + message body. Templates interpolate `{{variableName}}` from the payload. |
| **Payment** | receipt | Money received against one `Invoice`. `amount`, `paymentMode`, `paymentDate`, `receivedByAdminId`. Cascade-deleted with its `Invoice`. See **receipt** [shop]. |
| **PaymentMode** | | `CASH`, `CARD`, `UPI`, `BANK_TRANSFER`, `CHEQUE`, `OTHER`. |
| **PaymentStatus** | | `UNPAID`, `PARTIALLY_PAID`, `PAID`, `REFUNDED`, `WAIVED`. Recomputed after every payment insert or invoice edit. |
| **Permission** | | A single capability key like `invoices.finalize`. Attached to `Role` via `RolePermission`. See **PERMISSIONS** in `packages/types/src/domain.ts`. |
| **Role** | | A named group of permissions. Values are the enum keys of `ROLES`. See **RBAC** [tech]. |
| **ServiceRequest** | request, inbound | The customer-facing intake row created from the public site. `referenceId` is the shareable code. Feeds an `Appointment` and later a `JobCard`. |
| **ServiceRequestStatus** | | `SUBMITTED`, `UNDER_REVIEW`, `APPOINTMENT_PENDING`, `APPOINTMENT_CONFIRMED`, `CONVERTED_TO_JOB`, `CANCELLED`, `CLOSED`. |
| **Setting** | | Single-key-value config row. `key` is unique; `value` is JSON. Holds things like `invoice.quickLineItems`. |
| **StockBatch** | batch, purchase batch | One purchase lot of an `InventoryItem`: `batchNumber`, `costPrice`, `sellingPrice`, `mrp`, `initialQty`, `remainingQty`, `purchaseDate`, optional `expiryDate`. FIFO consumption reads batches by `purchaseDate` ascending. |
| **StockMovement** | ledger entry | Immutable audit row for every quantity change: type, quantity, `previousQuantity`, `newQuantity`, optional `batchId`, optional related entity. |
| **Supplier** | vendor | A party the shop buys from. Referenced from `InventoryItem` and `StockBatch`. |
| **Vehicle** | | A car, bike, scooty or other belonging to one `Customer`. Cascade-deleted with the customer. `registrationNumber` is not yet unique (`TODO(go-live+1)`). |
| **VehicleBrand** | | Brand catalog row: name, logo, sort order. Parent of `VehicleModel`. |
| **VehicleModel** | | One brand's model in the catalog, with optional engine CC and production years. See **InventoryItemModel** for parts compatibility. |
| **VehicleType** | | `CAR`, `BIKE`, `SCOOTY`, `OTHER`. |
| **Worker** | mechanic, technician | A shop-floor employee. `workerCode` is the human id. Holds shift, capacity, monthly salary, and links to appointments, leaves, task assignments. |
| **WorkerAssignment** | | Join between `JobCard` and `Worker` with an optional `assignmentRole`. Unique per pair. |
| **WorkerLeave** | leave request | A worker's leave: `leaveType`, `startDate`, `endDate`, optional partial-day times, `status`, `approvedByAdminId`. |
| **WorkerStatus** | | `ACTIVE`, `INACTIVE`, `ON_LEAVE`. |

**Not a model in the schema, despite appearing in requests:** `SalarySlip` (stored as an `Expense` under category `Salary`; see `apps/web/src/app/api/admin/salary-slips/route.ts` and `apps/web/src/lib/salary-slip-template.ts`). `Bay` is a string field (`bayId`) on `Appointment` and `BlockedSlot`, not a table.

---

## Business terms **[shop]**

| Term | Aliases | Definition |
|---|---|---|
| **AMC** | Annual Maintenance Contract | A pre-paid maintenance package the customer buys once and redeems across the year. Modelled as **AmcPlan** (the offer) and **AmcContract** (the sale). |
| **CGST, SGST, IGST** | | The three GST heads on an invoice line. Intra-state splits the HSN rate 50-50 into CGST and SGST; inter-state charges the full rate as IGST. This code shows the split at the print layer, not on the row: only the total `taxRate` and `taxAmount` are stored on `InvoiceLineItem`. |
| **DELIVERED job card** | | A `JobCard` with `status = DELIVERED` and `actualDeliveryAt` set. Vehicle is with the customer; invoice may still be `UNPAID`. |
| **DRAFT invoice** | | An `Invoice` with `invoiceStatus = DRAFT`. Editable, not counted for GST, no invoice-generated notification sent. |
| **FINALIZED invoice** | | An `Invoice` with `invoiceStatus = FINALIZED` and `finalizedAt` set. Immutable line items, GST recognised, cannot be edited, only paid or cancelled. Finalize is a `race-safe updateMany` gated on `invoiceStatus = DRAFT`. |
| **GST** | Goods and Services Tax | India's value-added tax. Rate per line comes from the HSN or SAC code on the line, resolved via **HsnRate**. |
| **HSN** | Harmonized System of Nomenclature | Six or eight-digit tariff code for a physical good, sets the GST rate. Stored on `InventoryItem.hsnCode` and copied onto `InvoiceLineItem.hsnCode` at line creation. |
| **IST** | Asia/Kolkata, UTC+5:30 | The shop's timezone. Document numbering, day boundaries and report ranges use the IST calendar day, not UTC. Helpers in `apps/web/src/lib/time.ts`. |
| **MRP** | Maximum Retail Price | The printed retail price on a part. Used as the default `unitPrice` on invoice lines (see commit `fecaa52`), never below `costPrice`. |
| **on-hand stock** | quantityInStock | The `quantityInStock` field on `InventoryItem`. Includes reserved units. |
| **quick line item** | quick add | A pre-configured line the shop keeps for one-tap add on new invoices. Stored as JSON under the `Setting` row keyed `invoice.quickLineItems`. |
| **receipt** | | A `Payment` row against an invoice. The customer-facing print is a payment receipt, distinct from the invoice itself. |
| **reserved stock** | reservedQuantity | The `reservedQuantity` field on `InventoryItem`. Units allocated to open job-card parts, still on the shelf but not sellable elsewhere. `RESERVED` and `RELEASED` `StockMovement` types push it up and down; `CONSUMED` moves the unit from reserved to gone. |
| **running total** | | The live invoice total shown while adding lines. Computed client-side, recomputed on the server before save. |
| **SAC** | Services Accounting Code | The service equivalent of HSN, used on labor and service-charge lines. Defaults to `998714` for `LABOR`, `SERVICE_CHARGE`, `AMC` and `87141090` for `CUSTOM_CHARGE` (see `apps/web/src/lib/hsn-rate.ts` `DEFAULT_HSN`). |
| **walk-in customer** | walk-in | A customer who arrives without an online booking. Handled as an `Appointment` with `bookingSource = WALK_IN` created at the counter, or a `JobCard` created directly without an appointment. |

---

## Technical terms

| Term | Aliases | Definition |
|---|---|---|
| **activity logger** | logActivity | The write path for `ActivityLog`. Accepts an optional tx client so the log rolls back with the primary mutation. `apps/web/src/lib/activity-logger.ts`. |
| **App Router** | Next.js App Router | The Next.js 14 routing model this app uses. All pages under `apps/web/src/app/**` and all APIs under `apps/web/src/app/api/**`. |
| **connection pooler** | Session Pooler | The Supabase-hosted PgBouncer this app connects to on port 5432 for run-time queries, kept separate from `DIRECT_URL` used by migrations. |
| **Edge Middleware** | | `apps/web/src/middleware.ts`. Runs before every route on Vercel's edge for auth redirect, best-effort per-IP rate limiting and per-account login throttle. |
| **HSN rate cache** | | An in-process, request-boundary cache of all `HsnRate` rows in `apps/web/src/lib/hsn-rate.ts`. TTL 60 seconds. Warm-instance-local, wiped on cold start. |
| **id-collision retry** | | Pattern that retries an insert once when a `nanoid`-generated id collides on a unique column. Used in the legacy generators in `apps/web/src/lib/id-generators.ts`. |
| **ISR** | Incremental Static Regeneration | Next.js's cache-and-revalidate rendering mode. Not the default here; admin pages are dynamic. |
| **JWT** | JSON Web Token | Signed bearer token the admin client sends as `Authorization: Bearer <token>` or in the `gearup_token` httpOnly cookie fallback. Signed with `JWT_SECRET`. Payload carries `roles[]` and `permissions[]`. |
| **ORM** | | Prisma. The one query interface to the Postgres database. |
| **PDF** | | Portable Document Format. Invoice, estimate, and salary-slip prints render an HTML template, opened by the browser's own print-to-PDF. |
| **PITR** | Point-in-Time Recovery | Supabase's transactional-log-backed restore. Not currently on this project (see `docs/RESTORE.md` and the gearup data-loss memory). |
| **PWA** | Progressive Web App | Not currently configured for this app. Term appears in planning docs only. |
| **Prisma** | | The ORM. Schema at `apps/web/prisma/schema.prisma`. Client is a singleton from `apps/web/src/lib/prisma.ts`. |
| **RBAC** | Role-Based Access Control | Roles hold permissions; users hold roles. Enforced server-side by `requirePermission()` in `apps/web/src/lib/auth.ts` on every admin route, and gated client-side by `useAuth().hasPermission()`. |
| **RLS** | Row-Level Security | Postgres per-row auth. Not used here; auth is enforced at the app layer only. |
| **Route Handler** | | A Next.js App Router file (`route.ts`) that exports HTTP method functions. Replaces the earlier Express plan. |
| **Server Action** | | A Next.js server-side function callable from a client component. Not the primary pattern here; the app uses fetch-to-Route-Handler. |
| **session mode** | | The connection pooling mode used for run-time queries via `DATABASE_URL`. Keeps one Postgres session per client, safe with prepared statements. |
| **SLA** | Service Level Agreement | Contractual response time. Term appears in planning docs, not enforced by code. |
| **SSR** | Server-Side Rendering | The default rendering mode for App Router server components. |
| **transaction mode** | | The alternative pooler mode, one Postgres session per statement. Not used here; would break prepared statements. |
| **TTL** | Time To Live | Cache expiry, e.g. the 60-second `CACHE_TTL_MS` on the HSN rate cache. |
| **tx timeout** | P2028 | Prisma's default 5-second interactive-transaction timeout. Long side-effects (notifications, PDF renders, external calls) are moved out of the transaction to avoid it; see the comment in `apps/web/src/app/api/admin/invoices/route.ts`. |
| **TZ** | | Timezone. Everywhere in this app it is IST (`Asia/Kolkata`). |
| **race-safe updateMany** | conditional update | The pattern of `updateMany({ where: { id, status: 'X' }, data: { status: 'Y' } })` returning a count, used to gate a state transition on the row still being in state `X` at the moment of write. Used on invoice finalize, payment, AMC-service decrement. |
| **Vercel Cron** | cron job | Scheduled invocations that hit an internal API route. Notification retry, AMC expiry and reminder jobs are planned as crons; delivery pipeline is described in `docs/notifications.md`. |
| **Zod** | | Runtime schema validator. Every route parses its input through a `z.object({...})` schema before touching Prisma. |

---

## Roles (from `packages/types/src/domain.ts`)

| Role | What it does |
|---|---|
| **SUPER_ADMIN** | Every permission, including admin-user management, destructive deletes, data export, cost-price visibility, and hard delete of inventory. |
| **ADMIN** | Every permission except the four `SUPER_ADMIN`-only ones: `job-cards.delete`, `data.export`, `inventory.hard-delete`, `inventory.view-cost`. |
| **RECEPTIONIST** | Front-desk operator. Manages customers, vehicles, service requests, appointments (including check-in and no-show), job cards, invoices (create and finalize), payments, AMC contracts and plans, worker leaves. |
| **MECHANIC** | Shop-floor worker. Views dashboards, vehicles, appointments, and their own job cards; updates status on assigned cards; views inventory. |
| **INVENTORY_MANAGER** | Parts and stock manager. Manages inventory (view, edit, stock movements) and can also create customers, vehicles, job cards and draft invoices. |

The `docs/rbac.md` file names `SERVICE_MANAGER`, `WORKER` and `BILLING`; those names are stale and do not exist in the code. The enum in `packages/types/src/domain.ts` is the source of truth.

---

## State transitions

**JobCard.** `CREATED → UNDER_INSPECTION → ESTIMATE_PREPARED → AWAITING_CUSTOMER_APPROVAL → APPROVED → PARTS_PENDING → WORK_IN_PROGRESS → QUALITY_CHECK → READY_FOR_DELIVERY → DELIVERED → CLOSED`. `REJECTED` and `CANCELLED` are terminal off-ramps from any point before `DELIVERED`. UI screens use a shorter set via `dbToSimple` / `simpleToDb`.

**Invoice.** `DRAFT → FINALIZED → CANCELLED`. Finalize is one-way for `DRAFT → FINALIZED`; `CANCELLED` is only reachable from `FINALIZED` and does not reverse the row, it flags it.

**Payment (as PaymentStatus on Invoice).** `UNPAID → PARTIALLY_PAID → PAID`. `REFUNDED` and `WAIVED` are administrative end states set on the invoice, not derived from payments.

**AmcContract.** `ACTIVE → EXPIRED` (by the expiry cron when `endDate` passes) or `ACTIVE → CANCELLED` (manual). No reactivation.

**ServiceRequest.** `SUBMITTED → UNDER_REVIEW → APPOINTMENT_PENDING → APPOINTMENT_CONFIRMED → CONVERTED_TO_JOB → CLOSED`, with `CANCELLED` reachable at any pre-conversion step.

**Appointment.** `REQUESTED → PENDING_REVIEW → CONFIRMED → CHECKED_IN → COMPLETED`, with `RESCHEDULED`, `CANCELLED`, `NO_SHOW` as alternate terminals.

---

## Terms deliberately not defined here

`sgnk`-prefixed skills, `Zephyrus`, `sgnk.ai`. These are the operator's studio tooling and are not part of the gearup product.

`ecosystem.md`, `AGENTS.md`, `AIOS`. These belong to the operator's meta-repo and appear only in commit messages that reference planning work; they do not shape the gearup codebase.

Planning-only vocabulary (SLA target minutes, response-time bands, kill conditions, MVP-N ladders) that lives in `docs/audit/` and `docs/requirements/` but has no code hook. Defined in those files; not repeated here.
