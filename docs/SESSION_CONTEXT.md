# GearUp Servicing — Complete Session Context

> Full record of everything done in this session on 2026-04-19
> Project: https://github.com/souvikmusib/gearup
> Production: https://gearup.sgnk.ai
> Supabase: ecljtctilsvvvwxuzxfy (ap-northeast-1 / Tokyo)

---

## Session Timeline

### Phase 1: Vercel Build Fix (14:19 - 14:40)

**Problem:** Both Vercel projects (`gearup` and `gearup-api`) failing with TypeScript error:
```
TS2322: Property 'fullName' is optional in type '...' but required in type 'CustomerCreateInput'
```

**Root cause:** Zod's inferred output type doesn't match Prisma's `CustomerCreateInput` — TypeScript structural typing mismatch.

**Fix:** Cast Zod-parsed body to Prisma input types across all route files.

**PRs created:**
- PR #2: Fixed `customer.routes.ts`, `vehicle.routes.ts`, `turbo.json` (merged)
- PR #3: Fixed remaining 7 route files (merged)

**Files fixed (9 total):**
- `customers/customer.routes.ts` → `Prisma.CustomerCreateInput`
- `vehicles/vehicle.routes.ts` → `Prisma.VehicleUncheckedCreateInput`
- `inventory/inventory.routes.ts` → `Prisma.InventoryItemUncheckedCreateInput`
- `workers/worker.routes.ts` → `Prisma.WorkerCreateInput`
- `appointments/appointment.routes.ts` → `Prisma.AppointmentUncheckedCreateInput`
- `job-cards/job-card.routes.ts` → `Prisma.JobCardUncheckedCreateInput`
- `expenses/expense.routes.ts` → `Prisma.ExpenseUncheckedCreateInput`
- `admin-users/admin-user.routes.ts` → `Prisma.AdminUserCreateInput`
- `invoices/invoice.routes.ts` → `Prisma.InvoiceUncheckedCreateInput`
- `public/public.routes.ts` → Multiple Prisma types in transaction

Also fixed: `turbo.json` — added `DATABASE_URL` and `DIRECT_URL` to `globalEnv`.

---

### Phase 2: Complete Architecture Restructure (14:50 - 15:30)

**Goal:** Restructure from two-app monorepo (Express API + Next.js frontend) to single Next.js app with Route Handlers + Supabase Postgres.

**Before:**
```
apps/api (Express.js) → Vercel project "gearup-api"
apps/web (Next.js)    → Vercel project "gearup"
packages/db           → Prisma client
packages/notifications → Unused
packages/config       → Loose configs
```

**After:**
```
apps/web (Next.js)    → Single Vercel project "gearup"
  src/app/api/*       → 31 Route Handlers (replaces Express)
  src/lib/*           → 10 shared helpers
  prisma/schema.prisma → 31 models, 17 enums
packages/types        → Kept (RBAC, domain types)
packages/ui           → Kept (shared components)
packages/tsconfig     → Created (shared TS configs)
```

**PR #4:** Complete restructure (merged)

**What was created:**
- `apps/web/prisma/schema.prisma` — cleaned schema, added `directUrl`, removed attachment models
- `apps/web/src/lib/prisma.ts` — singleton Prisma client
- `apps/web/src/lib/auth.ts` — JWT verify + requirePermission (Next.js headers-based)
- `apps/web/src/lib/errors.ts` — AppError classes + handleApiError()
- `apps/web/src/lib/constants.ts` — app constants
- `apps/web/src/lib/pagination.ts` — paginate() + paginationMeta()
- `apps/web/src/lib/id-generators.ts` — nanoid-based ID generators
- `apps/web/src/lib/activity-logger.ts` — logActivity() helper
- 31 Route Handler files under `apps/web/src/app/api/`
- Updated `package.json`, `next.config.mjs`, `turbo.json`, `.env.example`, `README.md`

**What was deleted:**
- `apps/api/` — entire Express backend (50+ files)
- `packages/db/` — old Prisma client package
- `packages/notifications/` — unused notification package

**Vercel project changes:**
- Root directory: `apps/api` → `apps/web`
- Framework: Express → Next.js
- Added env var: `JWT_SECRET`

---

### Phase 3: Environment & Database Setup (15:06 - 15:30)

**JWT Secret generated:**
```
nj00pWGvzRB3NZQfoo0QAmyYMUGYkDmgpGtp1vRYUz8=
```

**Supabase credentials (final/correct):**
```
Project ID: ecljtctilsvvvwxuzxfy
URL: https://ecljtctilsvvvwxuzxfy.supabase.co
Publishable Key: sb_publishable_VVb4jURExQqUS7Ri9_8oIw_s49kvW2Y
DATABASE_URL: postgresql://postgres.ecljtctilsvvvwxuzxfy:behx5ksOTNG55hef@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
DIRECT_URL: (same as DATABASE_URL)
```

**Note:** Initially used a different Supabase project (`nitdgdavawiaxxeploio`) — tables were pushed there but Vercel pointed to `ecljtctilsvvvwxuzxfy`. Fixed by re-running `prisma db push` and seed against the correct database.

**Connection pool issue:** Supabase free tier has 15 connection limit. Prisma defaults to multiple connections per instance. Fix: add `?connection_limit=1` to DATABASE_URL in Vercel.

---

### Phase 4: Data Seeding (15:53 - 16:10)

**Admin user seeded:**
```
Username: admin
Password: admin123
Role: SUPER_ADMIN (all 33 permissions)
```

**Dummy data seeded (5 complete workflows):**

| Workflow | Customer | Vehicle | Status |
|----------|----------|---------|--------|
| 1 | Rahul Sharma | Maruti Swift | ✅ Complete (SR → Apt → JC → Invoice → Payment = PAID ₹3,186) |
| 2 | Priya Patel | Hyundai Creta | 🔄 In Progress (SR → Apt → JC = WORK_IN_PROGRESS) |
| 3 | Amit Kumar | Tata Nexon | ⏳ Pending (SR submitted, awaiting appointment) |
| 4 | Sneha Reddy | Kia Seltos | 💰 Unpaid (JC → Invoice = UNPAID ₹1,770) |
| 5 | Vikram Singh | RE Classic 350 | 💰 Partially Paid (JC → Invoice → ₹3,000 of ₹5,900) |

**Additional data:**
- 5 customers, 5 vehicles, 3 workers (Raju, Suresh, Mohan)
- 3 inventory items (Engine Oil, Air Filter, Brake Pads)
- 2 inventory categories, 3 expense categories
- 5 expenses (Rent ₹25K, Electricity ₹5K, Tools, Internet)
- 6 appointment slot rules (Mon-Sat, 9AM-6PM, 30min slots)
- 2 holidays (Good Friday, May Day)
- 1 worker leave (Mohan - sick leave)
- 3 notifications (DELIVERED, SENT, FAILED)
- 3 notification templates
- 11 settings (business info, invoice config, notification toggles)
- 2 stock movements (STOCK_IN, CONSUMED)

**Settings fixed:** Values were stored as `"\"string\""` (double-escaped JSON). Re-upserted with proper values.

---

### Phase 5: Testing & Audits (15:55 - 16:30)

**E2E Test Suite (Playwright):** 91 tests, 90 passed, 1 failed (test bug)

| Section | Tests | Pass |
|---------|-------|------|
| Public Pages (4) | 4 | 4 |
| Public API (4) | 4 | 4 |
| Authentication (5) | 5 | 5 |
| Admin Page Navigation (34) | 34 | 34 |
| Customers CRUD (7) | 7 | 7 |
| Vehicles CRUD (4) | 4 | 4 |
| Workers CRUD (5) | 5 | 5 |
| Appointments CRUD (4) | 4 | 4 |
| Job Cards CRUD (4) | 4 | 4 |
| Invoices CRUD (3) | 3 | 3 |
| Expenses CRUD (4) | 4 | 4 |
| Remaining Modules (13) | 13 | 12 |

**Data Persistence Audit:** 34/34 passed — all CRUD operations persist to Supabase.

**External User Flow Audit:** 26/26 passed — public submission, tracking, slot availability all work.

**Admin Database Persistence Audit:** 34/34 passed — create, read, update, delete, re-read all verified.

**Performance Profile:**
- Page TTFB: 76-168ms (all green)
- API response: 900-1800ms (cross-region DB latency)
- Total JS bundle: 461KB
- CSS: 20.4KB

**Production data (final counts):**
- 241 total rows across 27/28 tables
- 139+ activity logs auto-generated
- Only `Supplier` table empty (no suppliers added)

---

### Phase 6: Bug Fixes & Features (18:23 - 19:50)

**Dashboard stuck at loading:**
- Root cause: calling `/admin/reports/dashboard` (page route) instead of `/admin/reports?type=dashboard` (API)
- Fixed: one-line path change

**Dashboard redesign:**
- Clickable KPI cards (navigate to relevant pages)
- Quick Actions panel (New Customer, Appointment, Job Card, Invoice)
- Summary stats (Total Customers, Vehicles, Workers)
- Recent Activity feed (last 8 logs, clickable)
- Skeleton loading UI

**Login requires two attempts:**
- Root cause: `login()` called `fetchMe()` without awaiting, then `router.push()` fired immediately
- Dashboard loaded with `user: null`, bounced back to login
- Fixed: made `login()` async, `await fetchMe()` before navigating

**Invoice workflow features added:**
- `POST /api/admin/invoices/[id]/finalize` — sets FINALIZED status
- `POST /api/admin/invoices/[id]/payments` — records payment, auto-updates amounts
- `GET /api/admin/invoices/[id]/pdf` — generates print-ready HTML invoice
- Invoice detail page rebuilt with Finalize button, Record Payment form, Download PDF

**PDF download fix:** `window.open()` doesn't send auth headers. Fixed with `window.fetch()` + `document.write()` + auto `print()`.

**Breadcrumbs:** Auto-generated from URL path on all admin pages with back button.

**Skeleton loading:** Admin layout and dashboard show animated skeletons while loading.

**Vercel region:** Added `vercel.json` with `regions: ["hnd1"]` to move functions to Tokyo.

**setup.sh:** First-time project setup script (prerequisite check → .env → install → prisma → seed).

---

### Phase 7: Security Fixes (20:06 - 20:12)

**3 Critical vulnerabilities fixed:**

1. **Invoice PATCH mass-assignment** — added `.strict()` Zod schema. Only `notes`, `dueDate`, `discountType`, `discountValue` editable. `grandTotal`, `amountPaid`, `paymentStatus` can no longer be overwritten.

2. **Debug route deleted** — `api/debug/route.ts` was exposing admin user data without auth.

3. **Demo mode removed** — `localStorage('gearup_demo')` bypass removed from `auth-context.tsx` and `login/page.tsx`. No more hardcoded `superadmin` fallback.

**8 Bug/edge case fixes:**

4. **Invoice finalize guard** — only DRAFT → FINALIZED allowed
5. **Payment recording guard** — only against FINALIZED invoices, prevents overpayment
6. **Job card permissions** — added `requireAnyPermission()` (OR logic) for CREATE|VIEW_OWN
7. **Settings key allowlist** — only `business.*`, `invoice.*`, `notification.*`, `integration.*` prefixes
8. **Available-slots timezone** — UTC-consistent date parsing
9. **Public SR slot duration** — reads from AppointmentSlotRule instead of hardcoded 30min
10. **Auth helper** — added `requireAnyPermission()` for OR-based permission checks

**Best practice improvements:**

11. **Next.js config** — migrated deprecated `experimental.serverComponentsExternalPackages` → `serverExternalPackages`
12. **Activity logging** — fire-and-forget (removed `await` from 23 route handlers)
13. **CORS headers** — added for all API routes via middleware
14. **Rate limiting** — login: 10/min, public POST: 30/min per IP
15. **Middleware** — handles OPTIONS preflight, rate limiting, CORS

---

## Current State

### Repository
- **Branch:** `arnab-dev` (ahead of main with all fixes)
- **PR #8:** Open — contains all Phase 6-7 changes, rebased on main, conflict-free
- **Main:** Has Phase 1-5 changes merged

### Vercel
- **Project:** gearup (single project)
- **Root:** apps/web
- **Framework:** Next.js
- **Domain:** gearup.sgnk.ai
- **Region:** iad1 (will change to hnd1 after PR merge + deploy)
- **Deploy limit:** Hit 100/24h limit — resets ~14:00 IST April 20

### Database (Supabase)
- **Project:** ecljtctilsvvvwxuzxfy
- **Region:** ap-northeast-1 (Tokyo)
- **Tables:** 31 (27 with data)
- **Total rows:** 241+
- **Connection limit:** Need `?connection_limit=1` on DATABASE_URL

### Admin Credentials
```
URL: https://gearup.sgnk.ai/admin/login
Username: admin
Password: admin123
```

### Known Issues
| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | API response times 900ms+ | 🔴 | Fix: merge PR #8 (Tokyo region) |
| 2 | Admin password is admin123 | 🔴 | Change via /api/admin/auth/change-password |
| 3 | Connection pool exhaustion | 🟡 | Fix: add ?connection_limit=1 to DATABASE_URL |
| 4 | Build warnings (DYNAMIC_SERVER_USAGE) | 🟢 | Cosmetic — add `export const dynamic = 'force-dynamic'` |
| 5 | `as any` casts in Prisma calls | 🟢 | Low risk with Zod validation |
| 6 | JWT contains full permissions array | 🟢 | Works at current scale |
| 7 | Vercel deploy limit hit (100/24h) | 🟡 | Resets April 20 ~14:00 IST |

### Files Created/Modified This Session

**New files (apps/web/src/):**
- `app/api/admin/invoices/[id]/finalize/route.ts`
- `app/api/admin/invoices/[id]/payments/route.ts`
- `app/api/admin/invoices/[id]/pdf/route.ts`
- `components/shared/breadcrumbs.tsx`
- `components/shared/skeletons.tsx`

**Major rewrites:**
- `app/admin/dashboard/page.tsx` — full redesign
- `app/admin/invoices/[id]/page.tsx` — full rebuild with actions
- `app/admin/layout.tsx` — skeleton loading + breadcrumbs
- `lib/auth/auth-context.tsx` — removed demo mode, async login
- `lib/auth.ts` — added requireAnyPermission()
- `lib/activity-logger.ts` — fire-and-forget
- `middleware.ts` — CORS + rate limiting

**Root files:**
- `apps/web/vercel.json` — Tokyo region
- `apps/web/playwright.config.ts` — test config
- `apps/web/e2e/admin-e2e.spec.ts` — 91 E2E tests
- `setup.sh` — first-time setup script

**Documentation:**
- `docs/CODEBASE_CONTEXT.md` — 598 lines, ultra-detailed
- `docs/WORKFLOW_DETAILS.md` — CRUD vs dependent workflows
- `docs/TESTING_CHECKLIST.md` — 200+ checkpoints
- `docs/E2E_TESTING_REPORT.md` — Playwright test report

### API Endpoints (31 total)

**Public (no auth):**
- `GET /api/health`
- `POST /api/public/service-requests`
- `GET /api/public/available-slots?date=`
- `POST /api/public/track`

**Auth:**
- `POST /api/admin/auth/login`
- `GET /api/admin/auth/me`
- `POST /api/admin/auth/change-password`

**Admin CRUD (24):**
- Customers: GET, POST, GET/:id, PATCH/:id, GET/:id/history
- Vehicles: GET, POST, GET/:id, PATCH/:id
- Workers: GET, POST, GET/:id, PATCH/:id
- Appointments: GET, POST, GET/:id, PATCH/:id
- Job Cards: GET, POST, GET/:id, PATCH/:id
- Inventory Items: GET, POST
- Invoices: GET, POST, GET/:id, PATCH/:id, POST/:id/finalize, POST/:id/payments, GET/:id/pdf
- Payments: GET
- Expenses: GET, POST, GET/:id, DELETE/:id
- Service Requests: GET, GET/:id, PATCH/:id
- Notifications: GET
- Settings: GET, PATCH
- Reports: GET?type=dashboard|revenue|jobs
- Logs: GET
