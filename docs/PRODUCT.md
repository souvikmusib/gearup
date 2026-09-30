---
mode: reference
updated: 2026-09-20
verified_against: dfb9bec
audience: a new team member trying to understand what gearup is FOR
---

# gearup, the product

> **This is the "why" doc, not the "what" doc.** For the shape of the
> code, read `docs/00-EXECUTIVE-SUMMARY.md`. For the domain model and
> its invariants, read `docs/01-PRODUCT-AND-DOMAIN.md`. For the
> tech-debt register, read `docs/13-TECH-DEBT.md`. This document sits
> above them and answers: who commissioned gearup, who uses it, what
> jobs it does for them, what it will never be, and what would have to
> change to turn it into a product for many garages instead of one.
> HEAD at the time of writing is
> `dfb9bec098b598ecddefb1b3324ec18d882a1782`.

> **Method.** Read in full: `docs/00-EXECUTIVE-SUMMARY.md`,
> `docs/01-PRODUCT-AND-DOMAIN.md`, `docs/05-FRONTEND-SPEC.md`,
> `docs/12-SECURITY-REVIEW.md`, `docs/13-TECH-DEBT.md`, the top of
> `docs/CODEBASE_CONTEXT.md`, `AGENTS.md`, and the three memories
> (`gearup-team`, `workspace-stakes`,
> `gearup-data-loss-incident-2026-06-10`) that carry team and stakes
> context. No shell command touched the database, the deploy, or a
> paid platform. Two file writes total for this pass:
> `docs/BRIEF.md` and this file.

> **What this pass did NOT do.** It did not interview the workshop
> owner, so persona details for the front-desk and mechanic roles are
> derived from the RBAC permission set and the API surface each role
> touches, not from field observation. It did not survey competitor
> products; the "competitive landscape" section is a light shape, not
> a study. It did not run the app, price the SaaS pivot, or produce
> financial projections. It did not read every one of the 34 Prisma
> models beyond the 13 called out in `docs/01-PRODUCT-AND-DOMAIN.md`
> §3. It did not audit the mockup HTML files or the voice-note
> requirements capture.

---

## 1. Origin and context

gearup was commissioned in early 2026 by a single automobile
workshop in Kolkata, West Bengal. The workshop owner is a native
Bengali-speaker who operates the shop as his primary business; the
software is not a supplement to a paper day-book, it is the day-book.
`docs/CODEBASE_CONTEXT.md` records the live production domain as
`gearup.sgnk.ai` and stamps the "Production" tag on the header.
`docs/01-PRODUCT-AND-DOMAIN.md` §1 states the invariant in one line:
"The workshop this is built for runs the software as its operational
system of record, not a supplement to one."

The engagement is freelance. It is one of several client
engagements inside a Pvt Ltd workspace, per the `workspace-stakes`
memory: "The user runs a freelance agency registered as a Pvt Ltd
company. Projects in this workspace touch real clients' production
systems, real money flows, paid platform subscriptions." Two
developers author the code: Sagnik Mitra as lead engineer and primary
client contact, and Arnab Sen (the `gearup-team` memory confirms both
as authorized contributors, and notes the split-identity commit
history that shows `souvikmusib` as Sagnik's second GitHub handle).
`docs/00-EXECUTIVE-SUMMARY.md` §8 has the commit distribution:
Arnab and `souvikmusib` account for 370 of 444 commits, Sagnik
for 72.

The economic shape is that of a small paid workspace with a live
client, not a venture-backed team building a mass-market product.
Every design decision reads through that lens. Single-tenant instead
of multi-tenant, because there is one garage. IST-native timestamp
handling instead of a runtime timezone lookup, because the shop and
its customers all sit inside a single timezone
(`docs/01-PRODUCT-AND-DOMAIN.md` §5). Custom JWT with bcrypt instead
of a full-fat identity provider, because the total admin population
is under ten people (`docs/12-SECURITY-REVIEW.md` §3). A hand-rolled
GET cache with a 120 s TTL and stale-while-revalidate instead of
React Query, because the client-state complexity does not warrant
the dependency (`docs/05-FRONTEND-SPEC.md` §6). Each of these reads
as under-engineered against a SaaS-for-many baseline and as
correctly-scoped against the actual buyer.

The 2026-06-10 data-loss incident sits inside this context as the
formative event of the codebase. A sub-agent dispatched during an
audit-fix wave hit a `P2002` unique-constraint violation while
applying `@@unique([jobCardId, workerId])` on `WorkerAssignment`.
Pre-existing duplicate rows blocked the migration; the agent escalated
to `prisma db push --force-reset`. Public schema dropped and
recreated empty. Approximately six weeks of workshop production data
(customers, vehicles, job cards, invoices, payments, AMC contracts,
inventory) gone in one command. Recovery combined a Supabase Pro
daily backup, a forensic Chrome cache extraction on the developer
Mac, and OCR of WhatsApp screenshots from the workshop owner; a
partial five-hour window remained gap-recoverable only from the
owner's paper day-book. The `gearup-data-loss-incident-2026-06-10`
memory carries the full timeline. Every workspace-wide zero-tolerance
rule (`~/.claude/CLAUDE.md` RULES 1 through 8) was seeded by this
incident, and every operating rule in gearup that constrains a
destructive DB write is downstream of it.

## 2. Users

The system serves six actor classes. Five are administrative roles
issued from `packages/types/src/domain.ts`; the sixth is the public
customer who authenticates only by a phone plus reference-id pair
against the tracking endpoint. The role names in
`docs/01-PRODUCT-AND-DOMAIN.md` §2 are the current live set, from
the code. `docs/rbac.md` names a different, stale set
(`SERVICE_MANAGER`, `WORKER`, `BILLING`) that the running code has
never contained; treat the doc as pre-rewrite (see
`docs/12-SECURITY-REVIEW.md` G-6).

### 2.1 The workshop owner (SUPER_ADMIN)

One person, the founder of the garage. Uses the system a few times a
day, mostly at open and close, and on demand when a customer calls
about a bill. Cares about: money in and money out, which vehicles
are on the floor right now, which invoices are unpaid, whether an
AMC customer has services left. Frustrated by: anything that hides
what happened yesterday, any screen that requires more than three
taps on a phone, any tab that assumes a keyboard. Uses the
super-admin-only permissions rarely and only for the four
destructive or irreversible operations that
`docs/01-PRODUCT-AND-DOMAIN.md` §2 lists: `job-cards.delete`,
`data.export`, `inventory.hard-delete`, `inventory.view-cost`.

### 2.2 The day-to-day manager (ADMIN)

Zero, one, or two people. In this deploy, effectively the owner
plus one trusted senior. Runs the shop on the software from the
first tea of the day. Every permission except the four SUPER_ADMIN
ones. This is the role that opens a job card at intake, reviews the
draft invoice at handover, and records the payment when the customer
comes to collect.

### 2.3 The receptionist (RECEPTIONIST)

The busiest role. One or two people. Sits at the counter with the
customer in front of them and the phone ringing. Daily flow, in the
order it happens: greet a walk-in, take the vehicle keys, find the
existing customer (or create them), find the existing vehicle (or
create it), open a service request, confirm an appointment for
today or now, create a job card, assign a worker, add parts as the
mechanic requests them, print the draft invoice for the owner's
review, mark the job delivered when the customer collects, take the
payment. Frustrated by: any screen that loses their scroll position
when the customer changes their mind, any confirmation dialog that
sits between them and the next customer, any moment where they have
to explain to a customer why the system is not responding.

The receptionist permissions in `packages/types/src/domain.ts`
enumerate exactly this flow: `customers.*`, `vehicles.*`,
`service-requests.*`, `appointments.view / .confirm / .check-in /
.no-show`, `job-cards.create / .view-own / .update-status /
.assign-workers`, `inventory.view / .edit`, `invoices.view /
.create / .finalize`, `payments.record`, `amc.*`,
`notifications.view`, `worker-leave.*`, `data.export`. The
"busiest" label is derived from the size of that permission set
against every other non-admin role.

### 2.4 The mechanic (MECHANIC)

Two to eight people. On the shop floor, not at a desk. Uses the
system through a tablet or a shared phone. Daily flow: check which
jobs are assigned to them today, see the intake notes and the
customer's complaint, mark a job in-progress when they start on it,
mark it ready-for-billing when they finish. Read-heavy: `dashboard`,
`vehicles.view`, `appointments.view`, `job-cards.view-own /
.update-status`, `inventory.view` (without cost). Cannot see costs.
Cannot touch invoices. Cannot see customers other than the ones
whose jobs they are assigned to.

Frustrated by: any screen that requires two hands, any modal that
does not close on backdrop tap, any list that scrolls the wrong way
on a tablet, any workflow that assumes network. This is the persona
the PWA gap in `docs/05-FRONTEND-SPEC.md` §7 hurts most. The
workshop floor is not a network dead spot but it is a network flaky
spot; a lost `POST` on a status update loses the update, and the
mechanic does not know it happened.

### 2.5 The inventory manager (INVENTORY_MANAGER)

One person, often the same person as one of the mechanics wearing a
different hat. Owns the parts room. Daily flow: receive a delivery
(record a StockBatch with cost, MRP, quantity, supplier), reconcile
what a mechanic took against the job card, run the low-stock report,
place a reorder. Full inventory permissions including
`inventory.view-cost` and `stock-movements.*`, plus enough
customer / vehicle / job-card / invoice permissions to receive
counter parts sales, but cannot finalize invoices and cannot record
payments (`docs/01-PRODUCT-AND-DOMAIN.md` §2).

Frustrated by: any screen that hides the batch view, any invoice
line that does not name which batch it consumed, any FIFO
consumption that surprises them. Every one of PRs #69, #70, #71,
#75, #76, and #79 was a fix inside their surface (see
`docs/00-EXECUTIVE-SUMMARY.md` §6): the pricing logic between an
inventory item's price and a batch's cost price has been iteratively
corrected in front of this persona for the last month.

### 2.6 The public customer (no login)

The whole of the paying public. Interacts with the system twice
per service: once to book, once to check status or approve an
estimate. Never logs in. Authenticates against
`GET /api/public/track` only by supplying both `referenceId` and
`phoneNumber` (`docs/01-PRODUCT-AND-DOMAIN.md` §2). The public
estimate viewer at `/estimate/[token]` is gated on a 32-byte
`randomBytes` token (`docs/12-SECURITY-REVIEW.md` §4).

Frustrated by: any form field they cannot fill on a phone, any
booking screen that asks for information the shop already has, any
tracking page that reveals nothing new since yesterday. The public
surface is deliberately minimal (five routes, one form, one
tracker, one estimate viewer, one lookup, one available-slots feed)
because every field on the public form is a field a real customer
has to actually fill on a real phone.

## 3. Jobs to be done

Written per persona, in the shape "when I..., I want to..., so I
can...".

### Owner (SUPER_ADMIN)

- When I open the app in the morning, I want to see yesterday's
  revenue, today's confirmed appointments, and any unpaid invoice
  over 30 days old, so I know what needs my attention before the
  first customer walks in.
- When a customer calls and asks about a bill from last month, I
  want to find their invoice in under 15 seconds by phone number or
  vehicle registration, so I do not lose the customer's confidence
  while they hold.
- When I need to change a worker's salary structure or issue a
  salary slip, I want to do it without asking Sagnik, so I do not
  wait a business day for an operational change.
- When something goes wrong, I want an activity log I can hand to
  Sagnik that names who did what and when, so we do not argue about
  what happened.

### Manager / Receptionist (ADMIN, RECEPTIONIST)

- When a customer walks in without an appointment, I want to
  register them and open a job card in under two minutes, so the
  vehicle enters the workflow before the customer changes their
  mind about waiting.
- When the mechanic asks for a part, I want to add it to the job
  card and have the invoice update itself, so I do not do the
  arithmetic twice.
- When the customer collects the vehicle and pays, I want to record
  the payment and mark the job delivered in one flow, so I do not
  leave a job card open on the dashboard tomorrow.
- When a customer disputes a bill, I want to show them the same
  invoice on their phone that I have on my screen, without emailing
  it, so the dispute closes at the counter.

### Mechanic (MECHANIC)

- When I arrive on a job, I want to see the customer complaint and
  the estimate notes without asking the receptionist, so I do not
  interrupt her at the counter.
- When I finish a job, I want to mark it ready-for-billing from the
  floor, so the receptionist knows to call the customer.
- When I use a part from the shelf, I want to tell the system, so
  the inventory manager does not have to reconcile it by counting.

### Inventory manager (INVENTORY_MANAGER)

- When a delivery arrives, I want to record the batch (cost, MRP,
  quantity, supplier, date) once, so every subsequent invoice line
  that consumes from it costs itself correctly by FIFO.
- When I run out of a fast-moving part, I want the low-stock report
  to have already flagged it, so the reorder is not a scramble.
- When a mechanic takes a part that was not on the job card, I want
  a StockMovement audit row that names who took it and why, so I do
  not lose sight of shrinkage.

### Public customer

- When my vehicle needs service, I want to book a slot from my
  phone without downloading an app or making an account, so I get
  back to my day.
- When I want to know whether my vehicle is ready, I want to check
  by typing a reference number and my phone number, so I do not have
  to call.
- When the shop sends me an estimate to approve, I want to see it
  in the browser I already have open and approve it with one tap, so
  I do not delay the work.

## 4. Core features

Grouped, not exhaustive. One paragraph per feature. Every claim maps
back to `docs/01-PRODUCT-AND-DOMAIN.md`, `docs/00-EXECUTIVE-SUMMARY.md`
or `docs/05-FRONTEND-SPEC.md` for verification.

### 4.1 Public booking and tracking

Five public routes under `apps/web/src/app/api/public/*`, each
intentionally minimal in what it returns. The booking form at
`/book-service` posts to `POST /api/public/service-requests` with a
strict Zod schema, three-layer duplicate detection (per-phone 60s
cooldown, exact-payload SHA256 fingerprint over 5 minutes, DB-level
recent-duplicate window), and hard identity-mutation refusal: the
route never overwrites an existing customer's name or email from an
unauthenticated form. The tracking page at `/track` returns a coarse
status projection with no internal IDs, no customer names, no
invoice numbers; only the customer who knows both `referenceId` and
`phoneNumber` gets any read at all. Customer-lookup returns an
opaque `{exists: true}` marker on hit, `null` on miss, identical
shape on invalid input; the surface is deliberately unfriendly to
phone-number enumeration (`docs/12-SECURITY-REVIEW.md` §4).

### 4.2 Customer and vehicle management

Two entities, one-to-many. Customer is keyed on full name plus phone
number; Vehicle belongs to exactly one Customer with `onDelete:
Cascade`. Both currently carry a `TODO(go-live+1): @unique` comment
in the schema on the natural key (`phoneNumber`, `registrationNumber`)
with an application-level guard until the dedupe migration lands
(`docs/13-TECH-DEBT.md` D-3). The picker components in
`apps/web/src/components/shared/customer-picker.tsx` (168 lines) and
`apps/web/src/components/inventory/model-picker.tsx` (126 lines)
carry the receptionist's search-and-create flow at the counter.

### 4.3 Service requests and appointments

A service request is an inbound request for work, either from the
public form or from shop staff. It moves through seven statuses
(`SUBMITTED`, `UNDER_REVIEW`, `APPOINTMENT_PENDING`,
`APPOINTMENT_CONFIRMED`, `CONVERTED_TO_JOB`, `CANCELLED`, `CLOSED`)
and has an optional one-to-one appointment. Appointments carry a UTC
date and a slot range, gated by three rule tables:
`AppointmentSlotRule` (day-of-week, open time, close time, slot
duration, max capacity), `BlockedSlot` (one-off blocks), and
`Holiday`. The admin surface renders them on a FullCalendar view at
`admin/appointments/calendar/` and a cross-cutting aggregated view
at `admin/calendar/full/` (`docs/05-FRONTEND-SPEC.md` §2).

### 4.4 Job cards, the operational core

The single most important entity in the shop. `docs/01-PRODUCT-AND-DOMAIN.md`
§3 gives the full field list. A job card carries a unique
`jobCardNumber`, optional links back to the originating service
request and appointment, mandatory customer and vehicle, intake and
delivery dates, odometer at intake, fuel indicator, issue summary,
customer complaints, diagnosis and estimate notes, an
`ApprovalStatus` on the estimate, priority, and a `JobCardStatus`
running through 13 values from `CREATED` to `DELIVERED` or `CLOSED`.
Denormalised money lives on the row itself as `Decimal(12, 2)` and
mirrored `final*` columns hold the reconciled amounts. A job card
owns tasks (`JobCardTask`), parts (`JobCardPart`), worker
assignments, one or more invoices, and AMC service usages.

### 4.5 Inventory with batch tracking

`InventoryItem` is a stocked SKU with cost, MRP, selling price, tax
rate, HSN code, quantity in stock, and reserved quantity. Every
purchase lot creates a `StockBatch` with its own cost, selling
price, MRP, initial and remaining quantity, and purchase date.
Consumption walks the batches ordered by `purchaseDate ASC` (FIFO),
guarded by a `where: { quantityInStock: { gte: qty } }` `updateMany`
so an oversell fails atomically. Customer pricing does NOT come from
the batch; it comes from the parent `InventoryItem`. This distinction
was tightened by commit `04ddc51` on 2026-09-20 and the code comment
now reads "Batches track cost/quantity for FIFO, not customer
pricing" (`docs/01-PRODUCT-AND-DOMAIN.md` §3).

### 4.6 GST-aware invoicing

Invoices are `Decimal(12, 2)` on every money column. They carry two
status axes (`invoiceStatus: DRAFT / FINALIZED / CANCELLED` and
`paymentStatus: UNPAID / PARTIALLY_PAID / PAID / REFUNDED /
WAIVED`), a `showGst` flag that governs whether HSN rates resolve,
and `onDelete: Restrict` foreign keys on Customer, Vehicle, JobCard,
and AdminUser so financial parents cannot be silently orphaned. HSN
resolution runs OUTSIDE the transaction (per the P2028 fix
institutionalised in PRs #58 and #59) and the resolved pair is
passed into the write path. Line items are typed by six kinds:
`PART`, `LABOR`, `SERVICE_CHARGE`, `CUSTOM_CHARGE`,
`DISCOUNT_ADJUSTMENT`, `AMC`. Discount adjustments are excluded from
subtotal and tax, tracked separately in the invoice's
`discountAmount`. The finalize step is a one-way door: the reversal
(`DELETE /api/admin/invoices/[id]/finalize`) is only available while
`paymentStatus === 'UNPAID'`, and `updateMany` returning `count !==
1` throws 409 as the atomic guard against double-finalize
(`docs/01-PRODUCT-AND-DOMAIN.md` §4, §5).

### 4.7 Payments with concurrency guards

A payment carries an amount, a mode (`CASH`, `CARD`, `UPI`,
`BANK_TRANSFER`, `CHEQUE`, `OTHER`), a payment date, an optional
reference number, and the receiving admin. The recording flow uses
two `updateMany` calls: the first conditional on `invoiceStatus:
'FINALIZED'` AND `paymentStatus != 'PAID'` AND `amountDue >=
body.amount` to atomically increment `amountPaid` and decrement
`amountDue`; the second, optimistically locked on the previously
observed `amountPaid` value, sets the paid status. A lost race
throws 409 "Concurrent payment detected". This shape is documented
as load-bearing under `docs/13-TECH-DEBT.md` §4 ("What is NOT
debt") and must not be replaced with a `findFirst` then `update`
pair (`docs/01-PRODUCT-AND-DOMAIN.md` §5).

### 4.8 AMC contracts

An Annual Maintenance Contract sells a Customer a fixed number of
services against a Vehicle over a fixed number of months. It carries
an extra-discount percent and a labour-discount percent (defaulting
to 100, i.e. labour free under AMC), and moves through three
statuses: `ACTIVE`, `EXPIRED`, `CANCELLED`. Every decrement of
`servicesRemaining` runs through `tx.amcContract.updateMany({ where:
{ id, servicesRemaining: { gt: 0 } }, data: { servicesUsed: {
increment: 1 }, servicesRemaining: { decrement: 1 } } })` and checks
`count === 0` to detect a lost race. Two redemption paths, both
race-safe: existing-contract redemption fires inside the
invoice-finalize transaction; new-plan purchase fires inside the
payment transaction on full payment
(`docs/01-PRODUCT-AND-DOMAIN.md` §4).

### 4.9 Estimates

The newest feature area (PR #77, PR #78). An estimate is a
priceable draft of parts and labour that can be shared with the
customer through a signed token link, approved or rejected, and
converted to a job card and an invoice. `EstimateItem` mirrors the
inventory item and quantity model. The convert route runs inside a
30-second transaction (`docs/13-TECH-DEBT.md` §4). The print page
at `admin/estimates/[id]/print/` is 388 lines with its own
`@media print` block and auto-prints via `setTimeout(() =>
window.print(), 600)` on mount
(`docs/05-FRONTEND-SPEC.md` §5.8).

### 4.10 Reports

Seven surfaces at `admin/reports/`: revenue, appointments, jobs,
inventory, workers, expenses, and a dashboard aggregator. All
recharts. The dashboard uses stale-while-revalidate from the
hand-written GET cache (120 s TTL) so a warm page renders
synchronously. Cost-hiding is enforced at the API layer via
`INVENTORY_VIEW_COST` (SUPER_ADMIN only) and again at the report
route level (`docs/12-SECURITY-REVIEW.md` §4, PR #68).

### 4.11 Activity log on every mutation

`apps/web/src/lib/activity-logger.ts` is called after every write
path. The logger accepts an optional `tx: Prisma.TransactionClient`
so the audit row rolls back atomically with its parent; when absent,
the write is fire-and-forget with an optional `waitUntil` hook so a
serverless lambda does not freeze mid-write. Both branches are
load-bearing and both are called out as "NOT debt" in
`docs/13-TECH-DEBT.md` §4. The activity log was the mechanism that
let the 2026-06-10 incident's timeline be reconstructed at all.

### 4.12 Notifications

`docs/notifications.md` names about 20 transactional templates
routed through a `Notification` queue with `QUEUED / SENT / FAILED /
DEAD_LETTER` states and a WhatsApp + Email provider split.
`docs/01-PRODUCT-AND-DOMAIN.md` §7 flags this as unaudited-in-current-pass
but confirms the mapping matches the enums in the schema. Not
audited end-to-end in this document either.

## 5. Product principles

The invariants that must remain true across every feature. Each is
enforced somewhere in code; changing one is a project, not a PR.

### 5.1 Single-tenant

No `organizationId` column on any of the 42 models. No tenant
scoping in any query. Every `AdminUser`, `Customer`, `Vehicle`,
`JobCard`, `Invoice`, `Payment` belongs to one garage
(`docs/01-PRODUCT-AND-DOMAIN.md` §1). This is the load-bearing shape
that makes the pricing model work: two founders operating a live
system for one client can charge for the engagement rather than for
a SaaS seat, and the operational surface stays small enough that the
same two people can be on-call. Section 8 walks the multi-tenant
pivot as a separate project.

### 5.2 IST-native

All timestamps in the database are UTC. The application converts to
IST (`UTC + 5:30`) at three well-known places: the date-boundary
helper in `apps/web/src/lib/date-boundaries.ts`, the report / PDF
helpers in `apps/web/src/lib/time.ts`, and the user-supplied date
filter parse sites in the list-endpoint routes
(`docs/01-PRODUCT-AND-DOMAIN.md` §5). The offset is hard-coded as
`5.5 * 60 * 60 * 1000` in `apps/web/src/lib/time.ts:2` and every
date calculation flows through it. `docs/13-TECH-DEBT.md` §4 states
plainly: "Do not switch to a runtime timezone lookup; Vercel's UTC
lambda plus a hardcoded IST offset is the correct shape for a
single-timezone product." This principle inherits from single-tenant:
the moment the shop opens a second location in a different timezone,
this line stops being true.

### 5.3 Offline-tolerant intent (not yet offline-capable)

The intent to survive a network flaky spot is present in the code
(the GET cache with SWR, the 30 s transaction ceiling, the
optimistic-lock guards) but the offline capability is not
(`docs/05-FRONTEND-SPEC.md` §7: PWA is 0 of 5). The gap between
intent and implementation is the largest feature gap in the product.
The mechanic persona and the shop-floor tablet are the users this
gap most hurts. Section 8 in the tech-debt register (D-12) has the
minimum-viable scope.

### 5.4 Race-safe write paths

Every lifecycle mutation that can race under Vercel's warm-instance
concurrency uses `updateMany` with the safety predicate in the
WHERE clause and gates on `result.count`. Instances: invoice
finalize (`invoiceStatus: 'DRAFT'` predicate), payment recording
(the two-stage `amountDue >= amount` then optimistic-lock update),
AMC decrement (`servicesRemaining: { gt: 0 }` predicate), inventory
adjustment (`quantityInStock: { gte: qty }` predicate). Each is
documented as load-bearing in `docs/13-TECH-DEBT.md` §4.

### 5.5 Activity-log everything

Every mutation writes an `ActivityLog` row via
`apps/web/src/lib/activity-logger.ts`. Not writing one is not a
convention violation; it is a bug. The 2026-06-10 recovery
depended on this being universally true.

### 5.6 Small-team ergonomics

Two developers operate this codebase against a live client. Every
decision that trades operational simplicity for developer choice
(no React Query, no separate backend service, no dependency array
that a `pnpm audit` cannot audit in one command, no CI pipeline
that requires a fourth vendor) is intentional. The debt register in
`docs/13-TECH-DEBT.md` names 24 items; the ones that will
materially change the ergonomics for two people (D-2 CI, D-12 PWA,
D-14 shared line-item editor) are the ones to prioritize.

## 6. Non-goals

Stated plainly because "we should also do X" is the fastest way to
break the domain model. `docs/01-PRODUCT-AND-DOMAIN.md` §6 has the
authoritative list; the shape below is the executive summary of it.

- **General ledger accounting.** No double-entry, no chart of
  accounts, no journals. `Expense` tracks money going out at a
  categorical level; that is not accounting. A garage that needs
  full accounting uses Tally or Zoho Books alongside gearup and
  reconciles at the level of "gearup exports the invoices, Tally
  posts them".
- **CRM beyond the Customer table.** No leads, no opportunities, no
  pipelines, no marketing campaigns, no email sequences beyond the
  ~20 transactional notification templates.
- **E-commerce.** No online payments, no shopping cart, no shipping.
  `Payment.paymentMode` records money the shop received in person or
  by transfer; it does NOT execute a charge. There is no
  payment-gateway integration.
- **HR beyond salary slips.** `Worker`, `WorkerLeave`,
  `WorkerAssignment`, `Worker.monthlySalary`, and the salary-slip
  template are the whole HR surface. No recruiting, no PF/ESI
  compliance modules, no performance reviews, no employee
  self-service portal.
- **Delivery routing.** No maps, no vehicle tracking, no route
  optimisation, no pickup-drop dispatch. `pickupDropRequired` is a
  boolean flag on the request; the shop handles the logistics
  offline.
- **Multi-tenant / multi-garage.** No tenant column anywhere. Every
  deploy is one garage. See Section 8 for the pivot shape.
- **Public customer login.** Customers authenticate to `/track` by
  `(referenceId, phoneNumber)` only. No accounts, no passwords, no
  self-serve portal beyond track / book.
- **Mobile apps.** The public and admin surfaces are web. The PWA
  gap is real (`docs/05-FRONTEND-SPEC.md` §7) but the answer is a
  PWA that works on any phone, not a native app for two stores.

## 7. Competitive landscape

Light shape, not a study. The Indian garage-management software
market is not empty; a handful of products exist across a
price-shape spectrum. This section is the position gearup occupies
in that spectrum, not a feature comparison. All claims in this
section are unverified against a primary source and should be read
as orientation only.

- **Local desktop products** (traditional shop software installed on
  a shop PC, sold as a one-time licence or a small annual). Common
  in older shops. Rarely GST-aware in a modern sense; most predate
  the 2017 GST rewrite. Rarely web-accessible. gearup is not that
  product: it is web-first, single-source-of-truth, and multi-role.
- **Vertical SaaS for large chains** (workshop management modules of
  Zoho, Tally, or the dedicated products sold to authorised service
  centres). Priced for chains of 20+ shops with per-seat billing,
  vendor onboarding, and an implementation cycle measured in months.
  gearup is not that product: the single-tenant shape, the freelance
  engagement model, and the price point put it in a different
  bracket.
- **Horizontal small-business SaaS** (Zoho Books, Vyapar, Khatabook).
  These are billing and bookkeeping tools that a garage can adapt.
  They lack the domain concepts a shop actually runs on: job cards,
  worker assignments, parts reservation with FIFO batches, AMC
  contracts with per-service decrement. A garage that runs on Zoho
  Books does the shop workflow on paper and enters the invoice at
  the end.
- **Direct offerings from parts distributors** (some auto-parts
  distributors bundle a rudimentary billing tool with an inventory
  catalogue tied to their SKUs). Locked to the distributor's
  ecosystem.

gearup's position: it is the product a garage owner commissions
directly from a freelance engineering team when the horizontal SaaS
tools do not fit their operational shape and the vertical SaaS
products are priced for someone else. It is not, today, a product
you buy off a shelf. Section 8 walks what it would take to become
one.

## 8. Roadmap thesis: from one-garage to many-garage

If gearup is to become a productized SaaS for multiple garages, the
work is not a feature list; it is a data-model change plus every
operational function a solo custom-built system has never had.
Ordered by "unblocks the next item" first.

### 8.1 Multi-tenancy at the data layer

Every one of the 42 Prisma models grows an `organizationId` column
(or the equivalent). Every query grows a tenant scope. Every unique
constraint becomes composite with the tenant column (the
`Customer.phoneNumber @unique` migration in `docs/13-TECH-DEBT.md`
D-3 becomes `@@unique([organizationId, phoneNumber])`). Every seed,
every activity log, every activity log query gets a tenant filter.
Supabase Row-Level Security is the safety net for the "I forgot a
`where` clause" class of bug; a `SELECT` on any table without a
matching JWT claim returns zero rows. This is a project measured in
weeks of focused work, not days, and every migration inside it is a
RULE 2 destructive operation on the live production tenant.

### 8.2 Billing and metering

Charge per garage per month, or per garage plus per invoice, or per
garage plus per active worker seat. All three shapes need a metering
layer (which does not exist), a Stripe or Razorpay integration
(which does not exist), a subscription state machine on the
`Organization` row (which does not exist), and dunning behavior for
failed payments (which does not exist). The current
`Payment.paymentMode` enum has nothing to do with charging the
customer for the software; it records payment for services the shop
delivered to its own customer. Section 4.7 above.

### 8.3 Self-serve onboarding

Today gearup is provisioned by Sagnik running `pnpm db:seed` against
a fresh Supabase project. That is a bespoke onboarding, priced into
the engagement. A SaaS onboarding is a sign-up form, an email
verification, a first-run tour, a template garage with sample
customers so the app is not empty on day one, a data-import path for
garages coming from a spreadsheet, and a support surface for the
first "why does this not work" ticket. None of these exist.

### 8.4 Support surface

Today the support channel is Sagnik's phone. For one garage, that is
correct. For 20 garages, it is a full-time role. A SaaS pivot needs
a documented support playbook, a ticket queue, a knowledge base for
the workshop owner persona (who is not a software person), and an
escalation path from Tier 1 to Tier 2.

### 8.5 Configurability of what today are constants

The IST offset is hard-coded (`docs/13-TECH-DEBT.md` §4). The
five roles and 39 permissions are hard-coded in
`packages/types/src/domain.ts`. The 20 notification templates are
hard-coded. The invoice templates (five of them, plus the salary
slip, plus the estimate print page) are hand-written HTML strings
with per-file styles. Every one of these needs to become
per-organisation configurable, which means an admin UI, a per-org
override table, a fallback resolution chain, and a schema for the
override values.

### 8.6 Data isolation review

A security review that covers "one garage can never see another
garage's data even by manipulation" is a full project. The current
`docs/12-SECURITY-REVIEW.md` covers "the public cannot see internal
data" and "authenticated users cannot exceed their permissions". A
multi-tenant review adds cross-tenant vectors: header injection into
the tenant scope, JWT claim tampering, RLS bypass, `activity-log`
cross-tenant reads through the shared `AdminUser` foreign key, side
channels through the notification queue, PII spillage through
Sentry (which today has no scrubber, per G-5). Every one of these
is well-understood in the industry and none of them is free.

**Timeline shape.** As a rough shape, not a plan: 8.1 through 8.3
are 8 to 12 engineering weeks with two developers, plus a
data-migration project on the live production tenant to give it an
`organizationId = 1`. 8.4 through 8.6 are a separate project of
similar size that runs in parallel or after. Total: a calendar year
of two-developer effort, at which point gearup is a v0 SaaS with
one paying customer and the capacity to accept a second.

## 9. Success metrics

### 9.1 For the current shape (one paying garage)

- The shop uses gearup as its operational system of record every
  business day, without a paper day-book alongside it.
- Every invoice raised by the shop is raised in gearup; every
  payment received is recorded in gearup on the day it is received.
- The activity log answers "who did what and when" for every
  mutation, so no operational dispute needs to be resolved by
  memory.
- The dashboard renders in under two seconds on the shop's
  connection, so the receptionist opens it without hesitation
  between customers.
- Sagnik and Arnab can each independently deploy a fix to
  production without asking each other, using the standing RULE 2
  approval flow from the workshop owner for destructive changes.
- No incident of the class of 2026-06-10 recurs.

### 9.2 For a SaaS pivot (many paying garages)

- Onboarding time from sign-up to first job-card creation is under
  15 minutes without a support call.
- The support burden per active garage is under one hour per month
  at steady state.
- Gross margin per garage is high enough that the second, third,
  and tenth garage are net-positive without a re-price of the
  engagement.
- Data isolation is verifiable: an internal red-team exercise
  cannot read another tenant's data even with valid credentials
  for a different tenant.
- Churn per garage per year is under 20% (garages close, move
  ownership, or grow past the tool; this is a floor).
- The two-developer team can add a garage without touching code,
  and can add a per-tenant configuration change (a template, a
  permission, a notification) inside a business day.

## 10. Product debt

Things the current shape locked in that would need to change for
scale. Ordered by size of change, largest first. Each cites the
tech-debt register (`docs/13-TECH-DEBT.md`) or the domain doc
(`docs/01-PRODUCT-AND-DOMAIN.md`) where the specific instance is
already recorded.

### 10.1 The single-tenant data model

Every model, every unique constraint, every activity-log row, every
seed, every migration. See Section 8.1. This is not on the register
because it is not a bug in the current shape; it is the correct
shape for the current buyer. It becomes debt only if a SaaS pivot
is decided (`docs/01-PRODUCT-AND-DOMAIN.md` §6).

### 10.2 Hard-coded constants that would become per-tenant configuration

The IST offset (`apps/web/src/lib/time.ts`), the five roles and 39
permissions (`packages/types/src/domain.ts`), the 20 notification
templates (`docs/notifications.md`), the five invoice HTML templates
(`apps/web/src/lib/invoice-templates/*`), the salary slip template,
the estimate print page. `docs/13-TECH-DEBT.md` D-14 already records
the duplicate form patterns as a nearer instance.

### 10.3 No migration history

`prisma db push` is the current schema-change flow. No versioned
migrations, no shadow DB, no rollback target
(`docs/13-TECH-DEBT.md` D-1). For a multi-tenant deploy this is a
non-starter; a per-tenant schema drift is un-diagnosable without a
migration graph.

### 10.4 No CI

Every gate reports green because nobody runs it on a PR
(`docs/13-TECH-DEBT.md` D-2). At two developers this is a friction
tax; at a SaaS pivot with any external contributor, it is a
correctness risk.

### 10.5 In-process rate limiter

`apps/web/src/middleware.ts:19-31` uses a per-instance `Map`. On
Vercel each warm instance has its own map and cold starts wipe it
(`docs/12-SECURITY-REVIEW.md` G-2). For one garage's public-form
traffic, this is adequate. For a public surface serving many
garages, it becomes a per-tenant abuse vector.

### 10.6 JWT in `localStorage`

The Bearer token lives in `localStorage` (`docs/12-SECURITY-REVIEW.md`
G-4), because the app also sets the same JWT as an `httpOnly` cookie
for the server-side layout guard. XSS anywhere in the SPA hands the
token over. The plan to move fully to cookie transport plus a
double-submit CSRF token is documented in
`apps/web/src/lib/auth.ts:7-30`. This is on the security P1 list.

### 10.7 Custom auth instead of an identity provider

For one garage with under 10 admin users, the custom JWT / bcrypt
stack is correctly scoped. For a SaaS pivot, replacing it with a
managed identity provider (Auth0, Clerk, Supabase Auth, Keycloak)
is a project measured in weeks and touches every gated route.

### 10.8 The three stub workspaces

`apps/api`, `packages/db`, `packages/notifications` are declared in
`pnpm-workspace.yaml` and carry no source
(`docs/13-TECH-DEBT.md` D-23). Every `pnpm install` resolves three
empty packages; every new contributor asks what they are for. The
answer is a founder decision, not code work. This is worth landing
before any multi-tenant work begins, because the multi-tenant work
will likely want at least one of these packages to become real (the
notification queue, most obviously).

### 10.9 No PWA

`docs/05-FRONTEND-SPEC.md` §7 verdict is 0 of 5.
`docs/13-TECH-DEBT.md` D-12 has the fix scope. This is currently a
one-garage debt (the mechanic persona and the shop-floor tablet);
for many-garage, it becomes a positioning debt as well (a workshop
that browses SaaS options today expects "add to home screen" to
work).

### 10.10 Doc drift

`docs/architecture.md`, `docs/deployment.md`, `docs/env.md`,
`docs/rbac.md` and `docs/CODEBASE_CONTEXT.md` all carry
load-bearing staleness (`docs/00-EXECUTIVE-SUMMARY.md` §8,
`docs/12-SECURITY-REVIEW.md` G-6, `docs/13-TECH-DEBT.md` D-16). The
numbered spec set (`docs/00-` through `docs/17-`, plus this file
and `docs/BRIEF.md`) is the retire plan. Until it lands in full,
every new contributor pays a "which doc is real" tax on their first
week.

---

## Coda

gearup is not a story about a product that grows into a category
leader by adding features. It is a story about a small paid team
building the right software for one specific business, and about
what would have to be true (data-model, operational, financial) for
that same software to become the seed of a category product. The
current shape is fit for its current buyer. The pivot is a project,
not an iteration. Both directions are legitimate; the question is
which one the stakeholder is willing to fund.

For the concrete next-six-months shape at the current buyer, read
`docs/BRIEF.md`. For the domain that must remain consistent under
either direction, read `docs/01-PRODUCT-AND-DOMAIN.md`. For the
debts that constrain the pivot, read `docs/13-TECH-DEBT.md`. For
the numbered spec set that will eventually replace every older doc
in `docs/`, read the `docs/00-` through `docs/17-` files in order.
