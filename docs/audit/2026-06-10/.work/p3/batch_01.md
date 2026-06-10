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


## Target: `apps/web/src/app/(public)/book-service/page.tsx` (1 findings)

### [P3] Success screen tells user to track but doesn't deep-link with the new ref
- id: `booking-success-no-followup-link` · cat: ux
- loc: `apps/web/src/app/(public)/book-service/page.tsx:138-148`
- evidence:
```
<p className="mt-2 text-3xl font-mono font-bold text-blue-600">{result.referenceId}</p>
<p className="mt-4 text-sm text-gray-500 ...">Save this ID to track your service request. We'll notify you via WhatsApp/email.</p>
```
- impact: UX miss — user has to manually copy/paste into /track. Track page already supports ?referenceId=... query (track/page.tsx:54-57).
- fix: Add a primary CTA <Link href={`/track?referenceId=${result.referenceId}`}>Track this request</Link> and a Copy button.

---

## Target: `apps/web/src/app/admin/appointments/page.tsx` (1 findings)

### [P3] Appointments page load() does not reset page to 1 on filter change
- id: `appointment-page-load-not-paged-on-filter` · cat: ux
- loc: `apps/web/src/app/admin/appointments/page.tsx:96-101`
- evidence:
```
<input ... value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value, statusFilter); }} />
<select ... onChange={(e) => { setStatusFilter(e.target.value); load(search, e.target.value); }}>
```
- impact: User on page 4, applies a status filter that has 2 result pages — sees empty results and thinks nothing matches.
- fix: setPage(1) before calling load on filter/search change; also debounce the search input.

---

## Target: `apps/web/src/app/admin/customers/[id]/page.tsx` (1 findings)

### [P3] Customer/Vehicle detail page has two action buttons in same flex slot
- id: `customer-detail-double-button` · cat: ux
- loc: `apps/web/src/app/admin/customers/[id]/page.tsx:37-41, /admin/vehicles/[id]/page.tsx:38-42`
- evidence:
```
<div className='flex items-center justify-between'>
  <PageHeader ... />
  <button>Edit Customer</button>
  <button>Delete</button>
</div>
```
- impact: `justify-between` with 3 children spaces them across the row weirdly (header pushed left, Edit drifts to middle, Delete pinned right). Looks broken on small screens. Also `confirm()` for destructive delete is jarring vs the polished Modal pattern used elsewhere.
- fix: Wrap the two buttons in a `<div className='flex gap-2'>` and use a real confirmation Modal.

---

## Target: `apps/web/src/app/admin/dashboard/page.tsx` (2 findings)

### [P3] Dashboard renders date-derived strings on the client only — risk of hydration mismatch if SSR'd
- id: `no-suppressHydrationWarning-mismatch` · cat: consistency
- loc: `apps/web/src/app/admin/dashboard/page.tsx:98-106`
- evidence:
```
const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
  ...
};
```
- impact: These pages are `'use client'` so it's currently fine — but `formatTime` uses `Date.now()` and `toLocaleString` with no locale, which is locale-dependent (different output on EN-US vs IN dev machines vs prod servers). Inconsistent across sessions and would break the moment anyone SSRs this.
- fix: Pin a locale (`toLocaleString('en-IN')`) for shop-local strings; or use a relative-time library. If you ever SSR, add `suppressHydrationWarning` to time spans.

### [P3] Dashboard never distinguishes 'still loading' from 'API returned empty'
- id: `dashboard-skeleton-no-empty-state-distinction` · cat: ux
- loc: `apps/web/src/app/admin/dashboard/page.tsx:74-76`
- evidence:
```
if (!data) return <DashboardSkeleton />;
```
- impact: If `/admin/reports?type=dashboard` errors, `data` stays null forever and the page shows the skeleton indefinitely with no retry. Same trap for the calendar pages where `loading` flips to false but `items` is `[]` regardless of error vs empty.
- fix: Track an error state separately: `const [error, setError] = useState<string | null>(null);` and render a retry button when set.

---

## Target: `apps/web/src/app/admin/expenses/page.tsx` (1 findings)

### [P3] Row-click opens edit modal but row a11y depends on DataTable internals
- id: `expenses-ui-rowclick-a11y` · cat: ux
- loc: `apps/web/src/app/admin/expenses/page.tsx:124`
- evidence:
```
<DataTable ... onRowClick={openEdit} />  with inline delete button inside the row using e.stopPropagation
```
- impact: Whole-row clickability without explicit role=button/tabIndex (depends on DataTable impl) is hostile to keyboard/SR users.
- fix: Audit @gearup/ui DataTable to expose role=button + tabIndex when onRowClick set; or move actions to a row-end menu.