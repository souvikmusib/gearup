---
mode: reference
updated: 2026-09-20
verified_against: 5af8fc8
---

# Frontend specification

> **This describes the code, not the plan.** Everything below was read from working tree `5af8fc8` on 2026-09-20. Counts, file paths, and behaviour claims are re-derivable with the quoted commands. The plan-side view of what the frontend is meant to become lives in `docs/requirements/` and `docs/architecture.md`; the latter is older than this pass, so where the two disagree, this file is the ground truth.
>
> **Method.** Read `apps/web/package.json`, `apps/web/next.config.mjs`, `apps/web/tailwind.config.js`, `apps/web/src/middleware.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/admin/layout.tsx`, `apps/web/src/app/admin/admin-shell.tsx`, `apps/web/src/app/(public)/layout.tsx`, `apps/web/src/lib/auth.ts`, `apps/web/src/lib/api/client.ts`, `apps/web/src/lib/auth/auth-context.tsx`, `apps/web/src/lib/theme/theme-context.tsx`, `apps/web/src/components/layout/admin-sidebar.tsx`, `AGENTS.md`, and every barrel and index in `packages/ui/src/`. Skimmed the 18 files under `apps/web/src/components/` and 15+ page files across the admin, public, and marketing routes. Ran `find` over `apps/web/src/app` for pages and API routes, `wc -l` for the sizes quoted, and `grep -rn` for icon library usage, emoji-as-icon presence, form library, toast library, print calls, PWA library markers, and service worker files.
>
> **What this pass did NOT do.** No `next build`, no dev server, no HTTP request, no Lighthouse run, no PWA installability check in a real browser. No line-by-line read of the 742-line `admin/invoices/[id]/page.tsx`, the 641-line `landing-experience.tsx`, or the 388-line print page. No audit of every one of the 63 page files against the design tokens; the design-system gap section spot-checks the 10 pages named there. No verification that the CSP configured in `next.config.mjs` actually lands on responses in production (source-file read only). No audit of individual API route handlers, which belong in the backend spec.

---

## 1. Overview

Next.js 14.2 App Router on React 18.3 with TypeScript 5.4, from `apps/web/package.json`. Bundler is the stock Next 14 webpack + Turbopack dev; no `experimental.turbo` opt-in in `next.config.mjs`.

Styling is Tailwind 3.4 with `darkMode: 'class'` (from `apps/web/tailwind.config.js`) plus a small hand-written `src/styles/globals.css` that fixes `Google Sans` and `Google Sans Code` at the body level. The font is not loaded via `next/font/google`; the CSS just names it, so `Google Sans` will only render if the browser has it, otherwise the fallback stack kicks in (`Product Sans`, `system-ui`, `-apple-system`, `"Segoe UI"`, Roboto, `sans-serif`).

State: no React Query, no SWR, no Zustand, no Redux. There is a hand-written GET cache in `src/lib/api/client.ts` with a 120 s TTL, in-flight de-dupe, and a `getSWR(path)` shape that returns `{ cached, promise }` for stale-while-revalidate reads (§6). Auth and theme are two `React.createContext` providers wired in `src/providers/index.tsx`; that is the whole client-state stack.

Forms: no library. Every form is a raw `<form onSubmit>` with local `useState`. `zod` 3.23 is a production dependency but is imported only by API route handlers (`grep -rn 'from .zod.' apps/web/src/app` returns 10 matches, all under `apps/web/src/app/api/`). No shared client-side form validator, no `react-hook-form`, no `formik`.

Tables: no library. Every list view builds its own `<table>` or uses the `DataTable` in `packages/ui/src/components/data-table.tsx` (78 lines). Charts use `recharts` 2.15.3 (`AreaChart`, `BarChart`, `PieChart` seen live in `admin/dashboard/page.tsx`). Calendar uses `@fullcalendar/*` 6.1.15 (`daygrid`, `timegrid`, `interaction`, `react`).

PDF and print: no PDF library on the client. Invoices, estimates, salary slips are rendered as HTML strings from `src/lib/invoice-templates/*.ts` and printed via `window.print()` with a `@media print` block. See §5 print surface.

Icon system: `lucide-react` 0.378.0 (`grep -rl 'lucide-react' apps/web/src | wc -l` = 23). No Google Material Symbols, no inline-SVG icon helper. Emoji-as-icon usage is nearly zero; see §10.

Font system: no `next/font`. CSS-declared `Google Sans` / `Google Sans Code` with a system fallback stack in `globals.css`.

Other in-tree libraries: `gsap` 3.15, `three` 0.184 (the landing hero uses one of these for the 3D scene, see `landing-experience.tsx`), `@vercel/analytics`, `@vercel/speed-insights`, `@sentry/nextjs` 8 (initialised via `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` at the app root; `next.config.mjs` wraps the export in `withSentryConfig`), `nanoid`, `bcryptjs`, `jsonwebtoken`.

---

## 2. Routing

```
find apps/web/src/app -name 'page.tsx' | wc -l   →  63
find apps/web/src/app/api -name 'route.ts' | wc -l   →  83
```

63 page files, 83 API route handlers. API surface is covered in the backend spec.

The route tree has four groups: `(public)` (unauth), `admin/*` (auth-gated), the marketing pages `/amc` and `/location`, and the very small `/api/*` tree.

### 2.1 Public surface: `(public)/*` and standalone marketing

| Route | File | Lines | What it does |
|---|---|---|---|
| `/` | `(public)/page.tsx` | 74 | Server component. Marketing landing with a hero, service grid, "how it works", trust section. Links to `/book-service` and `/track`. No API call. |
| `/book-service` | `(public)/book-service/page.tsx` | 271 | Client component. Multi-step form; POSTs to `/api/public/service-request` (and calls `/api/public/customer-lookup` on the phone step). |
| `/contact` | `(public)/contact/page.tsx` | 45 | Static contact card. No API call. |
| `/track` | `(public)/track/page.tsx` | 195 | Client. Enter a service-request or job-card number; calls `/api/public/track` and renders the returned timeline. |
| `/estimate/[token]` | `(public)/estimate/[token]/page.tsx` | 147 | Client. GETs `/api/public/estimate/[token]`; POSTs approval or rejection with an optional comment. |
| `/amc` | `amc/page.tsx` | 147 | Server component. Static marketing page listing 14 product categories with regular vs. AMC discount. No API. |
| `/location` | `location/page.tsx` | 5 | Server component. `redirect('https://maps.app.goo.gl/ng4K4ktWzDpZoTg4A')`. Nothing else. |

`(public)/layout.tsx` (26 lines) is a header + footer with a brand mark and three links (`/book-service`, `/track`, `/contact`) plus `<ThemeToggle />`. The AMC and location pages sit OUTSIDE the `(public)` group, so they render with the root layout only and get no public header.

### 2.2 Admin surface: `admin/*`

```
find apps/web/src/app/admin -name 'page.tsx' | wc -l   →  57
```

57 admin pages. `admin/layout.tsx` (45 lines) is the server-side perimeter: it reads `x-pathname` from a middleware-injected header to identify `/admin/login`, and for every other path it verifies the JWT cookie synchronously and `redirect('/admin/login')`s on failure. `admin/admin-shell.tsx` (74 lines) is the client shell that mounts `<AdminSidebar />` + `<Breadcrumbs />` around `{children}` and holds a defense-in-depth client redirect for tokens revoked mid-session.

`admin/page.tsx` exists but the edge middleware in `next.config.mjs`'s `redirects()` short-circuits `/admin` to `/admin/dashboard` before the layout runs, so the bundle for `admin/page.tsx` is never shipped.

Grouped by feature area:

| Area | Pages | Notes on what each renders / calls |
|---|---|---|
| Dashboard | `dashboard/` | Client. `/admin/reports?type=dashboard` primary, then batches of `/admin/logs`, `/admin/reports/revenue`, `/admin/reports/jobs`, `/admin/reports/workers`, `/admin/inventory/low-stock` via `getSWR`. Recharts area/bar/pie widgets. Role-aware (INVENTORY_MANAGER, RECEPTIONIST, SUPER_ADMIN, ADMIN). |
| Service requests | `service-requests/`, `service-requests/[id]/` | Client. List and detail; convert-to-job-card action. |
| Appointments | `appointments/`, `appointments/[id]/`, `appointments/calendar/` | Client. FullCalendar view; `/admin/appointments` list + detail. |
| Calendar (cross-cutting) | `calendar/`, `calendar/full/` | Client. Aggregated calendar (214 lines in `calendar/full/page.tsx`). |
| Job cards | `job-cards/`, `job-cards/[id]/` | Client. Ticket-lifecycle detail with parts / labour lines. |
| Customers | `customers/`, `customers/[id]/` | Client. List + detail with vehicles nested. |
| Vehicles | `vehicles/`, `vehicles/[id]/` | Client. List + detail; brand/model picker via `CustomerPicker`/`ModelPicker`. |
| Workers | `workers/`, `workers/[id]/`, `workers/calendar/` | Client. Roster, per-worker detail, calendar. |
| Inventory | `inventory/catalog/`, `inventory/categories/`, `inventory/items/`, `inventory/low-stock/`, `inventory/movements/`, `inventory/suppliers/` | Client. Full inventory sub-tree, six pages. |
| Invoices | `invoices/`, `invoices/[id]/` | Client. Detail page is 742 lines; renders line items, then generates one of five HTML templates via `src/lib/invoice-templates/*` on demand. `window.print()` at line 253 (see §5). |
| Estimates | `estimates/`, `estimates/[id]/`, `estimates/[id]/print/` | Client. Print page is 388 lines with its own `@media print` block and `window.print()` on mount timer. |
| Payments | `payments/` | Client. Records and reconciliation. |
| AMC | `amc/contracts/`, `amc/contracts/[id]/`, `amc/plans/` | Client. AMC contract lifecycle; plan definitions. |
| Expenses | `expenses/`, `expenses/categories/` | Client. Ledger + taxonomy. |
| Salary slips | `salary-slips/` | Client. Template renderer (`src/lib/salary-slip-template.ts`). |
| Notifications | `notifications/`, `notifications/templates/` | Client. Outbox + template CRUD. |
| Reports | `reports/`, `reports/revenue/`, `reports/appointments/`, `reports/jobs/`, `reports/inventory/`, `reports/workers/`, `reports/expenses/` | Client. Recharts. Seven pages. |
| Logs | `logs/` | Client. Activity log viewer, backs `/admin/logs`. |
| Settings | `settings/`, `settings/admins/`, `settings/business-hours/`, `settings/garage/`, `settings/holidays/`, `settings/hsn-rates/`, `settings/integrations/`, `settings/notifications/`, `settings/quick-items/`, `settings/roles/` | Client. Ten sub-pages. |
| Auth | `login/` | Client. Login form; POSTs `/api/admin/auth/login`. |

Every admin page opens with `'use client'`. The layout is the only server component in the admin tree.

### 2.3 What is missing

There is no root-level `error.tsx`, `not-found.tsx`, or `loading.tsx` in `apps/web/src/app/`. `find ... -name 'error.tsx' -o -name 'not-found.tsx' -o -name 'loading.tsx'` returns zero. Failures at the root fall through to Next 14's default black-and-white error page. That is a real gap for a production app: a 500 in a chunk load shows the framework default with no brand context.

---

## 3. Shared components

Under `apps/web/src/components/` there are **18 `.tsx` files**. Four directories are `.gitkeep`-only (`admin/`, `charts/`, `forms/`, `tables/`); the tree is grouped by intent but half the intents are placeholders.

### 3.1 Layout

| File | Lines | Role |
|---|---|---|
| `layout/admin-sidebar.tsx` | 160 | The whole admin nav: 22-entry `NAV` array, four sub-menus (`Calendar`, `Inventory`, `AMC`, `Reports`), permission-filtered via `hasPermission(item.permission)`, mobile drawer with `X`/`Menu` toggle. Brand image is `/brand/gearup.svg`, uses `next/image` with `unoptimized`. |

### 3.2 Shared primitives (`components/shared/*`)

| File | Lines | One line |
|---|---|---|
| `breadcrumbs.tsx` | 89 | Derives the crumb chain from `usePathname()`; title-cases each segment. |
| `customer-picker.tsx` | 168 | Async searchable customer selector with an inline "New customer" toggle. |
| `list-body.tsx` | 35 | Loading / empty / rows switch for list pages. |
| `list-toolbar.tsx` | 151 | Search + filter + sort + pagination controls for list pages. |
| `modal.tsx` | 29 | Uncontrolled `<dialog>`-style modal with backdrop click-to-close. |
| `pagination.tsx` | 74 | Numeric page control with prev/next. |
| `process-loader.tsx` | 54 | Multi-step progress indicator for long ops. |
| `searchable-select.tsx` | 138 | Combobox with keyboard nav. |
| `skeletons.tsx` | 48 | `DashboardSkeleton`, `ListSkeleton`, `DetailSkeleton`. |
| `theme-toggle.tsx` | 12 | One-button light / dark swap; calls `useTheme().toggle`. |
| `vehicle-reg-lookup.tsx` | 70 | Registration-number lookup with debounced fetch. |
| `whatsapp-button.tsx` | 15 | Deep-link to `https://wa.me/...`. |

### 3.3 Domain widgets

| File | Lines | One line |
|---|---|---|
| `dashboard/inventory-dashboard.tsx` | 140 | Recharts widgets for inventory managers on the dashboard. |
| `inventory/edit-modal.tsx` | 113 | Inline edit shell over `InventoryItemForm`. |
| `inventory/inventory-item-form.tsx` | 340 | The whole inventory-item form (SKU, category, cost, price, tax, min-stock, brand/model picker). |
| `inventory/model-picker.tsx` | 126 | Two-level brand->model picker used by inventory and vehicles. |
| `public/landing-experience.tsx` | 641 | The `three.js`/`gsap` hero animation for the marketing landing. Not rendered by `(public)/page.tsx` today (`grep` shows no import); appears to be a staged upgrade. |

### 3.4 Shared UI package: `@gearup/ui`

`packages/ui/src/` is a tiny in-repo library with six primitives, 179 lines total:

| Component | Lines |
|---|---|
| `DataTable` | 78 |
| `EmptyState` | 12 |
| `Input` | 27 |
| `PageHeader` | 14 |
| `StatCard` | 12 |
| `StatusBadge` | 30 |

Consumed via `import { PageHeader } from '@gearup/ui'`. `transpilePackages: ['@gearup/ui', '@gearup/types']` in `next.config.mjs` compiles them alongside the web app.

---

## 4. Hooks

```
find apps/web/src/hooks -type f     →  apps/web/src/hooks/.gitkeep
find apps/web/src/app -path '*/hooks/*'   →  (none)
```

**There are no custom hooks.** `apps/web/src/hooks/` is `.gitkeep`-only, and no `app/**/hooks/` folder exists. Every stateful behaviour is either a `useState` local to the page, a call into one of the two context hooks (`useAuth`, `useTheme`), or a direct `api.get / api.getSWR / api.post / api.patch / api.delete` from `@/lib/api/client`.

The pattern this replaces (a `useQuery`, `useMutation`, `useFetch` wrapper) does not exist; consumers reach for `useEffect` + `useState` + the API client every time. That is repeated in ~60 pages.

---

## 5. UI conventions

### 5.1 Icons

`lucide-react` 0.378.0 is the sole icon system. 23 files import from it, including the sidebar (13 icons: `LayoutDashboard`, `FileText`, `Calendar`, `Wrench`, `Users`, `Bike`, `UserCog`, `Package`, `Receipt`, `CreditCard`, `DollarSign`, `Bell`, `BarChart3`, `ScrollText`, `Settings`, `LogOut`, `Menu`, `X`, `ChevronDown`), the dashboard, and the public estimate viewer (`CheckCircle`, `Loader2`, `XCircle`).

`AGENTS.md` in this repo is a 13-line claude-mem stub and states no UI rules. There is no project-level ban on emoji as icons and no rule pinning Material Symbols. Sagnik's global `~/.claude/CLAUDE.md` Learned Rule #52 makes Material Symbols the sanctioned icon system for surfaces he builds; this codebase pre-dates that rule and does not follow it.

Emoji-as-icon usage is nearly zero. `grep -rn -E "['\"](\\u2713|\\u2717|\\u2705|\\u274c|\\u26a0|\\u23f3|\\U0001f389|\\U0001f6ab|\\U0001f517|\\u270f|\\U0001f5d1|\\u2192|\\u2190)"` over `apps/web/src/app` and `apps/web/src/components` returns only three hits:

- `apps/web/src/app/admin/appointments/page.tsx:144` uses `← Select existing` inside a text button.
- `apps/web/src/app/admin/notifications/templates/page.tsx:15` renders `? '✓' : '✗'` in a table cell for `isActive`.
- `apps/web/src/components/shared/customer-picker.tsx:110` uses `← Select existing`.

A wider sweep for the pictograph set (`\U0001f4cb`, `\U0001f3af`, `\U0001f4a1`, `\U0001f680`, `\U0001f4ca`, `✨`, `\U0001f464`, `\U0001f512`, `\U0001f527`) finds four files that contain such glyphs: `amc/page.tsx`, `admin/calendar/full/page.tsx`, `admin/invoices/[id]/page.tsx`, `admin/inventory/items/page.tsx`. All four are in-copy decorations, not control icons, but they are the ones to fix first if the icon rule is adopted.

### 5.2 Color and theme

Dark mode is class-driven Tailwind (`darkMode: 'class'`). `ThemeContext` in `src/lib/theme/theme-context.tsx` (28 lines) stores the choice in `localStorage.gearup_theme`, seeds from `prefers-color-scheme` on first load, and toggles `document.documentElement.classList`. Root layout carries `suppressHydrationWarning` on `<html>` to swallow the seed flash.

Brand accent is Tailwind `blue-600` (`#2563eb` from the default palette), used for primary buttons and links. Success is `green-600`, danger is `red-600`, warning is unused in the sample I read. There is no design-token layer, no CSS custom properties for brand colours; `tailwind.config.js` extends only `fontFamily`, not `colors`.

### 5.3 Layout

- Public: header (brand + three nav links + theme toggle) over `<main class="flex-1">` over a copyright footer. Full width, `max-w-6xl` inner containers. Standalone marketing pages `/amc` and `/location` do NOT get this shell; they render inside the root layout only.
- Admin: 264 px sidebar on `lg+`, off-canvas drawer below. `<main>` scrolls independently. Breadcrumbs at the top of every page.
- Login: centered card, `bg-gray-50 dark:bg-gray-950`.

### 5.4 Feedback

- **Toasts**: **none**. `grep -rn 'toast\|Sonner'` finds only a comment in `src/lib/api/client.ts` saying "a global toast/banner layer can surface it to the user" for a future implementation. `window.dispatchEvent(new CustomEvent('gearup:network-error', ...))` is fired on network failure, but no listener subscribes, so it disappears.
- **Loaders**: three shapes co-exist. Skeleton components in `components/shared/skeletons.tsx` (used by the dashboard and admin shell), inline `Loader2` from lucide (used by the public estimate viewer and login), and per-page `process-loader.tsx` for multi-step ops.
- **Empty states**: `<EmptyState>` from `@gearup/ui` is the sanctioned primitive but is used sparingly; several list pages inline a "No records" `<p>`.
- **Error states**: on 401 the API client redirects to `/admin/login` unconditionally when the current path is under `/admin`. On other errors, callers read `res.error?.message` and surface it in-page as red text or a banner. There is no page-level `<ErrorBoundary>` and no route-level `error.tsx`.

### 5.5 Forms

Raw HTML forms. Every field is a controlled `<input>` with `useState`. Errors are per-page `useState<string>` and rendered as a red banner. No schema validation on the client; the API accepts, validates with `zod`, and returns a shaped error the page reads.

Login (`admin/login/page.tsx`, 66 lines) is the canonical shape: two fields, submit disabled while loading, one-shot idempotency guard against double-submits noted in the source comment.

### 5.6 Tables

`@gearup/ui`'s `DataTable` (78 lines) is the shared primitive. Some list pages use it, others build a raw `<table>`. `list-toolbar.tsx` (151 lines) provides search + filter + sort + pagination controls, and `pagination.tsx` (74 lines) provides the numeric page bar. Server-side pagination is standard on list endpoints; there is no infinite-scroll pattern in this codebase.

Row actions are inline links / buttons in the last column; there is no shared "row menu" component. Sorting is `?sort=col&dir=asc` in the URL, read by the page and passed through.

### 5.7 Modals and sheets

`components/shared/modal.tsx` (29 lines) is the only sanctioned modal, a `<div class="fixed inset-0 ...">` overlay with a backdrop click handler. No sheet, no drawer besides the mobile sidebar. Complex flows open a full page instead of a modal (e.g. `admin/customers/[id]`).

### 5.8 Print and PDF surfaces

There is no client PDF library. Every printed artefact is an HTML string with a `@media print` block, opened in a new window and printed via `window.print()`.

- `apps/web/src/lib/invoice-templates/index.ts` re-exports five templates: `tax-invoice`, `combined`, `customer-draft`, `mechanic-copy`, `amc-invoice`. Each is a string-returning function with its own inline styles and `@media print { body { -webkit-print-color-adjust:exact; ...} @page { margin:8mm; size:A4; } }` block.
- `apps/web/src/lib/salary-slip-template.ts` is the sixth surface.
- `apps/web/src/app/admin/estimates/[id]/print/page.tsx` (388 lines) is a full route that auto-prints via `setTimeout(() => window.print(), 600)` on mount and carries its own `@media print` styles.
- `apps/web/src/app/admin/invoices/[id]/page.tsx:253` opens a new window with the template HTML and calls `w.print()` on it.

There is no PDF server route in `apps/web/src/app/api/**` that I saw (would need to be confirmed against the backend spec). Everything relies on the browser's print-to-PDF.

---

## 6. State and data flow

`src/lib/api/client.ts` is the whole client-side data layer. It exports one object `api` with `get`, `post`, `patch`, `delete`, `getSWR`, `prefetch`, `clearCache`.

- **GET cache**: `Map<string, {data, expiresAt}>` with a 120 000 ms TTL, keyed on `GET:<path>`.
- **In-flight de-dupe**: `Map<string, Promise>` so concurrent identical GETs share one request.
- **Stale-while-revalidate**: `getSWR(path)` returns `{ cached, promise }`; consumers render `cached` immediately (if any) and swap when `promise` resolves. The dashboard uses this on every primary call so a warm dashboard renders synchronously.
- **Invalidation**: any successful non-GET clears the whole cache (`clearGetCache()` inside `request`). That is coarse but simple. There is no per-path invalidation and no optimistic-update helper.
- **401 handling**: `handleUnauthorized()` clears `localStorage.gearup_token`, `gearup_demo`, `gearup_user`, clears the GET cache, and (if `window.location.pathname` starts with `/admin`) redirects to `/admin/login`. Non-admin callers get the 401 inline.
- **Network errors**: logged to console and dispatched as `gearup:network-error` on `window`; nothing listens.

Auth state propagates through `AuthProvider` (`src/lib/auth/auth-context.tsx`, ~140 lines). The client holds the JWT in `localStorage.gearup_token` (with the security note in the file's header, "XSS anywhere in the SPA can exfiltrate the token") AND the same JWT is set as an `httpOnly` cookie `gearup_token` by the login route so the server-side `admin/layout.tsx` guard can read it. The cookie is the fallback documented in `src/lib/auth.ts`, which prefers the `Authorization: Bearer` header. `hasPermission(p)` is exposed on the auth context; the sidebar filters its 22 `NAV` entries with it, and each page independently gates controls off `user?.roles?.includes('SUPER_ADMIN')` and similar.

There are no optimistic updates. Every mutation is a plain `api.post/.patch/.delete`, followed by cache-clear and a re-fetch.

---

## 7. PWA readiness assessment

**Verdict: 0 / 5.** This is not a PWA today and has none of the pieces in place.

- `apps/web/public/manifest.json`: does not exist. `apps/web/src/app/manifest.ts` does not exist either. The root layout wires a `metadata.icons` block (four PNG sizes + an SVG + Apple touch icon) but a favicon/`apple-touch-icon` is not a web-app manifest.
- Service worker: absent. `find apps/web -name 'sw.ts' -o -name 'sw.js' -o -name 'service-worker*'` returns nothing. `grep -l 'next-pwa\|serwist\|workbox' apps/web/package.json apps/web/next.config.mjs` returns nothing.
- Icons: `apps/web/public/brand/` carries `gearup-mark-32.png`, `gearup-mark-192.png`, `gearup-mark-512.png`, `gearup-mark.png`, `gearup-mark.webp`, `gearup-favi.svg`, `gearup.svg`, `gearup-logo.png`. **192 and 512 exist; no maskable icon is declared.** Sizes cover the iOS home-screen and Android launcher requirements from a raster standpoint, but no manifest ties them together, no `purpose: "maskable"` variant exists, and there is no 180 x 180 Apple touch icon (the layout aliases the 192 to `apple: '/brand/gearup-mark-192.png'`, which iOS accepts but is not the canonical size).
- Install prompt: not wired. No `beforeinstallprompt` listener anywhere.
- Push, background sync, background fetch: absent.

### What is missing to make it a real PWA

1. A `manifest.json` (or `app/manifest.ts`) with `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color`, an icons array including a `purpose: "maskable"` variant.
2. A service worker with a precache for the app shell and a stale-while-revalidate strategy for `GET /api/admin/*` responses that are already cache-friendly (120 s TTL matches; the SW can extend the effective window across reloads).
3. An install prompt UI, probably in the admin shell so the shop-floor tablet can add it in one tap.
4. An offline shell: a static fallback rendered when `/admin/dashboard` and friends fail to fetch data.

### Which parts of the app suffer most on flaky connections (shop floor case)

- **Job cards under work**: every save is a full round-trip and cache-clear. Losing signal mid-save loses the edit.
- **Inventory movement recording**: line-item forms with no local queue; a dropped POST loses the movement.
- **Live appointment status changes**: read-heavy dashboard already has SWR, but writes (marking a job in-progress) do not queue.
- **Print flows**: `window.print()` on a locally-generated HTML is offline-safe once the data is loaded; those already survive.

### Minimum-viable PWA scope (3 to 5 tasks)

1. **Add a `manifest.ts` and a `theme-color` meta tag.** ~30 minutes. Makes the app installable on Android and iOS.
2. **Add a maskable icon variant** (single 512 x 512 with safe zone). ~1 hour including asset work.
3. **Install a service worker (Serwist or next-pwa v5) with app-shell precache and SWR for `GET /api/admin/reports?type=dashboard`, `GET /api/admin/service-requests`, `GET /api/admin/job-cards`.** ~4 to 6 hours. Delivers "app opens instantly on the tablet" and "dashboard renders on the way to the workshop".
4. **Wire a write-queue for job-card and inventory-movement mutations** using IndexedDB + a Background Sync fallback. ~1 to 2 days. Makes the shop-floor workflow survive a dead spot.
5. **Add a "You are offline" banner and a global `beforeinstallprompt` capture with a one-tap "Install" button in the admin sidebar footer.** ~2 to 3 hours.

Tasks 1 + 2 + 3 alone move the score from 0 to a working PWA (a 3). Task 4 is what earns the last two points for a workshop-grade experience.

---

## 8. Auth UI

- **Login page**: `apps/web/src/app/admin/login/page.tsx` (66 lines). Two-field form (`adminUserId`, `password`), Eye / EyeOff password toggle, one-shot idempotency guard against double submits, `POST /api/admin/auth/login`. On success, `login(res.data.token)` (which writes `localStorage.gearup_token`, fetches `/me`, caches the user in `localStorage.gearup_user`) and `router.push('/admin/dashboard')`.
- **Session cookie handling**: the login route sets `gearup_token` as `httpOnly + Secure + SameSite=Lax` (`AUTH_COOKIE_NAME` in `src/lib/auth.ts`); the client also keeps the same JWT in `localStorage` for the `Authorization: Bearer` header. The admin server-side layout verifies the cookie synchronously with `jwt.verify` before rendering, then delegates to the client `AdminShell`.
- **Middleware**: `src/middleware.ts` matches `/api/:path*` and `/admin/:path*`. On `/admin/*` it injects `x-pathname` so the layout can tell login apart from the guarded pages. It does not itself gate authentication.
- **Role-based UI gating**: the sidebar's 22-item `NAV` array carries `permission` keys (`'dashboard.view'`, `'service-requests.view'`, `'job-cards.view-own'`, `'customers.view'`, `'vehicles.view'`, `'workers.manage'`, `'appointments.view'`, `'inventory.view'`, `'invoices.view'`, `'payments.record'`, `'amc.contracts-view'`, `'expenses.view'`, `'notifications.view'`, `'reports.view'`, `'logs.view'`, `'settings.manage'`) and filters with `hasPermission(item.permission)` from the auth context. Individual pages also read `user?.roles?.includes('SUPER_ADMIN' | 'ADMIN' | 'INVENTORY_MANAGER' | 'RECEPTIONIST')` to hide role-specific widgets on the dashboard.
- **Sign-out**: `useAuth().logout()` in the sidebar footer button. Client-side clear only; the server sees the cookie expire naturally, or on the next authed request via `handleUnauthorized`.

---

## 9. Public surface (route + file inventory)

| Route | File | Purpose |
|---|---|---|
| `/` | `apps/web/src/app/(public)/page.tsx` | Marketing landing (hero + services + how-it-works + trust). |
| `/book-service` | `apps/web/src/app/(public)/book-service/page.tsx` | Public service-request form. POST `/api/public/service-request`; GET `/api/public/customer-lookup`. |
| `/track` | `apps/web/src/app/(public)/track/page.tsx` | Public status tracker. GET `/api/public/track`. |
| `/estimate/[token]` | `apps/web/src/app/(public)/estimate/[token]/page.tsx` | Customer-facing estimate approval. GET + POST `/api/public/estimate/[token]`. |
| `/contact` | `apps/web/src/app/(public)/contact/page.tsx` | Static contact card. |
| `/amc` | `apps/web/src/app/amc/page.tsx` | AMC pricing marketing poster. |
| `/location` | `apps/web/src/app/location/page.tsx` | 5-line `redirect()` to Google Maps. |

The marketing landing pulls `landing-experience.tsx` (641 lines, `three.js`/`gsap`) into the tree but does not render it yet (import-graph check: `(public)/page.tsx` imports `Link`, `lucide-react` icons; no `landing-experience` import).

---

## 10. Design-system gaps

Spot-check of 10 pages: `(public)/page.tsx`, `admin/dashboard/page.tsx`, `admin/login/page.tsx`, `admin/customers/page.tsx`, `admin/invoices/[id]/page.tsx`, `admin/estimates/[id]/print/page.tsx`, `admin/inventory/items/page.tsx`, `admin/calendar/full/page.tsx`, `amc/page.tsx`, `(public)/estimate/[token]/page.tsx`.

- **No shared design tokens.** Colours are Tailwind palette names (`blue-600`, `gray-950`, `red-700`, `green-600`) inlined per component. A brand-blue change is a repo-wide grep-and-replace.
- **Two brand marks in play.** `/brand/gearup.svg` (used in the sidebar and public header, `unoptimized` next/image), `/brand/gearup-favi.svg` (root layout favicon). The mark PNGs `gearup-mark-*.png` are exclusively for the tab icon and PWA.
- **Buttons diverge.** `admin/login/page.tsx` uses a full-width primary button with `rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow`. `(public)/page.tsx` uses `rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow`. The public estimate page uses inline utility strings again with no shared `<Button>` primitive. There is no `<Button>` in `@gearup/ui`.
- **Inputs diverge.** Login has its own `inputCls` constant; `@gearup/ui/Input` exists (27 lines) but is not the one the login page reaches for.
- **Cards diverge.** Dashboard, public landing, and AMC page each hand-roll their own card shell (`rounded-lg border ... bg-white ...`).
- **In-copy pictograph glyphs.** `amc/page.tsx`, `admin/calendar/full/page.tsx`, `admin/invoices/[id]/page.tsx`, `admin/inventory/items/page.tsx` contain emoji-class characters in decorative copy (not as controls). Not urgent, but the first four surfaces to run through a design pass.
- **Icons.** `lucide-react` throughout, no Material Symbols. Consistent within the codebase; divergent from Sagnik's global standard.
- **Loading states.** Three shapes (skeletons, inline spinner, process-loader). No one convention.
- **Toasts / notifications.** None. Errors are red banners inline; a dispatched `gearup:network-error` event has no listener.
- **Focus states.** Tailwind defaults (browser blue ring). No brand focus token.
- **Spacing.** Consistent Tailwind scale in the surfaces I read; no ad-hoc pixel values noticed.

The highest-value move would be to promote a `<Button>`, `<Card>`, and `<Input>` triple into `@gearup/ui`, plus a `useToast()` hook, and migrate the 10 pages above first; the rest will follow the templates.
