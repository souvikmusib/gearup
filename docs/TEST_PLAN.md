# GearUp Ultra-Detailed End-to-End Test Plan

Version: 1.0  
Last Updated: 2026-04-19  
Target System: GearUp Servicing (`apps/web`)  
Primary Inputs: `docs/CODEBASE_CONTEXT.md`, `docs/WORKFLOW_DETAILS.md`, `apps/web/prisma/schema.prisma`, `apps/web/src/app/**`, `apps/web/src/app/api/**`

---

## 1. Purpose

This document is a reusable, agent-ready, model-agnostic E2E testing blueprint that is:

1. Specific to the current GearUp codebase.
2. Structured so any AI executor (Codex, Claude Code, Kiro, Antigravity, human QA) can run it without ambiguity.
3. Designed for full-lifecycle testing: UI -> API -> DB -> logs -> notifications -> reporting -> security.

This is not a short checklist. This is an execution-grade plan with suites, flows, data contracts, invariants, failure handling, and release gates.

---

## 2. How Any Agent Should Use This Plan

## 2.1 Required Inputs (must load before execution)

1. `docs/CODEBASE_CONTEXT.md`
2. `docs/WORKFLOW_DETAILS.md`
3. `docs/rbac.md`
4. `docs/qa-matrix.md`
5. `docs/notifications.md`
6. `apps/web/prisma/schema.prisma`
7. All route handlers under `apps/web/src/app/api/**/route.ts`
8. All pages under `apps/web/src/app/(public)/**` and `apps/web/src/app/admin/**`

## 2.2 Execution Contract

Every test run must produce:

1. `artifacts/e2e/<run-id>/summary.md`
2. `artifacts/e2e/<run-id>/cases.json`
3. `artifacts/e2e/<run-id>/failures/` screenshots + network logs + route payloads
4. `artifacts/e2e/<run-id>/db-verification.sql` and result output
5. `artifacts/e2e/<run-id>/rbac-matrix.csv`
6. `artifacts/e2e/<run-id>/release-gate.md` (pass/fail by gate)

## 2.3 Required Assertion Depth

For every business-critical case, validate all layers:

1. UI outcome
2. API response shape and code
3. DB state change (Prisma model invariants)
4. Activity log or notification side effect where applicable

---

## 3. System Under Test Snapshot

## 3.1 Architecture Reality (Current)

1. Frontend + backend route handlers are in `apps/web` (Next.js App Router).
2. Auth uses JWT (`Authorization: Bearer`) + RBAC permission checks.
3. Primary data store is Supabase Postgres via Prisma.
4. Public flows enter via `/api/public/*`.
5. Admin flows enter via `/api/admin/*`.

Note: Some legacy docs mention Express app separation. For current E2E execution, treat `apps/web/src/app/api/**` as source of truth.

## 3.2 Core Domain Workflow

1. Service Request -> Appointment -> Job Card -> Invoice -> Payment
2. Supporting domains: Customers, Vehicles, Workers, Inventory, Expenses, Notifications, Settings, Reports, Logs

## 3.3 High-Risk Areas

1. Multi-entity transactional create in public booking.
2. Status transitions across ServiceRequest/Appointment/JobCard/Invoice/Payment.
3. RBAC enforcement consistency across all admin routes.
4. Financial calculations in invoice creation.
5. Notification retry/dead-letter behavior.
6. Auth session expiry and unauthorized redirect handling.

---

## 4. Quality Gates (Release Blocking)

## 4.1 P0 (Hard Block)

1. Public booking and tracking must pass.
2. Admin login, token validation, and permission checks must pass.
3. Workflow chain (SR -> Appointment -> JobCard -> Invoice -> Payment) must pass.
4. No unauthorized data exposure from public endpoints.
5. No data-integrity break in monetary and stock fields.

## 4.2 P1 (Soft Block unless severe)

1. Reports aggregation correctness.
2. Search, pagination, filtering consistency.
3. Notification queue and retry behavior.
4. Performance thresholds.

## 4.3 Exit Criteria

1. 100% P0 pass.
2. >= 95% P1 pass with no open critical defects.
3. 0 open security-critical defects.
4. 0 open data-corruption defects.

---

## 5. In-Scope Inventory

## 5.1 Public Pages

1. `/`
2. `/book-service`
3. `/track`
4. `/contact`
5. `/estimate/[token]`

## 5.2 Admin Pages (Categories and Subcategories)

1. Auth
1. `/admin/login`
2. Core
1. `/admin/dashboard`
2. `/admin/customers`
3. `/admin/customers/[id]`
4. `/admin/vehicles`
5. `/admin/vehicles/[id]`
6. `/admin/workers`
7. `/admin/workers/[id]`
8. `/admin/workers/calendar`
9. `/admin/appointments`
10. `/admin/appointments/[id]`
11. `/admin/appointments/calendar`
12. `/admin/service-requests`
13. `/admin/service-requests/[id]`
14. `/admin/job-cards`
15. `/admin/job-cards/[id]`
3. Finance
1. `/admin/invoices`
2. `/admin/invoices/[id]`
3. `/admin/payments`
4. `/admin/expenses`
5. `/admin/expenses/categories`
4. Inventory
1. `/admin/inventory/items`
2. `/admin/inventory/categories`
3. `/admin/inventory/suppliers`
4. `/admin/inventory/movements`
5. `/admin/inventory/low-stock`
5. Notifications
1. `/admin/notifications`
2. `/admin/notifications/templates`
6. Settings
1. `/admin/settings`
2. `/admin/settings/admins`
3. `/admin/settings/business-hours`
4. `/admin/settings/integrations`
5. `/admin/settings/notifications`
7. Reports
1. `/admin/reports`
2. `/admin/reports/revenue`
3. `/admin/reports/appointments`
4. `/admin/reports/jobs`
5. `/admin/reports/inventory`
6. `/admin/reports/workers`
7. `/admin/reports/expenses`
8. Audit
1. `/admin/logs`

## 5.3 API Route Coverage (Method Matrix)

### Public API

1. `GET /api/health`
2. `GET /api/public/available-slots`
3. `POST /api/public/service-requests`
4. `POST /api/public/track`

### Admin Auth API

1. `POST /api/admin/auth/login`
2. `GET /api/admin/auth/me`
3. `POST /api/admin/auth/change-password`

### Admin Domain API

1. Customers: `GET/POST /api/admin/customers`, `GET/PATCH /api/admin/customers/[id]`, `GET /history`
2. Vehicles: `GET/POST /api/admin/vehicles`, `GET/PATCH /api/admin/vehicles/[id]`
3. Workers: `GET/POST /api/admin/workers`, `GET/PATCH /api/admin/workers/[id]`
4. Appointments: `GET/POST /api/admin/appointments`, `GET/PATCH /api/admin/appointments/[id]`
5. Service Requests: `GET /api/admin/service-requests`, `GET/PATCH /api/admin/service-requests/[id]`
6. Job Cards: `GET/POST /api/admin/job-cards`, `GET/PATCH /api/admin/job-cards/[id]`
7. Inventory Items: `GET/POST /api/admin/inventory/items`
8. Invoices: `GET/POST /api/admin/invoices`, `GET/PATCH /api/admin/invoices/[id]`
9. Payments: `GET /api/admin/payments`
10. Expenses: `GET/POST /api/admin/expenses`, `GET/DELETE /api/admin/expenses/[id]`
11. Notifications: `GET /api/admin/notifications`
12. Settings: `GET/PATCH /api/admin/settings`
13. Reports: `GET /api/admin/reports`
14. Logs: `GET /api/admin/logs`
15. Debug (non-prod hardening target): `GET /api/debug`

---

## 6. Components, Forms, and Interaction Map

## 6.1 Shared UI Components to Validate

1. `@gearup/ui`: `DataTable`, `StatusBadge`, `PageHeader`, `StatCard`
2. Local shared: `ListToolbar`, `Pagination`, `Modal`, `ThemeToggle`

## 6.2 Confirmed Interactive Forms

1. Public booking form (`/book-service`)
2. Public tracking form (`/track`)
3. Admin login form (`/admin/login`)
4. Customer create modal (`/admin/customers`)
5. Worker create modal (`/admin/workers`)
6. Inventory item create modal (`/admin/inventory/items`)

## 6.3 Important Interaction Patterns

1. Search + debounce + pagination coupling.
2. Row-click navigation from list to detail pages.
3. Status badge rendering from enum values.
4. Token expiration handling in API client (401 clears localStorage + redirects).
5. Modal open/close and form reset behavior.

---

## 7. Database Validation Scope

Validate on these Prisma models at minimum:

1. `Customer`, `Vehicle`, `ServiceRequest`, `Appointment`, `JobCard`, `Invoice`, `Payment`
2. `Worker`, `WorkerAssignment`, `JobCardTask`, `JobCardPart`
3. `InventoryItem`, `StockMovement`, `InventoryCategory`, `Supplier`
4. `Expense`, `ExpenseCategory`
5. `Notification`, `NotificationTemplate`
6. `ActivityLog`, `Setting`
7. Auth RBAC: `AdminUser`, `Role`, `Permission`, `AdminUserRole`, `RolePermission`

Key invariants:

1. Monetary fields (`Decimal`) never become NaN/null unexpectedly.
2. `amountDue = grandTotal - amountPaid` always consistent.
3. Status transitions do not violate enum lifecycle.
4. Linkage integrity: foreign keys resolve for all workflow objects.
5. Audit logs exist for create/update/delete where implemented.

---

## 8. Test Data Strategy

## 8.1 Data Partitions

1. Happy path valid data.
2. Boundary values (min lengths, empty optional fields).
3. Invalid formats (email, phone, enum mismatches).
4. Duplicate identifiers (phone, SKU, registrationNumber).
5. Cross-entity mismatches (vehicle not belonging to customer, stale IDs).

## 8.2 Seed and Isolation Rules

1. Baseline seed account required (`admin` + SUPER_ADMIN role).
2. Prefix test-created records with `E2E_<runId>_`.
3. Use deterministic reference values for replayability.
4. Cleanup strategy:
1. preferred: transaction rollback in isolated env,
2. fallback: tagged cleanup script by prefix.

## 8.3 Time Control

1. Use fixed timezone baseline for date-sensitive tests.
2. Freeze or mock current time for status-time assertions where possible.
3. For production smoke, compare relative transitions rather than exact timestamp equality.

---

## 9. End-to-End Suites (Execution Order)

## 9.1 Suite A - Smoke and Accessibility Foundations

1. Public and admin pages return 200 and key visible headings.
2. Basic keyboard navigation on login/book/track forms.
3. Required fields enforce constraints in browser layer.

## 9.2 Suite B - Public Funnel (P0)

### TC-PUB-001 Public Booking Success

1. Submit `/book-service` with valid customer+vehicle+service data.
2. Assert success screen and reference ID format.
3. Assert DB creates or reuses customer and vehicle correctly.
4. Assert service request created with `SUBMITTED`.
5. Assert activity log generated with actor `PUBLIC` if implemented.

### TC-PUB-002 Public Booking Validation Failures

1. Invalid phone length.
2. Missing mandatory fields.
3. Invalid email format.
4. Assert descriptive error without server crash.

### TC-PUB-003 Public Tracking Success

1. Submit valid reference + phone.
2. Assert timeline object, status fields, and no sensitive admin-only data.

### TC-PUB-004 Public Tracking Data Protection

1. Correct reference + wrong phone.
2. Unknown reference.
3. Enumeration attempts with repeated requests.
4. Assert no data leakage pattern.

## 9.3 Suite C - Authentication and Session (P0)

### TC-AUTH-001 Valid Login

1. `POST /api/admin/auth/login` with seed credentials.
2. Assert JWT structure and payload includes roles+permissions.

### TC-AUTH-002 Wrong Password and Lockout

1. Repeat wrong password attempts up to threshold.
2. Assert lock status and lock duration behavior.

### TC-AUTH-003 Me Endpoint Contract

1. With valid token, assert user profile and RBAC arrays.
2. Invalid token -> 401.
3. Missing token -> 401.

### TC-AUTH-004 Session Expiry UX

1. Force 401 on protected API call from UI.
2. Assert client clears local storage and redirects to `/admin/login`.

### TC-AUTH-005 Password Change

1. Valid current + strong new password -> success.
2. Wrong current password -> rejection.
3. New password below minimum -> validation rejection.

## 9.4 Suite D - RBAC Matrix (P0)

For each role (`SUPER_ADMIN`, `ADMIN`, `SERVICE_MANAGER`, `WORKER`, `BILLING`):

1. Verify allowed endpoints return success.
2. Verify disallowed endpoints return 403.
3. Verify UI navigation and action controls respect same permission model.
4. Verify worker-specific rule: can update only assigned job cards.

Output required: role-permission matrix with pass/fail per route and per UI action.

## 9.5 Suite E - Core Workflow Chain (P0)

### TC-WF-001 SR -> Appointment

1. Create SR via public API.
2. Create/confirm appointment against same customer+vehicle.
3. Validate linking and timeline consistency.

### TC-WF-002 Appointment -> Job Card

1. Create job card linked to appointment and optional SR.
2. Assert service request status flips to `CONVERTED_TO_JOB` when linked.

### TC-WF-003 Job Card Lifecycle

1. Transition statuses through allowed states.
2. Assert disallowed transitions are rejected or handled.
3. Assert `actualDeliveryAt` auto-set at `DELIVERED` when logic applies.

### TC-WF-004 Job Card -> Invoice

1. Create invoice with line items from job card context.
2. Assert subtotal/tax/discount/grandTotal math.

### TC-WF-005 Invoice -> Payment

1. Record partial payment then full payment.
2. Assert amountDue and paymentStatus transitions (`UNPAID` -> `PARTIALLY_PAID` -> `PAID`).

## 9.6 Suite F - Master Data CRUD

### Customers

1. List, search, paginate.
2. Create and update.
3. History endpoint retrieval.

### Vehicles

1. Create linked vehicle.
2. Detail includes customer + recent records.
3. Update mutable fields.

### Workers

1. Auto workerCode generation format.
2. Status filter.
3. Update details and status.

### Inventory Items

1. Create item with numeric conversions.
2. Search and pagination.
3. Category/supplier relation rendering.

### Expenses

1. Create/list/detail/delete.
2. Category link and creator link assertions.

## 9.7 Suite G - Reporting and Dashboard Consistency

1. Dashboard type report returns all required counters.
2. Revenue report date filters.
3. Jobs, appointments, workers, inventory, expenses report shape and totals.
4. Cross-check sampled counts against direct DB queries.

## 9.8 Suite H - Notifications and Async Reliability

1. Notification list filters by channel/event/status.
2. Event-triggered notification entries created for key actions.
3. Retry behavior increments retry counts.
4. Dead-letter threshold behavior (if configured).
5. Deduplication for same event+entity key.

## 9.9 Suite I - Activity Logs and Auditability

1. Verify create/update/delete actions write activity logs.
2. Assert actor metadata, entityType/entityId, action string, timestamps.
3. Validate logs filters (`entityType`, `actorType`, `action`).

## 9.10 Suite J - Settings and Configuration

1. `GET /api/admin/settings` map shape.
2. `PATCH /api/admin/settings` upsert semantics.
3. Sensitive settings change audit logging.

## 9.11 Suite K - UI Resilience and UX Integrity

1. Loading states visible and recover correctly.
2. Empty states on list pages.
3. Error banners for failed mutations.
4. Modal close resets local form state.
5. Debounced search does not cause stale page pointer issues.

---

## 10. Negative and Abuse Test Catalog

1. Invalid enum injection on each status field.
2. Overposting unknown fields in create/update payload.
3. SQL-like and script-like payload strings in text fields.
4. Large payload limits for notes/descriptions.
5. Unauthorized access to all `/api/admin/*` endpoints.
6. Broken object IDs for all detail routes.
7. Rate burst on public track/booking endpoints.
8. Duplicate create races (same phone+registration concurrent booking).

---

## 11. State Machine Validation

## 11.1 ServiceRequestStatus

Allowed states to test:

1. `SUBMITTED`
2. `UNDER_REVIEW`
3. `APPOINTMENT_PENDING`
4. `APPOINTMENT_CONFIRMED`
5. `CONVERTED_TO_JOB`
6. `CANCELLED`
7. `CLOSED`

Test both valid and invalid transitions.

## 11.2 AppointmentStatus

1. `REQUESTED`
2. `PENDING_REVIEW`
3. `CONFIRMED`
4. `RESCHEDULED`
5. `CANCELLED`
6. `NO_SHOW`
7. `CHECKED_IN`
8. `COMPLETED`

## 11.3 JobCardStatus

Validate full lifecycle and terminal states:

1. `CREATED` -> `UNDER_INSPECTION` -> `ESTIMATE_PREPARED` -> `AWAITING_CUSTOMER_APPROVAL` -> `APPROVED`
2. Work execution path: `PARTS_PENDING` -> `WORK_IN_PROGRESS` -> `QUALITY_CHECK` -> `READY_FOR_DELIVERY` -> `DELIVERED` -> `CLOSED`
3. Cancellation path from intermediate states.

## 11.4 Invoice and Payment

1. Invoice states: `DRAFT`, `FINALIZED`, `CANCELLED`
2. Payment states: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `REFUNDED`, `WAIVED`

---

## 12. Security Test Plan

## 12.1 Authentication and Token Security

1. JWT tampering checks.
2. Expired token behavior.
3. Missing bearer prefix behavior.
4. Permission escalation attempts through crafted JWT payload.

## 12.2 Authorization

1. Route-level permission checks for every admin endpoint.
2. UI action gating parity with backend authorization.
3. Horizontal access checks on detail routes.

## 12.3 Data Exposure

1. Public endpoints only return customer-safe fields.
2. Error payloads do not leak internals or stack traces.
3. Debug endpoint not exposed in production release.

## 12.4 Input Security

1. HTML/JS injection attempts in user-entered fields.
2. Oversized payload handling.
3. Unsafe filename/path handling (if upload endpoints activated later).

---

## 13. Non-Functional Testing

## 13.1 Performance Baselines

1. Public pages LCP and TTFB budget targets.
2. CRUD API p95 latency targets by module.
3. Invoice creation p95 target and DB query count.

## 13.2 Concurrency

1. Concurrent booking requests for same vehicle/date.
2. Concurrent payment posting against same invoice.
3. Concurrent stock movement updates on same SKU.

## 13.3 Reliability

1. DB transient failure handling.
2. Notification provider failure handling.
3. Network interruption during critical submissions.

## 13.4 Observability

1. Server exceptions captured in Sentry with route context.
2. Frontend exceptions captured with page context.
3. Correlate activity log entries to request IDs when available.

---

## 14. Automation Strategy

## 14.1 Layers

1. API contract tests (fast, deterministic).
2. UI + API integrated E2E (Playwright).
3. DB integrity assertions post-flow.
4. Security matrix tests.

## 14.2 Suggested Execution Commands

1. Install dependencies:

```bash
pnpm install
```

2. Run app locally (if local E2E):

```bash
pnpm --filter @gearup/web dev
```

3. Run Playwright tests (repo currently has `apps/web/e2e/admin-e2e.spec.ts`):

```bash
cd apps/web
npx playwright test
```

4. Target production smoke (read-only safe operations only) by setting base URL in `apps/web/playwright.config.ts` or env override.

## 14.3 Suite Segmentation for CI

1. Stage 1: Smoke + auth + health (under 5 min)
2. Stage 2: Core workflow + RBAC (under 15 min)
3. Stage 3: Full regression (nightly)
4. Stage 4: Performance + abuse + resilience (scheduled)

---

## 15. Defect Taxonomy and Severity

## 15.1 Severity

1. S0: Security/data breach or data corruption.
2. S1: P0 workflow blocked.
3. S2: Major functional regression with workaround.
4. S3: Minor functional or UX defect.
5. S4: Cosmetic.

## 15.2 Defect Template

1. Case ID
2. Build/commit/deployment ID
3. Environment
4. Steps to reproduce
5. Expected vs actual
6. API payload/response snapshot
7. DB evidence
8. Screenshot/video/log link
9. Suspected layer (`ui`, `api`, `db`, `auth`, `infra`)

---

## 16. Traceability Matrix (Requirement -> Test)

Mandatory traceability links:

1. Booking requirement -> TC-PUB-001/002
2. Tracking privacy requirement -> TC-PUB-003/004
3. RBAC requirement -> TC-RBAC-* matrix
4. Workflow conversion requirement -> TC-WF-001..005
5. Financial integrity requirement -> TC-WF-004/005 + DB invariants
6. Audit requirement -> Suite I
7. Notification reliability requirement -> Suite H

---

## 17. Agent Prompt Block (Reusable Across Tools)

Use this exact block with any agent:

```text
You are executing an end-to-end QA run for this repository using docs/TEST_PLAN.md as the contract.

Mandatory steps:
1) Load docs/CODEBASE_CONTEXT.md, docs/WORKFLOW_DETAILS.md, docs/rbac.md, docs/qa-matrix.md, docs/notifications.md.
2) Build test inventory from apps/web/src/app/** and apps/web/src/app/api/**.
3) Execute suites in order: Smoke -> Public -> Auth -> RBAC -> Workflow -> CRUD -> Reports -> Notifications -> Logs -> Settings -> Negative/Security.
4) For each failed case, capture UI evidence, API request/response, and DB verification evidence.
5) Produce artifacts under artifacts/e2e/<run-id>/ with summary.md, cases.json, release-gate.md.
6) Do not mark pass unless UI/API/DB side effects match expected behavior.

Output format:
- Executive summary
- P0 failures
- P1 failures
- Security findings
- Data integrity findings
- Release recommendation (GO/NO-GO)
```

---

## 18. Current Known Gaps (from existing reports and code scan)

1. Some pages are placeholders (calendar views and several settings/report detail pages); include smoke checks but lower functional depth.
2. Existing E2E script has at least one test script bug around settings update method mismatch.
3. Login page includes demo fallback branch; production runs must validate real auth path explicitly.
4. `middleware.ts` currently does not enforce admin auth by itself; rely on API auth and client redirect behavior tests.
5. `docs/architecture.md` includes legacy deployment shape; prioritize actual `apps/web/src/app/api` implementation when conflicts exist.

---

## 19. Maintenance Protocol

Update this plan when any of these change:

1. Prisma schema enums/models.
2. Admin/public route additions or method changes.
3. Permission constants in `packages/types/src/domain.ts`.
4. New create/edit forms or modal flows.
5. Notification event types/templates.

Minimal review cadence:

1. At every release branch cut.
2. After each schema migration.
3. After each RBAC change.

---

## 20. Final Release Decision Rubric

GO only if all true:

1. P0 suite pass = 100%.
2. No open S0/S1 defects.
3. RBAC matrix fully green for protected routes.
4. Workflow chain validated end-to-end with DB assertions.
5. Financial calculations validated on invoice/payment scenarios.
6. Audit + notification side effects verified where required.

Otherwise: NO-GO with defect rollback/mitigation plan.

