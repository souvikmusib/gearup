Apply small P3 nit fixes to gearup. Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup.
- Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- PERMISSIONS at `packages/types/src/domain.ts` (`@gearup/types`).
- AppError signature: `(statusCode: number, message: string, code: string)`.
- logActivity params: `actorType, actorId, action, entityType, entityId, previousValue?, newValue?, tx?`.
  NEVER use `adminUserId` or `metadata` — use `actorId: user.sub` and `previousValue/newValue`.
- handleApiError from `@/lib/errors`.

Rules:
1. Read each file before editing.
2. Apply EVERY finding to its target file. P3s are quality nits — make them ALL.
3. Preserve unrelated code. No reformatting outside the fix.
4. Don't run build.

Return JSON: {"files_edited": [...], "applied_ids": [...], "skipped": [{"id":"","reason":""}], "notes":"..."}.


## Target: `apps/web/src/app/admin/job-cards/page.tsx` (2 findings)

### [P3] job-cards/page.tsx worker dropdown shows 'active' count computed only from the current paginated page
- id: `jobcard-page-active-count-from-current-page-only` · cat: business-logic
- loc: `apps/web/src/app/admin/job-cards/page.tsx:156-159`
- evidence:
```
const activeCount = data.filter((jc: any) => jc.assignments?.some((a: any) => a.worker?.fullName === w.fullName) && !['DELIVERED','CANCELLED'].includes(jc.status)).length;
```
- impact: Counts are misleading — only counts what's in the current 20-row page. Also matches by fullName (could collide on duplicate names).
- fix: Either drop the active count or fetch a real aggregate from /admin/workers (already returns _count.assignments). Match by id, not name.

### [P3] Job-cards list status filter sends raw DB enum values; UI display uses simplified statuses elsewhere — inconsistent
- id: `jobcard-list-status-filter-uses-db-values` · cat: consistency
- loc: `apps/web/src/app/admin/job-cards/page.tsx:151-153`
- evidence:
```
{['CREATED','ESTIMATE_PREPARED','WORK_IN_PROGRESS','READY_FOR_DELIVERY','DELIVERED','CANCELLED'].map((s) => <option key={s} value={s}>{s === 'CREATED' ? 'OPEN' : ...
```
- impact: Detail page uses 6 SIMPLE_STATUSES (and toSimpleStatus collapses many DB enum values like APPROVED, PARTS_PENDING, QUALITY_CHECK to IN_PROGRESS). The list filter omits those — a job card in QUALITY_CHECK is invisible when filtering by 'In Progress'.
- fix: Build the filter on top of the simple status set and map back to where: { status: { in: [...] } } server-side, OR run a migration that collapses to the simple set.

---

## Target: `apps/web/src/app/admin/layout.tsx` (2 findings)

### [P3] Admin layout renders `null` while auth is loading after first hydration
- id: `auth-rerender-flash` · cat: ux
- loc: `apps/web/src/app/admin/layout.tsx:122-124`
- evidence:
```
if (isLoginPage) return <>{children}</>;
if (loading) return <LoadingSkeleton />;
if (!user) return null;
```
- impact: When the cached user is present but `fetchMe` returns 401, `user` flips to null with `loading=false`, the layout returns `null` (blank white screen) for one tick before the `useEffect` `router.replace('/admin/login')` runs. Looks broken.
- fix: Render the skeleton (not `null`) when `!user`, since you're about to redirect anyway.

### [P3] Warmup loop has no mobile/saveData/connection check
- id: `prefetch-warmup-burns-mobile-data` · cat: performance
- loc: `apps/web/src/app/admin/layout.tsx:90-99`
- evidence:
```
const runDataPrefetch = async () => {
  for (const endpoint of PREFETCH_ENDPOINTS) {
    if (cancelled || document.hidden) return;
    await api.prefetch(endpoint);
    ...
  }
};
```
- impact: Checks `document.hidden` but not `navigator.connection.saveData` or `effectiveType`. On a mechanic's 3G phone, 33 API calls eat data and battery for nothing.
- fix: Skip the loop when `navigator.connection?.saveData` is true or `effectiveType` is `'slow-2g'`/`'2g'`. Better: only prefetch on `'4g'` and Wi-Fi.

---

## Target: `apps/web/src/app/admin/login/page.tsx` (1 findings)

### [P3] Login button disable depends only on loading state — no idempotency on server
- id: `login-form-no-double-submit-guard` · cat: ux
- loc: `apps/web/src/app/admin/login/page.tsx:17-30`
- evidence:
```
const submit = async (e) => { e.preventDefault(); setError(''); setLoading(true); try { const res = await api.post(...); ... } catch { ... } };
```
- impact: Double-tap or slow network can fire two POST /login requests. Both run bcrypt, both bump failedLoginAttempts on wrong password — could lock account in fewer attempts than expected.
- fix: Disable button via `loading` (already done) plus add `aria-busy` and ignore submit if loading. Server-side: optionally debounce attempts within ~500ms window per (ip, adminUserId).

---

## Target: `apps/web/src/app/admin/page.tsx` (1 findings)

### [P3] /admin → /admin/dashboard redirect ships a client component when it could be server
- id: `redirect-page-not-server` · cat: performance
- loc: `apps/web/src/app/admin/page.tsx:1-5`
- evidence:
```
import { redirect } from 'next/navigation';

export default function AdminIndexPage() {
  redirect('/admin/dashboard');
}
```
- impact: This is already a server component (good), but it's inside a client `AdminLayout`. The layout's auth check still runs and the client bundle still loads before the redirect resolves. Minor — flag because it can be a permanent 308 redirect at the Next config level for a faster hop.
- fix: Add `{ source: '/admin', destination: '/admin/dashboard', permanent: false }` to `next.config.js` redirects so it short-circuits at the edge.

---

## Target: `apps/web/src/app/admin/reports/revenue/page.tsx` (2 findings)

### [P3] Revenue page shows eternal 'Loading...' on API failure; no error state
- id: `revenue-page-no-error-state` · cat: ux
- loc: `apps/web/src/app/admin/reports/revenue/page.tsx:31`
- evidence:
```
useEffect: api.get(...).then((r) => { if (r.success) setData(r.data); });
if (!data) return <p>Loading...</p>;
```
- impact: Forbidden/500 leaves the page stuck — bad first impression at go-live demo.
- fix: Track error state; render actionable message + retry; reuse ProcessLoader.

### [P3] Avg/Transaction uses `|| 1` denominator masking empty-data case
- id: `revenue-page-avg-divbyzero-mask` · cat: ux
- loc: `apps/web/src/app/admin/reports/revenue/page.tsx:33`
- evidence:
```
const totalTxns = data.byMode?.reduce((s, m) => s + (m._count ?? 0), 0) || 1;
<p>{totalTxns}</p>  (shows 1 when really 0)
<p>₹{Math.round(totalRevenue/totalTxns)}</p>
```
- impact: Empty state shows 'Transactions: 1' and 'Avg: ₹0' instead of 0 / —.
- fix: Drop `|| 1`; render '—' for avg when totalTxns===0.