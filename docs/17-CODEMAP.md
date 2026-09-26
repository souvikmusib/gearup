---
mode: reference
updated: 2026-09-20
verified_against: bb1ba1c
---

# CODEMAP

> **This describes the code, not the plan.** Verified on 2026-09-20 against `bb1ba1c` (branch `docs/gearup-ai-os-map`). The scope of this map is `apps/web/src/`. The Prisma schema lives one directory up at `apps/web/prisma/schema.prisma` and is summarised in §8.

> **Method.** Generated from a real listing under `apps/web/src/`. `find apps/web/src -type f \( -name '*.ts' -o -name '*.tsx' \) | sort` gives the 216 files, `wc -l` gives every line count, `find apps/web/src -type d | sort` gives the tree, and `grep -E "^export (async )?(function|const) (GET|POST|PUT|PATCH|DELETE)|requirePermission\(" <route>` on every `route.ts` gives the HTTP verbs and the RBAC key. For `lib/*` I read the top 8 lines and all `export` lines. Prisma model field counts come from an awk pass over `schema.prisma`.

> **What this pass did NOT do.** I did not read the body of every page or component; the one-liners are inferred from path position, exports, and (where the file has a top doc comment) that comment. I did not verify that every referenced `PERMISSIONS.*` key resolves, only that the call is present. I did not compare route handlers against the `types` package. Files whose export names or paths mislead about their purpose will be described wrongly here.

## 1. Shape

216 TypeScript files, 25,619 lines, under six top-level areas, counted on 2026-09-20 against `bb1ba1c`. All source is TypeScript (`.ts`) or TypeScript React (`.tsx`); there is no plain JavaScript under `apps/web/src/`.

| Area | Files | Lines | What it is |
|---|---|---|---|
| `src/app/` | 151 | 18,820 | Next.js App Router: 64 pages, 83 API route handlers, 4 shells and layouts |
| `src/lib/` | 35 | 3,216 | Server and client libraries: auth, prisma, invoice templates, report calculators |
| `src/components/` | 18 | 2,403 | Cross-page UI: shared table controls, forms, sidebar, landing experience |
| `src/__tests__/` | 10 | 941 | Vitest unit tests for lib and cross-cutting helpers |
| `src/middleware.ts` | 1 | 227 | Edge middleware: per-account login throttle plus security headers |
| `src/providers/` | 1 | 12 | Root client-side provider tree |

The `src/hooks/` and `src/types/` directories exist but carry only a `.gitkeep`; the shared types live in the workspace package `@gearup/types` and shared UI primitives in `@gearup/ui`, both consumed via aliases. `src/styles/` holds only `globals.css`, which is not counted in the 216.

Files import via three paths: `@/…` for anything under `apps/web/src/`, `@gearup/types` for the shared TypeScript types, and `@gearup/ui` for the shared React primitives.

## 2. Directory tree

```
apps/web/src/
├── __tests__/                      Vitest suites (unit/ + top-level cross-cutting)
├── app/                            Next.js App Router
│   ├── (public)/                   marketing + customer-facing routes (book, track, estimate)
│   ├── admin/                      staff console (RBAC-gated)
│   ├── amc/                        AMC members landing page
│   ├── api/                        83 route handlers
│   │   ├── admin/                  RBAC-gated JSON API
│   │   ├── public/                 customer-facing endpoints (booking, tracking, estimate)
│   │   └── health/                 liveness probe
│   ├── location/                   redirect to Google Maps
│   └── layout.tsx                  root html + Providers + Vercel Analytics
├── components/
│   ├── dashboard/                  inventory summary card for the admin dashboard
│   ├── inventory/                  item edit modal, item form, model picker
│   ├── layout/                     admin sidebar
│   ├── public/                     landing experience
│   └── shared/                     breadcrumbs, list toolbar, modal, pagination, skeletons, etc.
├── hooks/                          .gitkeep only
├── lib/                            libraries (see §6)
│   ├── api/                        the SWR-lite fetch client
│   ├── auth/                       React auth context
│   ├── invoice-templates/          HTML for the five invoice styles
│   ├── reports/                    pure aggregators for revenue and parts profit
│   ├── sentry/                     empty
│   ├── theme/                      light/dark context
│   ├── utils/                      empty
│   └── validators/                 zod password policy
├── middleware.ts                   per-account throttle + security headers
├── providers/index.tsx             ThemeProvider(AuthProvider(children))
├── styles/globals.css              Tailwind entry point
└── types/                          .gitkeep only
```

## 3. API routes

83 route handlers under `apps/web/src/app/api/`, organised as `health` (1), `public/*` (5), and `admin/*` (77). Every admin handler gates on a `PERMISSIONS.*` key via `requirePermission()`; public handlers gate at the transport (token, phone lookup) instead.

### 3.1 Health and public (6)

| Path | Verbs | Auth | One line |
|---|---|---|---|
| `api/health/route.ts` | GET | none | Liveness probe. |
| `api/public/available-slots/route.ts` | GET | none | List bookable appointment slots for a given date and service. |
| `api/public/customer-lookup/route.ts` | GET | phone | Return the caller's vehicles and open service requests by phone. |
| `api/public/service-requests/route.ts` | POST | none | Book a service request from the public site. |
| `api/public/track/route.ts` | POST | reference lookup | Return job-card or invoice status by tracking reference. |
| `api/public/estimate/[token]/route.ts` | GET, POST | opaque token | Read a shared estimate by public token, and accept or reject it. |

### 3.2 Admin auth (4)

| Path | Verbs | Auth | One line |
|---|---|---|---|
| `api/admin/auth/login/route.ts` | POST | credentials | Password login: verifies against `AdminUser`, applies lockout, issues JWT cookie. |
| `api/admin/auth/logout/route.ts` | POST | session | Clear the `gearup_token` cookie. |
| `api/admin/auth/me/route.ts` | GET | session | Return the current admin's identity and permissions. |
| `api/admin/auth/change-password/route.ts` | POST | session | Change the current admin's password against the shared password policy. |

### 3.3 Customers, vehicles, workers, service requests (10)

| Path | Verbs | Permission | One line |
|---|---|---|---|
| `api/admin/customers/route.ts` | GET, POST | CUSTOMERS_VIEW / CUSTOMERS_EDIT | List and create customers. |
| `api/admin/customers/[id]/route.ts` | GET, PATCH, DELETE | CUSTOMERS_VIEW / CUSTOMERS_EDIT | Read, update, and soft-delete a customer. |
| `api/admin/customers/[id]/history/route.ts` | GET | CUSTOMERS_VIEW | Return the customer's job, invoice, and appointment history. |
| `api/admin/vehicles/route.ts` | GET, POST | VEHICLES_VIEW / VEHICLES_EDIT | List and create vehicles. |
| `api/admin/vehicles/[id]/route.ts` | GET, PATCH, DELETE | VEHICLES_VIEW / VEHICLES_EDIT | Read, update, and delete one vehicle. |
| `api/admin/workers/route.ts` | GET, POST | (open) / WORKERS_MANAGE | List workers, create a worker. |
| `api/admin/workers/[id]/route.ts` | GET, PATCH | WORKERS_MANAGE | Read and update one worker record. |
| `api/admin/workers/[id]/leave/route.ts` | POST, PATCH | WORKERS_MANAGE | Record and update a worker leave entry. |
| `api/admin/workers/calendar/route.ts` | GET | WORKERS_MANAGE | Return workers' availability calendar. |
| `api/admin/service-requests/route.ts` | GET | SERVICE_REQUESTS_VIEW | List inbound service requests. |
| `api/admin/service-requests/[id]/route.ts` | GET, PATCH | SERVICE_REQUESTS_VIEW / SERVICE_REQUESTS_EDIT | Read and update one service request. |

### 3.4 Appointments (2)

| Path | Verbs | Permission | One line |
|---|---|---|---|
| `api/admin/appointments/route.ts` | GET, POST | APPOINTMENTS_VIEW / APPOINTMENTS_CONFIRM | List and confirm appointments. |
| `api/admin/appointments/[id]/route.ts` | GET, PATCH | APPOINTMENTS_VIEW / APPOINTMENTS_CONFIRM | Read and update one appointment. |

### 3.5 Job cards (5)

| Path | Verbs | Permission | One line |
|---|---|---|---|
| `api/admin/job-cards/route.ts` | GET, POST | (open) / JOB_CARDS_CREATE | List and create job cards. |
| `api/admin/job-cards/[id]/route.ts` | GET, PATCH, DELETE | (open) / JOB_CARDS_UPDATE_STATUS / JOB_CARDS_DELETE | Read, change status, and delete one job card. |
| `api/admin/job-cards/[id]/tasks/route.ts` | POST, PATCH, DELETE | JOB_CARDS_CREATE | Add, update, and delete tasks on a job card. |
| `api/admin/job-cards/[id]/parts/route.ts` | POST, PATCH, DELETE | JOB_CARDS_CREATE | Add, update, and delete parts (with stock movements) on a job card. |
| `api/admin/job-cards/[id]/workers/route.ts` | POST, DELETE | JOB_CARDS_CREATE | Assign and unassign workers on a job card. |

### 3.6 Estimates (3)

| Path | Verbs | Permission | One line |
|---|---|---|---|
| `api/admin/estimates/route.ts` | GET, POST | INVOICES_VIEW / INVOICES_CREATE | List and create estimates. |
| `api/admin/estimates/[id]/route.ts` | GET, PATCH, DELETE | INVOICES_VIEW / INVOICES_CREATE | Read, update, and delete an estimate. |
| `api/admin/estimates/[id]/convert/route.ts` | POST | INVOICES_CREATE | Convert an estimate into a job card or invoice. |

### 3.7 Invoices, payments, line items (7)

| Path | Verbs | Permission | One line |
|---|---|---|---|
| `api/admin/invoices/route.ts` | GET, POST | INVOICES_VIEW / INVOICES_CREATE | List and create invoices. |
| `api/admin/invoices/[id]/route.ts` | GET, PATCH | INVOICES_VIEW / INVOICES_CREATE | Read and update one invoice. |
| `api/admin/invoices/[id]/line-items/route.ts` | POST, PATCH, DELETE | INVOICES_CREATE | Add, update, and delete invoice line items (canonical calc in `lib/invoice-calc.ts`). |
| `api/admin/invoices/[id]/finalize/route.ts` | POST, DELETE | INVOICES_FINALIZE | Finalize an invoice, or reverse a finalization. |
| `api/admin/invoices/[id]/payments/route.ts` | POST | PAYMENTS_RECORD | Record a payment against an invoice. |
| `api/admin/invoices/[id]/pdf/route.ts` | GET | INVOICES_VIEW | Render one invoice as PDF using the templates in `lib/invoice-templates/`. |
| `api/admin/payments/route.ts` | GET | PAYMENTS_RECORD | List payments. |

### 3.8 Expenses (5)

| Path | Verbs | Permission | One line |
|---|---|---|---|
| `api/admin/expenses/route.ts` | GET, POST | EXPENSES_VIEW / EXPENSES_MANAGE | List and create expenses. |
| `api/admin/expenses/[id]/route.ts` | GET, PATCH, DELETE | EXPENSES_VIEW / EXPENSES_MANAGE | Read, update, and delete an expense. |
| `api/admin/expenses/categories/route.ts` | GET, POST | EXPENSES_VIEW / EXPENSES_MANAGE | List and create expense categories. |
| `api/admin/expenses/categories/[id]/route.ts` | PATCH, DELETE | EXPENSES_MANAGE | Update and delete an expense category. |
| `api/admin/salary-slips/route.ts` | GET, POST | EXPENSES_VIEW / EXPENSES_MANAGE | List and create worker salary slips. |
| `api/admin/salary-slips/[id]/route.ts` | PATCH, DELETE | EXPENSES_MANAGE | Update and delete a salary slip. |
| `api/admin/salary-slips/[id]/pdf/route.ts` | GET | EXPENSES_VIEW | Render a salary slip as PDF (template in `lib/salary-slip-template.ts`). |

### 3.9 Inventory (13)

| Path | Verbs | Permission | One line |
|---|---|---|---|
| `api/admin/inventory/items/route.ts` | GET, POST | INVENTORY_VIEW / INVENTORY_EDIT | List and create inventory items. |
| `api/admin/inventory/items/[id]/route.ts` | GET, PATCH, DELETE | INVENTORY_VIEW / INVENTORY_EDIT | Read, update, soft-delete one item. |
| `api/admin/inventory/items/[id]/stock/route.ts` | POST | INVENTORY_EDIT | Adjust stock (with `StockMovement` audit trail). |
| `api/admin/inventory/items/[id]/batches/route.ts` | GET | INVENTORY_VIEW | List stock batches for one item. |
| `api/admin/inventory/items/[id]/hard-delete/route.ts` | POST | INVENTORY_HARD_DELETE | Permanently delete an item and its dependents. |
| `api/admin/inventory/categories/route.ts` | GET, POST | INVENTORY_VIEW / INVENTORY_EDIT | List and create inventory categories. |
| `api/admin/inventory/categories/[id]/route.ts` | PATCH, DELETE | INVENTORY_EDIT | Update and delete a category. |
| `api/admin/inventory/suppliers/route.ts` | GET, POST | INVENTORY_VIEW / INVENTORY_EDIT | List and create suppliers. |
| `api/admin/inventory/suppliers/[id]/route.ts` | PATCH, DELETE | INVENTORY_EDIT | Update and delete a supplier. |
| `api/admin/inventory/movements/route.ts` | GET | INVENTORY_VIEW | List stock movements (paginated audit trail). |
| `api/admin/inventory/low-stock/route.ts` | GET | INVENTORY_VIEW | List items at or below their reorder threshold. |
| `api/admin/inventory/catalog/route.ts` | GET, POST | INVENTORY_VIEW / INVENTORY_EDIT | List and create the vehicle brand/model catalog. |
| `api/admin/inventory/catalog/models/route.ts` | POST | INVENTORY_EDIT | Add a vehicle model to a brand. |

### 3.10 Notifications and logs (5)

| Path | Verbs | Permission | One line |
|---|---|---|---|
| `api/admin/notifications/route.ts` | GET | NOTIFICATIONS_VIEW | List sent notifications. |
| `api/admin/notifications/templates/route.ts` | GET, POST, PATCH, DELETE | NOTIFICATIONS_VIEW / NOTIFICATIONS_TEMPLATES_MANAGE | CRUD notification templates. |
| `api/admin/logs/route.ts` | GET | LOGS_VIEW | List activity log entries (from `lib/activity-logger.ts`). |
| `api/admin/logs/export/route.ts` | GET | LOGS_VIEW | Export activity log to CSV. |
| `api/admin/hsn-rates/route.ts` | GET, POST | SETTINGS_VIEW / SETTINGS_MANAGE | Read and upsert HSN/SAC GST rate rows. |

### 3.11 Settings and RBAC (7)

| Path | Verbs | Permission | One line |
|---|---|---|---|
| `api/admin/settings/route.ts` | GET, PATCH | SETTINGS_VIEW / SETTINGS_MANAGE | Read and update business settings. |
| `api/admin/settings/business-hours/route.ts` | GET, PUT | SETTINGS_VIEW / SETTINGS_MANAGE | Read and replace weekly business-hour rules. |
| `api/admin/settings/holidays/route.ts` | GET, POST, DELETE | SETTINGS_MANAGE | List, add, and remove holidays. |
| `api/admin/settings/roles/route.ts` | GET, POST | ADMIN_USERS_MANAGE | List and create roles. |
| `api/admin/settings/roles/[id]/route.ts` | PATCH, DELETE | ADMIN_USERS_MANAGE | Update and delete a role. |
| `api/admin/settings/admins/route.ts` | GET, POST, PATCH | ADMIN_USERS_MANAGE | List, create, and update admin users. |
| `api/admin/settings/export/route.ts` | GET | SETTINGS_MANAGE + DATA_EXPORT | Export full settings snapshot. |

### 3.12 Reports (6)

| Path | Verbs | Permission | One line |
|---|---|---|---|
| `api/admin/reports/route.ts` | GET | DASHBOARD_VIEW | Aggregate dashboard metrics. |
| `api/admin/reports/revenue/route.ts` | GET | REPORTS_VIEW | Revenue report (composed with `lib/reports/income-breakdown.ts` and `parts-profit.ts`). |
| `api/admin/reports/expenses/route.ts` | GET | REPORTS_VIEW | Expenses report over an IST date range. |
| `api/admin/reports/inventory/route.ts` | GET | REPORTS_VIEW | Stock valuation and movement report. |
| `api/admin/reports/appointments/route.ts` | GET | REPORTS_VIEW | Appointment volume report. |
| `api/admin/reports/jobs/route.ts` | GET | REPORTS_VIEW | Job card throughput report. |
| `api/admin/reports/workers/route.ts` | GET | REPORTS_VIEW | Per-worker load and revenue report. |

### 3.13 AMC (5)

| Path | Verbs | Permission | One line |
|---|---|---|---|
| `api/admin/amc/plans/route.ts` | GET, POST | AMC_CONTRACTS_VIEW / AMC_PLANS_MANAGE | List and create AMC plans. |
| `api/admin/amc/plans/[id]/route.ts` | GET, PATCH, DELETE | AMC_CONTRACTS_VIEW / AMC_PLANS_MANAGE | Read, update, delete a plan. |
| `api/admin/amc/contracts/route.ts` | GET, POST | AMC_CONTRACTS_VIEW / AMC_CONTRACTS_MANAGE | List and create AMC contracts. |
| `api/admin/amc/contracts/[id]/route.ts` | GET, PATCH, DELETE, POST | AMC_CONTRACTS_VIEW / AMC_CONTRACTS_MANAGE | Read, update, delete, and act on one contract. |
| `api/admin/amc/contracts/[id]/usages/route.ts` | GET | AMC_CONTRACTS_VIEW | List service usages recorded against one contract. |
| `api/admin/amc/contracts/[id]/usages/[usageId]/route.ts` | DELETE | AMC_CONTRACTS_MANAGE | Remove one usage entry from a contract. |

## 4. Pages

64 `page.tsx` files. Grouped by URL area.

### 4.1 Root and layouts (4)

| File | Lines | One line |
|---|---|---|
| `app/layout.tsx` | 32 | Root html shell, imports `globals.css`, wraps in `Providers`, ships Vercel Analytics and Speed Insights. |
| `app/(public)/layout.tsx` | 26 | Public site shell with header, nav links, and theme toggle. |
| `app/admin/layout.tsx` | 45 | Server-side JWT gate for the whole `/admin/*` tree; redirects to login on failure. |
| `app/admin/admin-shell.tsx` | 73 | Client shell for the admin console: sidebar, breadcrumbs, auth-context redirect on 401. |

### 4.2 Public pages (7)

| File | Lines | One line |
|---|---|---|
| `app/(public)/page.tsx` | 74 | Marketing home page (hero, feature cards, CTA). |
| `app/(public)/book-service/page.tsx` | 271 | Multi-step public booking form (customer, vehicle, service, slot). |
| `app/(public)/contact/page.tsx` | 45 | Contact info page. |
| `app/(public)/track/page.tsx` | 195 | Track a service request or job card by reference. |
| `app/(public)/estimate/[token]/page.tsx` | 147 | Customer view of a shared estimate: read, accept, reject. |
| `app/amc/page.tsx` | 147 | AMC members landing page with plan benefits and CTA. |
| `app/location/page.tsx` | 5 | Redirect to the Google Maps location. |

### 4.3 Admin: shell entry points (2)

| File | Lines | One line |
|---|---|---|
| `app/admin/page.tsx` | 5 | Redirect `/admin` to `/admin/dashboard`. |
| `app/admin/login/page.tsx` | 66 | Admin login form (posts to `/api/admin/auth/login`). |
| `app/admin/dashboard/page.tsx` | 353 | Operations dashboard: KPIs, today's calendar, inventory snapshot. |

### 4.4 Admin: customers, vehicles, workers, service requests (10)

| File | Lines | One line |
|---|---|---|
| `app/admin/customers/page.tsx` | 90 | Customer list with search and pagination. |
| `app/admin/customers/[id]/page.tsx` | 155 | Customer detail with history tabs. |
| `app/admin/vehicles/page.tsx` | 108 | Vehicle list with reg-number search. |
| `app/admin/vehicles/[id]/page.tsx` | 164 | Vehicle detail with service history. |
| `app/admin/workers/page.tsx` | 104 | Workers directory. |
| `app/admin/workers/[id]/page.tsx` | 150 | Worker detail with leave and salary history. |
| `app/admin/workers/calendar/page.tsx` | 92 | Worker availability calendar. |
| `app/admin/service-requests/page.tsx` | 76 | Inbound service requests list. |
| `app/admin/service-requests/[id]/page.tsx` | 153 | Service request detail with actions (schedule, decline). |

### 4.5 Admin: appointments and calendar (4)

| File | Lines | One line |
|---|---|---|
| `app/admin/appointments/page.tsx` | 178 | Appointment list with filters. |
| `app/admin/appointments/[id]/page.tsx` | 198 | Appointment detail: confirm, reschedule, mark no-show. |
| `app/admin/appointments/calendar/page.tsx` | 80 | Slot-based appointment calendar view. |
| `app/admin/calendar/page.tsx` | 193 | Shop calendar (appointments + job cards). |
| `app/admin/calendar/full/page.tsx` | 214 | Full-screen calendar view. |

### 4.6 Admin: job cards, estimates, invoices (7)

| File | Lines | One line |
|---|---|---|
| `app/admin/job-cards/page.tsx` | 265 | Job cards list with status filters. |
| `app/admin/job-cards/[id]/page.tsx` | 552 | Job card detail: tasks, parts, worker assignments, status timeline. |
| `app/admin/estimates/page.tsx` | 80 | Estimates list. |
| `app/admin/estimates/[id]/page.tsx` | 468 | Estimate builder with line-item editor and share link. |
| `app/admin/estimates/[id]/print/page.tsx` | 388 | Print-view of an estimate. |
| `app/admin/invoices/page.tsx` | 449 | Invoices list with status and date filters. |
| `app/admin/invoices/[id]/page.tsx` | 742 | Invoice editor: line items, discounts, payments, finalize, PDF. The largest page in the app. |

### 4.7 Admin: payments and expenses (5)

| File | Lines | One line |
|---|---|---|
| `app/admin/payments/page.tsx` | 68 | Payments list across invoices. |
| `app/admin/expenses/page.tsx` | 217 | Expenses list with filters. |
| `app/admin/expenses/categories/page.tsx` | 79 | Expense categories admin. |
| `app/admin/salary-slips/page.tsx` | 514 | Worker salary slip creator and list. |

### 4.8 Admin: inventory (7)

| File | Lines | One line |
|---|---|---|
| `app/admin/inventory/items/page.tsx` | 457 | Inventory items list with search, filters, batch view. |
| `app/admin/inventory/catalog/page.tsx` | 457 | Vehicle brand/model catalog editor. |
| `app/admin/inventory/categories/page.tsx` | 111 | Inventory categories admin. |
| `app/admin/inventory/suppliers/page.tsx` | 129 | Suppliers list. |
| `app/admin/inventory/movements/page.tsx` | 39 | Stock movements audit table. |
| `app/admin/inventory/low-stock/page.tsx` | 59 | Items at or below reorder threshold. |

### 4.9 Admin: reports (7)

| File | Lines | One line |
|---|---|---|
| `app/admin/reports/page.tsx` | 85 | Reports index and quick metrics. |
| `app/admin/reports/revenue/page.tsx` | 531 | Revenue report with income breakdown and parts profit. |
| `app/admin/reports/expenses/page.tsx` | 45 | Expenses report. |
| `app/admin/reports/inventory/page.tsx` | 26 | Inventory valuation report. |
| `app/admin/reports/appointments/page.tsx` | 29 | Appointment volume report. |
| `app/admin/reports/jobs/page.tsx` | 29 | Job throughput report. |
| `app/admin/reports/workers/page.tsx` | 204 | Per-worker load and revenue. |

### 4.10 Admin: AMC (3)

| File | Lines | One line |
|---|---|---|
| `app/admin/amc/plans/page.tsx` | 113 | AMC plans admin. |
| `app/admin/amc/contracts/page.tsx` | 116 | AMC contracts list. |
| `app/admin/amc/contracts/[id]/page.tsx` | 182 | AMC contract detail with usage log. |

### 4.11 Admin: notifications and logs (3)

| File | Lines | One line |
|---|---|---|
| `app/admin/notifications/page.tsx` | 86 | Sent notifications list. |
| `app/admin/notifications/templates/page.tsx` | 17 | Notification templates list (thin wrapper over the DataTable). |
| `app/admin/logs/page.tsx` | 148 | Activity log viewer with filters and CSV export. |

### 4.12 Admin: settings (9)

| File | Lines | One line |
|---|---|---|
| `app/admin/settings/page.tsx` | 98 | Settings index. |
| `app/admin/settings/garage/page.tsx` | 127 | Garage / business-info form. |
| `app/admin/settings/business-hours/page.tsx` | 19 | Read-only weekly business-hours summary. |
| `app/admin/settings/holidays/page.tsx` | 106 | Holidays admin. |
| `app/admin/settings/hsn-rates/page.tsx` | 99 | HSN/SAC GST rate admin. |
| `app/admin/settings/admins/page.tsx` | 171 | Admin users list and role assignment. |
| `app/admin/settings/roles/page.tsx` | 216 | Roles and permissions editor. |
| `app/admin/settings/quick-items/page.tsx` | 60 | Quick-item shortcuts admin. |
| `app/admin/settings/notifications/page.tsx` | 92 | Notification channel settings. |
| `app/admin/settings/integrations/page.tsx` | 14 | Placeholder listing WhatsApp, Email, and Sentry as env-configured. |

## 5. Components

18 files across five domains.

### 5.1 `components/shared/` (12)

| File | Lines | One line |
|---|---|---|
| `breadcrumbs.tsx` | 89 | Reads the pathname and renders breadcrumbs with a back arrow. |
| `customer-picker.tsx` | 168 | Search-and-select for a customer, with inline "create new" flow. |
| `list-body.tsx` | 35 | List page wrapper: loading and refreshing states around content. |
| `list-toolbar.tsx` | 151 | Search bar + filter chips + primary-action button for list pages; exports `FilterDef`. |
| `modal.tsx` | 29 | Base modal (esc-to-close, backdrop) used by every custom dialog. |
| `pagination.tsx` | 74 | Page/size pagination controls; defaults `[10, 25, 50, 100, 200]`. |
| `process-loader.tsx` | 54 | Multi-step loading indicator with rotating tips. |
| `searchable-select.tsx` | 138 | Combo-box with search and optional "create new"; exports `SearchableSelectOption`. |
| `skeletons.tsx` | 48 | `ListSkeleton` and `DashboardSkeleton`. |
| `theme-toggle.tsx` | 12 | Sun/moon button bound to the theme context. |
| `vehicle-reg-lookup.tsx` | 70 | Registration-number search that resolves to a vehicle + customer. |
| `whatsapp-button.tsx` | 15 | Deep link to WhatsApp with a pre-filled message. |

### 5.2 `components/inventory/` (3)

| File | Lines | One line |
|---|---|---|
| `edit-modal.tsx` | 113 | Modal wrapper around `InventoryItemForm` for edits. |
| `inventory-item-form.tsx` | 340 | Full create/edit form for an inventory item; exports `EMPTY_FORM`. |
| `model-picker.tsx` | 126 | Multi-select for vehicle brand/model catalog entries. |

### 5.3 `components/dashboard/`, `components/layout/`, `components/public/` (3)

| File | Lines | One line |
|---|---|---|
| `dashboard/inventory-dashboard.tsx` | 140 | Inventory KPIs card block for the admin dashboard. |
| `layout/admin-sidebar.tsx` | 160 | The admin console sidebar with grouped nav. |
| `public/landing-experience.tsx` | 641 | Public landing experience (hero + sections). Largest component in the tree. |

## 6. Libraries under `src/lib/`

25 top-level or one-level-nested library files (10 more sit in `reports/` and `invoice-templates/`).

### 6.1 Auth, transport, IDs, constants (11)

| File | Lines | Exports | One line |
|---|---|---|---|
| `auth.ts` | 73 | `AUTH_COOKIE_NAME`, `getAuthToken`, `verifyAuth`, `requirePermission`, `requireAnyPermission` | Server-side auth transport: reads `gearup_token` header or cookie, verifies JWT, gates on `PERMISSIONS.*`. |
| `auth/auth-context.tsx` | 138 | `AuthProvider`, `useAuth` | Client-side auth context; carries a documented XSS caveat about localStorage tokens. |
| `jwt-secret.ts` | 41 | `getJwtSecret` | Boot-time JWT secret resolver: refuses dev fallback on Vercel/production. |
| `prisma.ts` | 49 | `prisma` | Shared `PrismaClient` singleton with serverless connection-pool tuning. |
| `api/client.ts` | 199 | `api` | Client fetch wrapper with in-memory GET cache and `getSWR` (stale-while-revalidate) helper. |
| `activity-logger.ts` | 166 | `logActivity` | Writes an `ActivityLog` row for a given actor and entity action. |
| `constants.ts` | 9 | `APP_NAME`, `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_DURATION_MINUTES`, `JWT_EXPIRY`, page sizes, ID prefixes | App-wide numeric and string constants. |
| `errors.ts` | 168 | `AppError`, `NotFoundError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `handleApiError` | Custom error classes and the JSON error responder used by every API route. |
| `id-generators.ts` | 129 | `generateReferenceId`, `generateAppointmentRef`, `generateAmcContractNumber`, `generateInvoiceNumber`, `generateJobCardNumber`, `generateWorkerCode`, `generateEstimateNumber`, `isLegacyNumber`, `withIdCollisionRetry` | ID generators (nanoid) plus sequential business numbers backed by `DocumentSequence`. |
| `pagination.ts` | 14 | `paginate`, `paginationMeta` | Paginate skip/take and the response meta object. |
| `validators/password.ts` | 54 | `PASSWORD_MIN_LENGTH`, `passwordPolicy` | Zod password policy: min length, mixed classes, common-password blocklist. |

### 6.2 Domain helpers (8)

| File | Lines | Exports | One line |
|---|---|---|---|
| `date-boundaries.ts` | 22 | `getISTDayBoundaries`, `getISTRangeBoundaries` | UTC boundaries for the current IST day, and for an inclusive IST range. |
| `time.ts` | 29 | `SHOP_TZ`, `istDayStart`, `istDayEnd`, `formatIST`, `formatTimeIST` | IST-fixed time helpers around `Asia/Kolkata`. |
| `format-reg.ts` | 34 | `formatRegNumber`, `isValidRegNumber` | Indian vehicle-registration formatting (`WB-68-K-5489`) and validation. |
| `title-case.ts` | 29 | `toTitleCase`, `toSentenceCase` | Display-only title/sentence casing that preserves SKU-like tokens (AMC, GST, UPI, HSN, etc.). |
| `hsn-rate.ts` | 109 | `DEFAULT_HSN`, `getGstRate`, `resolveHsnCode`, `resolveHsnAndRate`, `invalidateHsnRateCache` | Resolve HSN code and GST rate per line type, with an in-memory cache. |
| `invoice-calc.ts` | 86 | `InvoiceLineLike`, `ComputedLine`, `nonDiscountPreSubtotal`, `computeLineTotal`, `recomputeDiscountLineTotal` | Canonical invoice line-total calculation, per its own doc comment the single source of truth used by both invoice-create POST and the per-invoice line-items POST. |
| `estimate-token.ts` | 54 | `MIN_TOKEN_LENGTH`, `ESTIMATE_TOKEN_TTL_MS`, `generateEstimateToken`, `defaultEstimateTokenExpiry`, `computeEstimateRevision` | 32-byte base64url tokens for public estimate URLs, with 7-day expiry. |
| `clipboard.ts` | 19 | `copyText` | Cross-browser clipboard writer with a textarea fallback. |
| `brand-logos.ts` | 27 | `BRAND_STYLES`, `getBrandStyle`, `getBrandInitial` | Brand text-badge colours for inventory card views. |

### 6.3 Reports (`lib/reports/`, 3 impl + 3 tests)

| File | Lines | One line |
|---|---|---|
| `reports/date-presets.ts` | 55 | IST-resolved date presets for report filters (today, this month, etc.); avoids UTC drift documented at the top of the file. |
| `reports/income-breakdown.ts` | 155 | `buildIncomeBreakdown`, the ex-GST income slice aggregator for the revenue report. |
| `reports/parts-profit.ts` | 122 | `buildPartsProfit`, per-part gross-profit aggregation from `(day, item)` revenue and cost rows. |
| `reports/date-presets.test.ts` | 58 | Unit tests for the presets. |
| `reports/income-breakdown.test.ts` | 113 | Unit tests. |
| `reports/parts-profit.test.ts` | 85 | Unit tests. |

### 6.4 Invoice and salary templates (`lib/invoice-templates/` 7, plus `lib/salary-slip-template.ts`)

| File | Lines | One line |
|---|---|---|
| `invoice-templates/index.ts` | 7 | Barrel: re-exports `generateInvoiceHTML`, `generateCustomerDraftHTML`, `generateMechanicCopyHTML`, `generateAmcInvoiceHTML`, `generateCombinedHTML` and their shared helpers. |
| `invoice-templates/helpers.ts` | 127 | `esc`, `formatDateIST`, `numberToWords`, `groupLineItems`, `buildBusinessInfo`; types `BusinessInfo`, `GroupedItems`. |
| `invoice-templates/tax-invoice.ts` | 312 | Traditional Indian Tax Invoice A4 template with grouped rows and GST back-calculation. |
| `invoice-templates/customer-draft.ts` | 65 | Customer draft / service summary without pricing. |
| `invoice-templates/mechanic-copy.ts` | 41 | Mechanic work-order copy for the workshop floor. |
| `invoice-templates/amc-invoice.ts` | 352 | Gold-tier AMC invoice v3 (grouped, AMC-highlighted). |
| `invoice-templates/combined.ts` | 76 | Combined single-page: mechanic + customer copy on one A4 sheet. |
| `salary-slip-template.ts` | 172 | Salary slip HTML template matching the GearUp invoice branding. |

### 6.5 Client theme provider

| File | Lines | Exports | One line |
|---|---|---|---|
| `theme/theme-context.tsx` | 27 | `ThemeProvider`, `useTheme` | Client light/dark theme provider persisted in `localStorage` under `gearup_theme`. |

The `lib/sentry/` and `lib/utils/` directories exist but hold no TypeScript files; Sentry configuration lives in `apps/web/sentry.*.config.ts` at the app root.

## 7. Middleware and providers

| File | Lines | One line |
|---|---|---|
| `middleware.ts` | 227 | Edge middleware with a per-account login attempt throttle (independent of the per-IP limiter) and security headers. Its `config` block scopes it to the routes it needs to see. |
| `providers/index.tsx` | 12 | Root client provider: `ThemeProvider` wrapping `AuthProvider`. |

## 8. Prisma models

`apps/web/prisma/schema.prisma` (1,060 lines) declares 41 models. Field counts include scalar, enum, and relation fields, and exclude `@@index` / `@@unique` / other block-level directives.

| Model | Fields | Model | Fields | Model | Fields |
|---|---|---|---|---|---|
| `AdminUser` | 19 | `Role` | 8 | `Permission` | 8 |
| `AdminUserRole` | 5 | `RolePermission` | 5 | `Customer` | 22 |
| `Vehicle` | 26 | `ServiceRequest` | 20 | `Appointment` | 24 |
| `AppointmentSlotRule` | 9 | `BlockedSlot` | 10 | `Holiday` | 9 |
| `Worker` | 24 | `WorkerLeave` | 14 | `JobCard` | 43 |
| `WorkerAssignment` | 9 | `JobCardTask` | 14 | `JobCardPart` | 12 |
| `InventoryCategory` | 4 | `Supplier` | 9 | `InventoryItem` | 34 |
| `StockMovement` | 15 | `StockBatch` | 17 | `Invoice` | 30 |
| `InvoiceLineItem` | 15 | `Payment` | 10 | `ExpenseCategory` | 4 |
| `Expense` | 14 | `NotificationTemplate` | 10 | `Notification` | 20 |
| `ActivityLog` | 13 | `Setting` | 5 | `AmcPlan` | 17 |
| `AmcContract` | 23 | `AmcServiceUsage` | 9 | `DocumentSequence` | 6 |
| `VehicleBrand` | 6 | `VehicleModel` | 10 | `InventoryItemModel` | 4 |
| `HsnRate` | 5 | `Estimate` | 19 | `EstimateItem` | 15 |

`JobCard` (43 fields) is the largest model, followed by `InventoryItem` (34), `Invoice` (30), and `Vehicle` (26).

## 9. Tests

10 Vitest files, 941 lines. All under `src/__tests__/`.

| File | Lines | One line |
|---|---|---|
| `date-boundaries.test.ts` | 58 | Cross-day IST boundary math. |
| `new-features.test.ts` | 149 | Cross-cutting regression suite for recent features. |
| `pagination.test.ts` | 44 | `paginate` and `paginationMeta` at the top level. |
| `unit/errors.test.ts` | 124 | `AppError` hierarchy and `handleApiError` behaviour. |
| `unit/estimate-token.test.ts` | 72 | Token length, expiry, and revision hashing. |
| `unit/format-reg.test.ts` | 36 | `formatRegNumber` and `isValidRegNumber` cases. |
| `unit/gst-hsn.test.ts` | 205 | HSN resolution and GST-rate cache behaviour. |
| `unit/id-generators.test.ts` | 85 | Sequential business numbers and `withIdCollisionRetry`. |
| `unit/invoice-calc.test.ts` | 120 | The canonical invoice-line calculator, including discount lines. |
| `unit/pagination.test.ts` | 48 | Duplicate targeted suite for pagination edge cases. |

The `lib/reports/*.test.ts` files (256 lines across three suites) sit alongside the code they cover and are counted in §6.3.

## 10. Non-code files under `src/`

Not counted in the 216 files above.

| File | What it is |
|---|---|
| `src/styles/globals.css` | Tailwind entry point (single stylesheet). |
| `src/hooks/.gitkeep` | Placeholder; shared hooks not present. |
| `src/types/.gitkeep` | Placeholder; types live in `@gearup/types`. |

## 11. Reproducing this page

```bash
cd apps/web
find src -type f \( -name '*.ts' -o -name '*.tsx' \) | sort | wc -l          # 216
find src -type f \( -name '*.ts' -o -name '*.tsx' \) -exec cat {} + | wc -l  # 25619
find src/app/api -name 'route.ts' | wc -l                                    # 83
find src/app -name 'page.tsx' | wc -l                                        # 64
find src -type d | sort                                                      # the tree in §2
grep -E "^model " prisma/schema.prisma | wc -l                               # 41
```
