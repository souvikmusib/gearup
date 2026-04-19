# GearUp Servicing — Codebase Context

> Ultra-detailed reference for AI agents, developers, and contributors.
> Last updated: 2026-04-19 | Production: gearup.sgnk.ai

---

## 1. Stack & Infrastructure

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | Next.js 14.2 (App Router) | React 18, Tailwind CSS 3.4, Lucide icons |
| **API** | Next.js Route Handlers | Replaces Express — same-origin `/api/*` |
| **Database** | Supabase Postgres | Via Prisma ORM 5.22, Session Pooler port 5432 |
| **Auth** | Custom JWT + RBAC | bcryptjs passwords, jsonwebtoken, 33 permissions |
| **Hosting** | Vercel | Single project, root `apps/web`, Fluid Compute |
| **Monorepo** | pnpm workspaces + Turborepo | 4 workspace packages |
| **Monitoring** | Sentry (Next.js SDK) | Client + server + edge configs |
| **Domain** | gearup.sgnk.ai | Custom domain on Vercel |

### Environment Variables (Production)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Supabase Postgres connection (Session Pooler) |
| `DIRECT_URL` | Direct Postgres connection (for migrations) |
| `JWT_SECRET` | Signs admin JWT tokens (min 16 chars) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PROJECT_ID` | Supabase project ID |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |

---

## 2. Repository Structure

```
gearup/
├── apps/web/                          ← Single Next.js app (frontend + API)
│   ├── prisma/
│   │   ├── schema.prisma              ← 31 models, 17 enums
│   │   └── seed.ts                    ← Admin user + role seeder
│   ├── src/
│   │   ├── app/
│   │   │   ├── (public)/              ← Public pages (homepage, book-service, track, contact)
│   │   │   ├── admin/                 ← 35 admin pages
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── customers/         ← page.tsx + [id]/page.tsx
│   │   │   │   ├── vehicles/          ← page.tsx + [id]/page.tsx
│   │   │   │   ├── workers/           ← page.tsx + [id]/page.tsx + calendar/page.tsx
│   │   │   │   ├── appointments/      ← page.tsx + [id]/page.tsx + calendar/page.tsx
│   │   │   │   ├── job-cards/         ← page.tsx + [id]/page.tsx
│   │   │   │   ├── inventory/         ← items/ + categories/ + suppliers/ + movements/ + low-stock/
│   │   │   │   ├── invoices/          ← page.tsx + [id]/page.tsx
│   │   │   │   ├── payments/page.tsx
│   │   │   │   ├── expenses/          ← page.tsx + categories/page.tsx
│   │   │   │   ├── service-requests/  ← page.tsx + [id]/page.tsx
│   │   │   │   ├── notifications/     ← page.tsx + templates/page.tsx
│   │   │   │   ├── settings/          ← page.tsx + admins/ + business-hours/ + integrations/ + notifications/
│   │   │   │   ├── reports/           ← page.tsx + revenue/ + appointments/ + jobs/ + inventory/ + workers/ + expenses/
│   │   │   │   ├── logs/page.tsx
│   │   │   │   └── layout.tsx         ← Admin shell (sidebar + header)
│   │   │   ├── api/
│   │   │   │   ├── admin/             ← 27 authenticated Route Handlers
│   │   │   │   ├── public/            ← 3 unauthenticated Route Handlers
│   │   │   │   ├── health/route.ts    ← DB health check
│   │   │   │   └── debug/route.ts     ← Debug endpoint (remove before prod)
│   │   │   └── layout.tsx             ← Root layout
│   │   ├── components/
│   │   │   ├── layout/admin-sidebar.tsx
│   │   │   └── shared/               ← list-toolbar, modal, pagination, theme-toggle
│   │   ├── lib/
│   │   │   ├── prisma.ts             ← Singleton Prisma client
│   │   │   ├── auth.ts               ← JWT verify + requirePermission (server-side)
│   │   │   ├── auth/auth-context.tsx  ← Client-side auth context
│   │   │   ├── api/client.ts         ← Frontend API client (fetch wrapper)
│   │   │   ├── errors.ts             ← AppError classes + handleApiError()
│   │   │   ├── constants.ts          ← App constants (JWT_EXPIRY, prefixes)
│   │   │   ├── pagination.ts         ← paginate() + paginationMeta()
│   │   │   ├── id-generators.ts      ← nanoid-based ID generators
│   │   │   ├── activity-logger.ts    ← logActivity() helper
│   │   │   └── theme/theme-context.tsx
│   │   ├── providers/index.tsx        ← Auth + Theme providers
│   │   ├── middleware.ts              ← Next.js middleware (auth redirect)
│   │   └── styles/
│   ├── next.config.mjs
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
├── packages/
│   ├── types/                         ← Shared TypeScript types
│   │   └── src/
│   │       ├── api.ts                 ← ApiResponse, PaginationMeta
│   │       ├── auth.ts                ← AuthTokenPayload, LoginRequest/Response
│   │       └── domain.ts             ← All enums + ROLES + PERMISSIONS + ROLE_PERMISSIONS
│   ├── ui/                            ← Shared UI components
│   │   └── src/components/            ← DataTable, EmptyState, PageHeader, StatCard, StatusBadge
│   └── tsconfig/                      ← Shared TS configs (node.json, nextjs.json)
├── docs/
│   ├── TESTING_CHECKLIST.md
│   ├── WORKFLOW_DETAILS.md
│   └── CODEBASE_CONTEXT.md            ← This file
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .env.example
```

**File counts:** 31 API routes | 47 pages | 10 lib files | 10 components | 31 Prisma models | 17 enums


---

## 3. Database Schema (Prisma)

### Models (31 total)

**Core Entities:**
| Model | Required Fields | Key Relations | Notes |
|-------|----------------|---------------|-------|
| `Customer` | fullName, phoneNumber | → Vehicle[], ServiceRequest[], Appointment[], JobCard[], Invoice[] | Indexed on phoneNumber, email |
| `Vehicle` | customerId, vehicleType (CAR/BIKE/OTHER), registrationNumber, brand, model | → Customer, ServiceRequest[], JobCard[], Invoice[] | Indexed on customerId, registrationNumber |
| `Worker` | workerCode (auto), fullName | → Appointment[], WorkerAssignment[], WorkerLeave[], JobCardTask[] | Status: ACTIVE/INACTIVE/ON_LEAVE |

**Workflow Entities:**
| Model | Required Fields | Key Relations | Notes |
|-------|----------------|---------------|-------|
| `ServiceRequest` | referenceId (auto), customerId, vehicleId, serviceCategory, issueDescription | → Customer, Vehicle, Appointment?, JobCard[] | 7 statuses, indexed on status |
| `Appointment` | referenceId (auto), customerId, vehicleId, appointmentDate, slotStart, slotEnd, bookingSource | → Customer, Vehicle, ServiceRequest?, Worker?, JobCard[] | 8 statuses |
| `JobCard` | jobCardNumber (auto), customerId, vehicleId, intakeDate, issueSummary | → Customer, Vehicle, Appointment?, ServiceRequest?, WorkerAssignment[], JobCardTask[], JobCardPart[], Invoice[] | 13 statuses, Decimal costs |
| `Invoice` | invoiceNumber (auto), customerId, vehicleId, jobCardId, invoiceDate, createdByAdminId | → Customer, Vehicle, JobCard, AdminUser, InvoiceLineItem[], Payment[] | Status: DRAFT/FINALIZED/CANCELLED |
| `Payment` | invoiceId, amount, paymentMode, paymentDate, receivedByAdminId | → Invoice | Mode: CASH/CARD/UPI/BANK_TRANSFER/CHEQUE/OTHER |

**Sub-Entities:**
| Model | Parent | Purpose |
|-------|--------|---------|
| `WorkerAssignment` | JobCard + Worker | Links workers to job cards |
| `JobCardTask` | JobCard | Individual tasks within a job |
| `JobCardPart` | JobCard + InventoryItem | Parts consumed in a job |
| `InvoiceLineItem` | Invoice | Line items (PART/LABOR/CUSTOM_CHARGE/DISCOUNT_ADJUSTMENT) |
| `WorkerLeave` | Worker | Leave requests with approval |

**Inventory:**
| Model | Purpose |
|-------|---------|
| `InventoryCategory` | Groups items (e.g., Engine Parts, Consumables) |
| `Supplier` | Vendor information |
| `InventoryItem` | SKU, prices, stock levels, reorder thresholds |
| `StockMovement` | Tracks every stock change with before/after quantities |

**Configuration:**
| Model | Purpose |
|-------|---------|
| `AppointmentSlotRule` | Day-of-week slot configuration (open/close times, capacity) |
| `BlockedSlot` | Blocked time ranges |
| `Holiday` | Public holidays, closures |
| `Setting` | Key-value configuration store |
| `NotificationTemplate` | WhatsApp/Email message templates |

**System:**
| Model | Purpose |
|-------|---------|
| `AdminUser` | Admin accounts with bcrypt passwords, lockout tracking |
| `Role` | Named roles (SUPER_ADMIN, ADMIN, SERVICE_MANAGER, WORKER, BILLING) |
| `Permission` | Granular permissions (33 total) |
| `AdminUserRole` | Many-to-many: AdminUser ↔ Role |
| `RolePermission` | Many-to-many: Role ↔ Permission |
| `Notification` | Sent/queued notifications with delivery tracking |
| `ActivityLog` | Immutable audit trail for all mutations |
| `Expense` | Business expenses with categories |
| `ExpenseCategory` | Expense groupings |

### Enums (17)

```
AdminUserStatus: ACTIVE | INACTIVE | LOCKED
ActorType: ADMIN | WORKER | SYSTEM | PUBLIC
VehicleType: CAR | BIKE | OTHER
ServiceRequestStatus: SUBMITTED | UNDER_REVIEW | APPOINTMENT_PENDING | APPOINTMENT_CONFIRMED | CONVERTED_TO_JOB | CANCELLED | CLOSED
AppointmentStatus: REQUESTED | PENDING_REVIEW | CONFIRMED | RESCHEDULED | CANCELLED | NO_SHOW | CHECKED_IN | COMPLETED
JobCardStatus: CREATED | UNDER_INSPECTION | ESTIMATE_PREPARED | AWAITING_CUSTOMER_APPROVAL | APPROVED | REJECTED | PARTS_PENDING | WORK_IN_PROGRESS | QUALITY_CHECK | READY_FOR_DELIVERY | DELIVERED | CANCELLED | CLOSED
ApprovalStatus: NOT_REQUIRED | PENDING | APPROVED | REJECTED
WorkerStatus: ACTIVE | INACTIVE | ON_LEAVE
LeaveStatus: PENDING | APPROVED | REJECTED
HolidayType: PUBLIC_HOLIDAY | WEEKLY_OFF | BUSINESS_CLOSURE | MAINTENANCE_SHUTDOWN | CUSTOM_BLOCK
InventoryMovementType: STOCK_IN | STOCK_OUT | ADJUSTMENT_INCREASE | ADJUSTMENT_DECREASE | RESERVED | RELEASED | CONSUMED | RETURNED
InvoiceStatus: DRAFT | FINALIZED | CANCELLED
PaymentStatus: UNPAID | PARTIALLY_PAID | PAID | REFUNDED | WAIVED
InvoiceLineType: PART | LABOR | CUSTOM_CHARGE | DISCOUNT_ADJUSTMENT
NotificationChannel: WHATSAPP | EMAIL
NotificationStatus: QUEUED | PROCESSING | SENT | DELIVERED | FAILED | DEAD_LETTER
PaymentMode: CASH | CARD | UPI | BANK_TRANSFER | CHEQUE | OTHER
```

---

## 4. Authentication & Authorization

### Auth Flow
```
1. POST /api/admin/auth/login { adminUserId, password }
2. Server: bcrypt.compare(password, user.passwordHash)
3. Server: jwt.sign({ sub, adminUserId, roles, permissions }, JWT_SECRET, { expiresIn: '24h' })
4. Client: stores token in localStorage('gearup_token')
5. Client: sends Authorization: Bearer <token> on every request
6. Server: jwt.verify(token, JWT_SECRET) via lib/auth.ts
```

### Server-Side Auth (lib/auth.ts)
```typescript
verifyAuth()           // Returns AuthTokenPayload or throws UnauthorizedError
requirePermission(...) // Verifies auth + checks permissions, throws ForbiddenError
getAuthToken()         // Extracts Bearer token from next/headers
```

### Client-Side Auth (lib/auth/auth-context.tsx)
```typescript
useAuth()  // { token, user, login(token), logout(), isAuthenticated }
```

### RBAC — 5 Roles, 33 Permissions

| Role | Permissions |
|------|------------|
| SUPER_ADMIN | All 33 permissions |
| ADMIN | All except admin-users.manage, settings.manage |
| SERVICE_MANAGER | Dashboard, customers, vehicles, SRs, appointments, job-cards, inventory, invoices (create only), notifications, reports |
| WORKER | Dashboard, customers (view), vehicles (view), SRs (view), appointments (view), job-cards (own + update status), inventory (view), reports |
| BILLING | Dashboard, customers, vehicles (view), inventory (view), invoices (full), payments, expenses, notifications, reports |

### Account Security
- Max 5 failed login attempts → account LOCKED for 30 minutes
- Passwords hashed with bcrypt cost factor 12
- JWT expires in 24 hours
- Activity logged on every login


---

## 5. API Reference (31 Route Handlers)

### Public Endpoints (no auth)

| Method | Path | Purpose | Input |
|--------|------|---------|-------|
| GET | `/api/health` | DB connectivity check | — |
| POST | `/api/public/service-requests` | Submit service request (creates customer + vehicle + SR + optional appointment in transaction) | fullName, phoneNumber, vehicleType, brand, model, registrationNumber, serviceCategory, issueDescription, preferredDate? |
| GET | `/api/public/available-slots?date=` | Get available appointment slots for a date | date (YYYY-MM-DD) |
| POST | `/api/public/track` | Track service request by reference + phone | referenceId, phoneNumber |

### Auth Endpoints

| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| POST | `/api/admin/auth/login` | — | Login, returns JWT |
| GET | `/api/admin/auth/me` | any valid token | Current user profile + permissions |
| POST | `/api/admin/auth/change-password` | any valid token | Change own password |

### Admin CRUD Endpoints

| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| GET | `/api/admin/customers` | customers.view | List (paginated, searchable) |
| POST | `/api/admin/customers` | customers.edit | Create customer |
| GET | `/api/admin/customers/[id]` | customers.view | Get with vehicles, SRs, invoices |
| PATCH | `/api/admin/customers/[id]` | customers.edit | Update customer |
| GET | `/api/admin/customers/[id]/history` | customers.view | Activity log for customer |
| GET | `/api/admin/vehicles` | vehicles.view | List (paginated, searchable) |
| POST | `/api/admin/vehicles` | vehicles.edit | Create vehicle |
| GET | `/api/admin/vehicles/[id]` | vehicles.view | Get with customer, SRs, job cards |
| PATCH | `/api/admin/vehicles/[id]` | vehicles.edit | Update vehicle |
| GET | `/api/admin/workers` | workers.manage | List (paginated, filterable by status) |
| POST | `/api/admin/workers` | workers.manage | Create (auto-generates workerCode) |
| GET | `/api/admin/workers/[id]` | workers.manage | Get with assignments, leaves |
| PATCH | `/api/admin/workers/[id]` | workers.manage | Update (including status) |
| GET | `/api/admin/appointments` | appointments.view | List (paginated, filter by status/date) |
| POST | `/api/admin/appointments` | appointments.confirm | Create (auto-generates referenceId) |
| GET | `/api/admin/appointments/[id]` | appointments.view | Get with all relations |
| PATCH | `/api/admin/appointments/[id]` | appointments.confirm | Update status/dates |
| GET | `/api/admin/job-cards` | job-cards.create | List (paginated, filter by status, search) |
| POST | `/api/admin/job-cards` | job-cards.create | Create (auto-generates jobCardNumber) |
| GET | `/api/admin/job-cards/[id]` | job-cards.create | Get with tasks, parts, workers, invoices |
| PATCH | `/api/admin/job-cards/[id]` | job-cards.update-status | Update status, diagnosis, costs |
| GET | `/api/admin/inventory/items` | inventory.view | List (paginated, search, filter by category) |
| POST | `/api/admin/inventory/items` | inventory.edit | Create item |
| GET | `/api/admin/invoices` | invoices.view | List (filter by payment/invoice status) |
| POST | `/api/admin/invoices` | invoices.create | Create with line items (auto-calculates tax/totals) |
| GET | `/api/admin/invoices/[id]` | invoices.view | Get with line items, payments |
| PATCH | `/api/admin/invoices/[id]` | invoices.create | Update invoice |
| GET | `/api/admin/payments` | payments.record | List with invoice + customer |
| GET | `/api/admin/expenses` | expenses.view | List (filter by category) |
| POST | `/api/admin/expenses` | expenses.manage | Create expense |
| GET | `/api/admin/expenses/[id]` | expenses.view | Get with category |
| DELETE | `/api/admin/expenses/[id]` | expenses.manage | Delete expense |
| GET | `/api/admin/service-requests` | service-requests.view | List (filter by status, search) |
| GET | `/api/admin/service-requests/[id]` | service-requests.view | Get with customer, vehicle, appointment, job cards |
| PATCH | `/api/admin/service-requests/[id]` | service-requests.edit | Update status, notes |
| GET | `/api/admin/notifications` | notifications.view | List (filter by channel, status) |
| GET | `/api/admin/settings` | settings.view | Get all settings as key-value map |
| PATCH | `/api/admin/settings` | settings.manage | Upsert multiple settings |
| GET | `/api/admin/reports?type=` | reports.view / dashboard.view | Dashboard, revenue, jobs reports |
| GET | `/api/admin/logs` | logs.view | Activity logs (filter by entity, actor, action) |

### API Response Format

All endpoints return:
```json
{
  "success": true|false,
  "data": { ... } | [ ... ],
  "meta": { "page": 1, "pageSize": 20, "total": 100, "totalPages": 5 },
  "error": { "code": "ERROR_CODE", "message": "Human readable", "details": {} }
}
```

### Error Codes
| Code | HTTP | When |
|------|------|------|
| VALIDATION_ERROR | 400 | Zod validation fails |
| UNAUTHORIZED | 401 | Missing/invalid/expired token |
| FORBIDDEN | 403 | Missing required permission |
| NOT_FOUND | 404 | Entity not found |
| CONFLICT | 409 | Unique constraint violation |
| INTERNAL_ERROR | 500 | Unhandled server error |


---

## 6. Business Workflows

### Primary Workflow: Vehicle Servicing Lifecycle

```
Customer → Vehicle → Service Request → Appointment → Job Card → Invoice → Payment
```

**Step-by-step:**

1. **Customer submits** service request via `/book-service` (public form)
   - Auto-creates Customer (if new phone number)
   - Auto-creates Vehicle (if new registration)
   - Creates ServiceRequest (status: SUBMITTED)
   - Optionally creates Appointment (if preferred date given)

2. **Admin reviews** service request → updates status to UNDER_REVIEW

3. **Admin creates/confirms appointment** → status: CONFIRMED

4. **Customer arrives** → admin marks CHECKED_IN

5. **Admin creates Job Card** from appointment
   - Links to customer, vehicle, appointment, service request
   - Service request status auto-updates to CONVERTED_TO_JOB
   - Assigns workers, creates tasks, reserves parts

6. **Work progresses** through job card statuses:
   - UNDER_INSPECTION → ESTIMATE_PREPARED → AWAITING_CUSTOMER_APPROVAL
   - APPROVED → WORK_IN_PROGRESS → QUALITY_CHECK → READY_FOR_DELIVERY

7. **Admin creates Invoice** from completed job card
   - Adds line items (parts, labor, custom charges)
   - Tax auto-calculated per line item
   - Finalizes invoice

8. **Admin records Payment** against invoice
   - Updates amountPaid, amountDue, paymentStatus
   - UNPAID → PARTIALLY_PAID → PAID

9. **Vehicle delivered** → job card status: DELIVERED

### Module Classification

**CRUD (Independent — admin can create directly):**
Customers, Vehicles, Workers, Inventory Items, Inventory Categories, Suppliers, Expenses, Expense Categories, Settings, Admin Users

**Dependent (Created through workflow):**
Service Requests (public form only), Appointments, Job Cards, Invoices, Payments, Stock Movements, Worker Assignments, Notifications, Activity Logs

### Seeded Workflow Examples (Production Data)

| # | Customer | Vehicle | Flow | Status |
|---|----------|---------|------|--------|
| 1 | Rahul Sharma | Maruti Swift | SR → Apt → JC → Invoice → Payment | ✅ PAID (₹3,186) |
| 2 | Priya Patel | Hyundai Creta | SR → Apt → JC (WIP) | 🔄 In Progress |
| 3 | Amit Kumar | Tata Nexon | SR submitted | ⏳ Awaiting Appointment |
| 4 | Sneha Reddy | Kia Seltos | JC → Invoice | 💰 UNPAID (₹1,770) |
| 5 | Vikram Singh | RE Classic 350 | JC → Invoice → Partial Payment | 💰 PARTIALLY_PAID (₹2,900 due) |

---

## 7. Frontend Architecture

### Page Layout
- **Public pages** (`(public)/`): Standalone layout, no auth required
- **Admin pages** (`admin/`): Shared layout with sidebar + header, auth required
- **API routes** (`api/`): Serverless functions, no UI

### Client-Side API Client (`lib/api/client.ts`)
```typescript
const BASE = '/api';  // Same-origin, no CORS needed
api.get<T>(path)      // GET with auth header
api.post<T>(path, body)
api.patch<T>(path, body)
api.delete<T>(path)
// Auto-redirects to /admin/login on 401
// Returns { success: false, error: { code: 'NETWORK_ERROR' } } on fetch failure
```

### Auth Context (`lib/auth/auth-context.tsx`)
- Stores JWT in `localStorage('gearup_token')`
- Provides `useAuth()` hook: `{ token, user, login, logout, isAuthenticated }`
- Decodes JWT client-side for user info (no API call needed for basic info)

### Shared UI Components (`packages/ui`)
| Component | Purpose |
|-----------|---------|
| `DataTable` | Reusable table with sorting |
| `EmptyState` | Empty list placeholder |
| `PageHeader` | Page title + action buttons |
| `StatCard` | Dashboard metric card |
| `StatusBadge` | Colored status pill |

### Admin Sidebar Navigation
```
Dashboard
Customers
Vehicles
Workers (+ Calendar)
Appointments (+ Calendar)
Job Cards
Inventory (Items, Categories, Suppliers, Movements, Low Stock)
Invoices
Payments
Expenses (+ Categories)
Service Requests
Notifications (+ Templates)
Settings (General, Admins, Business Hours, Integrations, Notifications)
Reports (Revenue, Appointments, Jobs, Inventory, Workers, Expenses)
Activity Logs
```

---

## 8. Key Library Files

### `lib/prisma.ts`
Singleton PrismaClient with global caching (prevents connection exhaustion in serverless).

### `lib/auth.ts`
Server-side auth using `next/headers`. Three functions:
- `getAuthToken()` — extracts Bearer token
- `verifyAuth()` — verifies JWT, returns payload
- `requirePermission(...perms)` — verifies auth + checks permissions

### `lib/errors.ts`
Error classes: `AppError`, `NotFoundError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`
Plus `handleApiError(error)` — catches any error and returns proper `NextResponse`.

### `lib/id-generators.ts`
Uses `nanoid` with alphanumeric charset:
- `generateReferenceId()` → `GU-XXXXXXXX`
- `generateJobCardNumber()` → `JC-XXXXXXXX`
- `generateInvoiceNumber()` → `INV-XXXXXXXX`
- `generateAppointmentRef()` → `APT-XXXXXXXX`
- `generateWorkerCode()` → `WRK-XXXXXX`

### `lib/activity-logger.ts`
`logActivity({ entityType, entityId, action, previousValue, newValue, actorType, actorId })`
Called after every mutation. Stores JSON snapshots of before/after values.

### `lib/pagination.ts`
- `paginate({ page, pageSize })` → `{ skip, take }` for Prisma
- `paginationMeta(total, page, pageSize)` → `{ page, pageSize, total, totalPages }`

---

## 9. Performance Profile

### Page Load (TTFB from Vercel edge)
| Page | TTFB | Size | Type |
|------|------|------|------|
| Homepage | 334ms | 30.6KB | Static |
| Admin Login | 115ms | 7.5KB | Static |
| Admin Dashboard | 120ms | 6.0KB | Static |
| All admin list pages | 95-168ms | ~6KB | Static |
| Track page | 76ms | 11.1KB | Static |

### API Response Times (Vercel → Supabase cross-region)
| Endpoint | Time | Bottleneck |
|----------|------|-----------|
| /api/health | 77ms | Simple SELECT 1 |
| /api/admin/* (warm) | 900-1800ms | Cross-region DB (Virginia → Tokyo) |
| /api/admin/auth/login | 1473ms (cold) | bcrypt + DB + cold start |
| /api/admin/reports?type=dashboard | 1876ms | 6 parallel DB queries |

### Bundle Sizes
| Asset | Size |
|-------|------|
| Total JS | 461KB |
| React + framework | 168.7KB |
| Shared app code | 121.4KB |
| Polyfills | 109.9KB |
| Admin layout | 15.5KB |
| CSS (Tailwind) | 20.4KB |
| Per-page chunks | 2-12KB |

### Known Performance Issue
Vercel functions run in `iad1` (Virginia) but Supabase DB is in `ap-northeast-1` (Tokyo) — ~200ms network latency per query. Fix: move Vercel region to `hnd1` (Tokyo).

---

## 10. Production Data (as of 2026-04-19)

| Entity | Count | Sample Data |
|--------|-------|-------------|
| Customers | 10 | Rahul, Priya, Amit, Sneha, Vikram + 5 test |
| Vehicles | 9 | Swift, Creta, Nexon, Seltos, Classic 350, BMW X5, Tesla Model 3 |
| Workers | 5 | Raju (Mechanic), Suresh (Electrician), Mohan (Painter) + 2 test |
| Appointments | 3 | COMPLETED, CHECKED_IN, CONFIRMED |
| Job Cards | 5 | DELIVERED ×2, WORK_IN_PROGRESS, READY_FOR_DELIVERY + 1 test |
| Invoices | 4 | PAID (₹3,186), UNPAID (₹1,770), PARTIALLY_PAID (₹5,900) |
| Payments | 2 | UPI ₹3,186 + CASH ₹3,000 |
| Expenses | 5 | Rent ₹25K, Electricity ₹5K, Tools ₹4.5K+₹3.2K, Internet ₹1.5K |
| Service Requests | 6 | SUBMITTED, UNDER_REVIEW, APPOINTMENT_PENDING, CONVERTED_TO_JOB ×2 |
| Notifications | 3 | DELIVERED (WhatsApp), SENT (WhatsApp), FAILED (Email) |
| Settings | 11 | Business info, invoice config, notification toggles |
| Activity Logs | 41+ | Auto-generated from all operations |
| Slot Rules | 6 | Mon-Sat, 9AM-6PM, 30min slots, capacity 8 |
| Holidays | 2 | Good Friday, May Day |
| Inventory Items | 3 | Engine Oil (50 stock), Air Filter (25), Brake Pads (15) |
| Stock Movements | 2 | STOCK_IN +20, CONSUMED -4 |
| Notification Templates | 3 | Appointment reminder, Ready for pickup, Invoice email |
| Expense Categories | 3 | Utilities, Rent, Tools & Equipment |
| Inventory Categories | 2 | Engine Parts, Consumables |

---

## 11. Test Results Summary

**E2E Test Suite: 58/59 passed**

| Module | Tests | Pass | Fail |
|--------|-------|------|------|
| Auth (login, me, bad password, invalid token) | 6 | 6 | 0 |
| Customers (CRUD + search + pagination + history) | 6 | 6 | 0 |
| Vehicles (CRUD + search + relations) | 5 | 5 | 0 |
| Workers (CRUD + auto-code + filter) | 5 | 5 | 0 |
| Appointments (CRUD + auto-ref + relations) | 5 | 5 | 0 |
| Job Cards (CRUD + auto-number + relations) | 4 | 4 | 0 |
| Inventory (list + categories + search) | 3 | 3 | 0 |
| Invoices (create + auto-number + line items + tax) | 5 | 5 | 0 |
| Payments (list) | 1 | 1 | 0 |
| Expenses (create + read + delete) | 3 | 3 | 0 |
| Service Requests (list + read + update) | 3 | 3 | 0 |
| Notifications (list) | 1 | 1 | 0 |
| Settings (upsert + read) | 2 | 2 | 0 |
| Reports (dashboard + revenue + jobs) | 4 | 4 | 0 |
| Activity Logs (list + filter) | 2 | 2 | 0 |
| Public (SR submit + track + slots + invalid) | 4 | 3 | 1 |

**The 1 failure:** `/api/public/track` returns empty body (instead of JSON error) for completely invalid input. Edge case, not functional.

---

## 12. Known Issues & Remediation

| # | Issue | Severity | Status | Fix |
|---|-------|----------|--------|-----|
| 1 | API response times 900ms-1.8s | 🔴 High | Open | Move Vercel region to `hnd1` (Tokyo) to match Supabase |
| 2 | Build logs show "Dynamic server usage" warnings | 🟡 Low | Cosmetic | Add `export const dynamic = 'force-dynamic'` to route files |
| 3 | `/api/debug` endpoint still deployed | 🟡 Medium | Open | Delete `apps/web/src/app/api/debug/route.ts` |
| 4 | Admin password is `admin123` | 🔴 High | Open | Change via `/api/admin/auth/change-password` |
| 5 | pnpm lockfile version mismatch warning | 🟢 Low | Cosmetic | Update `packageManager` in root package.json |
| 6 | Empty response on invalid track input | 🟢 Low | Open | Fix error handler in track route |
| 7 | No rate limiting on login endpoint | 🟡 Medium | Open | Add rate limiting middleware |
| 8 | Service Requests have no admin "Create" button | 🟢 Info | By design | Created via public form at `/book-service` |

---

## 13. Development Commands

```bash
pnpm install              # Install all dependencies
pnpm dev                  # Start Next.js dev server (port 3000)
pnpm build                # Production build
pnpm db:generate          # Generate Prisma Client
pnpm db:push              # Push schema to database
pnpm db:migrate           # Run migrations
pnpm db:seed              # Seed admin user
npx tsx prisma/seed.ts    # Run seed script (from apps/web/)
```

### Admin Credentials
```
URL:      https://gearup.sgnk.ai/admin/login
Username: admin
Password: admin123
```
