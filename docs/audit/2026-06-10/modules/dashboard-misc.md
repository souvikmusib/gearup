# Admin dashboard, calendar pages, top-level admin layout — module audit

_Module key:_ `dashboard-misc`

## Summary

The admin dashboard + calendar surfaces are entirely client-rendered components that consume admin APIs via a shared `api` client. There are no server mutations in these files, so RBAC/data-integrity risks are largely deferred to the underlying API routes; however, the client surfaces themselves have meaningful go-live issues. The biggest concerns: (1) the JWT is stored in `localStorage` and sent as a Bearer header — this is XSS-exfiltratable and bypasses any `httpOnly`/`sameSite` cookie protection the rest of the app may rely on; (2) admin gating is *client-only* (the `AdminLayout` checks `user` in a `useEffect` and `AdminSidebar` filters by `hasPermission`), so a user who lands on `/admin/dashboard` briefly renders nothing then redirects — there is no server-side guard in any of these pages, the entire perimeter depends on the middleware + API routes refusing requests; (3) the layout's "warm-up" prefetches ~33 admin endpoints sequentially with 900 ms gaps on every navigation into `/admin/*`, which is significant unnecessary load against the API and also fights the 2-minute `GET` cache TTL; (4) calendar pages fetch up to 500 appointments + all workers + all leaves + all assignments client-side with no pagination/window, will degrade badly past a few hundred records; (5) pervasive `any` typing and unguarded property access (`res.data.workers` without null-check) will throw at runtime if the API shape drifts; (6) several accessibility issues (clickable `<div>` KPI cards, no keyboard handling); (7) Sentry directory is an empty `.gitkeep` — no error reporting on the client surface at all. None of the issues in this module are themselves go-live blockers *for these files alone*, but #1 (token in localStorage) is a P0 the security review needs to confirm is intentional, and the prefetch storm (#3) is a P1 that can hurt the launch under any concurrent admin load.

## Routes audited

- `/admin`
- `/admin/dashboard`
- `/admin/calendar`
- `/admin/calendar/full`
- `/admin/appointments/calendar`
- `/admin/workers/calendar`

## Files audited

- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/dashboard/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/layout.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/calendar/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/calendar/full/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/appointments/calendar/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/workers/calendar/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/components/layout/admin-sidebar.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/layout.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/(public)/layout.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/api/client.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/auth/auth-context.tsx`

## Coupling

Depends on: `@/lib/api/client` (shared GET cache + Bearer token from localStorage), `@/lib/auth/auth-context` (client-side `useAuth`, `hasPermission`), `@gearup/ui` (`PageHeader`), `@gearup/types` (`ApiResponse`, `MeResponse`), `recharts`, `@fullcalendar/*`, `lucide-react`. Backend APIs consumed: `/api/admin/reports?type=...`, `/api/admin/logs`, `/api/admin/appointments`, `/api/admin/workers`, `/api/admin/workers/calendar`, `/api/admin/settings/holidays`, `/api/admin/inventory/items`, `/api/admin/auth/me`. Depended on by: nothing (leaf pages), but `AdminLayout` wraps every `/admin/*` page so any regression here breaks the whole admin perimeter (auth gate, prefetch, sidebar, breadcrumbs).

## Findings

### [P0 · BLOCKER] JWT stored in localStorage and sent as Bearer header — exfiltratable by any XSS
_id:_ `jwt-in-localstorage-xss-exfil` · _category:_ auth · _file:_ `apps/web/src/lib/api/client.ts:34, apps/web/src/lib/auth/auth-context.tsx:36-86`

```
const token = typeof window !== 'undefined' ? localStorage.getItem('gearup_token') : null;
...
...(token ? { Authorization: `Bearer ${token}` } : {}),
// auth-context
localStorage.setItem('gearup_token', token);
```
**Impact.** Any reflected/stored XSS anywhere in the admin app (recharts tooltips, log entityType render, customer name render etc.) can read the JWT and impersonate the admin from outside the browser. httpOnly cookies are unreachable from JS; localStorage isn't. This negates the cookie/sameSite protections the middleware presumably relies on.

**Fix.** Move auth token to an httpOnly + Secure + SameSite=Lax cookie set by the login endpoint; have the API read it from cookie instead of Authorization header for the browser surface. Keep Bearer only for non-browser clients. Delete the gearup_token localStorage read on the client.

  _Adversarial verify:_ **CONFIRMED** (now P1) — Confirmed: client.ts:34 reads `gearup_token` from localStorage and attaches it as `Authorization: Bearer <token>` (line 51), and auth-context.tsx:80 writes the token to localStorage on login. Any XSS in the admin app can read the token via `localStorage.getItem('gearup_token')` and exfiltrate it; there is no httpOnly cookie protection. I'm downgrading from P0 to P1 because exploitation requires an actual XSS vector to exist (not independently verified here) and admin-only surface limits blast radius, but the architecture is genuinely vulnerable and the proposed httpOnly cookie fix is correct.

### [P1] Admin pages have no server-side auth — entire perimeter is client `useEffect` redirect
_id:_ `admin-no-server-guard` · _category:_ auth · _file:_ `apps/web/src/app/admin/layout.tsx:70-124`

```
export default function AdminLayout({ children }) {
  const { user, loading } = useAuth();
  ...
  useEffect(() => {
    if (!loading && !user && !isLoginPage) router.replace('/admin/login');
  }, [loading, user, isLoginPage, router]);
  ...
  if (!user) return null;
```
**Impact.** Unauthenticated users get the admin HTML/JS bundle and the layout renders briefly before the redirect. All real protection lives in `middleware.ts` + per-route API checks. If middleware misses a path or matcher regresses, the UI itself enforces nothing. Also leaks the entire admin route map to bots.

**Fix.** Convert `admin/layout.tsx` (or a parent server layout) to a server component that calls `requireUser()` and `redirect('/admin/login')` server-side before any client component renders. Keep the client-side `useAuth` only for live updates.

### [P1] AdminLayout sequentially prefetches 33 admin endpoints on every mount
_id:_ `prefetch-storm-on-every-admin-nav` · _category:_ performance · _file:_ `apps/web/src/app/admin/layout.tsx:9-44, 81-120`

```
const PREFETCH_ENDPOINTS = [ '/admin/reports?type=dashboard', '/admin/logs?pageSize=8', /* 31 more */ ];
...
for (const endpoint of PREFETCH_ENDPOINTS) {
  if (cancelled || document.hidden) return;
  await api.prefetch(endpoint);
  await new Promise<void>((resolve) => { timers.push(window.setTimeout(resolve, 900)); });
}
```
**Impact.** Every admin login (and every full-page reload of any /admin/* route) triggers ~33 API calls 900ms apart over ~30s, including heavy ones (`/admin/appointments?pageSize=200`, `/admin/inventory/items?page=1`, six `/admin/reports?type=*` queries). With 10 concurrent admins on day 1 that's hundreds of unnecessary DB hits per minute, plus it warms a per-tab cache that already has a 120s TTL so users will refetch a lot of it anyway. Also wastes mobile bandwidth.

**Fix.** Drop the prefetch loop. Either (a) rely on Next.js route prefetch + the existing 2-minute `getSWR` cache, or (b) prefetch only the 3-4 most-likely-next routes based on `pathname`. If you keep it, gate behind a feature flag and only run on `/admin/dashboard` mount (not every admin page).

### [P1] Calendar pages fetch up to 500 records with no date window — unbounded growth
_id:_ `calendar-no-windowing` · _category:_ performance · _file:_ `apps/web/src/app/admin/calendar/page.tsx:43, apps/web/src/app/admin/calendar/full/page.tsx:29, apps/web/src/app/admin/appointments/calendar/page.tsx:21, apps/web/src/app/admin/workers/calendar/page.tsx:19-20`

```
const apptReq = api.getSWR<any>('/admin/appointments?pageSize=500');
// full/page.tsx
api.get<any>('/admin/appointments?pageSize=500'),
// appointments/calendar
api.getSWR<any>('/admin/appointments?pageSize=200');
// workers/calendar
api.getSWR<any>('/admin/workers?pageSize=200');
api.getSWR<any>('/admin/appointments?pageSize=200');
```
**Impact.** Calendars silently truncate past 500/200 records, so older or future-dense data disappears from the UI with no indication. As the shop's appointment history grows beyond a few months this will both miss data and become a slow render (FullCalendar with 500+ events + 33-endpoint prefetch on the same page).

**Fix.** Add `from`/`to` query params bounded by the calendar's current visible range (FullCalendar fires `datesSet` — use it to refetch). For the card view, default to next 21 days and add range pagination. Server should reject `pageSize > 100` with an explicit error.

### [P1] Pervasive `any` + unguarded property access on API responses
_id:_ `any-typing-runtime-throws` · _category:_ type-safety · _file:_ `apps/web/src/app/admin/calendar/full/page.tsx:46-61, apps/web/src/app/admin/dashboard/page.tsx:34-73`

```
api.get<any>('/admin/workers/calendar').then((res) => {
  if (!res.success) return;
  const { workers: w, leaves, assignments } = res.data;
  setWorkers(w);
  ...
  leaves.forEach((l: any) => { ... });
  assignments.forEach((a: any) => { ... });
```
**Impact.** If `res.data` is `null`/undefined, or shape drifts (e.g. API returns `{ items: [] }` instead of `{ workers, leaves, assignments }`), this throws an unhandled TypeError inside a `.then` — the page never updates and there's no Sentry to catch it. Dashboard does the same on `data.todayRevenue.toLocaleString()` (kpi line 83) without nullish guard for `todayRevenue`.

**Fix.** Define a typed response (`{ workers: Worker[]; leaves: Leave[]; assignments: Assignment[] }`) and validate with Zod or at minimum `const data = res.data ?? {}; const workers = data.workers ?? []; ...`. Replace `any[]` state with concrete types from `@gearup/types`.

### [P2] KPI cards and activity rows are `<div onClick>` with no role/keyboard handling
_id:_ `clickable-div-no-a11y` · _category:_ ux · _file:_ `apps/web/src/app/admin/dashboard/page.tsx:117-133, 272-294`

```
<div
  key={kpi.label}
  onClick={() => router.push(kpi.href)}
  className="cursor-pointer rounded-xl ..."
>
...
<div ... className="... cursor-pointer ..." onClick={() => { ... router.push(...) }}>
```
**Impact.** Not keyboard navigable, not focusable, not announced as actionable by screen readers. Fails WCAG 2.1.1 keyboard. The KPI cards already link to routes — they should be `<Link>` for prefetch + middle-click + a11y for free.

**Fix.** Replace clickable `<div>` with `<Link prefetch={false} href={kpi.href}>` for KPI cards and activity rows. Same for the three summary stat rows at 235/242/249.

### [P2] Bearer 401 clears token but not `gearup_user`; logout clears token but not in-flight prefetches
_id:_ `user-cache-not-cleared-on-401` · _category:_ auth · _file:_ `apps/web/src/lib/api/client.ts:55-61, 128-134; apps/web/src/lib/auth/auth-context.tsx:83-89`

```
if (res.status === 401 && typeof window !== 'undefined') {
  localStorage.removeItem('gearup_token');
  localStorage.removeItem('gearup_demo');
  clearGetCache();
  window.location.href = '/admin/login';
}
// logout()
localStorage.removeItem('gearup_token');
localStorage.removeItem('gearup_demo');
writeCachedUser(null);
```
**Impact.** On 401 the client removes `gearup_token` but leaves `gearup_user` in localStorage. After redirect to /login, if anything reads the cached user before fetchMe, stale identity (incl. roles/permissions) is shown. Also: logout doesn't cancel the still-running 33-endpoint prefetch loop, which now spam-401s the server until the layout unmounts.

**Fix.** In the 401 branch and in `logout()`, also call `writeCachedUser(null)`. Hoist a shared `signOut()` helper. Wire an `AbortController` into `AdminLayout`'s prefetch loop and abort on logout/user change.

### [P2] Dashboard reads logs as array but pagination wrapper likely returns `{items,total}`
_id:_ `logs-cache-shape-mismatch` · _category:_ business-logic · _file:_ `apps/web/src/app/admin/dashboard/page.tsx:51-55`

```
const logsReq = api.getSWR<any>('/admin/logs?pageSize=8');
if (logsReq.cached?.success) setLogs(logsReq.cached.data ?? []);
logsReq.promise.then((res) => {
  if (res.success && res.data) setLogs(res.data);
});
```
**Impact.** Other consumers in this file handle both shapes (`r.data?.items ?? r.data ?? []`). For logs, the code assumes `res.data` itself is the array. If `/admin/logs` returns the standard paginated `{items, total, page, pageSize}` shape, `logs.map` will throw because `res.data.map` is not a function.

**Fix.** Use the same defensive destructure: `setLogs(res.data?.items ?? res.data ?? [])`. Or better — type the response in `@gearup/types` and stop guessing.

### [P3] /admin → /admin/dashboard redirect ships a client component when it could be server
_id:_ `redirect-page-not-server` · _category:_ performance · _file:_ `apps/web/src/app/admin/page.tsx:1-5`

```
import { redirect } from 'next/navigation';

export default function AdminIndexPage() {
  redirect('/admin/dashboard');
}
```
**Impact.** This is already a server component (good), but it's inside a client `AdminLayout`. The layout's auth check still runs and the client bundle still loads before the redirect resolves. Minor — flag because it can be a permanent 308 redirect at the Next config level for a faster hop.

**Fix.** Add `{ source: '/admin', destination: '/admin/dashboard', permanent: false }` to `next.config.js` redirects so it short-circuits at the edge.

### [P1] Sentry directory is empty `.gitkeep` — no error reporting on admin surface
_id:_ `sentry-not-initialized` · _category:_ observability · _file:_ `apps/web/src/lib/sentry/.gitkeep`

```
$ ls apps/web/src/lib/sentry/
.gitkeep
```
**Impact.** Every silent runtime throw on the dashboard/calendar (the `any` accesses, the recharts mount errors, the user-shape mismatches) will go unreported in production. Go-live with zero observability on the most-trafficked admin pages.

**Fix.** Initialize `@sentry/nextjs` with client + server configs, wrap the admin layout in an ErrorBoundary that reports to Sentry, and add `Sentry.captureException` in the api client's `.catch` branches (currently swallowed to `NETWORK_ERROR`).

### [P2] Network errors swallowed to a generic shape, never surfaced to the user
_id:_ `silent-network-errors` · _category:_ error-handling · _file:_ `apps/web/src/lib/api/client.ts:73, 84-86, 142-144`

```
const pending = run().catch(() => ({ success: false, error: { code: 'NETWORK_ERROR', message: 'Unable to reach server' } } as ApiResponse<T>));
...
} catch {
  return { success: false, error: { code: 'NETWORK_ERROR', message: 'Unable to reach server' } };
}
```
**Impact.** Dashboard/calendar pages check `if (res.success)` and silently do nothing on failure — the loader state often resolves to empty arrays with no toast/banner. Users will think "no appointments today" when really the API is down. No Sentry capture either.

**Fix.** Add a global toast on `success === false` from a mutation, and an inline error banner on GET failures in dashboard/calendar (e.g. "Couldn't load this — retry"). Log the underlying error to Sentry instead of dropping it.

### [P3] Admin layout renders `null` while auth is loading after first hydration
_id:_ `auth-rerender-flash` · _category:_ ux · _file:_ `apps/web/src/app/admin/layout.tsx:122-124`

```
if (isLoginPage) return <>{children}</>;
if (loading) return <LoadingSkeleton />;
if (!user) return null;
```
**Impact.** When the cached user is present but `fetchMe` returns 401, `user` flips to null with `loading=false`, the layout returns `null` (blank white screen) for one tick before the `useEffect` `router.replace('/admin/login')` runs. Looks broken.

**Fix.** Render the skeleton (not `null`) when `!user`, since you're about to redirect anyway.

### [P2] Sidebar visibility = `hasPermission(item.permission)` which trusts client `MeResponse.permissions`
_id:_ `permissions-array-trusted-from-client` · _category:_ auth · _file:_ `apps/web/src/components/layout/admin-sidebar.tsx:93, apps/web/src/lib/auth/auth-context.tsx:90`

```
{NAV.filter((item) => hasPermission(item.permission)).map((item) => {
...
const hasPermission = (p: string) => !!user?.permissions.includes(p);
```
**Impact.** The sidebar is a UX hint, but if `localStorage.gearup_user` is mutated by a malicious browser extension or XSS, an attacker can unlock nav items they shouldn't see. (Real authz must live on the API.) Worth flagging because the cached user is written from `MeResponse` and never re-validated until next fetchMe — anyone with a stale-but-valid token can keep seeing wider nav after a permission revocation.

**Fix.** Re-run `fetchMe` on tab focus (`visibilitychange`) and after any settings change. Never grant any client-side action based purely on cached permissions; the API must re-check.

### [P2] Calendar overview, full calendar, appointments-cal, workers-cal duplicate the same data fetch
_id:_ `calendar-tabs-vs-fullcalendar-no-sync` · _category:_ tech-debt · _file:_ `apps/web/src/app/admin/calendar/page.tsx:43-64, full/page.tsx:27-62, appointments/calendar/page.tsx:21-30, workers/calendar/page.tsx:18-29`

```
// calendar/page.tsx
api.getSWR<any>('/admin/appointments?pageSize=500');
api.getSWR<any>('/admin/workers/calendar');
// full/page.tsx
api.get<any>('/admin/appointments?pageSize=500'),
api.get<any>('/admin/workers/calendar');
// appointments/calendar/page.tsx
api.getSWR<any>('/admin/appointments?pageSize=200');
```
**Impact.** Four near-identical calendar surfaces, each with their own slightly different fetch (200 vs 500 page size, getSWR vs get, slightly different grouping). Maintenance burden, inconsistent truncation, and contradicting UIs (`/appointments/calendar` only shows 200, `/calendar` shows 500). Users may see different counts depending on entry point.

**Fix.** Consolidate into one `useCalendarData(range)` hook backed by a single `/admin/calendar?from=&to=` API that returns `{appointments, holidays, leaves, assignments}`. Delete the duplicate pages or make them thin views over the same hook.

### [P2] Dashboard pulls 500 inventory items just to client-filter low-stock
_id:_ `low-stock-client-filter-500-items` · _category:_ performance · _file:_ `apps/web/src/app/admin/dashboard/page.tsx:68-73`

```
api.get<any>('/admin/inventory/items?pageSize=500').then((r) => {
  if (r.success) {
    const items = r.data?.items ?? r.data ?? [];
    setLowStock(items.filter((i: any) => Number(i.quantityInStock) <= (Number(i.reorderLevel) || 2) && Number(i.quantityInStock) >= 0).slice(0, 10));
  }
});
```
**Impact.** Every dashboard load fetches up to 500 inventory rows over the wire just to show 10. With a real catalogue this is hundreds of KB transferred for every Admin/InventoryManager on every dashboard hit. The prefetch loop also separately hits `/admin/inventory/low-stock` (line 30) — there's already a dedicated endpoint.

**Fix.** Replace with `api.get('/admin/inventory/low-stock?limit=10')` and use the response directly. Also defaults `reorderLevel || 2` is a magic constant — push that default into the API.

### [P2] Calendar uses native `Date` + `toISOString().slice(0,10)` — wrong day in non-UTC zones
_id:_ `fullcalendar-no-tz-bug` · _category:_ business-logic · _file:_ `apps/web/src/app/admin/calendar/page.tsx:19-21, apps/web/src/app/admin/appointments/calendar/page.tsx:33-38`

```
function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}
// appointments/calendar
const key = new Date(item.appointmentDate).toISOString().slice(0, 10);
```
**Impact.** An appointment booked at `2026-06-10T22:00:00+05:30` (IST) is `2026-06-10T16:30:00Z`. `toISOString().slice(0,10)` returns `2026-06-10` — correct here, but a 23:30 IST booking becomes `2026-06-10T18:00:00Z` → still 06-10. However, a 06:00 IST booking on 06-10 = `2026-06-10T00:30:00Z` → 06-10 (also fine), but a 04:00 IST booking = `2026-06-09T22:30:00Z` → groups under 06-09, off by one day. For a shop in IST this misfiles early-morning appointments.

**Fix.** Use a TZ-aware day key based on the shop's locale, e.g. `new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })` (yields YYYY-MM-DD), or normalize on the server.

### [P2] /admin/workers/calendar groups by `assignedWorkerId` which may not exist on Appointment
_id:_ `worker-calendar-uses-wrong-field` · _category:_ business-logic · _file:_ `apps/web/src/app/admin/workers/calendar/page.tsx:32-37`

```
const byWorker = useMemo(() => {
  return appointments.reduce<Record<string, any[]>>((acc, appointment) => {
    if (!appointment.assignedWorkerId) return acc;
    acc[appointment.assignedWorkerId] = [...(acc[appointment.assignedWorkerId] ?? []), appointment];
    return acc;
  }, {});
}, [appointments]);
```
**Impact.** The other calendar page reads `appointment.worker?.fullName` and `appointment.workerId` is not referenced anywhere else in this audit scope. If the field is actually `workerId` (singular), every appointment is dropped (`!appointment.assignedWorkerId` is always true), and every worker card shows "No assigned appointments." Needs schema cross-check.

**Fix.** Verify against `prisma/schema.prisma` whether the column is `assignedWorkerId` or `workerId`. Fix the reducer to use the canonical field. Add a runtime guard / test.

### [P3] Layouts use raw `<img>` for the logo instead of `next/image`
_id:_ `img-tag-not-next-image` · _category:_ performance · _file:_ `apps/web/src/components/layout/admin-sidebar.tsx:86, apps/web/src/app/(public)/layout.tsx:10`

```
<img src="/brand/gearup-logo.png" alt="GearUp" className="h-8 w-auto object-contain" />
```
**Impact.** No automatic responsive sizing, no AVIF/WebP, no priority hint, no width/height attribute → CLS on every navigation. Will also trigger `<img>` ESLint warning if next/eslint is enabled.

**Fix.** Use `next/image` with explicit `width`/`height` and `priority` on the sidebar logo.

### [P3] Dashboard renders date-derived strings on the client only — risk of hydration mismatch if SSR'd
_id:_ `no-suppressHydrationWarning-mismatch` · _category:_ consistency · _file:_ `apps/web/src/app/admin/dashboard/page.tsx:98-106`

```
const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
  ...
};
```
**Impact.** These pages are `'use client'` so it's currently fine — but `formatTime` uses `Date.now()` and `toLocaleString` with no locale, which is locale-dependent (different output on EN-US vs IN dev machines vs prod servers). Inconsistent across sessions and would break the moment anyone SSRs this.

**Fix.** Pin a locale (`toLocaleString('en-IN')`) for shop-local strings; or use a relative-time library. If you ever SSR, add `suppressHydrationWarning` to time spans.

### [P3] Warmup loop has no mobile/saveData/connection check
_id:_ `prefetch-warmup-burns-mobile-data` · _category:_ performance · _file:_ `apps/web/src/app/admin/layout.tsx:90-99`

```
const runDataPrefetch = async () => {
  for (const endpoint of PREFETCH_ENDPOINTS) {
    if (cancelled || document.hidden) return;
    await api.prefetch(endpoint);
    ...
  }
};
```
**Impact.** Checks `document.hidden` but not `navigator.connection.saveData` or `effectiveType`. On a mechanic's 3G phone, 33 API calls eat data and battery for nothing.

**Fix.** Skip the loop when `navigator.connection?.saveData` is true or `effectiveType` is `'slow-2g'`/`'2g'`. Better: only prefetch on `'4g'` and Wi-Fi.

### [P3] Dashboard never distinguishes 'still loading' from 'API returned empty'
_id:_ `dashboard-skeleton-no-empty-state-distinction` · _category:_ ux · _file:_ `apps/web/src/app/admin/dashboard/page.tsx:74-76`

```
if (!data) return <DashboardSkeleton />;
```
**Impact.** If `/admin/reports?type=dashboard` errors, `data` stays null forever and the page shows the skeleton indefinitely with no retry. Same trap for the calendar pages where `loading` flips to false but `items` is `[]` regardless of error vs empty.

**Fix.** Track an error state separately: `const [error, setError] = useState<string | null>(null);` and render a retry button when set.
