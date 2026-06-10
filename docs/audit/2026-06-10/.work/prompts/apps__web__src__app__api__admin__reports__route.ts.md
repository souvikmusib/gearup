You are a senior Next.js / Prisma / TypeScript engineer applying audit fixes to the gearup codebase. GO-LIVE TOMORROW. Fixes must be surgical, correct, no regressions.

Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup

## Context
- Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- All admin routes use `requirePermission(req, PERMISSIONS.X)` from `apps/web/src/lib/auth.ts`. Permissions enum at `packages/types/src/auth.ts`.
- DB: `import { prisma } from '@/lib/prisma'`. Multi-table writes MUST use `prisma.$transaction(async (tx) => ...)`.
- Errors: `handleApiError(err)` in `apps/web/src/lib/errors.ts`. Throw `new AppError(code, msg, status)`.
- Activity log: `logActivity({adminUserId, action, entityType, entityId, metadata})` from `apps/web/src/lib/activity-logger.ts`.
- Gold pattern for race-free stock: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts` uses tx + `updateMany` with `gte` guard.

## Rules
1. **Read the file first** before editing.
2. **Apply EVERY finding** listed below. None are optional.
3. **Preserve unrelated code.** Don't reformat or refactor outside scope.
4. **Race-fixes**: use `prisma.$transaction` + conditional `updateMany({where:{...guard},data:...})` then assert `result.count === 1`, else throw `new AppError('CONFLICT', '...', 409)`.
5. **Permission fixes**: if a new PERMISSIONS.X is needed, the shared-infra agent has added/will add it to `packages/types/src/auth.ts`. Just import + use.
6. **Mass-assignment**: replace `data: body as any` with explicit field picks.
7. **No backward-compat shims** — fix it right.
8. **Imports**: add what you need; don't remove ones still used.
9. **Schema changes**: if a Zod schema changes, ensure all callers match.
10. **Don't run build** — coordinator does that.

## Verify after edit
Re-Read the file. Confirm syntax. Mention any cascading changes needed.

Return JSON only: {"file": "...", "applied": ["id1","id2"], "skipped": [{"id":"","reason":""}], "cascading_changes": ["path: note"], "notes": "2-5 sentences"}.

Target file: `apps/web/src/app/api/admin/reports/route.ts`

## Findings to fix in this file (4)

### 1. [P1 · BLOCKER] Revenue 'byWorker' built by string-splitting invoice line-item description
- _id_: `reports-revenue-laborworker-string-parse` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/reports/route.ts:82`
- _evidence_:
```
if (type === 'LABOR') {
  const name = (li.description as string).replace('Labor — ', '').replace('Labor charges', 'Unassigned');
  byWorker[name] = (byWorker[name] || 0) + Number(li.lineTotal);
}
```
- _impact_: Any phrasing/locale/em-dash change silently breaks per-worker revenue — numbers still display, attribution wrong.
- _proposed fix_: Add workerId to InvoiceLineItem for LABOR rows and join on it; or join via WorkerAssignment→JobCard→Invoice and map by id.
- _verifier said_: real=True, Confirmed at apps/web/src/app/api/admin/reports/route.ts:82. The byWorker aggregation derives the worker name by string-replacing 'Labor — ' (em-dash) and 'Labor charges' from li.description with no relational join to a worker entity. Any change to the labor line-item phrasing (locale, hyphen vs em-dash, custom labor description) silently breaks per-worker revenue attribution while still rendering plausible-looking numbers. The same handler joins workerJobValue properly via WorkerAssignment a few lines later, confirming a structural join is the correct fix. P1 / go-live blocker stands for reporting that drives payouts or operational decisions.

### 2. [P1] Decimal sums coerced through JS Number across all report endpoints
- _id_: `reports-decimal-to-number-coerce` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/reports/route.ts:52`
- _evidence_:
```
todayRevenue: Number(todayRevenue._sum.amount ?? 0),
... dailyMap[istDate] = (dailyMap[istDate] || 0) + Number(p.amount);
... byType[type] = (byType[type] || 0) + Number(li.lineTotal);
```
- _impact_: Sub-rupee float drift compounds in daily roll-ups; reconciliation with payments table won't match exactly at scale.
- _proposed fix_: Aggregate with Prisma.Decimal (new Decimal(0).plus(...)) and serialize as string; or do grouping in SQL via date_trunc.

### 3. [P1] Revenue report loads every payment + every related line item + every assignment in range into memory
- _id_: `reports-revenue-unbounded-load` · _category_: performance
- _location_: `apps/web/src/app/api/admin/reports/route.ts:66`
- _evidence_:
```
prisma.payment.findMany({ where, select: { amount, paymentDate, invoiceId } });
... prisma.invoiceLineItem.findMany({ where: { invoiceId: { in: paidInvoiceIds } } });
... prisma.workerAssignment.findMany({ where: { jobCard: { invoices: { some: { id: { in: paidInvoiceIds } } } } }, include: { worker: ..., jobCard: { include: { invoices: ... } } } });
```
- _impact_: '3 Months' / 'Custom: 1 year' will blow Node heap and TTFB at modest data volume.
- _proposed fix_: Push aggregation to SQL (date_trunc, GROUP BY lineType / workerId). Cap range to 12 months at the API.

### 4. [P1 · BLOCKER] type=revenue requires only DASHBOARD_VIEW — leaks per-worker labor revenue to dashboard-only roles
- _id_: `reports-dashboard-permission-leak` · _category_: auth
- _location_: `apps/web/src/app/api/admin/reports/route.ts:13`
- _evidence_:
```
if (type === 'dashboard' || type === 'revenue') { requirePermission(PERMISSIONS.DASHBOARD_VIEW); } else { requirePermission(PERMISSIONS.REPORTS_VIEW); }
```
- _impact_: Role with DASHBOARD_VIEW only (intended for KPI tiles) can read full revenue breakdown including per-worker labor and worker job-card totals. /reports/revenue/route.ts correctly requires REPORTS_VIEW; this branch undermines it.
- _proposed fix_: Require REPORTS_VIEW for type=revenue; keep DASHBOARD_VIEW only for type=dashboard.
- _verifier said_: real=True, Confirmed at apps/web/src/app/api/admin/reports/route.ts:13 — the condition `if (type === 'dashboard' || type === 'revenue')` gates both behind DASHBOARD_VIEW. The revenue branch (lines 60-111) returns totalRevenue, daily series, byType, byWorker labor breakdown, and workerJobValue (per-worker job-card totals) — clearly sensitive financial/HR data that should require REPORTS_VIEW. A role with DASHBOARD_VIEW intended only for KPI tiles can hit `/api/admin/reports?type=revenue` and read this. The dedicated `/reports/revenue/route.ts` requiring REPORTS_VIEW corroborates intent. P1 go-live blocker is appropriate; fix is the proposed one-line change.