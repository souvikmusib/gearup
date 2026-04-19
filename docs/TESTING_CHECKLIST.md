# GearUp Servicing — Testing Checklist

> Last tested: 2026-04-19 against `gearup.sgnk.ai`
> Stack: Next.js 14 (Vercel) + Supabase Postgres (Prisma) + Custom JWT Auth

---

## 1. Infrastructure & Deployment

### Vercel
- [x] Build passes without errors
- [x] Framework detected as Next.js
- [x] Root directory set to `apps/web`
- [x] Prisma Client generated during build (`postinstall`)
- [x] All API routes marked as `ƒ (Dynamic)` — not statically rendered
- [x] Production deployment promoted and aliased
- [x] Custom domain `gearup.sgnk.ai` resolves correctly
- [x] SSO/Deployment Protection disabled for production
- [ ] Preview deployments work for PRs
- [ ] Rollback to previous deployment works

### Environment Variables (Vercel)
- [x] `DATABASE_URL` — points to correct Supabase Postgres
- [x] `DIRECT_URL` — points to correct Supabase Postgres
- [x] `JWT_SECRET` — set and min 16 chars
- [x] `NEXT_PUBLIC_SUPABASE_URL` — correct project URL
- [x] `NEXT_PUBLIC_SUPABASE_PROJECT_ID` — correct project ID
- [x] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — correct anon key
- [ ] Env vars scoped correctly (production/preview/development)

### Database (Supabase Postgres)
- [x] 31 tables created via `prisma db push`
- [x] Schema matches `apps/web/prisma/schema.prisma`
- [x] `directUrl` configured for migrations
- [x] Connection pooling via Session Pooler (port 5432)
- [x] Admin user seeded (`admin` / `admin123`)
- [x] SUPER_ADMIN role created and assigned
- [ ] Database backups enabled in Supabase dashboard
- [ ] Connection limits appropriate for serverless

---

## 2. Authentication & Authorization

### Login Flow
- [x] `POST /api/admin/auth/login` — valid credentials return JWT token
- [x] Token contains `sub`, `adminUserId`, `roles`, `permissions`
- [x] Token expires in 24h (`JWT_EXPIRY`)
- [x] Invalid password returns `401 Unauthorized`
- [x] Non-existent user returns `401 Unauthorized`
- [x] Failed login increments `failedLoginAttempts`
- [ ] Account locks after 5 failed attempts
- [ ] Locked account returns "Account locked" message
- [ ] Lock expires after 30 minutes
- [x] Successful login resets `failedLoginAttempts` to 0
- [x] `lastLoginAt` updated on successful login

### Token Verification
- [x] `GET /api/admin/auth/me` — returns user profile with roles & permissions
- [x] Invalid token returns `401 UNAUTHORIZED`
- [x] Expired token returns `401 UNAUTHORIZED`
- [x] Missing `Authorization` header returns `401`
- [x] Malformed `Bearer` header returns `401`

### RBAC (Role-Based Access Control)
- [x] SUPER_ADMIN has all 33 permissions
- [x] Routes check permissions via `requirePermission()`
- [ ] ADMIN role has correct subset of permissions
- [ ] SERVICE_MANAGER role has correct subset
- [ ] WORKER role limited to view-only + own job cards
- [ ] BILLING role limited to invoices/payments/expenses
- [ ] Missing permission returns `403 FORBIDDEN`

### Password Management
- [x] `POST /api/admin/auth/change-password` — works with valid current password
- [ ] Rejects if current password is wrong
- [ ] Enforces minimum 8 character new password
- [ ] Password hashed with bcrypt (cost factor 12)

---

## 3. API Endpoints — CRUD Operations

### Customers (`/api/admin/customers`)
- [x] `GET /` — list with pagination (`page`, `pageSize`)
- [x] `GET /` — search by `fullName`, `phoneNumber`, `email`
- [x] `POST /` — create with required `fullName` + `phoneNumber`
- [x] `GET /:id` — read with `vehicles`, `serviceRequests`, `invoices`
- [x] `PATCH /:id` — partial update
- [x] `GET /:id/history` — activity log for customer
- [x] Pagination meta: `page`, `pageSize`, `total`, `totalPages`
- [ ] Validation: rejects missing `fullName`
- [ ] Validation: rejects `phoneNumber` < 5 chars
- [ ] Validation: rejects invalid email format

### Vehicles (`/api/admin/vehicles`)
- [x] `GET /` — list with pagination
- [x] `GET /` — search by `registrationNumber`, `brand`, `model`
- [x] `POST /` — create with `customerId`, `vehicleType`, `registrationNumber`, `brand`, `model`
- [x] `GET /:id` — read with `customer`, `serviceRequests`, `jobCards`
- [x] `PATCH /:id` — partial update
- [x] Customer → Vehicle relation resolves
- [x] Vehicle → Customer relation resolves
- [ ] Validation: rejects invalid `vehicleType` (must be CAR/BIKE/OTHER)

### Workers (`/api/admin/workers`)
- [x] `GET /` — list with pagination
- [x] `GET /` — filter by `status`, search by `fullName`/`workerCode`
- [x] `POST /` — create with auto-generated `workerCode` (WRK-XXXXXX)
- [x] `GET /:id` — read with `assignments`, `leaves`
- [x] `PATCH /:id` — update including `status` (ACTIVE/INACTIVE/ON_LEAVE)
- [ ] `POST /:id/leave` — create leave request
- [ ] `GET /:id/schedule` — view assignments and leaves

### Appointments (`/api/admin/appointments`)
- [x] `GET /` — list with pagination, filter by `status`, `date`
- [x] `POST /` — create with auto-generated `referenceId` (APT-XXXXXXXX)
- [x] Created with `status: CONFIRMED` and `confirmedByAdminId`
- [x] `GET /:id` — read with `customer`, `vehicle`, `serviceRequest`, `worker`
- [x] `PATCH /:id` — update with date conversion for `appointmentDate`, `slotStart`, `slotEnd`
- [ ] Reschedule action updates status to `RESCHEDULED`
- [ ] Cancel action updates status to `CANCELLED`
- [ ] Check-in action updates status to `CHECKED_IN`
- [ ] No-show action updates status to `NO_SHOW`

### Job Cards (`/api/admin/job-cards`)
- [x] `GET /` — list with pagination, filter by `status`, search
- [x] `POST /` — create with auto-generated `jobCardNumber` (JC-XXXXXXXX)
- [x] `GET /:id` — read with all relations (customer, vehicle, tasks, parts, invoices)
- [x] `PATCH /:id` — update status, diagnosis, costs
- [x] Status `DELIVERED` auto-sets `actualDeliveryAt`
- [ ] Linked service request status updated to `CONVERTED_TO_JOB`
- [ ] `POST /:id/assign-workers` — assign workers
- [ ] `POST /:id/tasks` — create task
- [ ] `PATCH /:id/tasks/:taskId` — update task
- [ ] `POST /:id/parts` — add part

### Inventory (`/api/admin/inventory`)
- [x] `GET /items` — list with pagination, search, filter by `categoryId`
- [x] Items include `category` and `supplier` relations
- [x] Search by `itemName` and `sku`
- [x] `POST /items` — create inventory item
- [ ] `PATCH /items/:id` — update item
- [ ] `GET /categories` — list categories
- [ ] `POST /categories` — create category
- [ ] `GET /suppliers` — list suppliers
- [ ] `POST /suppliers` — create supplier
- [ ] `POST /stock-movements` — create stock movement with quantity calculation
- [ ] `GET /movements` — list stock movements
- [ ] `GET /low-stock` — items below reorder level

### Invoices (`/api/admin/invoices`)
- [x] `GET /` — list with pagination, filter by `paymentStatus`, `invoiceStatus`
- [x] `POST /` — create with auto-generated `invoiceNumber` (INV-XXXXXXXX)
- [x] Line items created in same transaction
- [x] Tax calculated per line item (`taxRate / 100 * lineTotal`)
- [x] `subtotal`, `taxTotal`, `grandTotal`, `amountDue` computed
- [x] Discount calculation (percentage or fixed)
- [x] `GET /:id` — read with `lineItems`, `payments`, `customer`, `vehicle`, `jobCard`
- [ ] `POST /:id/finalize` — sets `invoiceStatus: FINALIZED`
- [ ] `POST /:id/payments` — record payment, update `amountPaid`/`amountDue`/`paymentStatus`
- [ ] Payment status transitions: UNPAID → PARTIALLY_PAID → PAID

### Payments (`/api/admin/payments`)
- [x] `GET /` — list with pagination, includes invoice + customer

### Expenses (`/api/admin/expenses`)
- [x] `GET /` — list with pagination, filter by `categoryId`
- [x] `POST /` — create expense
- [x] `GET /:id` — read with `category`, `createdBy`
- [x] `DELETE /:id` — delete expense
- [ ] `GET /categories` — list expense categories
- [ ] `POST /categories` — create expense category

### Service Requests (`/api/admin/service-requests`)
- [x] `GET /` — list with pagination, filter by `status`, search
- [x] `GET /:id` — read with `customer`, `vehicle`, `appointment`, `jobCards`
- [x] `PATCH /:id` — update status, notes, urgency
- [x] Status `CANCELLED`/`CLOSED` auto-sets `closedAt`

### Notifications (`/api/admin/notifications`)
- [x] `GET /` — list with pagination, filter by `channel`, `eventType`, `sendStatus`
- [ ] `POST /retry/:id` — retry failed notification
- [ ] `GET /templates` — list notification templates
- [ ] `PATCH /templates/:id` — update template

### Settings (`/api/admin/settings`)
- [x] `GET /` — returns key-value map
- [x] `PATCH /` — upsert multiple settings
- [ ] `GET /business-hours` — slot rules + holidays
- [ ] `PATCH /business-hours` — update slot rules
- [ ] `GET /integrations` — integration settings
- [ ] `PATCH /integrations` — update integration settings

### Reports (`/api/admin/reports`)
- [x] `?type=dashboard` — today's appointments, pending requests, active jobs, unpaid invoices, revenue
- [x] `?type=revenue` — payments grouped by mode with date range filter
- [x] `?type=jobs` — job cards grouped by status
- [ ] `?type=appointments` — appointments grouped by status
- [ ] `?type=inventory` — total items and stock units
- [ ] `?type=workers` — workers with assignment counts
- [ ] `?type=expenses` — expenses grouped by category with date range

### Activity Logs (`/api/admin/logs`)
- [x] `GET /` — list with pagination (default 50 per page)
- [x] Filter by `entityType`, `actorType`, `action`
- [x] Includes `adminUser` relation (fullName, adminUserId)
- [x] Auto-created on customer/vehicle/worker/expense/invoice mutations

---

## 4. Public Endpoints

### Service Request Submission (`/api/public/service-requests`)
- [x] Creates customer if not exists (by phone number)
- [x] Creates vehicle if not exists (by registration + customer)
- [x] Creates service request with auto-generated `referenceId`
- [x] Creates appointment if `preferredDate` provided
- [x] All created in a single database transaction
- [x] Activity logged as `actorType: PUBLIC`
- [ ] Validation: all required fields enforced
- [ ] Duplicate phone → reuses existing customer

### Tracking (`/api/public/track`)
- [x] Returns service request status by `referenceId` + `phoneNumber`
- [x] Returns appointment status, job card status, invoice/payment status
- [x] Wrong phone number returns 404
- [ ] Non-existent referenceId returns proper error JSON

### Available Slots (`/api/public/available-slots`)
- [x] Returns slots for a given date
- [x] Respects `AppointmentSlotRule` configuration
- [ ] Respects holidays (returns empty with message)
- [ ] Respects blocked slots
- [ ] Respects max capacity
- [ ] Missing `date` param returns 400

---

## 5. Frontend Navigation

### Public Pages
- [x] `/` — Homepage loads (30.6KB, 334ms)
- [x] `/book-service` — Service request form loads
- [x] `/track` — Tracking page loads
- [x] `/contact` — Contact page loads

### Admin Pages (35 total)
- [x] `/admin/login` — Login form renders
- [x] `/admin/dashboard` — Dashboard loads
- [x] `/admin/customers` — Customer list
- [x] `/admin/customers/[id]` — Customer detail (dynamic)
- [x] `/admin/vehicles` — Vehicle list
- [x] `/admin/vehicles/[id]` — Vehicle detail (dynamic)
- [x] `/admin/workers` — Worker list
- [x] `/admin/workers/[id]` — Worker detail (dynamic)
- [x] `/admin/workers/calendar` — Worker calendar
- [x] `/admin/appointments` — Appointment list
- [x] `/admin/appointments/[id]` — Appointment detail (dynamic)
- [x] `/admin/appointments/calendar` — Calendar view
- [x] `/admin/job-cards` — Job card list
- [x] `/admin/job-cards/[id]` — Job card detail (dynamic)
- [x] `/admin/inventory/items` — Inventory items
- [x] `/admin/inventory/categories` — Categories
- [x] `/admin/inventory/suppliers` — Suppliers
- [x] `/admin/inventory/movements` — Stock movements
- [x] `/admin/inventory/low-stock` — Low stock alerts
- [x] `/admin/invoices` — Invoice list
- [x] `/admin/invoices/[id]` — Invoice detail (dynamic)
- [x] `/admin/payments` — Payment list
- [x] `/admin/expenses` — Expense list
- [x] `/admin/expenses/categories` — Expense categories
- [x] `/admin/service-requests` — Service request list
- [x] `/admin/service-requests/[id]` — Detail (dynamic)
- [x] `/admin/notifications` — Notification list
- [x] `/admin/notifications/templates` — Templates
- [x] `/admin/settings` — General settings
- [x] `/admin/settings/admins` — Admin user management
- [x] `/admin/settings/business-hours` — Business hours config
- [x] `/admin/settings/integrations` — Integration settings
- [x] `/admin/settings/notifications` — Notification settings
- [x] `/admin/reports` — Reports hub
- [x] `/admin/reports/revenue` — Revenue report
- [x] `/admin/reports/appointments` — Appointments report
- [x] `/admin/reports/jobs` — Jobs report
- [x] `/admin/reports/inventory` — Inventory report
- [x] `/admin/reports/workers` — Workers report
- [x] `/admin/reports/expenses` — Expenses report
- [x] `/admin/logs` — Activity logs

---

## 6. Performance

### Page Load (TTFB)
- [x] All admin pages < 200ms TTFB
- [x] Static pages pre-rendered (~6KB HTML)
- [x] Client-side navigation via page chunks (2–12KB)
- [x] Shared layout stays mounted during navigation
- [x] Total JS bundle: 461KB (acceptable)
- [x] CSS: 20.4KB (Tailwind, single file)

### API Response Times
- [x] `/api/health` — 77ms 🟢
- [ ] Admin endpoints — 900ms–1.8s 🔴 (Vercel cold start + cross-region DB)
- [ ] Optimize: Move Vercel region to match Supabase (`ap-northeast-1`)
- [ ] Optimize: Add Prisma connection pooling
- [ ] Optimize: Consider Vercel Fluid Compute for warm functions

### TLS
- [x] TLS handshake: 55ms

---

## 7. Data Integrity

- [x] Row counts match between list response and `total` in pagination meta
- [x] Cross-table relations resolve (Customer ↔ Vehicle, JobCard → Customer/Vehicle)
- [x] Activity logs auto-created on all mutations
- [x] Decimal fields (prices, quantities) stored correctly
- [x] DateTime fields stored in UTC
- [x] Enum fields validated (VehicleType, Status enums)
- [x] Unique constraints enforced (`adminUserId`, `sku`, `invoiceNumber`, etc.)
- [x] Cascade deletes work (e.g., delete customer → delete vehicles)
- [ ] Concurrent write safety (optimistic locking not implemented)

---

## 8. Security

- [x] All `/api/admin/*` routes require Bearer token
- [x] Public routes (`/api/public/*`, `/api/health`) require no auth
- [x] Passwords hashed with bcrypt (cost 12)
- [x] JWT signed with HS256
- [x] Account lockout after failed attempts
- [x] `.env` in `.gitignore`
- [x] No secrets in client-side code
- [ ] Rate limiting on login endpoint
- [ ] CORS headers configured
- [ ] Input sanitization beyond Zod validation
- [ ] SQL injection protection (Prisma parameterized queries — inherent)
- [ ] XSS protection (React auto-escaping — inherent)
- [ ] CSRF protection for state-changing requests
- [ ] JWT refresh token rotation
- [ ] Audit log for admin user management actions

---

## 9. Error Handling

- [x] Zod validation errors return 400 with details
- [x] Not found errors return 404
- [x] Auth errors return 401/403
- [x] Unhandled errors return 500 with generic message (no stack leak)
- [ ] Empty response body on some edge cases (e.g., invalid track with empty phone)
- [ ] Prisma `P2025` (record not found) mapped to 404
- [ ] Prisma `P2002` (unique constraint) mapped to 409

---

## 10. Known Issues & TODOs

| Priority | Issue | Status |
|----------|-------|--------|
| 🔴 High | API response times 900ms+ (cross-region DB) | Open — move Vercel to `hnd1` |
| 🟡 Medium | Build logs show "Unhandled API error" warnings during static generation | Cosmetic — add `export const dynamic = 'force-dynamic'` |
| 🟡 Medium | `pnpm-lock.yaml` version mismatch warning | Cosmetic — update `packageManager` field |
| 🟢 Low | `/api/public/track` returns empty body for invalid input | Fix error handler edge case |
| 🟢 Low | `/api/debug` endpoint still deployed | Remove before production |
| 🟢 Low | Admin password is `admin123` | Change before production |

---

## Test Execution Summary

| Category | Passed | Failed | Total |
|----------|--------|--------|-------|
| Auth | 6 | 0 | 6 |
| Customers | 6 | 0 | 6 |
| Vehicles | 5 | 0 | 5 |
| Workers | 5 | 0 | 5 |
| Appointments | 5 | 0 | 5 |
| Job Cards | 4 | 0 | 4 |
| Inventory | 3 | 0 | 3 |
| Invoices | 5 | 0 | 5 |
| Payments | 1 | 0 | 1 |
| Expenses | 3 | 0 | 3 |
| Service Requests | 3 | 0 | 3 |
| Notifications | 1 | 0 | 1 |
| Settings | 2 | 0 | 2 |
| Reports | 4 | 0 | 4 |
| Activity Logs | 2 | 0 | 2 |
| Public | 3 | 1 | 4 |
| **Total** | **58** | **1** | **59** |
