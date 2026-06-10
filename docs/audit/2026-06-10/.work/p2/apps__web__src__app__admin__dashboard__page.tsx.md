You are applying P2 quality fixes to gearup. Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup.
Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- PERMISSIONS enum: `packages/types/src/domain.ts` (import via `@gearup/types`)
- DB: `import { prisma } from '@/lib/prisma'`. For multi-step writes use `prisma.$transaction`.
- Errors: `handleApiError(err)` in `@/lib/errors`. `AppError(statusCode: number, message: string, code: string)` — note arg order: STATUS first.
- Activity log: `logActivity({ adminUserId, action, entityType, entityId, metadata, tx })` from `@/lib/activity-logger` (supports optional tx).
- Gold stock pattern: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts`.

Rules:
1. Read the file first.
2. Apply EVERY finding. P2 = quality (consistency, perf, ux, type-safety, dead-code) — no skipping.
3. Preserve unrelated code; no reformatting.
4. Imports: add what you need; don't remove used ones.
5. No backward-compat shims.

Return JSON: {"file":"...","applied":[...ids],"skipped":[{"id":"","reason":""}],"notes":"..."}.

Target file: `apps/web/src/app/admin/dashboard/page.tsx`

## Findings (3)

### [P2] KPI cards and activity rows are `<div onClick>` with no role/keyboard handling
- id: `clickable-div-no-a11y` · category: ux
- location: `apps/web/src/app/admin/dashboard/page.tsx:117-133, 272-294`
- evidence:
```
<div
  key={kpi.label}
  onClick={() => router.push(kpi.href)}
  className="cursor-pointer rounded-xl ..."
>
...
<div ... className="... cursor-pointer ..." onClick={() => { ... router.push(...) }}>
```
- impact: Not keyboard navigable, not focusable, not announced as actionable by screen readers. Fails WCAG 2.1.1 keyboard. The KPI cards already link to routes — they should be `<Link>` for prefetch + middle-click + a11y for free.
- proposed fix: Replace clickable `<div>` with `<Link prefetch={false} href={kpi.href}>` for KPI cards and activity rows. Same for the three summary stat rows at 235/242/249.

### [P2] Dashboard reads logs as array but pagination wrapper likely returns `{items,total}`
- id: `logs-cache-shape-mismatch` · category: business-logic
- location: `apps/web/src/app/admin/dashboard/page.tsx:51-55`
- evidence:
```
const logsReq = api.getSWR<any>('/admin/logs?pageSize=8');
if (logsReq.cached?.success) setLogs(logsReq.cached.data ?? []);
logsReq.promise.then((res) => {
  if (res.success && res.data) setLogs(res.data);
});
```
- impact: Other consumers in this file handle both shapes (`r.data?.items ?? r.data ?? []`). For logs, the code assumes `res.data` itself is the array. If `/admin/logs` returns the standard paginated `{items, total, page, pageSize}` shape, `logs.map` will throw because `res.data.map` is not a function.
- proposed fix: Use the same defensive destructure: `setLogs(res.data?.items ?? res.data ?? [])`. Or better — type the response in `@gearup/types` and stop guessing.

### [P2] Dashboard pulls 500 inventory items just to client-filter low-stock
- id: `low-stock-client-filter-500-items` · category: performance
- location: `apps/web/src/app/admin/dashboard/page.tsx:68-73`
- evidence:
```
api.get<any>('/admin/inventory/items?pageSize=500').then((r) => {
  if (r.success) {
    const items = r.data?.items ?? r.data ?? [];
    setLowStock(items.filter((i: any) => Number(i.quantityInStock) <= (Number(i.reorderLevel) || 2) && Number(i.quantityInStock) >= 0).slice(0, 10));
  }
});
```
- impact: Every dashboard load fetches up to 500 inventory rows over the wire just to show 10. With a real catalogue this is hundreds of KB transferred for every Admin/InventoryManager on every dashboard hit. The prefetch loop also separately hits `/admin/inventory/low-stock` (line 30) — there's already a dedicated endpoint.
- proposed fix: Replace with `api.get('/admin/inventory/low-stock?limit=10')` and use the response directly. Also defaults `reorderLevel || 2` is a magic constant — push that default into the API.