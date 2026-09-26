---
mode: navigational-index
updated: 2026-09-20
verified_against: bb1ba1ca8fa20d3c0fac2cb9b5cecf5803aea88f
---

# MAP. Where everything lives in gearup.

A new developer opens this file first. Every entry is a pointer plus one sentence. If a fact needs more than that, follow the pointer.

## Method

Every path listed here was verified against HEAD `bb1ba1c` on 2026-09-20 with `find`, `ls`, and `wc -l`. Counts (routes, models, pages, tests) come from `find | wc -l`, not memory. Numbers are re-derived at read time by running the same commands, since the tree drifts faster than the doc.

## Did NOT do

- No em-dashes (period, comma, brackets only).
- No destructive command was run: no commit, no push, no `rm -rf`, no `db:push`, no `db:migrate`, no vercel action, no `pnpm install`, no seed script.
- No file besides this one was written.
- The eight `docs/*.md` docs listed in section 8 are described from their titles and their first ten lines only; their full content is out of scope for a map.
- `apps/api/` is a stub (only `dist/` and `node_modules/`). Backend lives inside `apps/web/src/app/api/`, per README.
- `packages/db/` and `packages/notifications/` have no source under version control (only `node_modules/`); they are name-reserved workspaces, not implementations.

## The rule

> If the answer fits in a section header of this file, read the file it points at. If it needs half a page, read that file directly. Do not read `docs/audit/**` unless investigating a specific June-2026 incident.

## 1. Repo layout (top two levels)

```
gearup/
  AGENTS.md                        one-line SGNK block, no content
  README.md                        stack + how to run
  InstructionPrompt.md             legacy build-out spec (2026-04)
  package.json                     root workspace scripts (turbo, husky)
  pnpm-workspace.yaml              apps/* + packages/*
  turbo.json                       turbo pipeline: build, lint, test, dev
  setup.sh, start.sh               bootstrap and dev launcher
  apps/
    web/                           the Next.js 14 app (frontend + API), see §2
    api/                           stub; only dist/, no source. Not used
  packages/
    types/                         shared TS types, RBAC permission keys
    ui/                            shared UI components (thin)
    config/                        eslint, prettier, tsconfig presets
    tsconfig/                      root tsconfig fragments (nextjs, node)
    db/                            reserved workspace, no source
    notifications/                 reserved workspace, no source
  prisma-adjacent (all under apps/web/prisma/, see §5)
  scripts/                         DB backup, splice, HSN seed, tz check
  docs/                            architecture, deployment, testing, audits
  backups/                         58 pg_dump snapshots (2026-06 to 2026-07)
  Gearup-Data-Reconstruction-WA-Images/   incident evidence, 2026-06-11
  .github/workflows/               ci.yml, db-backup.yml
  .husky/                          pre-commit and commit-msg hooks
  graphify-out/                    knowledge-graph output (auto)
```

## 2. The app (`apps/web/`)

Verified with `find`.

| Surface | Count | Root |
|---|---|---|
| API route handlers | 83 `route.ts` files | `apps/web/src/app/api/` |
| Admin UI pages | 57 `page.tsx` files | `apps/web/src/app/admin/` |
| Public UI pages | 5 `page.tsx` files | `apps/web/src/app/(public)/` |
| Prisma models | 42 | `apps/web/prisma/schema.prisma` (1060 lines) |
| Unit tests (Vitest) | 10 files | `apps/web/src/__tests__/` |
| Integration tests (Vitest) | 22 `.itest.ts` files | `apps/web/test/integration/` |
| E2E tests (Playwright) | 4 `.spec.ts` files | `apps/web/e2e/` |
| Component files | 18 `.tsx` files | `apps/web/src/components/` |

### `apps/web/src/app/` UI tree

```
app/
  layout.tsx                       root layout
  (public)/                        marketing + service-request funnel
    layout.tsx
    page.tsx                       landing
    book-service/                  service-request submission
    contact/
    estimate/                      shareable estimate view
    track/                         customer-facing job tracker
  admin/                           protected admin surface, see routes below
    layout.tsx  page.tsx  admin-shell.tsx
    login/                         admin login screen
    dashboard/  calendar/          overview + FullCalendar view
    customers/  vehicles/          CRM
    appointments/  service-requests/  intake pipeline
    job-cards/                     shop-floor work
    inventory/                     items, batches, movements
    invoices/  payments/           billing + collections
    estimates/                     estimate builder + convert
    expenses/                      operating spend
    amc/                           annual maintenance contracts
    salary-slips/                  worker payroll
    workers/                       staff + leave
    reports/                       revenue, jobs, inventory, expenses
    logs/                          activity log viewer
    notifications/                 template + delivery viewer
    settings/                      admins, roles, business hours, holidays
  amc/                             standalone AMC landing (public)
  location/                        static location page
  api/                             route handlers, see §3
```

### `apps/web/src/lib/` (helpers)

Files: `prisma.ts`, `auth.ts`, `jwt-secret.ts`, `errors.ts`, `activity-logger.ts`, `id-generators.ts`, `time.ts`, `date-boundaries.ts`, `hsn-rate.ts`, `invoice-calc.ts`, `salary-slip-template.ts`, `estimate-token.ts`, `pagination.ts`, `constants.ts`, `format-reg.ts`, `title-case.ts`, `brand-logos.ts`, `clipboard.ts`.

Subdirs: `api/` (client fetch wrapper), `auth/` (React auth-context), `theme/` (theme-context), `sentry/` (client helpers), `invoice-templates/` (7 renderers), `reports/` (date-presets + income + parts-profit, each with `.test.ts`), `validators/` (password), `utils/` (empty).

### `apps/web/prisma/`

`schema.prisma`, `seed.ts`, `migrate-batch-selling-price.ts`, `migrate-stock-batches.ts`. No `migrations/` dir; the project uses `prisma db push` (see §5).

### `apps/web/src/components/` (18 files)

Buckets: `shared/` (breadcrumbs, customer-picker, list-body, list-toolbar, modal, pagination, process-loader, searchable-select, skeletons, theme-toggle, vehicle-reg-lookup, whatsapp-button), `inventory/` (edit-modal, inventory-item-form, model-picker), `layout/admin-sidebar.tsx`, `public/landing-experience.tsx`, `dashboard/inventory-dashboard.tsx`. Directories `admin/`, `tables/`, `forms/`, `charts/` exist but are empty at HEAD.

### `apps/web/src/hooks/`

Empty (only `.gitkeep`). Hooks live inline in the pages/components that need them.

### `apps/web/src/middleware.ts`

Best-effort in-memory rate limiter, per-account login-attempt throttle, security-header injection. See file header for the Upstash/KV migration TODO.

### `apps/web/src/__tests__/`

`new-features.test.ts`, `pagination.test.ts`, `date-boundaries.test.ts`, and `unit/` (id-generators, errors, format-reg, invoice-calc, estimate-token, pagination, gst-hsn).

## 3. Domain modules

For each product area: API route dir, UI page dir, Prisma models involved, key lib helper. Every path exists at HEAD `bb1ba1c`.

### 3.1 Customers, vehicles, appointments, service-requests

| Area | API | UI | Prisma models | Lib helpers |
|---|---|---|---|---|
| Customers | `api/admin/customers/{route,[id]/route,[id]/history/route}.ts` | `admin/customers/` | `Customer` | `id-generators.ts`, `format-reg.ts` |
| Vehicles | `api/admin/vehicles/{route,[id]/route}.ts` | `admin/vehicles/` | `Vehicle`, `VehicleBrand`, `VehicleModel` | `format-reg.ts`, `title-case.ts` |
| Appointments | `api/admin/appointments/{route,[id]/route}.ts` | `admin/appointments/`, `admin/calendar/` | `Appointment`, `AppointmentSlotRule`, `BlockedSlot`, `Holiday` | `time.ts`, `date-boundaries.ts` |
| Service requests | `api/admin/service-requests/{route,[id]/route}.ts` plus `api/public/service-requests/route.ts`, `api/public/customer-lookup/route.ts`, `api/public/available-slots/route.ts`, `api/public/track/route.ts` | `admin/service-requests/`, `(public)/book-service/`, `(public)/track/` | `ServiceRequest` | `estimate-token.ts` |

### 3.2 Shop floor and billing

| Area | API | UI | Prisma models | Lib helpers |
|---|---|---|---|---|
| Job cards | `api/admin/job-cards/{route,[id]/route,[id]/tasks/route,[id]/parts/route,[id]/workers/route}.ts` | `admin/job-cards/` | `JobCard`, `JobCardTask`, `JobCardPart`, `WorkerAssignment` | `id-generators.ts`, `activity-logger.ts` |
| Invoices | `api/admin/invoices/{route,[id]/route,[id]/line-items/route,[id]/finalize/route,[id]/payments/route,[id]/pdf/route}.ts` | `admin/invoices/` | `Invoice`, `InvoiceLineItem`, `Payment`, `DocumentSequence`, `HsnRate` | `invoice-calc.ts`, `hsn-rate.ts`, `invoice-templates/` (tax, amc, combined, mechanic-copy, customer-draft) |
| Payments | `api/admin/payments/route.ts` | inline under invoices UI | `Payment` | `invoice-calc.ts` |
| Estimates | `api/admin/estimates/{route,[id]/route,[id]/convert/route}.ts` plus `api/public/estimate/route.ts` | `admin/estimates/`, `(public)/estimate/` | `Estimate`, `EstimateItem` | `estimate-token.ts` |

### 3.3 Inventory and stock

| Area | API | UI | Prisma models | Lib helpers |
|---|---|---|---|---|
| Inventory items | `api/admin/inventory/items/{route,[id]/route,[id]/stock/route,[id]/batches/route,[id]/hard-delete/route}.ts` | `admin/inventory/` | `InventoryItem`, `InventoryItemModel`, `InventoryCategory` | `hsn-rate.ts` |
| Categories | `api/admin/inventory/categories/{route,[id]/route}.ts` | inside inventory UI | `InventoryCategory` | none |
| Suppliers | `api/admin/inventory/suppliers/{route,[id]/route}.ts` | inside inventory UI | `Supplier` | none |
| Stock batches / movements | `api/admin/inventory/items/[id]/batches/route.ts`, `api/admin/inventory/movements/route.ts`, `api/admin/inventory/low-stock/route.ts` | inventory UI | `StockBatch`, `StockMovement` | `prisma/migrate-batch-selling-price.ts`, `prisma/migrate-stock-batches.ts` |
| Catalog (brand/model picker) | `api/admin/inventory/catalog/{route,models/route}.ts` | `components/inventory/model-picker.tsx` | `VehicleBrand`, `VehicleModel`, `InventoryItemModel` | `brand-logos.ts` |

### 3.4 AMC, expenses, salary, HSN

| Area | API | UI | Prisma models | Lib helpers |
|---|---|---|---|---|
| AMC | `api/admin/amc/plans/{route,[id]/route}.ts`, `api/admin/amc/contracts/{route,[id]/route,[id]/usages/route,[id]/usages/[usageId]/route}.ts` | `admin/amc/`, `app/amc/` | `AmcPlan`, `AmcContract`, `AmcServiceUsage` | `invoice-templates/amc-invoice.ts` |
| Expenses | `api/admin/expenses/{route,[id]/route,categories/route,categories/[id]/route}.ts` | `admin/expenses/` | `Expense`, `ExpenseCategory` | none |
| Salary slips | `api/admin/salary-slips/{route,[id]/route,[id]/pdf/route}.ts` | `admin/salary-slips/` | (uses `Worker`, `WorkerLeave`) | `salary-slip-template.ts` |
| HSN | `api/admin/hsn-rates/route.ts` | inside inventory + settings UI | `HsnRate` | `hsn-rate.ts` |

### 3.5 Notifications, logs, permissions, auth, reports

| Area | API | UI | Prisma models | Lib helpers |
|---|---|---|---|---|
| Notifications | `api/admin/notifications/{route,templates/route}.ts` | `admin/notifications/` | `Notification`, `NotificationTemplate` | none in `lib/`; delivery adapters absent at HEAD |
| Activity log | `api/admin/logs/{route,export/route}.ts` | `admin/logs/` | `ActivityLog` | `activity-logger.ts` |
| Permissions and roles | `api/admin/settings/roles/{route,[id]/route}.ts` | `admin/settings/` | `Role`, `Permission`, `RolePermission`, `AdminUserRole` | `packages/types/src/auth.ts` (permission keys) |
| Auth | `api/admin/auth/{login,logout,me,change-password}/route.ts` | `admin/login/` | `AdminUser` | `auth.ts`, `jwt-secret.ts`, `lib/auth/auth-context.tsx`, `validators/password.ts` |
| Reports | `api/admin/reports/{route,revenue/route,jobs/route,appointments/route,inventory/route,expenses/route,workers/route}.ts` | `admin/reports/` | derived from all above | `lib/reports/{date-presets,income-breakdown,parts-profit}.ts` |
| Settings | `api/admin/settings/{route,admins/route,business-hours/route,holidays/route,export/route,roles/route,roles/[id]/route}.ts` | `admin/settings/` | `Setting`, `AdminUser`, `Role`, `Holiday`, `AppointmentSlotRule` | none |

## 4. Cross-cutting infrastructure

| Concern | Where |
|---|---|
| Prisma client singleton + Supabase pool tuning | `apps/web/src/lib/prisma.ts` (pgbouncer, `connection_limit`, `pool_timeout` set for `pooler.supabase.com`) |
| Route middleware (rate limit, security headers) | `apps/web/src/middleware.ts` |
| JWT auth + role checks | `apps/web/src/lib/auth.ts`, `apps/web/src/lib/jwt-secret.ts`, `packages/types/src/auth.ts` |
| Permission keys and role types | `packages/types/src/auth.ts` |
| Activity logger (supports Prisma tx) | `apps/web/src/lib/activity-logger.ts` |
| ID generators (nanoid + sequential + IST-dated) | `apps/web/src/lib/id-generators.ts` |
| IST time helpers | `apps/web/src/lib/time.ts`, `apps/web/src/lib/date-boundaries.ts` |
| HSN rate cache / defaults | `apps/web/src/lib/hsn-rate.ts` |
| Error taxonomy + Next.js response helper | `apps/web/src/lib/errors.ts` |
| Invoice arithmetic (GST, discounts) | `apps/web/src/lib/invoice-calc.ts` |
| Invoice PDF templates | `apps/web/src/lib/invoice-templates/` (7 files); route: `api/admin/invoices/[id]/pdf/route.ts` |
| Salary slip PDF template | `apps/web/src/lib/salary-slip-template.ts`; route: `api/admin/salary-slips/[id]/pdf/route.ts` |
| Sentry (Next.js integration) | `apps/web/sentry.{client,server,edge}.config.ts`, `apps/web/src/lib/sentry/` |
| Pagination shape | `apps/web/src/lib/pagination.ts` |
| Estimate share token | `apps/web/src/lib/estimate-token.ts` |
| WhatsApp button (client-side link only) | `apps/web/src/components/shared/whatsapp-button.tsx` |
| WhatsApp / email delivery pipeline | **Not implemented at HEAD.** `.env.example` reserves `WHATSAPP_*` and `EMAIL_*` vars; no sender file in `lib/`. `NotificationTemplate` and `Notification` models exist but the outbound adapter is absent. `packages/notifications/` is an empty workspace slot. |

## 5. Data layer

| Item | Path |
|---|---|
| Schema (42 models, 1060 lines) | `apps/web/prisma/schema.prisma` |
| Seed | `apps/web/prisma/seed.ts` (run via `pnpm --filter web db:seed`) |
| One-off data migrations | `apps/web/prisma/migrate-batch-selling-price.ts`, `apps/web/prisma/migrate-stock-batches.ts` |
| Migration history | **None.** No `apps/web/prisma/migrations/` dir. Schema is pushed with `prisma db push` (see `package.json` scripts `db:push`, `db:generate`, `db:migrate`) |
| Backup script (local, launchd) | `scripts/db-backup.sh`, `scripts/db-backup-launchd.sh`, `scripts/db-backup-launchd-wrapper.sh` |
| Backup workflow (Actions, daily 02:00 UTC) | `.github/workflows/db-backup.yml` |
| Backup artefacts | `backups/` (58 `*.sql` / `*.sql.gz` files, oldest 2026-06-11, most recent 2026-07-*) |
| Restore runbook | `docs/RESTORE.md` |
| Splice / recovery SQL | `scripts/splice-after-restore.sql`, `scripts/fix-data-quality.sql`, `scripts/fix-line-items-v2.sql`, `scripts/build-splice-sql.py` |
| HSN seed | `scripts/add-hsn-code.sql` |
| Timezone sanity check | `scripts/check-tz.sh` |

## 6. Test surfaces

| Kind | Count | Root | Config |
|---|---|---|---|
| Vitest unit | 10 files | `apps/web/src/__tests__/` (7 under `unit/`) | `apps/web/vitest.config.ts` |
| Vitest integration | 22 files (`*.itest.ts`) | `apps/web/test/integration/` | `apps/web/vitest.integration.config.ts` |
| Playwright E2E | 4 specs (`admin-e2e`, `features-e2e`, `role-access`, `ui-smoke`) | `apps/web/e2e/` | `apps/web/playwright.config.ts` |
| Integration harness | ephemeral Postgres, seeded per suite | `apps/web/test/integration/global-setup.ts`, `helpers.ts`, `setup.ts` | see `TEST_DATABASE_URL` in `.github/workflows/ci.yml` |
| Reports lib tests | 3 co-located `*.test.ts` under `apps/web/src/lib/reports/` | inline | `vitest.config.ts` |

Run: `pnpm --filter web test:run` (unit), `pnpm --filter web test:int` (integration), `pnpm --filter web test:e2e` (Playwright).

## 7. Ops surfaces

| Concern | Path / detail |
|---|---|
| Vercel config | `apps/web/vercel.json`: region `hnd1`, `app/api/**/*.ts` maxDuration 30s |
| CI | `.github/workflows/ci.yml`: Postgres 17 service, `pnpm install --frozen-lockfile`, runs lint/tests |
| Scheduled DB backup | `.github/workflows/db-backup.yml`: cron `0 2 * * *` UTC, 3 storage tiers (Actions artifact 90d, `db-backups` orphan branch, local launchd) |
| Local launchd backup | `scripts/db-backup-launchd.sh` and wrapper (see LR#1 for TCC caveats) |
| Sentry | `apps/web/sentry.{client,server,edge}.config.ts`; DSN via `NEXT_PUBLIC_SENTRY_DSN` |
| Analytics / speed | `@vercel/analytics` and `@vercel/speed-insights` deps in `apps/web/package.json` |
| Git hooks | `.husky/` (pre-commit, commit-msg) |
| Env var groups | see `docs/env.md`: `NEXT_PUBLIC_*` (frontend), `DATABASE_URL` / `DIRECT_URL`, `JWT_SECRET` / `SESSION_SECRET`, `SUPABASE_*`, `WHATSAPP_*` (unwired), `EMAIL_*` (unwired), `CRON_ENABLED`, `OWNER_SUMMARY_EMAIL`, `APP_BASE_URL`, `PUBLIC_TRACK_URL_BASE` |
| Root scripts | `setup.sh`, `start.sh`, `turbo.json` (build, lint, test, dev) |
| No cron jobs in the app itself | `CRON_ENABLED` env is defined in `env.md` but no `vercel.json crons`, no `apps/web/src/app/api/cron/*` |

## 8. Existing docs cross-reference

Every `.md` under `docs/` at HEAD, one line each.

| File | What it is |
|---|---|
| `docs/architecture.md` | System architecture: services, data flow, deploy topology |
| `docs/deployment.md` | How to deploy to Vercel + Supabase, env checklist |
| `docs/env.md` | Every environment variable, required flag, description |
| `docs/rbac.md` | Roles, permission keys, matrix per module |
| `docs/notifications.md` | Notification templates + delivery plan (delivery unwired) |
| `docs/CALENDAR_RESEARCH.md` | Research notes for the FullCalendar picker |
| `docs/CODEBASE_CONTEXT.md` | Prose overview of the codebase for onboarding |
| `docs/WORKFLOW_DETAILS.md` | End-to-end user workflows across modules |
| `docs/timezone_plan.md` | IST handling plan (informs `lib/time.ts`) |
| `docs/handoff.md` | Post-build handoff steps (repo, deploy, DB) |
| `docs/qa-matrix.md` | QA test matrix by module |
| `docs/TEST_PLAN.md` | Manual test plan |
| `docs/TESTING_CHECKLIST.md` | Pre-release checklist |
| `docs/E2E_TESTING_REPORT.md` | Prior Playwright run report |
| `docs/RESTORE.md` | Restore runbook (pair with §5) |
| `docs/api-contracts.json` | Snapshot of admin API contracts (JSON) |
| `docs/amc-invoice-mockup.html`, `docs/amc-invoice-pdf-mockup.html`, `docs/combined-copy-mockup.html` | Static HTML mockups for invoice PDF work |
| `docs/requirements/voice-notes-2026-06-16.md` | Voice-note requirements dump |
| `docs/audit/2026-06-10/` | Data-loss incident audit (see LR memory `gearup-data-loss-incident-2026-06-10`); files: `EXECUTIVE_SUMMARY.md`, `FIX_PLAN.md`, `ISSUES.md`, `MAPS.md`, `PLAN.md`, `POST_RESTORE_PLAN.md`, `RECONSTRUCTION_PLAN.md`, `RECOVERY_REPORT.md`, `db-backups/`, `maps/`, `modules/` |
| `docs/audit/2026-06-12/E2E_AUDIT_REPORT.md` | Post-incident E2E audit |

Repo-root context files:

| File | What it is |
|---|---|
| `README.md` | Stack, `pnpm install`, API auth example, project structure |
| `AGENTS.md` | One-line SGNK snapshot pointer; no editorial content |
| `InstructionPrompt.md` | Original 2026-04 build spec (superseded by `docs/architecture.md` + `docs/CODEBASE_CONTEXT.md`) |
| `test plan.md` (root) | Stub, 133 bytes; use `docs/TEST_PLAN.md` |

## The four rules that override everything (workspace-scoped)

1. Every factual claim about this repo goes through `find` / `ls` / `git`, not memory (RULE 1).
2. No destructive command runs without per-op user approval (RULE 2). This map ships without one.
3. Every count in this file is re-derivable at read time; the commands are inline in §2.
4. When a section here disagrees with the code, the code is right. Fix the section.
