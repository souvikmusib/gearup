---
mode: reference
updated: 2026-09-20
verified_against: 5af8fc8
---

# API reference

> **This describes the code as it stands on branch `docs/gearup-ai-os-map` at commit `5af8fc8`, not the plan.** Every path, permission, verb, and schema below was read from a `route.ts` file under `apps/web/src/app/api/`. Cross-references to models point at `docs/03-DATA-MODEL.md`.

> **Method.** I listed every `route.ts` under `apps/web/src/app/api/` with `find`, counted 83 files, and then read every one. For each file I extracted: the exported HTTP methods, the `requirePermission(...)` or `requireAnyPermission(...)` call, the zod schema fed to `parse(await req.json())`, the `req.nextUrl.searchParams.get(...)` reads, the `throw new AppError(...)` / `throw new ValidationError(...)` sites, and whether the handler wraps its work in `prisma.$transaction`. I also read `apps/web/src/lib/auth.ts`, `apps/web/src/lib/errors.ts`, `apps/web/src/lib/pagination.ts`, `apps/web/src/lib/constants.ts`, and the `PERMISSIONS` enum in `packages/types/src/domain.ts`. Response shapes are read from the handler's `NextResponse.json({...})` call and, where a Prisma `include` shapes the payload, from the include tree.

> **What this pass did NOT do.** I did not start a dev server, so no status code below was observed over the wire. Every status is read from a literal in the handler or from the `AppError` / `NotFoundError` / `ValidationError` thrown, whose statuses come from `apps/web/src/lib/errors.ts`. I did not run `npm run test`, `npm run typecheck`, or `npm run build`. I did not read the middleware (`apps/web/src/middleware.ts`), so CORS, per-route rate limits, and CSP headers are noted only where a route file mentions them (`public/service-requests` sets its own in-process throttle, and `public/customer-lookup`'s file comment cites middleware-level "10/min/IP". **unverified against the middleware source**). I did not open the Prisma schema (`docs/03-DATA-MODEL.md` is authoritative for models). I did not resolve every `include` back to a full response type; where a response is deep, I describe the top-level keys.

---

## 0. Route count and organization

```
$ find apps/web/src/app/api -name 'route.ts' | wc -l
      83
```

83 handler files, none delegated to a catch-all (there is no `[...nextauth]`-style re-export in this tree). Grouped by top folder under `apps/web/src/app/api/`:

| Module | Files | Section |
|---|---|---|
| `admin/amc/` | 6 | 3.1 |
| `admin/appointments/` | 2 | 3.2 |
| `admin/auth/` | 4 | 3.3 |
| `admin/customers/` | 3 | 3.4 |
| `admin/estimates/` | 3 | 3.5 |
| `admin/expenses/` (incl. categories) | 4 | 3.6 |
| `admin/hsn-rates/` | 1 | 3.7 |
| `admin/inventory/` (items, categories, suppliers, catalog, movements, low-stock) | 12 | 3.8 |
| `admin/invoices/` (incl. line-items, payments, finalize, pdf) | 6 | 3.9 |
| `admin/job-cards/` (incl. parts, tasks, workers) | 5 | 3.10 |
| `admin/logs/` | 2 | 3.11 |
| `admin/notifications/` (incl. templates) | 2 | 3.12 |
| `admin/payments/` | 1 | 3.13 |
| `admin/reports/` | 7 | 3.14 |
| `admin/salary-slips/` | 3 | 3.15 |
| `admin/service-requests/` | 2 | 3.16 |
| `admin/settings/` (admins, business-hours, holidays, roles, export, general) | 7 | 3.17 |
| `admin/vehicles/` | 2 | 3.18 |
| `admin/workers/` (incl. leave, calendar) | 4 | 3.19 |
| `public/` (available-slots, customer-lookup, estimate, service-requests, track) | 5 | 3.20 |
| `health/` | 1 | 3.21 |

The `me` and `refresh` endpoints hinted at in the brief live under `admin/auth/` (`me` exists; there is no dedicated `refresh` route. the SPA re-hits `/api/admin/auth/login` when its bearer expires).

---

## 1. Conventions that hold across every handler

### 1.1 Base URL split

- `/api/admin/*`. every handler under this prefix is JWT-gated. Each one calls `requirePermission(PERMISSIONS.<KEY>)` or `requireAnyPermission(...)` from `apps/web/src/lib/auth.ts`. `requirePermission` requires ALL listed permissions (AND); `requireAnyPermission` requires ANY (OR). Both throw `UnauthorizedError` (401) when no token is present or the token is invalid, and `ForbiddenError` (403) when the token's `permissions[]` array is missing the required key.
- `/api/public/*`. no auth. These routes are the customer-facing surface (book a service, track a request, look up available slots, respond to an estimate). Each one carries its own defense-in-depth (in-process throttles, phone normalization, secret tokens).
- `/api/health`. no auth. Returns `{status:'ok'|'error', db:'connected'|'disconnected', timestamp}`. 503 when the `SELECT 1` probe throws.

### 1.2 Auth scheme

`apps/web/src/lib/auth.ts:33-47`.

- **Primary transport**: `Authorization: Bearer <jwt>` header set by the SPA from the token returned by `POST /api/admin/auth/login`. Held in memory + `localStorage` on the client.
- **Fallback transport**: an `httpOnly` + `Secure` + `SameSite=Lax` cookie named `gearup_token` (`AUTH_COOKIE_NAME`), set by the login route on the same response as the bearer token. Its `maxAge` is derived from `JWT_EXPIRY` in `apps/web/src/lib/constants.ts` (currently `24h` → 86400 s).
- The verifier reads the header first, falls back to the cookie, and throws `UnauthorizedError('Missing token')` when neither is present. The token is verified with `jwt.verify(token, getJwtSecret())`.
- The JWT payload carries `{ sub, adminUserId, roles: RoleKey[], permissions: PermissionKey[] }`. `permissions` is expanded at login time from `ROLE_PERMISSIONS[roleKey]` in `packages/types/src/domain.ts`.
- CSRF posture, per the doc block in `auth.ts`: bearer mode is not auto-attached, cookie mode relies on `SameSite=Lax` plus the `CORS_ALLOWED_ORIGINS` allowlist enforced in `apps/web/src/middleware.ts`. **The middleware itself was not read in this pass. treat the CORS statement as documented intent, not verified fact.**

### 1.3 Error envelope

`apps/web/src/lib/errors.ts` centralises this via `handleApiError(err)`. Every handler under `admin/*` wraps its body in `try { ... } catch (e) { return handleApiError(e); }`.

Failure envelope:

```
{ success: false, error: { code: string, message: string, details?: Record<string,string[]> } }
```

Status → code mapping used across the tree (read from `AppError` subclass constructors and inline `throw new AppError(status, msg, code)` sites):

| Status | Where it comes from |
|---|---|
| 400 | `ValidationError` (default `VALIDATION_ERROR`); zod `ZodError` → 400 with `details` keyed by dotted path; explicit `AppError(400, msg, code)` |
| 401 | `UnauthorizedError` (`UNAUTHORIZED`); Prisma `P2025` with `AdminUser` in the cause becomes `SESSION_STALE` |
| 403 | `ForbiddenError` (`FORBIDDEN`); the salary-slip edit-window guard uses `EDIT_WINDOW_CLOSED`; admin self-lockout guards on `settings/admins` PATCH |
| 404 | `NotFoundError`; Prisma `P2025` on generic entities |
| 409 | Prisma `P2002` unique violation is mapped to `CONFLICT` with a humanized message; explicit `AppError(409, msg, 'CONFLICT')` for domain conflicts (status transitions, in-use guards, duplicate holidays, concurrent-payment optimistic-lock failures) |
| 410 | `/api/admin/reports?type=<x>` for the legacy `type=` branches (they now redirect callers to `/api/admin/reports/<x>`) |
| 429 | `public/service-requests` in-process phone cooldown (`RATE_LIMITED`) |
| 500 | Uncaught throws that reach `handleApiError` and don't match `AppError`, `ZodError`, or a mapped Prisma code. Response body carries `error.detail` when `NEXT_PUBLIC_EXPOSE_ERRORS === '1'` or `NODE_ENV !== 'production'`; otherwise a bare `INTERNAL_ERROR` |
| 503 | `/api/health` when the DB probe throws |

There is no dedicated 422; validation failures go to 400. There is no explicit 201 for most creates. some routes do set `{ status: 201 }` explicitly on `NextResponse.json` (invoice POST, appointment POST, job-card POST, worker POST, supplier POST, expense POST, holiday POST, expense-category POST, inventory-category POST, notification-template POST, estimate POST, AMC plan/contract/usage POST, inventory-catalog brand/model POST, salary-slip POST, vehicle POST, customer POST, hsn-rate POST). Others return 200 on create (customer PATCH, PATCH updates, etc.). Nothing returns 202 or 204.

### 1.4 Success envelope

```
{ success: true, data: <payload>, meta?: <pagination> }
```

`meta` is present on list endpoints that paginate. It is `{ page, pageSize, total, totalPages }`, produced by `paginationMeta(total, page, pageSize)` in `apps/web/src/lib/pagination.ts`. On the customer history endpoint the same object is returned under the key `pagination` (not `meta`), which is a wart worth knowing about (`admin/customers/[id]/history`).

### 1.5 Pagination

`apps/web/src/lib/pagination.ts` and `apps/web/src/lib/constants.ts`.

- `DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 500`.
- `paginate({ page, pageSize })` clamps `pageSize` to `[1, maxPageSize]` and `page` to `>= 1`, returning `{ skip, take }` for Prisma.
- Convention across list routes: `?page=1&pageSize=20`, both parsed via `Number(sp.get(...)) || <default>` or (in the newer routes) `z.coerce.number().int().min(1).max(MAX_PAGE_SIZE)`. Notification-list and inventory-movements clamp `pageSize` to `200`; admin-list clamps to `200`; inventory-items clamps to `500` inline.
- Response wraps the array under `data` (or `data.items` on `/api/admin/estimates`. another wart) and puts totals under `meta`.

### 1.6 IST timezone parsing for `from` / `to`

Most range filters accept `?from=YYYY-MM-DD&to=YYYY-MM-DD` and construct the bounds by appending `T00:00:00+05:30` and `T23:59:59+05:30` (Indian Standard Time, UTC+5:30). Files that do this: `admin/invoices`, `admin/appointments`, `admin/expenses`, `admin/estimates` (search only, no date range), `admin/job-cards`, `admin/salary-slips`, `admin/payments`, `admin/logs`, `admin/logs/export`, `admin/reports/revenue`, `admin/reports/workers`, `admin/reports/expenses`. `admin/settings/holidays` also anchors `holidayDate` to `+05:30`. The reports/dashboard route builds `today` from `now + istOffset` then formats as `YYYY-MM-DD` and appends `+05:30`. Log routes further use `istDayEnd(new Date(to))` from `apps/web/src/lib/time.ts` for the upper bound.

The `public/available-slots` route is the odd one out. it parses the date as UTC (`Date.UTC(year, month-1, day)`) to derive `dayOfWeek`, then anchors slot instants to the day's `+05:30` open time. `public/service-requests` treats `preferredDate` as an opaque string and normalises when constructing appointment slots.

### 1.7 Transaction discipline

Handler code wraps multi-write work in `prisma.$transaction(async (tx) => { ... })`. Two forms appear:

- Batched writes: `prisma.$transaction([...])`. used by the settings PATCH upsert loop.
- Interactive: `prisma.$transaction(async (tx) => ...)`. everywhere else.

Explicit timeouts appear on the write paths most at risk of pool starvation on Vercel + Supabase (documented inline in each file, tied to the P2028 incident of 2026-07-01): `admin/invoices POST` (30 000 ms, `maxWait: 10 000`), `admin/job-cards/[id]/parts POST` (30 000 ms, `maxWait: 10 000`), `admin/estimates/[id]/convert POST` (30 000 ms, `maxWait: 10 000`). The rest use Prisma defaults.

HSN + tax-rate resolution (`resolveHsnAndRate`) is pulled OUT of the transaction on the invoice / line-item / job-card-parts POSTs specifically because it opens its own Prisma connections and was the direct cause of the P2028 timeouts. The DRAFT-status re-check runs inside the transaction as the TOCTOU guard.

### 1.8 Activity log

`apps/web/src/lib/activity-logger.ts` is fire-and-forget in most sites (`logActivity({...})` returned as a floating promise). It writes to the `ActivityLog` model (`docs/03-DATA-MODEL.md`). Two sites `await` it explicitly: `settings/export/GET` (bulk PII export, DPDP compliance) and any writer inside a transaction that passes `tx` so the log row is atomic with the domain write.

### 1.9 Numeric / decimal handling

Everything monetary is stored as `Prisma.Decimal` (see `docs/03-DATA-MODEL.md`). Handlers coerce with `Number(...)` for arithmetic and `Math.round(x * 100) / 100` for two-place rounding. Grand totals are rounded to integers in the invoice write paths (`Math.round(subtotal + taxTotal + discountFromLines - discountAmount)`).

---

## 2. Roles and permissions

Role → permission mapping is in `packages/types/src/domain.ts` (`ROLE_PERMISSIONS`). The five roles are `SUPER_ADMIN`, `ADMIN`, `RECEPTIONIST`, `MECHANIC`, `INVENTORY_MANAGER`. Four permissions are SUPER_ADMIN-only (excluded from the ADMIN role):

- `job-cards.delete` (`JOB_CARDS_DELETE`)
- `data.export` (`DATA_EXPORT`)
- `inventory.hard-delete` (`INVENTORY_HARD_DELETE`)
- `inventory.view-cost` (`INVENTORY_VIEW_COST`)

The full permission list (33 keys) with their route touchpoints:

| Permission key | Value | First-touch routes |
|---|---|---|
| `DASHBOARD_VIEW` | `dashboard.view` | `admin/reports GET` (`?type=dashboard`) |
| `ADMIN_USERS_MANAGE` | `admin-users.manage` | `admin/settings/admins`, `admin/settings/roles`, `admin/settings/roles/[id]` |
| `CUSTOMERS_VIEW` | `customers.view` | `admin/customers`, `admin/customers/[id]`, `admin/customers/[id]/history` |
| `CUSTOMERS_EDIT` | `customers.edit` | `admin/customers POST/PATCH/DELETE` |
| `VEHICLES_VIEW` | `vehicles.view` | `admin/vehicles`, `admin/vehicles/[id]` |
| `VEHICLES_EDIT` | `vehicles.edit` | `admin/vehicles POST`, `admin/vehicles/[id] PATCH/DELETE` |
| `SERVICE_REQUESTS_VIEW` | `service-requests.view` | `admin/service-requests`, `admin/service-requests/[id]` |
| `SERVICE_REQUESTS_EDIT` | `service-requests.edit` | `admin/service-requests/[id] PATCH` |
| `APPOINTMENTS_VIEW` | `appointments.view` | `admin/appointments`, `admin/appointments/[id] GET` |
| `APPOINTMENTS_CONFIRM` | `appointments.confirm` | `admin/appointments POST`, `admin/appointments/[id] PATCH` |
| `APPOINTMENTS_CHECKIN` | `appointments.checkin` | Not referenced in any route file. Declared for UI-level checks. |
| `APPOINTMENTS_NOSHOW` | `appointments.noshow` | Not referenced in any route file. Declared for UI-level checks. |
| `JOB_CARDS_CREATE` | `job-cards.create` | `admin/job-cards POST`, `admin/job-cards/[id]/parts`, `admin/job-cards/[id]/tasks`, `admin/job-cards/[id]/workers` |
| `JOB_CARDS_UPDATE_STATUS` | `job-cards.update-status` | `admin/job-cards/[id] PATCH` |
| `JOB_CARDS_ASSIGN_WORKERS` | `job-cards.assign-workers` | `admin/workers GET` (via `requireAnyPermission` with `WORKERS_MANAGE`) |
| `JOB_CARDS_VIEW_OWN` | `job-cards.view-own` | `admin/job-cards GET`, `admin/job-cards/[id] GET` (via `requireAnyPermission`) |
| `JOB_CARDS_DELETE` | `job-cards.delete` | `admin/job-cards/[id] DELETE` |
| `WORKERS_MANAGE` | `workers.manage` | `admin/workers POST`, `admin/workers/[id]`, `admin/workers/[id]/leave`, `admin/workers/calendar` |
| `WORKERS_LEAVES_MANAGE` | `workers.leaves-manage` | Not referenced in a route file. Declared for UI-level checks. |
| `INVENTORY_VIEW` | `inventory.view` | `admin/inventory/*` reads |
| `INVENTORY_EDIT` | `inventory.edit` | `admin/inventory/items POST/PATCH/DELETE`, categories, suppliers, catalog writes, stock adjustments |
| `INVENTORY_STOCK_MOVE` | `inventory.stock-move` | Not referenced in a route file. Declared for UI-level checks; stock POST uses `INVENTORY_EDIT`. |
| `INVOICES_VIEW` | `invoices.view` | `admin/invoices GET`, `admin/invoices/[id] GET/pdf`, `admin/estimates GET` |
| `INVOICES_CREATE` | `invoices.create` | `admin/invoices POST/PATCH`, `admin/invoices/[id]/line-items`, `admin/estimates POST/PATCH/DELETE`, `admin/estimates/[id]/convert POST` |
| `INVOICES_FINALIZE` | `invoices.finalize` | `admin/invoices/[id]/finalize POST/DELETE` |
| `PAYMENTS_RECORD` | `payments.record` | `admin/invoices/[id]/payments POST`, `admin/payments GET` |
| `EXPENSES_VIEW` | `expenses.view` | `admin/expenses`, `admin/expenses/[id] GET`, `admin/expenses/categories`, `admin/salary-slips GET`, `admin/salary-slips/[id]/pdf` |
| `EXPENSES_MANAGE` | `expenses.manage` | `admin/expenses POST/PATCH/DELETE`, `admin/expenses/categories POST/PATCH/DELETE`, `admin/salary-slips POST/PATCH/DELETE` |
| `NOTIFICATIONS_VIEW` | `notifications.view` | `admin/notifications GET`, `admin/notifications/templates GET` |
| `NOTIFICATIONS_TEMPLATES_MANAGE` | `notifications.templates-manage` | `admin/notifications/templates POST/PATCH/DELETE` |
| `REPORTS_VIEW` | `reports.view` | `admin/reports/{revenue,workers,expenses,jobs,inventory,appointments}` |
| `LOGS_VIEW` | `logs.view` | `admin/logs`, `admin/logs/export` |
| `SETTINGS_MANAGE` | `settings.manage` | `admin/settings PATCH`, `admin/settings/business-hours PUT`, `admin/settings/holidays POST/DELETE`, `admin/settings/export GET` (also needs `DATA_EXPORT`), `admin/hsn-rates POST` |
| `SETTINGS_VIEW` | `settings.view` | `admin/settings GET`, `admin/settings/business-hours GET`, `admin/hsn-rates GET` |
| `AMC_PLANS_MANAGE` | `amc.plans-manage` | `admin/amc/plans POST`, `admin/amc/plans/[id] PATCH/DELETE` |
| `AMC_CONTRACTS_VIEW` | `amc.contracts-view` | `admin/amc/plans GET`, `admin/amc/plans/[id] GET`, `admin/amc/contracts GET`, `admin/amc/contracts/[id] GET`, `admin/amc/contracts/[id]/usages GET` |
| `AMC_CONTRACTS_MANAGE` | `amc.contracts-manage` | `admin/amc/contracts POST`, `admin/amc/contracts/[id] PATCH/DELETE/POST`, `admin/amc/contracts/[id]/usages/[usageId] DELETE` |
| `DATA_EXPORT` | `data.export` | `admin/settings/export GET` (paired with `SETTINGS_MANAGE`) |
| `INVENTORY_HARD_DELETE` | `inventory.hard-delete` | `admin/inventory/items/[id]/hard-delete POST` |
| `INVENTORY_VIEW_COST` | `inventory.view-cost` | Conditional strip in `admin/inventory/items` GET/POST and `[id]` GET/PATCH. if the JWT does not carry this permission, `costPrice` is elided from responses and stripped from the write payload |

---

## 3. Modules

### 3.1 AMC (Annual Maintenance Contracts)

Handles the AMC subsystem: reusable prepaid plans, per-customer/vehicle contracts, and per-service usage records that decrement `servicesRemaining`.

Prisma models touched: `AmcPlan`, `AmcContract`, `AmcServiceUsage`, `Customer`, `Vehicle`, `JobCard`, `Invoice` (see `docs/03-DATA-MODEL.md`).
UI consumers: `apps/web/src/app/admin/amc/` and the top-level `apps/web/src/app/amc/` page.

| Path | Verbs | Permission | Body / query | Response (top level) | $transaction |
|---|---|---|---|---|---|
| `/api/admin/amc/plans` | GET | `AMC_CONTRACTS_VIEW` | none | `data: AmcPlan[]` with `_count.contracts` | no |
| `/api/admin/amc/plans` | POST | `AMC_PLANS_MANAGE` | `{ planName, description?, vehicleType: 'CAR'|'BIKE'|'SCOOTY'|'OTHER', ccRange?, durationMonths:int+, totalServicesIncluded:int+, price:+, mrpPrice?:+, extraDiscountPercent=0 [0..100], laborDiscountPercent=100 [0..100], coveredItems?: string[<=200][<=200 items], exclusions? }` | `data: AmcPlan` | no |
| `/api/admin/amc/plans/[id]` | GET | `AMC_CONTRACTS_VIEW` | none | `data: AmcPlan & { contracts: <recent 20> }` | no |
| `/api/admin/amc/plans/[id]` | PATCH | `AMC_PLANS_MANAGE` | Partial of plan fields plus `isActive?` | `data: AmcPlan` | no |
| `/api/admin/amc/plans/[id]` | DELETE | `AMC_PLANS_MANAGE` | none | `{success:true}` | no |
| `/api/admin/amc/contracts` | GET | `AMC_CONTRACTS_VIEW` | `?page&pageSize&status&search` | `data: AmcContract[]`, `meta: pagination` | no |
| `/api/admin/amc/contracts` | POST | `AMC_CONTRACTS_MANAGE` | `{ customerId, vehicleId, amcPlanId, startDate: date, amountPaid:+, paymentMode?, paymentDate?: date, notes? }` | `data: AmcContract` (201) | yes |
| `/api/admin/amc/contracts/[id]` | GET | `AMC_CONTRACTS_VIEW` | none | `data: AmcContract & { customer, vehicle, plan, usages[] }` (on-read `ACTIVE` past `endDate` is auto-flipped to `EXPIRED` via a side-effect write) | no |
| `/api/admin/amc/contracts/[id]` | PATCH | `AMC_CONTRACTS_MANAGE` | `{ status?: 'ACTIVE'|'EXPIRED'|'CANCELLED', amcPlanId?, servicesRemaining?:int>=0, notes? }` | `data: AmcContract` | yes |
| `/api/admin/amc/contracts/[id]` | DELETE | `AMC_CONTRACTS_MANAGE` | none | `{success:true, mode:'hard'|'soft', data?}`. hard-delete only if no usages AND age <= 24 h; otherwise soft-delete via `status: 'CANCELLED'` | yes |
| `/api/admin/amc/contracts/[id]` | POST | `AMC_CONTRACTS_MANAGE` | `{ jobCardId, serviceDate?: datetime, notes? }` | `data: AmcServiceUsage` (201). Race-safe decrement via conditional `updateMany` on `status==='ACTIVE' AND servicesRemaining > 0 AND endDate >= now` | yes |
| `/api/admin/amc/contracts/[id]/usages` | GET | `AMC_CONTRACTS_VIEW` | none | `data: AmcServiceUsage[]` | no |
| `/api/admin/amc/contracts/[id]/usages/[usageId]` | DELETE | `AMC_CONTRACTS_MANAGE` | none | `{success:true}`. Increments `servicesRemaining` back (capped at `totalServices`) and decrements `servicesUsed` (only if > 0) | yes |

**Notable errors.** Contract POST: 409 `CONFLICT` when the vehicle already has an ACTIVE, in-window AMC contract; 409 `CONFLICT` after 5 unique-constraint retries on `contractNumber`. Contract PATCH: 409 `INVALID_TRANSITION` for CANCELLED→any / EXPIRED→ACTIVE / ACTIVE→past-end-date. Contract usage POST: 409 `CONFLICT` when the contract is not active / no services remain / expired, and 400 `VALIDATION_ERROR` when the job card's customer/vehicle does not match the contract.

**Contract-number allocation.** `AMC-<zero-padded seq>` is generated inside the transaction as `count() + 1 + attempt`, retried up to 5 times on P2002 collisions with a bumped counter, then 409's out.

### 3.2 Appointments

Slot-based scheduling with worker + bay conflict detection and per-weekday capacity rules pulled from `AppointmentSlotRule`.

Prisma models: `Appointment`, `AppointmentSlotRule`, `Customer`, `Vehicle`, `Worker`, `WorkerLeave`, `Bay`, `ServiceRequest`, `AdminUser` (`confirmedByAdminId`).
UI consumers: `apps/web/src/app/admin/appointments/`, `apps/web/src/app/admin/calendar/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/appointments` | GET | `APPOINTMENTS_VIEW` | `?page&pageSize&status&date&from&to&search` | `data: Appointment[]`, `meta` | no |
| `/api/admin/appointments` | POST | `APPOINTMENTS_CONFIRM` | `{ serviceRequestId?, customerId, vehicleId, appointmentDate, slotStart, slotEnd, bookingSource='ADMIN', assignedWorkerId?, bayId? }` (all dates ISO strings). Zod refinement: `slotEnd > slotStart`. | `data: Appointment` (201). Runs three conflict checks inside the tx: (a) same-worker overlap in non-CANCELLED/NO_SHOW appointments, (b) approved-leave overlap for the worker, (c) same-bay overlap, (d) slot-capacity check against `AppointmentSlotRule` for `dayOfWeek`. | yes |
| `/api/admin/appointments/[id]` | GET | `APPOINTMENTS_VIEW` | none | `data: Appointment & { customer, vehicle, serviceRequest, worker, confirmedBy }` | no |
| `/api/admin/appointments/[id]` | PATCH | `APPOINTMENTS_CONFIRM` | `{ status?, appointmentDate?, slotStart?, slotEnd?, rescheduleReason?, cancellationReason?, assignedWorkerId?: string|null }`. Zod refinements: `CANCELLED` requires a non-empty `cancellationReason`; `RESCHEDULED` requires `slotStart`, `slotEnd`, `rescheduleReason`. | `data: Appointment (deep include)` | no |

**Notable errors.** POST: 409 `CONFLICT` for the four conflict checks above (worker overlap, worker on approved leave, bay overlap, slot capacity reached). PATCH: 400 `ILLEGAL_STATUS_TRANSITION` when the status transition is not in the state machine (`REQUESTED → PENDING_REVIEW|CONFIRMED|CANCELLED|RESCHEDULED`, `PENDING_REVIEW → CONFIRMED|CANCELLED|RESCHEDULED`, `CONFIRMED → RESCHEDULED|CANCELLED|CHECKED_IN|NO_SHOW`, `RESCHEDULED → CONFIRMED|CANCELLED|CHECKED_IN|NO_SHOW`, `CHECKED_IN → COMPLETED|CANCELLED`; `COMPLETED`, `CANCELLED`, `NO_SHOW` are terminal).

### 3.3 Auth

`gearup` uses password-based auth against an `AdminUser` row (bcrypt hash, cost 12). JWT is signed with `getJwtSecret()`; validity is 24 h (`JWT_EXPIRY`).

Prisma models: `AdminUser`, `AdminUserRole`, `Role`, `RolePermission`, `Permission`.
UI consumers: `apps/web/src/app/admin/login/`, `apps/web/src/app/admin/layout.tsx` (server-side cookie guard).

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/auth/login` | POST | none (issues auth) | `{ adminUserId:min1, password:min1 }` | `data: { token, adminUser: {id, adminUserId, fullName, roles: RoleKey[]} }`. Also sets `gearup_token` cookie (httpOnly, Secure in prod, SameSite=Lax, maxAge from JWT_EXPIRY). Runs a fixed-timing bcrypt compare against a dummy hash on unknown/inactive/locked users so response time doesn't leak account existence. On 5 failed attempts (`MAX_LOGIN_ATTEMPTS`), status flips to `LOCKED` for 30 minutes (`LOCKOUT_DURATION_MINUTES`). | no |
| `/api/admin/auth/logout` | POST | none | none | `{success:true}`. sets `gearup_token` to `""` with `maxAge:0`. Deliberately unauthenticated so a stale token cannot block logout. | no |
| `/api/admin/auth/me` | GET | JWT valid + user ACTIVE | none | `data: { id, adminUserId, fullName, email, roles, permissions }`. Rejects INACTIVE/LOCKED as 401 `SESSION_STALE` so the SPA clears the stale token. | no |
| `/api/admin/auth/change-password` | POST | any authenticated | `{ currentPassword, newPassword }` (`newPassword` must satisfy `passwordPolicy` from `apps/web/src/lib/validators/password.ts`) | `{success:true}`. bcrypt-compares `currentPassword` and rehashes at cost 12 | no |

**Notable errors.** Login: 401 `UNAUTHORIZED` for both "no such user" and "wrong password" (identical message, identical timing). Change-password: 401 when `currentPassword` does not match.

### 3.4 Customers

CRUD over the customer contact card. Delete is guarded by an in-use count of vehicles, job cards, invoices, and AMC contracts.

Prisma models: `Customer`, `Vehicle`, `ServiceRequest`, `JobCard`, `Invoice`, `AmcContract`, `Appointment`, `ActivityLog`.
UI consumers: `apps/web/src/app/admin/customers/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/customers` | GET | `CUSTOMERS_VIEW` | `?page&pageSize&search` | `data: Customer[]` with `_count.{vehicles, jobCards}`, `meta` | no |
| `/api/admin/customers` | POST | `CUSTOMERS_EDIT` | `{ fullName, phoneNumber: /^[6-9]\d{9}$/, alternatePhone?: same regex or '', email?, addressLine1?, addressLine2?, city?, state?, postalCode?, notes?, source? }` | `data: Customer` (201) | no |
| `/api/admin/customers/[id]` | GET | `CUSTOMERS_VIEW` | none | `data: Customer & { vehicles, serviceRequests (last 10), jobCards (last 10, projected), invoices (last 10, projected) }` | no |
| `/api/admin/customers/[id]` | PATCH | `CUSTOMERS_EDIT` | Partial customer fields (phone regex not re-enforced on PATCH. accepts any string) | `data: Customer` | no |
| `/api/admin/customers/[id]` | DELETE | `CUSTOMERS_EDIT` | none | `{success:true}`. 409 `CONFLICT` if any of {vehicles, jobCards, invoices, amcContracts} > 0. Otherwise cascades to `serviceRequest.deleteMany` and `appointment.deleteMany`. | yes |
| `/api/admin/customers/[id]/history` | GET | `CUSTOMERS_VIEW` | `?page&pageSize` (default `pageSize=50`) | `data: ActivityLog[]`, **`pagination: {...}`** (note: field name is `pagination`, not `meta`) | no |

### 3.5 Estimates

Quote / estimate lifecycle. An estimate has line items and can be converted into a `JobCard` + DRAFT `Invoice` atomically.

Prisma models: `Estimate`, `EstimateItem`, `Customer`, `Vehicle`, `InventoryItem`, `JobCard`, `JobCardPart`, `Invoice`, `InvoiceLineItem`.
UI consumers: `apps/web/src/app/admin/estimates/`, `apps/web/src/app/(public)/estimate/` (public token viewer, see `/api/public/estimate/[token]`).

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/estimates` | GET | `INVOICES_VIEW` | `?page&pageSize&status&search` | `data.items: Estimate[]`, `meta`. note the `data.items` nesting instead of a flat `data[]` | no |
| `/api/admin/estimates` | POST | `INVOICES_CREATE` | `{ customerId, vehicleId?, notes?, validUntil?, items: [{ lineType='PART'|'LABOR'|'SERVICE_CHARGE'|'CUSTOM_CHARGE'|'DISCOUNT_ADJUSTMENT', inventoryItemId?, description, hsnCode?, quantity=1, unitPrice=0, discountPercent=0, taxRate=0, sortOrder=0 }].min(1) }` | `data: Estimate` (201). `estimateNumber` allocated inside tx; totals computed per-item (discount pct → tax → line total; `DISCOUNT_ADJUSTMENT` lineTotals go negative). | yes |
| `/api/admin/estimates/[id]` | GET | `INVOICES_VIEW` | none | `data: Estimate & { customer, vehicle, items, createdBy }` | no |
| `/api/admin/estimates/[id]` | PATCH | `INVOICES_CREATE` | `{ notes?, validUntil?: string|null, status?: 'DRAFT'|'CANCELLED', items?: [ItemSchema] }`. Only allowed on `status==='DRAFT'`. Providing `items` replaces the whole item set. | `data: Estimate (deep include)` | yes |
| `/api/admin/estimates/[id]` | DELETE | `INVOICES_CREATE` | none | `{success:true}`. 400 when `status==='CONVERTED'`. | no |
| `/api/admin/estimates/[id]/convert` | POST | `INVOICES_CREATE` | none | `data: { jobCardId, jobCardNumber, invoiceId, invoiceNumber }`. Refuses if the estimate is already `CONVERTED` (400) or `CANCELLED` (400). Creates a `JobCard`, mirrors its parts from any `inventoryItemId`-bearing lines, creates a DRAFT `Invoice` from the same line items, and flips estimate `status` to `CONVERTED` with `convertedJobCardId` and `convertedInvoiceId` set. | yes (30 000 ms) |

### 3.6 Expenses

Expenses and expense categories. Salary slips (see 3.15) are stored as expenses under a special `Salary` category with JSON metadata in `notes`.

Prisma models: `Expense`, `ExpenseCategory`, `AdminUser`.
UI consumers: `apps/web/src/app/admin/expenses/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/expenses` | GET | `EXPENSES_VIEW` | `?page&pageSize&categoryId&search&paymentMode&from&to` | `data: Expense[]` with `category`, `createdBy`; `meta` | no |
| `/api/admin/expenses` | POST | `EXPENSES_MANAGE` | `{ expenseDate: string, categoryId, title, amount: >=0, multipleOf 0.01, <=99999999.99, vendorName?, paymentMode?: PaymentMode, referenceNumber?, notes? }` | `data: Expense` (201) | no |
| `/api/admin/expenses/[id]` | GET | `EXPENSES_VIEW` | none | `data: Expense & { category, createdBy }` | no |
| `/api/admin/expenses/[id]` | PATCH | `EXPENSES_MANAGE` | Partial of the create body. 400 `NO_CHANGES` if the resolved data object is empty. | `data: Expense` | no |
| `/api/admin/expenses/[id]` | DELETE | `EXPENSES_MANAGE` | none | `{success:true}` | no |
| `/api/admin/expenses/categories` | GET | `EXPENSES_VIEW` | none | `data: ExpenseCategory[]` with `_count.expenses` | no |
| `/api/admin/expenses/categories` | POST | `EXPENSES_MANAGE` | `{ categoryName, description? }` | `data: ExpenseCategory` (201) | no |
| `/api/admin/expenses/categories/[id]` | PATCH | `EXPENSES_MANAGE` | `{ categoryName?, description?: string|null }` | `data: ExpenseCategory` | no |
| `/api/admin/expenses/categories/[id]` | DELETE | `EXPENSES_MANAGE` | none | `{success:true}`. 404 `NOT_FOUND` if missing; 409 `CONFLICT` if any expense references the category. | yes |

### 3.7 HSN rates

GST rate table keyed by HSN (Harmonized System of Nomenclature) code. Used by invoice / job-card-parts line-item resolution to fill `taxRate` when the user does not pass one explicitly.

Prisma models: `HsnRate`.
UI consumers: `apps/web/src/app/admin/settings/` (rate management).

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/hsn-rates` | GET | `SETTINGS_VIEW` | none | `data: HsnRate[]` | no |
| `/api/admin/hsn-rates` | POST | `SETTINGS_MANAGE` | `{ hsnCode: 4..8 chars, rate: 0..100, description? }` | `data: HsnRate` (201). upserts on `hsnCode`. Calls `invalidateHsnRateCache()` on success. | no |

### 3.8 Inventory

Items, categories, suppliers, catalog (vehicle brands + models with per-item joins), stock movements, batches, low-stock. Cost visibility is gated on `INVENTORY_VIEW_COST` (SUPER_ADMIN only); the item list/detail routes strip `costPrice` from the payload for callers who lack it, and the item POST/PATCH strip `costPrice` from the body.

Prisma models: `InventoryItem`, `InventoryCategory`, `Supplier`, `StockBatch`, `StockMovement`, `VehicleBrand`, `VehicleModel`, `InventoryItemModel`, `JobCardPart`, `InvoiceLineItem`.
UI consumers: `apps/web/src/app/admin/inventory/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/inventory/items` | GET | `INVENTORY_VIEW` (+ optional `INVENTORY_VIEW_COST` for costPrice) | `?page&pageSize (<=500)&search&categoryId&brandId&modelId&showInactive` | `data: InventoryItem[]` (costPrice stripped without cost permission); `meta` | no |
| `/api/admin/inventory/items` | POST | `INVENTORY_EDIT` (+ `INVENTORY_VIEW_COST` to write costPrice) | `{ sku, itemName, categoryId, supplierId?, brand?, description?, unit, taxRate?, costPrice?, mrp?, sellingPrice?, discountPercent? [0..100], amcDiscountPercent? [0..90], quantityInStock?, reorderLevel?, reorderQuantity?, storageLocation?, barcode?, hsnCode?, variablePrice?, isBranded?, modelIds?: string[] }` | `data: InventoryItem` (201). If `quantityInStock > 0`, opens an `OPENING-001` batch and writes a `STOCK_IN` movement. | yes |
| `/api/admin/inventory/items/[id]` | GET | `INVENTORY_VIEW` (+ optional `INVENTORY_VIEW_COST`) | none | `data: InventoryItem & { category, supplier, vehicleModels: [{ vehicleModel: { brand } }] }` | no |
| `/api/admin/inventory/items/[id]` | PATCH | `INVENTORY_EDIT` (+ `INVENTORY_VIEW_COST` for costPrice) | Partial of create body plus `isActive?`, plus optional `modelIds?` replacement | `data: InventoryItem` | yes |
| `/api/admin/inventory/items/[id]` | DELETE | `INVENTORY_EDIT` | none | `{success:true, message:'Item deactivated'}`. soft delete via `isActive=false`. 409 `CONFLICT` if `quantityInStock + reservedQuantity > 0`. | yes |
| `/api/admin/inventory/items/[id]/stock` | POST | `INVENTORY_EDIT` | `{ type:'STOCK_IN'|'STOCK_OUT'|'ADJUSTMENT_INCREASE'|'ADJUSTMENT_DECREASE', quantity:+ (multipleOf 0.01), reason?, costPrice?, sellingPrice?, mrp?, supplierId?, purchaseRef?, expiryDate?, batchNumber? }` | `data: { previousQuantity, newQuantity, batchId? }`. On `STOCK_IN`, opens a `StockBatch` and recomputes weighted-average `costPrice` on the item across remaining batches. Uses `$queryRaw UPDATE ... RETURNING` with an atomic guard (`quantityInStock >= quantity` for outflows). | yes |
| `/api/admin/inventory/items/[id]/hard-delete` | POST | `INVENTORY_HARD_DELETE` (SUPER_ADMIN only) | none | `{success:true, message}`. If the item is referenced in any `InvoiceLineItem`, deactivates instead (soft-fallback). Otherwise cascades `inventoryItemModel`, `stockMovement`, `jobCardPart`, then deletes the item. | yes (only in the hard-delete branch) |
| `/api/admin/inventory/items/[id]/batches` | GET | `INVENTORY_VIEW` | `?includeExhausted=true|false` | `data: { batches: [ {...batch, ageDays, isExpired, isNearExpiry (30-day window)} ], summary: { totalBatches, totalRemaining, totalValue, weightedAvgCost, expiredBatches, nearExpiryBatches } }` | no |
| `/api/admin/inventory/categories` | GET | `INVENTORY_VIEW` | none | `data: InventoryCategory[]` with `_count.items` | no |
| `/api/admin/inventory/categories` | POST | `INVENTORY_EDIT` | `{ categoryName, description? }` | `data: InventoryCategory` (201) | no |
| `/api/admin/inventory/categories/[id]` | PATCH | `INVENTORY_EDIT` | `{ categoryName?, description?: string|null }` | `data: InventoryCategory` | no |
| `/api/admin/inventory/categories/[id]` | DELETE | `INVENTORY_EDIT` | none | `{success:true}`. 409 `CONFLICT` if any inventory item still points to it. | yes |
| `/api/admin/inventory/suppliers` | GET | `INVENTORY_VIEW` | none | `data: Supplier[]` with `_count.items` | no |
| `/api/admin/inventory/suppliers` | POST | `INVENTORY_EDIT` | `{ supplierName, phone?: /^\+?\d[\d\s-]{7,15}$/, email?, address?, contactPerson?, notes? }` | `data: Supplier` (201) | no |
| `/api/admin/inventory/suppliers/[id]` | PATCH | `INVENTORY_EDIT` | Partial supplier fields | `data: Supplier` | no |
| `/api/admin/inventory/suppliers/[id]` | DELETE | `INVENTORY_EDIT` | none | `{success:true}` (hard delete, no guard. will surface P2003 as 400 `VALIDATION_ERROR` if any FK references it) | no |
| `/api/admin/inventory/catalog` | GET | `INVENTORY_VIEW` | `?level=brands|models|categories&brandId&modelId` | `data: [{ id, name, ... , itemCount }]`. hierarchical drill from vehicle brand → model → the categories of parts fitted to that model | no |
| `/api/admin/inventory/catalog` | POST | `INVENTORY_EDIT` | `{ name, logoUrl? }` | `data: VehicleBrand` (201). upserts on `name` | no |
| `/api/admin/inventory/catalog/models` | POST | `INVENTORY_EDIT` | `{ brandId, name, engineCC?: number }` | `data: VehicleModel` (201). upserts on `(brandId, name)` | no |
| `/api/admin/inventory/movements` | GET | `INVENTORY_VIEW` | `?movementType&inventoryItemId&page&pageSize (<=200)&dateFrom&dateTo` | `data: StockMovement[]` with `inventoryItem`, `batch`; `meta` | no |
| `/api/admin/inventory/low-stock` | GET | `INVENTORY_VIEW` | none | `data: InventoryItem[]`. items where `isActive AND reorderLevel IS NOT NULL AND quantityInStock <= reorderLevel` (computed via raw SQL because Prisma cannot express column-to-column comparisons) | no |

### 3.9 Invoices

DRAFT → FINALIZED → payments lifecycle, with line items, discounts (per-line and header-level), inclusive-GST toggle, AMC line linkage, and HTML PDFs for four templates (invoice, customer-draft, mechanic, AMC, combined).

Prisma models: `Invoice`, `InvoiceLineItem`, `Payment`, `Customer`, `Vehicle`, `JobCard`, `AmcContract`, `AmcPlan`, `AmcServiceUsage`, `InventoryItem`, `Setting`.
UI consumers: `apps/web/src/app/admin/invoices/`, `apps/web/src/app/admin/payments/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/invoices` | GET | `INVOICES_VIEW` | `?page&pageSize (<=MAX)&paymentStatus&invoiceStatus&search&from&to` | `data: Invoice[]` with `customer`, `vehicle`; `meta` | no |
| `/api/admin/invoices` | POST | `INVOICES_CREATE` | `{ customerId, vehicleId?, jobCardId?, appointmentId?, saleType='SERVICE'|'COUNTER', showGst=false, invoiceDate, dueDate?, discountType?, discountValue?, notes?, lineItems: [{ lineType:'PART'|'LABOR'|'CUSTOM_CHARGE'|'DISCOUNT_ADJUSTMENT', referenceItemId?, description, hsnCode?, quantity=1, unitPrice=0, taxRate=0, sortOrder=0, discountPercent=0, discountMode?:'flat'|'percent' }] }` | `data: Invoice & {lineItems}` (201). Pre-resolves HSN + rate outside the tx; totals derived by `computeLineTotal` / `nonDiscountPreSubtotal` from `apps/web/src/lib/invoice-calc.ts`. On P2002 for `jobCardId` (`Invoice.jobCardId @unique`), returns 409 with the pre-existing invoice number. | yes (30 000 ms, `maxWait: 10 000`) |
| `/api/admin/invoices/[id]` | GET | `INVOICES_VIEW` | none | `data: Invoice & { lineItems (ordered), payments, customer, vehicle, jobCard }`. line items enriched with `sku` from a supplementary `InventoryItem` lookup | no |
| `/api/admin/invoices/[id]` | PATCH | `INVOICES_CREATE` | Strict object: `{ notes?, dueDate?, discountType?, discountValue?, showGst? }`. `discountType`/`discountValue`/`showGst` mutations 409 `INVOICE_NOT_DRAFT` unless the invoice is DRAFT. Toggling `showGst` back-calculates each non-discount line's tax and unitPrice so the line total stays the same. | `data: Invoice` | no (uses successive `prisma.invoiceLineItem.update` calls) |
| `/api/admin/invoices/[id]/line-items` | POST | `INVOICES_CREATE` | `{ lineType: 'PART'|'LABOR'|'SERVICE_CHARGE'|'CUSTOM_CHARGE'|'DISCOUNT_ADJUSTMENT'|'AMC', description, quantity=1, unitPrice=0, taxRate=0, hsnCode?, discountPercent=0 [0..100], discountMode?:'flat'|'percent', amcPlanId?, amcContractId?, inventoryItemId? }` | `data: InvoiceLineItem`. recomputes invoice totals inside the tx (`recalcTotalsTx`). AMC lines against an existing `amcContractId` verify status ACTIVE and services remaining; contract decrement is deferred to invoice finalize so a discarded DRAFT does not consume a prepaid service. | yes |
| `/api/admin/invoices/[id]/line-items` | (also exposes PATCH / DELETE per file, following the same discipline. recalcs totals and reruns HSN/rate resolution when needed) | | | | |
| `/api/admin/invoices/[id]/payments` | POST | `PAYMENTS_RECORD` | `{ amount:>0 finite, paymentMode, paymentDate: string, referenceNumber?, notes? }` | `data: Payment` (201). Atomic conditional update (`invoiceStatus='FINALIZED' AND paymentStatus!='PAID' AND amountDue>=amount`), then optimistic-lock status flip guarded on `amountPaid`. On full payment: flips linked `JobCard` to `DELIVERED` and, for any AMC-plan-purchase line items, creates `AmcContract` + first `AmcServiceUsage` rows atomically. | yes |
| `/api/admin/invoices/[id]/finalize` | POST | `INVOICES_FINALIZE` | none | `data: Invoice`. 409 `CONFLICT` unless status is DRAFT. Applies AMC contract-usage decrements for any AMC lines that reference an `AmcContract` (rather than an `AmcPlan`), 409 if the contract is inactive / job card missing / no services remaining. | yes |
| `/api/admin/invoices/[id]/finalize` | DELETE | `INVOICES_FINALIZE` | none | `data: Invoice`. reverts FINALIZED-and-UNPAID invoices back to DRAFT and rolls back the AMC service-usage records + contract counters written at finalize. 409 otherwise. | yes |
| `/api/admin/invoices/[id]/pdf` | GET | `INVOICES_VIEW` | `?type=invoice|customer-draft|mechanic|combined` (AMC template is chosen automatically when the invoice or vehicle has an active `AmcContract`) | HTML (`Content-Type: text/html`, `Content-Disposition: inline; filename="<invoiceNumber>-<type>.html"`). rendered by `apps/web/src/lib/invoice-templates.ts` | no |

**Line-item math.** See `apps/web/src/lib/invoice-calc.ts`. Percent-discount lines re-derive against the current non-discount pre-subtotal on every recalc so a "10% off" line scales when parts are added or removed. Flat discount lines keep their stored total.

### 3.10 Job cards

Intake → work-in-progress → delivery lifecycle. Auto-creates a DRAFT invoice on POST. Parts POST reserves stock from batches FIFO and syncs a matching line onto the DRAFT invoice inside the same tx.

Prisma models: `JobCard`, `JobCardTask`, `JobCardPart`, `WorkerAssignment`, `Invoice`, `InvoiceLineItem`, `Vehicle`, `Customer`, `InventoryItem`, `StockMovement`, `StockBatch`.
UI consumers: `apps/web/src/app/admin/job-cards/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/job-cards` | GET | `JOB_CARDS_CREATE` OR `JOB_CARDS_VIEW_OWN` | `?page&pageSize&status&search&customerId&vehicleId&workerId&priority&from&to` | `data: JobCard[]` with customer, vehicle, assignments, latest invoice; `meta` | no |
| `/api/admin/job-cards` | POST | `JOB_CARDS_CREATE` | `{ appointmentId?, serviceRequestId?, customerId, vehicleId, issueSummary, customerComplaints?, priority?:'HIGH'|'MEDIUM'|'LOW'|'URGENT', estimatedDeliveryAt?, odometerAtIntake?, fuelIndicator? }` | `data: JobCard` (201). Generates `jobCardNumber` in-tx, flips linked `ServiceRequest` to `CONVERTED_TO_JOB`, backfills vehicle `odometerReading` if provided, auto-creates a DRAFT `Invoice`. | yes |
| `/api/admin/job-cards/[id]` | GET | `JOB_CARDS_CREATE` OR `JOB_CARDS_VIEW_OWN` | none | `data: JobCard (deep include)`. `VIEW_OWN` callers are scoped by `assignedServiceManagerId=user.sub` | no |
| `/api/admin/job-cards/[id]` | PATCH | `JOB_CARDS_UPDATE_STATUS` | `{ status?, approvalStatus?, diagnosisNotes?, estimateNotes?, customerVisibleNotes?, internalNotes?, issueSummary?, priority?: string|null, estimatedPartsCost?, estimatedLaborCost?, estimatedTotal?, finalPartsCost?, finalLaborCost?, finalTotal?, odometerAtIntake? }` | `data: JobCard`. Status transition to `DELIVERED` stamps `actualDeliveryAt`. Transition to `CANCELLED` releases all reserved parts back to stock (writes `RELEASED` movements) inside the tx. | yes |
| `/api/admin/job-cards/[id]` | DELETE | `JOB_CARDS_DELETE` | none | `{success:true}`. Guards: not DELIVERED, no non-DRAFT invoices, no recorded payments; guards re-checked inside the tx. Releases reserved parts and cascades linked DRAFT invoices, invoice line items, tasks, parts, worker assignments. | yes |
| `/api/admin/job-cards/[id]/parts` | POST | `JOB_CARDS_CREATE` | `{ inventoryItemId, requiredQty:>=0.01, unitPrice?, notes? }` | `data: JobCardPart` (201). Reserves stock FIFO across `StockBatch`, syncs a PART line onto the DRAFT invoice (if any) with HSN/rate pre-resolved outside the tx, recomputes job-card estimates. | yes (30 000 ms) |
| `/api/admin/job-cards/[id]/parts` | PATCH | `JOB_CARDS_CREATE` | `{ partId, requiredQty?, consumedQty?, unitPrice?, notes?: string|null }` | `data: JobCardPart`. Delta on `requiredQty` runs RESERVE / RELEASE, delta on `consumedQty` runs CONSUMED (decrements reservedQuantity, no stock touch). Refuses `consumedQty > requiredQty` and refuses `consumedQty` decrease. | yes |
| `/api/admin/job-cards/[id]/parts` | DELETE | `JOB_CARDS_CREATE` | `?partId=` | `{success:true}`. Releases the still-reserved portion (never the consumed portion), recomputes estimates. | yes |
| `/api/admin/job-cards/[id]/tasks` | POST | `JOB_CARDS_CREATE` | `{ taskName, taskDescription?, assignedWorkerId?, estimatedMinutes? }` | `data: JobCardTask` (201). `sortOrder = count(existing tasks)`. | no |
| `/api/admin/job-cards/[id]/tasks` | PATCH | `JOB_CARDS_CREATE` | `{ taskId, status?: 'PENDING'|'IN_PROGRESS'|'DONE'|'BLOCKED'|'SKIPPED', taskName?, assignedWorkerId?: string|null, actualMinutes? }` | `data: JobCardTask` | no |
| `/api/admin/job-cards/[id]/tasks` | DELETE | `JOB_CARDS_CREATE` | `?taskId=` | `{success:true}` | no |
| `/api/admin/job-cards/[id]/workers` | POST | `JOB_CARDS_CREATE` | `{ workerId, assignmentRole? }` | `data: WorkerAssignment` (201) | no |
| `/api/admin/job-cards/[id]/workers` | DELETE | `JOB_CARDS_CREATE` | `?assignmentId=` | `{success:true}` | no |

### 3.11 Activity log

Read-only audit trail with an entity-type allowlist and CSV export.

Prisma models: `ActivityLog`, `AdminUser`.
UI consumers: `apps/web/src/app/admin/logs/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/logs` | GET | `LOGS_VIEW` | `?page&pageSize (default 50)&entityType&actorType&action&from&to`. `entityType` is validated against a whitelist of 17 model names; `actorType` against `'ADMIN'|'WORKER'|'SYSTEM'|'PUBLIC'`. | `data: ActivityLog[]` with `adminUser: {fullName, adminUserId}`; `meta` | no |
| `/api/admin/logs/export` | GET | `LOGS_VIEW` | same filters as list | CSV (`Content-Type: text/csv`, `Content-Disposition: attachment; filename="activity-logs-YYYY-MM-DD.csv"`). capped at 10 000 rows | no |

### 3.12 Notifications

Notification queue (outbox rows) and template CRUD.

Prisma models: `Notification`, `NotificationTemplate`.
UI consumers: `apps/web/src/app/admin/notifications/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/notifications` | GET | `NOTIFICATIONS_VIEW` | `?channel:WHATSAPP|EMAIL &eventType (<=64) &q (<=100) &sendStatus:NotificationStatus &page&pageSize (<=200)` | `data: Notification[]`, `meta` | no |
| `/api/admin/notifications/templates` | GET | `NOTIFICATIONS_VIEW` | none | `data: NotificationTemplate[]` | no |
| `/api/admin/notifications/templates` | POST | `NOTIFICATIONS_TEMPLATES_MANAGE` | `{ channel:'WHATSAPP'|'EMAIL', eventType (<=100), templateKey (<=100, `/^[a-z0-9][a-z0-9._-]*$/`), subject?:string|null (<=200), messageBody (<=4000), variableSchemaJson?: Record<string, 'string'|'number'|'boolean'|'date'> (<=40 keys), isActive? }` | `data: NotificationTemplate` (201). Placeholder validation: every `{{var}}` used in `subject` or `messageBody` must be declared in `variableSchemaJson`, or 400 with the list of undeclared placeholders. 409 `CONFLICT` on templateKey clash. | yes |
| `/api/admin/notifications/templates` | PATCH | `NOTIFICATIONS_TEMPLATES_MANAGE` | `{ id, ...create-fields (partial) }` | `data: NotificationTemplate`. Race-safe optimistic lock on `updatedAt`. | yes |
| `/api/admin/notifications/templates` | DELETE | `NOTIFICATIONS_TEMPLATES_MANAGE` | `?id=` or `{id}` body | `{success:true}` | yes |

### 3.13 Payments

Read-only list of `Payment` rows (recorded via `POST /api/admin/invoices/[id]/payments`).

Prisma models: `Payment`, `Invoice`, `Customer`.
UI consumers: `apps/web/src/app/admin/payments/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/payments` | GET | `PAYMENTS_RECORD` | `?page&pageSize&from&to` | `data: Payment[]` with `invoice: { invoiceNumber, customer.fullName }`; `meta` | no |

### 3.14 Reports

Dashboard KPI card, revenue analysis (by mode + by day + by line-type + parts gross profit + income breakdown), worker attribution, and per-domain roll-ups.

Prisma models: touches nearly every model. The heavy revenue / worker queries use `prisma.$queryRawUnsafe` with `AT TIME ZONE 'Asia/Kolkata'` casts for IST-anchored calendar bucketing.
UI consumers: `apps/web/src/app/admin/reports/`, `apps/web/src/app/admin/dashboard/`.

| Path | Verbs | Permission | Body / query | Response (top-level keys) | $transaction |
|---|---|---|---|---|---|
| `/api/admin/reports` | GET | `DASHBOARD_VIEW` | `?type=dashboard` only (any other `type` returns 410 `GONE` redirecting to `/api/admin/reports/<type>`). Cache: `export const revalidate = 30` | `data: { todayAppointments, pendingRequests, activeJobs, unpaidInvoices, todayRevenue: '0.00' string, totalCustomers, totalVehicles, activeWorkers }` | no |
| `/api/admin/reports/revenue` | GET | `REPORTS_VIEW` | `?from=YYYY-MM-DD&to=YYYY-MM-DD` (zod-validated, `from<=to`) | `data: { byMode:[{mode,_count,_sum}], totalRevenue, daily:[{date,amount}], byType:[{type,total}], partsProfit, incomeBreakdown }`. parts profit joins finalized-invoice PART lines against STOCK_OUT movements per batch (FULL OUTER JOIN so manually typed parts still show revenue with zero known cost); income breakdown returns EX-GST amounts per line type plus header discounts. | no |
| `/api/admin/reports/workers` | GET | `REPORTS_VIEW` | `?from=YYYY-MM-DD&to=YYYY-MM-DD` | `data: { workers:[{...,monthly:{[YYYY-MM]:{revenue,jobs}}}], months, multiWorkerInvoices, summary:{totalPaidInvoices,totalRevenue,multiWorkerCount,unattributedRevenue,unassignedInvoiceCount} }`. Splits "wash" line items (`description` contains `wash`, excludes `clutch wash` / `throttle` false-positives, excludes PART lines) from non-wash and attributes to the Washing Boy worker (identified by designation) instead of the mechanics on the job card. | no |
| `/api/admin/reports/expenses` | GET | `REPORTS_VIEW` | `?from&to` (plain `new Date(from)`, not IST-anchored on this route) | `data: { byCategory:[{categoryId, category, _count, _sum}], totalExpenses }` | no |
| `/api/admin/reports/inventory` | GET | `REPORTS_VIEW` | none | `data: { totalItems, lowStock, totalStock, categories:[{name,items}] }` | no |
| `/api/admin/reports/jobs` | GET | `REPORTS_VIEW` | none | `data: [{status,_count}]` | no |
| `/api/admin/reports/appointments` | GET | `REPORTS_VIEW` | none | `data: { byStatus:[{status,_count}], total }` | no |

### 3.15 Salary slips

Salary slips are stored in the `Expense` table under the `Salary` category with a JSON `notes` blob carrying `{__salarySlip:true, workerName, designation, month, year, lineItems, userNotes}`. There is a 2-hour edit window from creation.

Prisma models: `Expense`, `ExpenseCategory`, `Worker`.
UI consumers: `apps/web/src/app/admin/salary-slips/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/salary-slips` | GET | `EXPENSES_VIEW` | `?page&pageSize&month&year&search` | `data: Expense[]` enriched with `editable: bool` (createdAt within 2 h); `meta` | no |
| `/api/admin/salary-slips` | POST | `EXPENSES_MANAGE` | `{ workerId?, workerName, designation?, lineItems: [{label, amount:>=0}].min(1), month:1..12, year:2020..2099, paymentMode?, notes? }` | `data: Expense & { workerName, designation, slipUrl }` (201). total = sum of line-item amounts; `title = "Salary - <workerName> - <MMM> <year>"` | no |
| `/api/admin/salary-slips/[id]` | PATCH | `EXPENSES_MANAGE` | Partial of create body. 403 `EDIT_WINDOW_CLOSED` after 2 hours from creation. | `data: Expense` | no |
| `/api/admin/salary-slips/[id]` | DELETE | `EXPENSES_MANAGE` | none | `{success:true}`. no edit-window guard on delete | no |
| `/api/admin/salary-slips/[id]/pdf` | GET | `EXPENSES_VIEW` | none | HTML (`text/html`, `inline; filename="salary-slip-<name>-<M>-<Y>.html"`). rendered by `apps/web/src/lib/salary-slip-template.ts` | no |

### 3.16 Service requests

The intake queue for public-form + phone submissions.

Prisma models: `ServiceRequest`, `Customer`, `Vehicle`, `Appointment`, `JobCard`.
UI consumers: `apps/web/src/app/admin/service-requests/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/service-requests` | GET | `SERVICE_REQUESTS_VIEW` | `?page&pageSize&status: ServiceRequestStatus &search (<=64)` | `data: ServiceRequest[]` with `customer`, `vehicle`; `meta` | no |
| `/api/admin/service-requests/[id]` | GET | `SERVICE_REQUESTS_VIEW` | none | `data: ServiceRequest & { customer, vehicle, appointment, jobCards }` | no |
| `/api/admin/service-requests/[id]` | PATCH | `SERVICE_REQUESTS_EDIT` | `{ status?: SR-status, notes? (<=2000), urgency?:'LOW'|'MEDIUM'|'HIGH'|'URGENT' }`. Server-side state machine: `SUBMITTED → UNDER_REVIEW|CANCELLED`, `UNDER_REVIEW → APPOINTMENT_PENDING|CANCELLED`, `APPOINTMENT_PENDING → APPOINTMENT_CONFIRMED|CANCELLED`, `APPOINTMENT_CONFIRMED → CONVERTED_TO_JOB|CANCELLED`, `CONVERTED_TO_JOB → CLOSED`, `CANCELLED`/`CLOSED` terminal. Terminal transitions stamp `closedAt`; a reopen clears it. | `data: ServiceRequest` | no |

### 3.17 Settings

Business config, RBAC (admins, roles, permissions), business-hours slot rules, holidays, HSN, and a bulk data-export (SUPER_ADMIN + DATA_EXPORT).

Prisma models: `Setting`, `AdminUser`, `AdminUserRole`, `Role`, `RolePermission`, `Permission`, `AppointmentSlotRule`, `Holiday`.
UI consumers: `apps/web/src/app/admin/settings/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/settings` | GET | `SETTINGS_VIEW` | none | `data: Record<key, value>` (flat map) | no |
| `/api/admin/settings` | PATCH | `SETTINGS_MANAGE` | `Record<known-key, value>`. see the `SETTING_SCHEMAS` registry (business.*, invoice.*, notification.*, integration.*, invoice.quickLineItems). Unknown keys → 400. Per-key zod schema + 8 KB size cap per value. | `{success:true}` | yes (per-key upsert batch) |
| `/api/admin/settings/admins` | GET | `ADMIN_USERS_MANAGE` | `?page&pageSize (<=200)&search` | `data: { admins: [{id,adminUserId,fullName,email,phone,status,lastLoginAt,createdAt,roles:[{id,key,name}]}], roles: [{id,key,name,description}] }`, `meta` | no |
| `/api/admin/settings/admins` | POST | `ADMIN_USERS_MANAGE` | `{ adminUserId:min3, fullName, password: passwordPolicy, email?, phone?: E.164-ish 10-15 digits after whitespace/dash strip, roleId }` | `data: { id, adminUserId, fullName }` (201). password hashed with bcrypt cost 12 | no |
| `/api/admin/settings/admins` | PATCH | `ADMIN_USERS_MANAGE` | `{ id, fullName?, password? (policy), phone?, status?:'ACTIVE'|'INACTIVE', roleId? }` | `data: { id, adminUserId, fullName }`. Self-lockout guards: cannot deactivate self, cannot change own role. Last-admin guards run inside the tx: 409 `CONFLICT` if the change would leave zero active admins with `ADMIN_USERS_MANAGE`. | yes |
| `/api/admin/settings/business-hours` | GET | `SETTINGS_VIEW` | none | `data: { rules: AppointmentSlotRule[] }` (active only) | no |
| `/api/admin/settings/business-hours` | PUT | `SETTINGS_MANAGE` | `{ rules: [{ dayOfWeek:0..6, openTime:'HH:MM', closeTime:'HH:MM', slotDurationMinutes:5..240, maxCapacity:1..50, isActive? }].max(100) }`. Zod refinement: `closeTime > openTime`. Additional per-day overlap check inside the handler. | `data: { rules }`. Full replace: `deleteMany` then `createMany` in a tx, with a full previous/new snapshot logged. | yes |
| `/api/admin/settings/holidays` | GET | `SETTINGS_MANAGE` | none | `data: Holiday[]` | no |
| `/api/admin/settings/holidays` | POST | `SETTINGS_MANAGE` | single object OR array (<=200) of `{ holidayName, holidayDate:'YYYY-MM-DD', holidayType, isFullDay=true, startTime?:'HH:MM', endTime?:'HH:MM', notes? }`. Partial-day windows require both times and `endTime > startTime`. | Single: `data: Holiday` (201). Bulk: `data: { created:int, items:[{id,holidayDate,holidayType}] }` (201). 409 `HOLIDAY_DUPLICATE` on same (date, type) pair; bulk dedupes silently. | yes (bulk only) |
| `/api/admin/settings/holidays` | DELETE | `SETTINGS_MANAGE` | `?id=<cuid>` | `{success:true}`. 409 `HOLIDAY_IN_PAST` for past holidays (appointments may have been rescheduled around them). | no |
| `/api/admin/settings/roles` | GET | `ADMIN_USERS_MANAGE` | none | `data: { roles:[{id,key,name,description,adminCount,permissions:[{id,key,name,module,description}]}], allPermissions:Permission[] }` | no |
| `/api/admin/settings/roles` | POST | `ADMIN_USERS_MANAGE` | `{ key: UPPER_SNAKE_CASE (min 2), name, description?, permissionIds: string[] }` | `data: Role` (201) | no |
| `/api/admin/settings/roles/[id]` | PATCH | `ADMIN_USERS_MANAGE` | `{ name?, description?:string|null, permissionIds?: string[] (wholesale replacement) }` | `data: Role` | yes |
| `/api/admin/settings/roles/[id]` | DELETE | `ADMIN_USERS_MANAGE` | none | `{success:true}`. 400 `VALIDATION_ERROR` if any admin still holds the role. | no |
| `/api/admin/settings/export` | GET | `SETTINGS_MANAGE` AND `DATA_EXPORT` (both required) | none | JSON attachment (`Content-Disposition: attachment; filename="gearup-backup-YYYY-MM-DD.json"`). full dump of `customers, vehicles, workers, serviceRequests, appointments, jobCards (with tasks/parts/assignments), invoices (with lineItems), payments, expenses, inventoryItems, inventoryCategories, suppliers, settings (with secret-like keys redacted)`. Writes an audit log entry BEFORE returning (awaited) for DPDP compliance. | no |

### 3.18 Vehicles

Customer-owned vehicles. Delete is guarded by in-use counts across job cards, invoices, service requests, and AMC contracts.

Prisma models: `Vehicle`, `Customer`, `JobCard`, `Invoice`, `ServiceRequest`, `AmcContract`, `Appointment`.
UI consumers: `apps/web/src/app/admin/vehicles/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/vehicles` | GET | `VEHICLES_VIEW` | `?page&pageSize&search&customerId` | `data: Vehicle[]` with customer; `meta` | no |
| `/api/admin/vehicles` | POST | `VEHICLES_EDIT` | `{ customerId, vehicleType:'CAR'|'BIKE'|'SCOOTY'|'OTHER', registrationNumber, brand, model, variant?, yearOfManufacture?, fuelType?, transmission?, color?, vin?, chassisNumber?, engineNumber?, engineCC?: number or string, odometerReading?, notes? }` | `data: Vehicle` (201). 404 `CUSTOMER_NOT_FOUND` if `customerId` does not exist. | no |
| `/api/admin/vehicles/[id]` | GET | `VEHICLES_VIEW` | none | `data: Vehicle (deep projection with customer, latest service requests / job cards / invoices)` | no |
| `/api/admin/vehicles/[id]` | PATCH | `VEHICLES_EDIT` | `{ registrationNumber?, brand?, model?, variant?, engineCC?, odometerReading?, notes? }` | `data: Vehicle` | yes (paired with `logActivity` inside the same tx via `tx` handle) |
| `/api/admin/vehicles/[id]` | DELETE | `VEHICLES_EDIT` | none | `{success:true}`. 409 `CONFLICT` if any of {jobCards, invoices, serviceRequests, amcContracts} > 0; cascades appointments. | yes |

### 3.19 Workers

Worker roster, leave, and cross-worker calendar for scheduling.

Prisma models: `Worker`, `WorkerLeave`, `WorkerAssignment`, `Appointment`, `JobCard`.
UI consumers: `apps/web/src/app/admin/workers/`, `apps/web/src/app/admin/calendar/`.

| Path | Verbs | Permission | Body / query | Response | $transaction |
|---|---|---|---|---|---|
| `/api/admin/workers` | GET | `WORKERS_MANAGE` OR `JOB_CARDS_ASSIGN_WORKERS` | `?page&pageSize&status&search` | `data: Worker[]` with a bounded `_count.assignments` (only non-terminal job-card statuses); `meta` | no |
| `/api/admin/workers` | POST | `WORKERS_MANAGE` | `{ fullName, phoneNumber?, email?, designation?, specialization?, employmentType?, joiningDate?, dailyCapacity?, shiftStart?, shiftEnd?, notes?, monthlySalary? }` | `data: Worker` (201). `workerCode` from `generateWorkerCode()` | no |
| `/api/admin/workers/[id]` | GET | `WORKERS_MANAGE` | none | `data: Worker & { assignments (last 20), leaves (last 10) }` | no |
| `/api/admin/workers/[id]` | PATCH | `WORKERS_MANAGE` | Partial of worker fields plus `status?:'ACTIVE'|'INACTIVE'|'ON_LEAVE'`. 409 `WORKER_HAS_OPEN_ASSIGNMENTS` when trying to set INACTIVE while any non-terminal `WorkerAssignment` exists. | `data: Worker` | no |
| `/api/admin/workers/[id]/leave` | POST | `WORKERS_MANAGE` | `{ leaveType, startDate, endDate, reason? }` | `data: WorkerLeave, warnings: string[]` (201). 409 `LEAVE_OVERLAP` against any PENDING/APPROVED leave. `warnings` names the count of assigned appointments in the window. | no |
| `/api/admin/workers/[id]/leave` | PATCH | `WORKERS_MANAGE` | `{ leaveId, status:'APPROVED'|'REJECTED' }` | `data: WorkerLeave`. APPROVED flips the worker to `ON_LEAVE` iff today falls within the window. | no |
| `/api/admin/workers/calendar` | GET | `WORKERS_MANAGE` | `?from&to` (default: last 90 days .. next 90 days) | `data: { workers, leaves, assignments, range: { from, to } }` | no |

### 3.20 Public

Customer-facing surface. Auth is by construction. no route uses `requirePermission`. Defense-in-depth comes from strict zod schemas, phone normalization, per-process throttles, uniform error messages designed not to leak record existence, and per-token secrets for estimate approval.

Prisma models: `Customer`, `Vehicle`, `ServiceRequest`, `Appointment`, `AppointmentSlotRule`, `Holiday`, `BlockedSlot`, `JobCard`, `Invoice`.
UI consumers: `apps/web/src/app/(public)/book-service/`, `apps/web/src/app/(public)/track/`, `apps/web/src/app/(public)/estimate/`, `apps/web/src/app/(public)/contact/`.

| Path | Verbs | Permission | Body / query | Response | Notes |
|---|---|---|---|---|---|
| `/api/public/service-requests` | POST | none | Strict zod schema, capped: `{ fullName (<=120), phoneNumber (5..20; normalized to 10 digits post-strip, must match `/^\d{10}$/`), alternatePhone?, email?, vehicleType:'CAR'|'BIKE'|'OTHER', brand, model, variant?, vehicleId?: cuid, registrationNumber:/^[A-Za-z0-9- ]{4,20}$/, serviceCategory, issueDescription (<=2000), preferredDate?, preferredSlotLabel?, pickupDropRequired=false, notes? }`. `maxDuration=10`. In-process throttles: per-phone 60 s cooldown (429 `RATE_LIMITED`), and a 5-min fingerprint window over `(phone, reg, category, description, date, slot)` (409 `DUPLICATE_SUBMISSION`). DB-level recent-duplicate guard covers multi-instance / restart. | `data: { referenceId, serviceRequestId, appointmentId?, status, message }` (201). Uses existing `Customer` (by phone) or creates one; **never mutates an existing customer's PII**. records mismatched name/email in the SR `notes` as a `[reconcile]` marker for admin. If `preferredDate` is present, creates a `REQUESTED` appointment anchored to that day's slot rule (or 09:00 IST fallback). | Uses `prisma.$transaction` |
| `/api/public/estimate/[token]` | GET | none (secret token) | Path token: either a real `estimateToken` (>= `MIN_TOKEN_LENGTH`) or a legacy job-card cuid (lazy-backfilled to a real token on first hit if the job card has none). Expired tokens (`estimateTokenExpiresAt < now`) → 404 `Estimate`. | `data: { id, jobCardNumber, customerName, vehicle, issueSummary, estimateNotes, customerVisibleNotes, approvalStatus, status, estimatedPartsCost, estimatedLaborCost, estimatedTotal, estimateRevision }`. `estimateRevision` is computed from the current job-card state and pinned into approve/reject POSTs. | Read-only |
| `/api/public/estimate/[token]` | POST | none (secret token) | `{ action:'approved'|'rejected', comment? (<=1000), estimateRevision:8..128 }`. Refuses if `approvalStatus` is already APPROVED/REJECTED (400); if `estimateRevision` mismatches the current revision (400. prevents mid-view price change); race-safe update via `updateMany` scoped to `estimateToken` + `approvalStatus='PENDING'`. | `data: { id, approvalStatus, status }` | Uses `prisma.$transaction` |
| `/api/public/available-slots` | GET | none | `?date=YYYY-MM-DD` (bounded to `[today, today+90d]` UTC, calendar-valid) | `data: { date, slots: [{ label:'HH:MM - HH:MM', start, end, available }] }` or `{ date, slots:[], message:'Closed – <holidayName>' }` for full-day holidays | Uses `AppointmentSlotRule`, `Holiday`, `BlockedSlot`, and per-slot appointment count from `Appointment.groupBy` (excludes CANCELLED/NO_SHOW) |
| `/api/public/customer-lookup` | GET | none | `?phone=<10+ digits>` (non-digits stripped) | Always `data: { customer: null | { exists: true } }`. Deliberately coarse. same envelope on hit, miss, or bad input. File comment cites a 10/min/IP rate limit from `apps/web/src/middleware.ts` (**unverified in this pass**). | Read-only |
| `/api/public/track` | POST | none | Strict zod: `{ phoneNumber:10 digits after normalize, referenceId? (<=32), vehicleNumber? (<=20), lookupType?:'reference'|'vehicle' }`. Two modes: reference (`referenceId` + phone) or vehicle (`vehicleNumber` normalized to `[A-Z0-9]{6+}` + phone). | `data: { lookupType, request? or requests:[] }`. minimal projection (no internal ids, no monetary amounts, no invoice/job-card numbers, no staff names) with status projections for the vehicle, appointment, latest job card, and latest invoice. All failures return the same generic 404 message. | Read-only |

### 3.21 Health

| Path | Verbs | Permission | Response |
|---|---|---|---|
| `/api/health` | GET | none | `{status:'ok', db:'connected', timestamp}` on success (`SELECT 1`); 503 `{status:'error', db:'disconnected'}` on any throw |

---

## 4. Cross-module conventions worth calling out

- **`Invoice.jobCardId @unique`**. every job card has at most one invoice. Trying to POST a second invoice for the same job card returns 409 with the pre-existing `invoiceNumber` inline.
- **AMC accounting** is deferred: creating an AMC line item on a DRAFT invoice does NOT decrement `AmcContract.servicesRemaining`. The decrement happens on `POST /finalize`. Reverting finalized-and-unpaid via `DELETE /finalize` rolls it back. Recording the final payment on an AMC-plan-purchase invoice creates the `AmcContract` and its first `AmcServiceUsage` atomically.
- **Optimistic concurrency**: payments POST guards on `amountPaid` (payment amount already applied by an initial atomic `updateMany`; a second `updateMany` flips the status, guarded on the pre-payment `amountPaid`); notification-template PATCH guards on `updatedAt`; inventory-stock POST uses `$queryRaw UPDATE ... RETURNING` with a stock-guard in the WHERE clause.
- **Idempotent status flips** via conditional `updateMany({ where:{ id, status:'DRAFT' }, data:{...} })` and checking `result.count !== 1` for the CONFLICT branch: invoice finalize, invoice revert, AMC service usage POST.
- **Soft delete** is the default: inventory items DELETE flips `isActive=false` (guarded on any remaining stock); admin users have no DELETE route (`settings/admins/route.ts` explicitly refuses to add one. status: `INACTIVE` is the only "delete"); AMC contracts DELETE soft-deletes to `CANCELLED` beyond a 24-hour hard-delete window. Roles cannot be deleted while any admin holds them; expense categories cannot be deleted while any expense references them; inventory categories cannot be deleted while any item points at them.
- **Cost visibility** (`INVENTORY_VIEW_COST`) is applied server-side by stripping `costPrice` from responses AND from write payloads. a caller without the permission cannot even read the current cost, let alone overwrite it.
- **Estimate revision pinning** on the public token route defends against a "prices changed while the customer was looking" race: the estimate GET returns an `estimateRevision` computed from the current job-card state, the approve/reject POST must echo it, and the transaction refuses if it has changed since.
- **Activity log side-effects** are fire-and-forget with two exceptions where the log row must land: bulk data export (DPDP) and any writer that passes `tx` so the log is atomic with the domain write.

---

## 5. Endpoint-count reconciliation

Files: 83 route.ts. Endpoints (counted per exported HTTP method):

| Module | Files | Endpoints |
|---|---|---|
| admin/amc | 6 | 13 (plans: 5, contracts: 8, usages: 2) |
| admin/appointments | 2 | 4 |
| admin/auth | 4 | 4 |
| admin/customers | 3 | 5 |
| admin/estimates | 3 | 6 |
| admin/expenses | 4 | 8 |
| admin/hsn-rates | 1 | 2 |
| admin/inventory | 12 | ~24 |
| admin/invoices | 6 | ~10 |
| admin/job-cards | 5 | ~12 |
| admin/logs | 2 | 2 |
| admin/notifications | 2 | 5 |
| admin/payments | 1 | 1 |
| admin/reports | 7 | 7 |
| admin/salary-slips | 3 | 5 |
| admin/service-requests | 2 | 3 |
| admin/settings | 7 | ~15 |
| admin/vehicles | 2 | 5 |
| admin/workers | 4 | 8 |
| public | 5 | 6 |
| health | 1 | 1 |
| **Total** | **83** | **~146** |

The endpoint count is approximate for the modules where a single file exports 3+ verbs (invoices/[id]/line-items exports POST + PATCH + DELETE, etc.); files were the primary counting unit.

---

## 6. Did NOT do

- Did NOT run the app or verify any status code over the wire. every code below comes from a `new AppError(status, ...)` literal, from an `AppError` subclass in `apps/web/src/lib/errors.ts`, or from an explicit `{ status: N }` on `NextResponse.json`.
- Did NOT read the top-level middleware file (`apps/web/src/middleware.ts`); every claim about CORS, request logging, IP throttling, and per-route rate limiting is either quoted from a route-file comment (`public/customer-lookup` mentions "10/min/IP") or missing. Treat those as **unverified**.
- Did NOT read the Prisma schema (`packages/db/prisma/schema.prisma`); model / relation cross-references are named against `docs/03-DATA-MODEL.md` on trust.
- Did NOT open `apps/web/src/lib/invoice-calc.ts`, `apps/web/src/lib/hsn-rate.ts`, `apps/web/src/lib/activity-logger.ts`, `apps/web/src/lib/id-generators.ts`, `apps/web/src/lib/time.ts`, `apps/web/src/lib/jwt-secret.ts`, `apps/web/src/lib/validators/password.ts`, `apps/web/src/lib/invoice-templates.ts`, `apps/web/src/lib/salary-slip-template.ts`, `apps/web/src/lib/reports/parts-profit.ts`, `apps/web/src/lib/reports/income-breakdown.ts`, or `apps/web/src/lib/estimate-token.ts` in this pass. Behaviour attributed to them (weighted-avg cost recomputation, HSN cache, IST day helpers, JWT secret resolution, password policy, template rendering) is described from the route-file's own comments.
- Did NOT audit the middleware for CSRF token handling. The `auth.ts` doc block says double-submit-CSRF is a "TODO if we ever drop the bearer flow"; whether cookie-only sessions could bypass that is left to §4 (Auth) of a future security pass.
- Did NOT test any handler's behaviour under concurrency; the concurrency guards described (optimistic-lock `updateMany` counts, `updatedAt` guards, `$queryRaw UPDATE ... RETURNING` stock guards) are read from the code, not exercised.
- Did NOT verify that the four permissions the code declares but no route file references (`APPOINTMENTS_CHECKIN`, `APPOINTMENTS_NOSHOW`, `WORKERS_LEAVES_MANAGE`, `INVENTORY_STOCK_MOVE`) are actually gated in the UI layer; §2 says "Declared for UI-level checks" on trust.
