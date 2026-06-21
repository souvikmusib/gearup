## Claude Execution Prompt for GearUp

You are working in `/Users/sagnikmitra/Desktop/GitHub/gearup`.

Objective: implement the verified GearUp fixes below, plus the audit findings below, in a production-safe way. Do not do speculative cleanup. Do not touch unrelated files. Do not run destructive database commands. Use migrations for schema changes. Preserve existing data. Preserve dirty-worktree changes you did not make.

### Non-negotiable constraints

- No `prisma db push --force-reset`.
- No destructive Supabase or production mutations outside explicit migration-safe code changes.
- Keep invoice, job card, payment, and stock audit trails intact.
- Do not renumber historical invoices or job cards in-place without keeping legacy traceability.
- If a requested asset file is missing, do not invent brand assets. Wire code for the new asset path and document what file is still needed.
- Before editing, inspect current repo state. After editing, run only relevant verification gates.

### Repo context

- Stack: Next.js 14 App Router, Prisma, Supabase, pnpm workspace monorepo.
- Main app: `apps/web`.
- Key shared UI: `packages/ui`.
- Key schema: `apps/web/prisma/schema.prisma`.
- Current graph/report state was already generated locally.

### Verified current state

1. `Tax Invoice` appears already fixed in source.
   - Search found no remaining `Tax Invoice` or `TAX INVOICE` strings in app source.
   - Main invoice PDF header in `apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts` already renders `INVOICE`.
   - Treat this as a regression-check item. Only change if you find a runtime path still showing `Tax Invoice`.

2. Inventory currently has no true multi-view system.
   - `apps/web/src/app/admin/inventory/items/page.tsx` is list-only.
   - `apps/web/src/app/admin/inventory/categories/page.tsx` and `apps/web/src/app/admin/inventory/suppliers/page.tsx` are separate CRUD pages, not alternate card views of the same dataset.
   - There is no persisted view-mode state, no category-card drill-down state, and no company-card drill-down state in current code.

3. Font rollout is split across multiple pipelines.
   - Global app font is defined in `apps/web/src/styles/globals.css`.
   - Tailwind also hardcodes Google Sans in `apps/web/tailwind.config.js`.
   - Invoice/print HTML separately injects Google Sans in `apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts`.
   - Brand/logo and favicon still point to `/brand/gearup-logo.png` in several places.

4. Numbering is currently random, not chronological.
   - `apps/web/src/lib/id-generators.ts` uses random nanoid-based values for `generateJobCardNumber`, `generateInvoiceNumber`, and `generateWorkerCode`.
   - Schema comments already acknowledge invoice numbering is obsolete.

5. Search and pagination are shallow and inconsistent.
   - Most admin API searches are simple `contains` checks on 1-2 fields only.
   - Many views hardcode fetch sizes like `pageSize=100`, `200`, or `500`.
   - Several list/report pages still have no pagination UI at all.

### User-requested work items

Implement all of the following:

1. Change any remaining `Tax Invoice` heading to `Invoice`.
2. Improve inventory view:
   - add switchable `List View | Category Card View | Company Card View`
   - preserve search/filter state when switching views
   - searching from a card view must stay in that selected view mode
3. Fix font updates not reflecting throughout the system.
4. Implement robust numbering for invoices and job cards:
   - invoice format: `INVGDDMMYYYYNNNN`
   - job card format: `JOBGDDMMYYYYNNNN`
   - `NNNN` resets daily starting from `0001`
   - resilient across pod restarts and dev restarts
   - historical invoices/job cards need clear legacy subtext for audit purposes
5. Verify and revise stock-adjustment nomenclature.
6. Redesign invoices.
7. Replace favicon.
8. Replace current solid logo usage with the correct gradient-mark plus solid wordmark wherever appropriate.
9. Role level should not be a hardcoded variable list.
10. Worker ID and similar staff/document codes should be numerically chronological.
11. Optimize job-card page to eliminate horizontal scrolling as much as possible.
12. Fix filters layout/behavior. User screenshot path was referenced but is not present in repo, so inspect actual UI states and fix based on runtime behavior.
13. Upgrade search:
   - remove the effective `100` item ceiling mentality
   - support dynamic page size
   - add pagination consistently on every list page
   - add advanced multi-layer filtering
14. Add searchable dropdowns system-wide.
   - support keyword-any-order matching
   - for inventory brand/company lookups, return closest possible result instead of empty whenever feasible
15. Fix job-card print format:
   - reduce excess white space
   - fix broken print layout
16. Reduce invoice-edit load time.
   - if full optimization is not possible, show a proper loading state while invoice detail is opening

### File-level issue map

Use this map. Do not rediscover from scratch.

#### Numbering and ID generation

- `apps/web/src/lib/id-generators.ts`
- `apps/web/src/app/api/admin/invoices/route.ts`
- `apps/web/src/app/api/admin/job-cards/route.ts`
- `apps/web/src/app/api/admin/workers/route.ts`
- `apps/web/prisma/schema.prisma`

Required direction:

- Replace random invoice/job-card generation with a durable DB-backed daily sequence.
- Recommended: add a dedicated sequence model/table keyed by document kind + IST business date, incremented transactionally with a unique constraint.
- Do not rely on in-memory counters.
- Use IST day boundaries, not server local time.
- Keep existing numbers unchanged.
- Add derived UI subtext or stored metadata for legacy records whose numbers do not match the new format.
- Audit whether worker codes should follow the same date-sequence strategy. At minimum, stop using random worker codes.

#### Inventory view modes, search, filtering, dropdowns

- `apps/web/src/app/admin/inventory/items/page.tsx`
- `apps/web/src/app/api/admin/inventory/items/route.ts`
- `apps/web/src/app/admin/inventory/categories/page.tsx`
- `apps/web/src/app/admin/inventory/suppliers/page.tsx`
- `apps/web/src/components/shared/list-toolbar.tsx`
- `apps/web/src/components/shared/pagination.tsx`
- `packages/ui/src/components/data-table.tsx`

Required direction:

- Introduce a real inventory view-state model.
- Build card-mode groupings from items, not from separate CRUD pages.
- Keep `search`, `filters`, `page`, and `viewMode` in sync and stable.
- Add reusable searchable select/autocomplete component instead of native select-only patterns.
- Improve backend query model to support:
  - dynamic `pageSize`
  - better search across `itemName`, `sku`, `brand`, category, supplier
  - multi-filter composition
  - future fuzzy/closest-match logic

#### Fonts, favicon, branding, logo rollout

- `apps/web/src/app/layout.tsx`
- `apps/web/src/styles/globals.css`
- `apps/web/tailwind.config.js`
- `apps/web/src/components/layout/admin-sidebar.tsx`
- `apps/web/src/app/admin/login/page.tsx`
- `apps/web/src/app/(public)/layout.tsx`
- `apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts`
- `apps/web/public/brand/*`

Required direction:

- Unify font loading strategy across app shell and print/PDF surfaces.
- If using Google Sans remains intentional, use one reliable loading path and remove split-brain behavior.
- Ensure favicon uses proper favicon asset, not the main logo PNG masquerading as favicon.
- Replace hardcoded `/brand/gearup-logo.png` references with the correct brand asset mapping.
- Do not fabricate a new gradient logo asset. If the asset is missing, leave a clear TODO path and keep code ready for drop-in replacement.

#### Invoice redesign and invoice performance

- `apps/web/src/app/admin/invoices/page.tsx`
- `apps/web/src/app/admin/invoices/[id]/page.tsx`
- `apps/web/src/app/api/admin/invoices/[id]/route.ts`
- `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts`
- `apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts`

Required direction:

- Redesign both list and detail experiences where needed, but preserve accounting correctness.
- Improve perceived and actual load time of invoice detail.
- Current invoice detail page eagerly fetches large supporting datasets on mount:
  - inventory items: `/admin/inventory/items?pageSize=500`
  - workers: `/admin/workers?pageSize=200`
  - AMC follow-up calls after main fetch
- Defer these heavy loads until the user opens relevant controls, or prefetch more intelligently.
- Add a real skeleton or route-level loading state for invoice opening.
- Keep PDF/print output aligned with invoice redesign.

#### Job-card responsiveness and printability

- `apps/web/src/app/admin/job-cards/page.tsx`
- `apps/web/src/app/admin/job-cards/[id]/page.tsx`
- `apps/web/src/app/api/admin/job-cards/[id]/route.ts`
- `apps/web/src/app/api/admin/job-cards/[id]/tasks/route.ts`
- `apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts`
- `packages/ui/src/components/data-table.tsx`

Required direction:

- Reduce horizontal overflow on mobile and narrow desktop widths.
- Rework wide tables/controls into stacked or collapsible layouts where needed.
- Fix job-card print layout, especially mechanic/customer print sections and whitespace balance.

### Audit findings discovered during code review

Fix these too if you touch adjacent areas. These are real findings from current source:

1. Job-card detail page writes the wrong field for customer complaints.
   - In `apps/web/src/app/admin/job-cards/[id]/page.tsx`, the editable `Customer Complaints` input patches `customerVisibleNotes` instead of `customerComplaints`.

2. Task-status print mismatch.
   - Job-card tasks use statuses like `DONE` in `apps/web/src/app/api/admin/job-cards/[id]/tasks/route.ts`.
   - Invoice PDF print logic checks for `COMPLETED` in `apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts`.
   - Result: completed tasks can render unchecked in mechanic/combined print outputs.

3. Inventory item create route ignores `variablePrice` and `isBranded`.
   - UI sends these in `apps/web/src/app/admin/inventory/items/page.tsx`.
   - Create schema in `apps/web/src/app/api/admin/inventory/items/route.ts` does not accept them.
   - Edit route does accept them in `apps/web/src/app/api/admin/inventory/items/[id]/route.ts`.

4. Per-account login throttling is wired to the wrong identifiers.
   - `apps/web/src/middleware.ts` login account-rate-limit logic looks for `email`, `username`, or `phone`, but actual login uses `adminUserId`.
   - The intended per-account limiter is effectively bypassed for normal admin logins.

5. Auth flow is half cookie, half localStorage.
   - `apps/web/src/app/api/admin/auth/login/route.ts` sets an httpOnly cookie.
   - `apps/web/src/lib/auth/auth-context.tsx` still treats localStorage token as required for app auth.
   - `apps/web/src/app/admin/invoices/[id]/page.tsx` PDF open still depends on localStorage token.
   - `apps/web/src/app/admin/settings/page.tsx` export also reads localStorage token.
   - If you modernize auth during this work, do it coherently. Do not leave broken PDF/export flows.

6. Search/dropdown UX is inconsistent and mostly exact-order substring based.
   - No shared fuzzy or tokenized search utility exists.
   - Part pickers in job cards and invoices are custom ad hoc implementations, not reusable system controls.

7. Pagination is missing from several table/report pages.
   - Examples: `apps/web/src/app/admin/inventory/categories/page.tsx`, `apps/web/src/app/admin/inventory/suppliers/page.tsx`, `apps/web/src/app/admin/inventory/low-stock/page.tsx`, `apps/web/src/app/admin/settings/admins/page.tsx`, multiple report pages, template pages, and more.

8. Worker role selection is hardcoded and contradictory.
   - `apps/web/src/app/admin/workers/page.tsx` create form hardcodes `Role A`, `Role B`, `Role C`, `Role D`, `Mechanic`, `Electrician`, `Service Advisor`, `Supervisor`.
   - Worker detail page allows free-text designation edits.
   - Garage config pages aggregate raw designation strings as if they are canonical.
   - This needs a single source of truth.

### Implementation expectations

1. Start by designing the data model changes needed for numbering and role-level normalization.
2. Add tests for any non-trivial logic:
   - daily sequence generation
   - reset behavior at IST date boundary
   - collision-safe concurrent creation behavior if possible
   - search/filter query composition
   - any bug fix for task-print mismatch or wrong-field patching
3. Preserve backward compatibility for existing records.
4. Prefer shared reusable components over page-by-page hacks for:
   - searchable dropdowns
   - pagination controls
   - filter state
   - view mode switching
5. For print/PDF work:
   - verify normal invoice
   - AMC invoice
   - combined mechanic/customer print
   - job-card related print surfaces
6. For mobile/responsive work:
   - verify job-card detail
   - verify invoice detail
   - verify inventory items view modes

### Verification gates

Run the relevant subset after changes:

- `pnpm install` if needed
- `pnpm --filter @gearup/web exec prisma generate`
- `pnpm --filter @gearup/web exec tsc --noEmit`
- relevant tests for new sequence/search logic
- any existing test suites touched by changed logic
- browser verification for:
  - invoice detail open/loading
  - inventory view switching
  - search persistence between views
  - dropdown search behavior
  - job-card responsive layout
  - print preview output

### Output format expected from Claude

Return:

1. concise change summary
2. exact files changed
3. migrations added
4. tests added or updated
5. verification run and results
6. any remaining blocker, especially if brand assets or screenshot context are still missing

### Important note on item 1

Because source already shows `INVOICE`, explicitly report whether `Tax Invoice` was already fixed and whether any runtime-only or cached asset path still needed cleanup. Do not blindly claim this was changed if it was already resolved.
