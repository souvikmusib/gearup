# Expenses + all 6 report routes — module audit

_Module key:_ `expenses-reports`

## Summary

Expenses CRUD and the 6 report routes are functionally working with consistent requirePermission + handleApiError usage, but several go-live concerns remain: (1) heavy use of `as any` and untyped where-objects bypasses Prisma typing on every route; (2) Decimal arithmetic on Payment/Expense/InvoiceLineItem sums is coerced through JS `Number()`, losing precision for large totals; (3) the dashboard route fans out 8 parallel queries on every page load with no caching and the revenue type runs 3+ aggregates plus a per-invoice findMany that can return very large result sets; (4) no Zod on report query params — `from`/`to` are passed straight into `new Date()`, producing `Invalid Date` filters silently; (5) date-range filters across routes are inconsistent (revenue/dashboard use IST offsets, expense report uses raw `new Date(from)` UTC midnight, so date filtering is timezone-skewed); (6) DELETE on ExpenseCategory has no guard for in-use categories beyond Prisma FK 500; (7) Expense POST/PATCH cast `paymentMode as any` defeating the PaymentMode enum; (8) revenue "byWorker" parsing relies on string-splitting `description` — fragile; (9) `/reports?type=...` and the 6 dedicated `/reports/<x>` routes duplicate work with subtle divergence (one branch grants `type=revenue` to DASHBOARD_VIEW which leaks per-worker labor revenue to dashboard-only roles); (10) Sentry directory is empty (.gitkeep only) so unhandled errors only hit console.error.

## Routes audited

- `GET /api/admin/expenses`
- `POST /api/admin/expenses`
- `GET /api/admin/expenses/[id]`
- `PATCH /api/admin/expenses/[id]`
- `DELETE /api/admin/expenses/[id]`
- `GET /api/admin/expenses/categories`
- `POST /api/admin/expenses/categories`
- `PATCH /api/admin/expenses/categories/[id]`
- `DELETE /api/admin/expenses/categories/[id]`
- `GET /api/admin/reports?type=dashboard|revenue|jobs|appointments|inventory|workers|expenses`
- `GET /api/admin/reports/appointments`
- `GET /api/admin/reports/expenses`
- `GET /api/admin/reports/inventory`
- `GET /api/admin/reports/jobs`
- `GET /api/admin/reports/revenue`
- `GET /api/admin/reports/workers`

## Files audited

- `apps/web/src/app/api/admin/expenses/route.ts`
- `apps/web/src/app/api/admin/expenses/[id]/route.ts`
- `apps/web/src/app/api/admin/expenses/categories/route.ts`
- `apps/web/src/app/api/admin/expenses/categories/[id]/route.ts`
- `apps/web/src/app/api/admin/reports/route.ts`
- `apps/web/src/app/api/admin/reports/appointments/route.ts`
- `apps/web/src/app/api/admin/reports/expenses/route.ts`
- `apps/web/src/app/api/admin/reports/inventory/route.ts`
- `apps/web/src/app/api/admin/reports/jobs/route.ts`
- `apps/web/src/app/api/admin/reports/revenue/route.ts`
- `apps/web/src/app/api/admin/reports/workers/route.ts`
- `apps/web/src/app/admin/expenses/page.tsx`
- `apps/web/src/app/admin/reports/page.tsx`
- `apps/web/src/app/admin/reports/revenue/page.tsx`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/lib/errors.ts`
- `apps/web/src/lib/activity-logger.ts`
- `apps/web/src/lib/pagination.ts`
- `apps/web/prisma/schema.prisma (Expense/ExpenseCategory section)`

## Coupling

Depends on: lib/auth.requirePermission (JWT via Authorization header — no cookie path here, middleware presumed to attach token), lib/errors.handleApiError, lib/activity-logger.logActivity (fire-and-forget, non-transactional), lib/pagination, lib/prisma, @gearup/types PERMISSIONS, prisma models Expense/ExpenseCategory/Payment/Invoice/InvoiceLineItem/JobCard/WorkerAssignment/Appointment/ServiceRequest/Customer/Vehicle/Worker/InventoryItem/InventoryCategory. Depended on by: admin UI pages (expenses, reports dashboard, revenue), api/client SWR layer. Cross-module: revenue report reads invoice line items + worker assignments populated by invoices module; expense categories FK-referenced by Expense rows. Permission keys EXPENSES_VIEW/MANAGE/REPORTS_VIEW/DASHBOARD_VIEW defined in packages/types/src/domain.ts.

## Findings

### [P1] Expense POST/PATCH bypass PaymentMode enum via `as any`
_id:_ `expense-post-paymentmode-as-any` · _category:_ type-safety · _file:_ `apps/web/src/app/api/admin/expenses/route.ts:38`

```
body: z.object({ ... paymentMode: z.string().optional() ... });
const expense = await prisma.expense.create({ data: { ...body, expenseDate: new Date(body.expenseDate), paymentMode: body.paymentMode as any, createdByAdminId: user.sub } as any });
```
**Impact.** Any arbitrary string is accepted for paymentMode. Prisma rejects at DB-runtime with a non-mapped error (translated to 500). Silent enum drift risk.

**Fix.** Replace z.string() with z.nativeEnum(PaymentMode) on POST + PATCH. Drop the two `as any` casts.

### [P1] Expense POST mass-assigns body via spread + outer `as any`
_id:_ `expense-mass-assignment-spread` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/expenses/route.ts:38`

```
const expense = await prisma.expense.create({ data: { ...body, ..., createdByAdminId: user.sub } as any });
```
**Impact.** Outer `as any` removes Prisma's compile-time guard. Any future addition to the Zod schema (e.g. `id`, `createdAt`) becomes silently writable. Mass-assignment regression risk.

**Fix.** Destructure explicitly, drop the `as any`.

### [P1] Amount accepted as JS number, stored in Decimal(12,2); no bounds
_id:_ `expense-amount-decimal-precision` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/expenses/route.ts:34`

```
amount: z.number(), ... schema: amount Decimal @db.Decimal(12, 2)
```
**Impact.** Binary-float imprecision for paise amounts; no min(0) guard — negative or absurdly large amounts can be saved.

**Fix.** z.number().nonnegative().multipleOf(0.01).max(99999999.99), or accept a regex string and pass as Decimal.

### [P2] PATCH does not allow editing referenceNumber that POST accepts
_id:_ `expense-patch-missing-referencenumber` · _category:_ consistency · _file:_ `apps/web/src/app/api/admin/expenses/[id]/route.ts:20`

```
z.object({ expenseDate?, categoryId?, title?, amount?, vendorName?, paymentMode?, notes? })  // no referenceNumber
```
**Impact.** Wrong reference number cannot be corrected via API/UI.

**Fix.** Add referenceNumber: z.string().nullable().optional() to PATCH schema.

### [P3] PATCH accepts fully empty body — bumps updatedAt + writes audit log
_id:_ `expense-patch-empty-body-noop` · _category:_ ux · _file:_ `apps/web/src/app/api/admin/expenses/[id]/route.ts:20`

```
all fields optional; const expense = await prisma.expense.update({ where: { id: params.id }, data });
```
**Impact.** Spurious audit entries and updatedAt churn when modal saved without changes.

**Fix.** If Object.keys(data).length === 0 return 400 NO_CHANGES, or skip the update + log.

### [P1] DELETE ExpenseCategory has no in-use guard — returns misleading 400 on FK
_id:_ `expense-category-delete-no-inuse-guard` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/expenses/categories/[id]/route.ts:19`

```
await prisma.expenseCategory.delete({ where: { id: params.id } });  // schema relation defaults to Restrict
```
**Impact.** Deleting an in-use category returns 'Invalid reference: referenced record does not exist' which is wrong/confusing. No soft-delete path.

**Fix.** Pre-check expense count for the category; return a clear message; or add isActive boolean for soft-delete.

### [P3] Expense list `where` typed Record<string, unknown> — loses Prisma type safety
_id:_ `expense-where-untyped` · _category:_ type-safety · _file:_ `apps/web/src/app/api/admin/expenses/route.ts:19`

```
const where: Record<string, unknown> = {};
```
**Impact.** Same pattern across every report route. Typo silently filters nothing. ILIKE search has no trigram index.

**Fix.** Use Prisma.ExpenseWhereInput. Add pg_trgm GIN index if expense rows scale.

### [P2] Expense list endpoint has no date-range filter
_id:_ `expense-list-no-date-filter` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/expenses/route.ts:13`

```
only categoryId + search query params parsed; no from/to
```
**Impact.** Cannot list expenses for a date window without paginating through everything — operational pain at year-end.

**Fix.** Accept from/to and apply expenseDate range, matching the report route.

### [P1] Report routes accept `from`/`to` with no validation
_id:_ `reports-no-query-validation` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/reports/revenue/route.ts:11`

```
const from = sp.get('from'); const to = sp.get('to');
if (from && to) where.paymentDate = { gte: new Date(from), lte: new Date(to) };
```
**Impact.** Garbage input yields Invalid Date → 500. to<from silently returns empty. Repeats in /reports/expenses and /reports?type=...

**Fix.** Zod schema z.object({ from: z.string().date().optional(), to: z.string().date().optional() }).refine(from<=to).

### [P1 · BLOCKER] /reports/expenses interprets from/to as UTC midnight; revenue uses IST — inconsistent
_id:_ `reports-expense-date-tz-skew` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/reports/expenses/route.ts:13`

```
if (from && to) where.expenseDate = { gte: new Date(from), lte: new Date(to) };  // vs revenue: new Date(from + 'T00:00:00+05:30')
```
**Impact.** Same UI date picker yields different boundaries across reports. Expense totals for 'June' drop part of June 30; revenue includes it. Numbers don't reconcile.

**Fix.** Shared helper istDayRange(from,to) used everywhere.

  _Adversarial verify:_ **REFUTED** (now P3) — The finding claims expenses uses `new Date(from)` while revenue uses `new Date(from + 'T00:00:00+05:30')`, creating an inconsistency. Re-reading both files shows revenue/route.ts:13 uses the exact same `new Date(from)` / `new Date(to)` pattern as expenses/route.ts:13 — no IST offset anywhere. The two reports are consistent with each other, so the "numbers don't reconcile" impact is incorrect. There may be a separate (real) concern that neither route applies IST day boundaries, but that's not what this finding states, and it isn't a go-live blocker since both reports skew identically.

### [P1 · BLOCKER] Revenue 'byWorker' built by string-splitting invoice line-item description
_id:_ `reports-revenue-laborworker-string-parse` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/reports/route.ts:82`

```
if (type === 'LABOR') {
  const name = (li.description as string).replace('Labor — ', '').replace('Labor charges', 'Unassigned');
  byWorker[name] = (byWorker[name] || 0) + Number(li.lineTotal);
}
```
**Impact.** Any phrasing/locale/em-dash change silently breaks per-worker revenue — numbers still display, attribution wrong.

**Fix.** Add workerId to InvoiceLineItem for LABOR rows and join on it; or join via WorkerAssignment→JobCard→Invoice and map by id.

  _Adversarial verify:_ **CONFIRMED** (now P1) — Confirmed at apps/web/src/app/api/admin/reports/route.ts:82. The byWorker aggregation derives the worker name by string-replacing 'Labor — ' (em-dash) and 'Labor charges' from li.description with no relational join to a worker entity. Any change to the labor line-item phrasing (locale, hyphen vs em-dash, custom labor description) silently breaks per-worker revenue attribution while still rendering plausible-looking numbers. The same handler joins workerJobValue properly via WorkerAssignment a few lines later, confirming a structural join is the correct fix. P1 / go-live blocker stands for reporting that drives payouts or operational decisions.

### [P1] Decimal sums coerced through JS Number across all report endpoints
_id:_ `reports-decimal-to-number-coerce` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/reports/route.ts:52`

```
todayRevenue: Number(todayRevenue._sum.amount ?? 0),
... dailyMap[istDate] = (dailyMap[istDate] || 0) + Number(p.amount);
... byType[type] = (byType[type] || 0) + Number(li.lineTotal);
```
**Impact.** Sub-rupee float drift compounds in daily roll-ups; reconciliation with payments table won't match exactly at scale.

**Fix.** Aggregate with Prisma.Decimal (new Decimal(0).plus(...)) and serialize as string; or do grouping in SQL via date_trunc.

### [P1] Revenue report loads every payment + every related line item + every assignment in range into memory
_id:_ `reports-revenue-unbounded-load` · _category:_ performance · _file:_ `apps/web/src/app/api/admin/reports/route.ts:66`

```
prisma.payment.findMany({ where, select: { amount, paymentDate, invoiceId } });
... prisma.invoiceLineItem.findMany({ where: { invoiceId: { in: paidInvoiceIds } } });
... prisma.workerAssignment.findMany({ where: { jobCard: { invoices: { some: { id: { in: paidInvoiceIds } } } } }, include: { worker: ..., jobCard: { include: { invoices: ... } } } });
```
**Impact.** '3 Months' / 'Custom: 1 year' will blow Node heap and TTFB at modest data volume.

**Fix.** Push aggregation to SQL (date_trunc, GROUP BY lineType / workerId). Cap range to 12 months at the API.

### [P2] Dashboard route runs 8 parallel queries on every hit with no cache hint
_id:_ `reports-dashboard-no-cache` · _category:_ performance · _file:_ `apps/web/src/app/api/admin/reports/route.ts:26`

```
await Promise.all([... 8 queries incl. Customer/Vehicle counts ...])
```
**Impact.** Repeated counts on tables that don't change second-to-second; seq-scan risk as Customer/Vehicle grow.

**Fix.** export const revalidate = 30, or unstable_cache keyed by minute; rely on reltuples for big tables.

### [P2] /reports?type=... duplicates the 6 dedicated /reports/<x> endpoints with subtly divergent shapes
_id:_ `reports-duplicate-endpoints` · _category:_ tech-debt · _file:_ `apps/web/src/app/api/admin/reports/route.ts:145`

```
type=expenses returns byCategory keyed only by categoryId; /reports/expenses additionally joins categoryName.
```
**Impact.** Two code paths drift; front-end can pick either and get different fields. Same duplication for jobs/appointments/inventory/workers/revenue.

**Fix.** Keep one source of truth — delete the type= branches or delete the dedicated routes.

### [P1 · BLOCKER] type=revenue requires only DASHBOARD_VIEW — leaks per-worker labor revenue to dashboard-only roles
_id:_ `reports-dashboard-permission-leak` · _category:_ auth · _file:_ `apps/web/src/app/api/admin/reports/route.ts:13`

```
if (type === 'dashboard' || type === 'revenue') { requirePermission(PERMISSIONS.DASHBOARD_VIEW); } else { requirePermission(PERMISSIONS.REPORTS_VIEW); }
```
**Impact.** Role with DASHBOARD_VIEW only (intended for KPI tiles) can read full revenue breakdown including per-worker labor and worker job-card totals. /reports/revenue/route.ts correctly requires REPORTS_VIEW; this branch undermines it.

**Fix.** Require REPORTS_VIEW for type=revenue; keep DASHBOARD_VIEW only for type=dashboard.

  _Adversarial verify:_ **CONFIRMED** (now P1) — Confirmed at apps/web/src/app/api/admin/reports/route.ts:13 — the condition `if (type === 'dashboard' || type === 'revenue')` gates both behind DASHBOARD_VIEW. The revenue branch (lines 60-111) returns totalRevenue, daily series, byType, byWorker labor breakdown, and workerJobValue (per-worker job-card totals) — clearly sensitive financial/HR data that should require REPORTS_VIEW. A role with DASHBOARD_VIEW intended only for KPI tiles can hit `/api/admin/reports?type=revenue` and read this. The dedicated `/reports/revenue/route.ts` requiring REPORTS_VIEW corroborates intent. P1 go-live blocker is appropriate; fix is the proposed one-line change.

### [P2] Inventory report uses $queryRawUnsafe (footgun for future edits)
_id:_ `reports-inventory-rawunsafe` · _category:_ security · _file:_ `apps/web/src/app/api/admin/reports/inventory/route.ts:12`

```
prisma.$queryRawUnsafe<[{count: bigint}]>('SELECT COUNT(*) as count FROM "InventoryItem" WHERE "isActive" = true AND "reorderLevel" IS NOT NULL AND "quantityInStock" <= "reorderLevel"')
```
**Impact.** No injection today (static string), but next dev who adds a filter will likely template a value and introduce SQLi.

**Fix.** Switch to tagged-template `prisma.$queryRaw\`...\``.

### [P1] Worker report `activeAssignments` actually counts ALL assignments ever
_id:_ `reports-workers-active-mislabeled` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/reports/workers/route.ts:12`

```
_count: { select: { assignments: true, tasks: true } } ...
activeAssignments: w._count.assignments
```
**Impact.** UI label says 'active' but value is lifetime. /reports?type=workers correctly filters by unassignedAt:null + jobCard.status — divergent reality.

**Fix.** Apply same where filter (unassignedAt:null, jobCard.status notIn DELIVERED/CANCELLED/CLOSED) to _count.assignments.

### [P2] logActivity fire-and-forget; not in tx with mutation; failures only console.error
_id:_ `activity-logger-non-transactional` · _category:_ observability · _file:_ `apps/web/src/lib/activity-logger.ts:18`

```
prisma.activityLog.create({ data: { ... } }).catch((e) => console.error('Activity log failed:', e.message));
```
**Impact.** If audit insert fails the mutation still succeeds and the audit trail is silently lost.

**Fix.** For high-value mutations include the log in a $transaction with the write; wire console.error to Sentry.

### [P1 · BLOCKER] lib/sentry/ empty — no error reporting in production
_id:_ `sentry-empty` · _category:_ observability · _file:_ `apps/web/src/lib/sentry/`

```
ls apps/web/src/lib/sentry/ → empty. handleApiError ends with console.error.
```
**Impact.** Every 500 in expenses/reports prints only to server stdout. Go-live with no error visibility means regressions caught only by users.

**Fix.** Initialize @sentry/nextjs; capture inside handleApiError before the 500 branch; tag with release/env.

  _Adversarial verify:_ **REFUTED** (now P3) — Refuted. While apps/web/src/lib/sentry/ is indeed empty (only .gitkeep), Sentry is properly initialized via the standard @sentry/nextjs convention at the project root: sentry.server.config.ts, sentry.client.config.ts, and sentry.edge.config.ts all exist and call Sentry.init with the DSN. @sentry/nextjs auto-instruments API routes and captures unhandled errors, so 500s from expenses/reports routes will be reported to Sentry without needing explicit capture in handleApiError. The only minor gap is the lack of explicit Sentry.captureException in handleApiError (it relies on auto-instrumentation), which is a polish item, not a go-live blocker.

### [P2] Expenses search input fires API on every keystroke (no debounce, no cancel)
_id:_ `expenses-ui-search-no-debounce` · _category:_ performance · _file:_ `apps/web/src/app/admin/expenses/page.tsx:110`

```
<input ... onChange={(e) => { setSearch(e.target.value); load(e.target.value, catFilter); }} />
```
**Impact.** 8 char query → 8 round-trips + 8 ILIKE table-scans; UI race when older response arrives last.

**Fix.** Debounce ~250-300ms; AbortController in api.get to cancel in-flight.

### [P2] Expense edit modal: no validation, no error surface; empty amount saves ₹0
_id:_ `expenses-ui-edit-no-validation-no-error` · _category:_ ux · _file:_ `apps/web/src/app/admin/expenses/page.tsx:89`

```
const res = await api.patch(`/admin/expenses/${editItem.id}`, { ...editForm, amount: Number(editForm.amount) });
if (res.success) { setEditItem(null); load(); }  // no else branch
```
**Impact.** Failure leaves modal open silently; empty amount becomes 0 which PATCH currently accepts.

**Fix.** Mirror create-modal error state; guard Number(amount) > 0; toast on failure.

### [P3] Row-click opens edit modal but row a11y depends on DataTable internals
_id:_ `expenses-ui-rowclick-a11y` · _category:_ ux · _file:_ `apps/web/src/app/admin/expenses/page.tsx:124`

```
<DataTable ... onRowClick={openEdit} />  with inline delete button inside the row using e.stopPropagation
```
**Impact.** Whole-row clickability without explicit role=button/tabIndex (depends on DataTable impl) is hostile to keyboard/SR users.

**Fix.** Audit @gearup/ui DataTable to expose role=button + tabIndex when onRowClick set; or move actions to a row-end menu.

### [P3] Revenue page shows eternal 'Loading...' on API failure; no error state
_id:_ `revenue-page-no-error-state` · _category:_ ux · _file:_ `apps/web/src/app/admin/reports/revenue/page.tsx:31`

```
useEffect: api.get(...).then((r) => { if (r.success) setData(r.data); });
if (!data) return <p>Loading...</p>;
```
**Impact.** Forbidden/500 leaves the page stuck — bad first impression at go-live demo.

**Fix.** Track error state; render actionable message + retry; reuse ProcessLoader.

### [P3] Avg/Transaction uses `|| 1` denominator masking empty-data case
_id:_ `revenue-page-avg-divbyzero-mask` · _category:_ ux · _file:_ `apps/web/src/app/admin/reports/revenue/page.tsx:33`

```
const totalTxns = data.byMode?.reduce((s, m) => s + (m._count ?? 0), 0) || 1;
<p>{totalTxns}</p>  (shows 1 when really 0)
<p>₹{Math.round(totalRevenue/totalTxns)}</p>
```
**Impact.** Empty state shows 'Transactions: 1' and 'Avg: ₹0' instead of 0 / —.

**Fix.** Drop `|| 1`; render '—' for avg when totalTxns===0.

### [P2] verifyAuth reads Authorization header only — middleware must inject from cookie
_id:_ `auth-cookie-vs-header` · _category:_ auth · _file:_ `apps/web/src/lib/auth.ts:7`

```
const auth = h.get('authorization'); if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token');
```
**Impact.** If middleware forwards JWT only via cookie without injecting Authorization header, every admin API would 401.

**Fix.** Confirm middleware sets Authorization from cookie on every admin/*, or extend getAuthToken to fall back to cookies().get('token').

### [P2] No CSV/PDF export on any report — tax-time operational gap
_id:_ `reports-no-export` · _category:_ ux · _file:_ `apps/web/src/app/admin/reports/revenue/page.tsx`

```
No Download/Export control on any report page.
```
**Impact.** Owner can see numbers on screen but cannot hand them to a CA. Common ask post-launch.

**Fix.** Add CSV export per report — server route streams the same aggregation.
