# Prisma schema, lib infra, packages, build/deploy config — module audit

_Module key:_ `infra-schema`

## Summary

Schema is comprehensive and uses Decimal for money correctly, but ships several go-live blockers in cross-cutting infra: (1) the client-side API cache caches successful GET responses in a process-wide Map keyed only by path+token, so any auth-scoped data leaks across user sessions in the same tab if accounts are switched and survives logout-without-reload; (2) Sentry config files exist but the App Router instrumentation hook / withSentryConfig wrapper is missing, so server/edge Sentry never initializes despite the DSN being set — observability is silently dark; (3) the Prisma `serverComponentsExternalPackages` is wired but several composite-unique constraints are missing on natural identifiers that production-collide (e.g. customer phoneNumber, vehicle registrationNumber, supplier name, AMC servicesUsed monotonicity); (4) the `domain.ts` enums in `@gearup/types` are stale and out of sync with `schema.prisma` (JobCardStatus drifted to a 6-value legacy set vs 13 in DB; InvoiceLineType missing SERVICE_CHARGE and AMC; VehicleType missing SCOOTY) — every frontend casting/narrowing through these types is unsound; (5) `logActivity` is fire-and-forget but uses the shared prisma client outside any request — if called inside a `prisma.$transaction` it deadlocks/races, and it never awaits so errors are swallowed; (6) Decimal money columns are correct but `JobCardPart` and `InventoryItem.quantityInStock` are Decimal while several routes operate on Number — float drift risk in stock math; (7) JWT secret fallback prints a console warning but allows dev mode to run with a hardcoded secret — if NODE_ENV is ever unset in CI/preview, a known secret signs tokens. Several smaller P2s on pagination bounds, dev-mode log noise, and missing onDelete policy on financial FKs.

## Routes audited

- `N/A — module is cross-cutting infra; findings apply to every route that imports these libs`

## Files audited

- `apps/web/prisma/schema.prisma`
- `apps/web/prisma/seed.ts`
- `apps/web/src/lib/prisma.ts`
- `apps/web/src/lib/errors.ts`
- `apps/web/src/lib/pagination.ts`
- `apps/web/src/lib/activity-logger.ts`
- `apps/web/src/lib/jwt-secret.ts`
- `apps/web/src/lib/constants.ts`
- `apps/web/src/lib/format-reg.ts`
- `apps/web/src/lib/id-generators.ts`
- `apps/web/src/lib/api/client.ts`
- `apps/web/next.config.mjs`
- `apps/web/sentry.client.config.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/sentry.edge.config.ts`
- `packages/types/src/api.ts`
- `packages/types/src/domain.ts`
- `packages/types/src/auth.ts`
- `turbo.json`
- `apps/web/scripts/with-root-env.mjs`
- `apps/web/package.json`

## Coupling

prisma.ts is the singleton imported by every route + activity-logger. errors.ts/handleApiError is imported by every API route. id-generators backs invoice/job-card/appointment numbering. api/client.ts is the only frontend HTTP entrypoint and its cache leaks across pages. packages/types/domain.ts is consumed by both frontend forms and server cast sites — drift here corrupts both. jwt-secret.ts is used by lib/auth.ts on every authenticated request. Sentry configs are imported indirectly by @sentry/nextjs but require instrumentation hook in Next 14 App Router.

## Findings

### [P0 · BLOCKER] Client-side GET cache leaks data across users and after logout in the same tab
_id:_ `api-client-cache-cross-user-leak` · _category:_ security · _file:_ `apps/web/src/lib/api/client.ts:11-44`

```
const responseCache = new Map<string, CacheEntry>();
...
function cacheKey(path: string, token: string | null) { return `GET:${token ?? 'public'}:${path}`; }
...
if (res.status === 401 && typeof window !== 'undefined') { localStorage.removeItem('gearup_token'); ... clearGetCache(); window.location.href = '/admin/login'; }
```
**Impact.** Cache key includes token, but on logout-then-login-as-different-user before the page reloads, OR if a 200 response is served while the previous user's token is still in localStorage and a new tab pushes data in, cached payloads can be served. More concretely: 401-triggered clearGetCache happens but if logout is user-initiated (POST to /logout that returns 200) the cache is only cleared by virtue of non-GET success — `delete` requests work, but a plain navigation logout path can leave keyed data resident; switching users in same tab without full reload shows other user's data until first 401.

**Fix.** Tie cache to a session-version sentinel (bumped on login/logout), or clear cache on any auth state change; better yet drop the in-memory cache and rely on Next data cache / React Query.

  _Adversarial verify:_ **REFUTED** (now P3) — Refuted. The auth context's logout() (apps/web/src/lib/auth/auth-context.tsx:83-89) explicitly calls api.clearCache() and removes the token; login() (line 77-82) also calls api.clearCache() before setting the new token. Additionally, the cache key in client.ts:22-24 includes the token itself, so entries cached under user A's token are not retrievable when user B's token is active. The finding's core scenario (user-initiated logout leaving cache resident, or cross-user serving in same tab) is not exploitable given the existing clearCache calls on both auth transitions. Not a go-live blocker.

### [P0 · BLOCKER] Sentry server/edge config never loads — App Router requires instrumentation.ts + withSentryConfig
_id:_ `sentry-not-initialized-app-router` · _category:_ observability · _file:_ `apps/web/next.config.mjs:1-9 / apps/web/sentry.server.config.ts:1-8`

```
next.config.mjs has no withSentryConfig wrapper and no `instrumentation.ts` exists in apps/web/. sentry.server.config.ts and sentry.edge.config.ts will not be auto-loaded by @sentry/nextjs v8 on Next 14 App Router without the instrumentation hook.
```
**Impact.** Production errors will not be captured server-side. Console-only logging in handleApiError (`console.error('Unhandled API error:', error)`) is the only signal — invisible on Vercel without log drains.

**Fix.** Add `apps/web/instrumentation.ts` that imports the appropriate sentry config based on runtime, and wrap next.config.mjs with `withSentryConfig`. Also set `NEXT_PUBLIC_SENTRY_DSN` in turbo.json globalEnv.

  _Adversarial verify:_ **CONFIRMED** (now P1) — Verified: next.config.mjs has no withSentryConfig wrapper, and no instrumentation.ts exists anywhere in apps/web (checked root, src, and via find). @sentry/nextjs v8 is installed and sentry.server.config.ts / sentry.edge.config.ts files exist but will not be loaded — v8 requires the instrumentation hook to bootstrap server/edge SDK. Client-side errors will still be captured via sentry.client.config.ts (auto-injected), but server/edge errors will be invisible. Downgrading from P0 to P1: the app technically runs and ships, client-side telemetry partially exists, and handleApiError still console.errors (visible in Vercel runtime logs even without drains) — it's a serious observability gap but not strictly a launch blocker.

### [P0 · BLOCKER] packages/types/domain.ts enums are stale vs schema.prisma — unsound casts everywhere
_id:_ `types-domain-drift` · _category:_ type-safety · _file:_ `packages/types/src/domain.ts:5,26-32,54-56`

```
VehicleType = 'CAR' | 'BIKE' | 'OTHER' (missing SCOOTY).
JobCardStatus = 'OPEN' | 'ESTIMATE_READY' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'CANCELLED' — schema has 13 values (CREATED, UNDER_INSPECTION, ESTIMATE_PREPARED, AWAITING_CUSTOMER_APPROVAL, APPROVED, REJECTED, PARTS_PENDING, WORK_IN_PROGRESS, QUALITY_CHECK, READY_FOR_DELIVERY, DELIVERED, CANCELLED, CLOSED).
InvoiceLineType missing SERVICE_CHARGE and AMC.
```
**Impact.** Frontend status badges, switch statements, narrowing all silently coerce. A real JobCard with status 'WORK_IN_PROGRESS' is typed as never on the client. Forms that submit SCOOTY won't typecheck.

**Fix.** Regenerate domain.ts from Prisma enums or import the Prisma-generated enum types directly. Replace hardcoded unions with `${PrismaEnum}` patterns; add a CI check `prisma generate && tsc --noEmit`.

  _Adversarial verify:_ **CONFIRMED** (now P2) — Verified drift exists: schema.prisma VehicleType includes SCOOTY (missing from domain.ts), InvoiceLineType includes SERVICE_CHARGE and AMC (missing), and JobCardStatus has 13 values vs 6. However the JobCardStatus mismatch is intentional — apps/web/src/app/admin/job-cards/[id]/page.tsx defines SIMPLE_STATUSES and explicit dbToSimple/simpleToDb mapping functions, so domain.ts JobCardStatus represents a UI-simplified projection, not unmediated DB drift. The VehicleType (SCOOTY) and InvoiceLineType (SERVICE_CHARGE/AMC) gaps are real and would cause form-submission/badge issues, but the impact is bounded and easily caught at runtime — not a go-live blocker. Downgraded from P0 to P2: real type-safety drift worth fixing, but not a hard blocker because the file uses string-union types and most frontend code already uses string parameters or explicit mapping.

### [P1] logActivity is fire-and-forget on the shared prisma client — unsafe inside $transaction and silently swallows failures
_id:_ `activity-logger-tx-and-swallow` · _category:_ data-integrity · _file:_ `apps/web/src/lib/activity-logger.ts:18-33`

```
export function logActivity(params) { prisma.activityLog.create({ data: { ... } }).catch((e) => console.error('Activity log failed:', e.message)); }
```
**Impact.** (1) Any caller awaiting nothing means audit log writes can be cut off when Lambda freezes after response (common on Vercel). (2) If callers run this inside an outer `prisma.$transaction` callback, it uses the *root* prisma — race against the in-flight tx and bypasses rollback (logs an action that may have been rolled back). (3) JSON.parse(JSON.stringify(...)) throws on BigInt/Decimal — those throws are caught only inside the .catch on the .create promise, NOT the synchronous serialization above, so a Decimal field causes an unhandled throw.

**Fix.** Accept optional tx client param; await it where caller is awaiting the response anyway; sanitize Decimal/BigInt via a custom replacer; consider queueing.

### [P0 · BLOCKER] JWT_SECRET dev fallback fires whenever NODE_ENV !== 'production' — Vercel preview deploys ship with a known secret
_id:_ `jwt-dev-fallback-leaks-to-preview` · _category:_ auth · _file:_ `apps/web/src/lib/jwt-secret.ts:1-13`

```
const DEV_FALLBACK_JWT_SECRET = 'dev-only-jwt-secret-change-me';
...
if (process.env.NODE_ENV !== 'production') { console.warn(...); return DEV_FALLBACK_JWT_SECRET; }
```
**Impact.** Vercel preview deployments and any environment where NODE_ENV is not exactly 'production' silently sign and verify JWTs with a public string in the repo. Anyone who reads this file can forge admin tokens against preview/staging URLs that often share data with prod.

**Fix.** Throw whenever JWT_SECRET is unset, regardless of NODE_ENV. The dev fallback should only activate when an explicit `ALLOW_INSECURE_JWT=1` is set locally.

  _Adversarial verify:_ **REFUTED** (now P2) — The code does fall back to a hardcoded secret when NODE_ENV !== 'production', but the P0 claim hinges on Vercel preview deployments shipping with that fallback. Vercel sets NODE_ENV='production' for both production and preview builds (it is a build-time constant baked into Next.js bundles), so previews would hit the throw branch, not the fallback, assuming JWT_SECRET is unset. The actual risk is limited to local dev / test environments where NODE_ENV is 'development' or 'test' — a real code-smell worth fixing (require explicit opt-in like ALLOW_INSECURE_JWT=1) but not a go-live blocker for preview/prod.

### [P1] Customer.phoneNumber and Vehicle.registrationNumber have no @unique — duplicate customers/vehicles will accumulate
_id:_ `schema-missing-unique-phone-rego` · _category:_ data-integrity · _file:_ `apps/web/prisma/schema.prisma:220-246, 248-278`

```
model Customer { phoneNumber String  @@index([phoneNumber]) }  // no @unique
model Vehicle { registrationNumber String  @@index([registrationNumber]) } // no @unique
```
**Impact.** Public booking and admin create flows can each insert duplicate customers/vehicles. Reporting double-counts, AMC matches wrong vehicle, payments may collide. Once data exists with duplicates, adding @unique later requires manual dedupe.

**Fix.** Add `@unique` (or `@@unique([phoneNumber])` and `@@unique([registrationNumber])`); use upsert in customer/vehicle creation paths; backfill before promoting constraint.

### [P2] Invoice/Payment/AMC FKs to Customer/Vehicle/JobCard have default Restrict but no explicit onDelete — implicit policy
_id:_ `schema-no-ondelete-on-financial-fks` · _category:_ data-integrity · _file:_ `apps/web/prisma/schema.prisma:637-642, 670-685, 812-839`

```
customer  Customer  @relation(fields: [customerId], references: [id])
vehicle   Vehicle?  @relation(fields: [vehicleId], references: [id])
jobCard   JobCard?  @relation(fields: [jobCardId], references: [id])
```
**Impact.** Implicit Restrict is correct for financial integrity but unstated — a future migration generator may infer differently. AmcServiceUsage has no Cascade on contract delete (intentional?) but no documentation. Hard to reason about.

**Fix.** Add `onDelete: Restrict` explicitly on all financial relations; document the chosen policy in the schema header.

### [P1] AmcContract servicesUsed/servicesRemaining are denormalized counters with no DB-level guard
_id:_ `amc-servicesused-not-atomic` · _category:_ race-condition · _file:_ `apps/web/prisma/schema.prisma:812-839, 841-855`

```
servicesUsed Int @default(0)
servicesRemaining Int
// AmcServiceUsage rows reference contract — but nothing prevents servicesRemaining going negative or two concurrent jobCard usages incrementing past totalServices.
```
**Impact.** Two concurrent JobCard completions can both consume the last AMC service slot, customer gets a free service they're not entitled to.

**Fix.** Wrap usage creation + counter update in $transaction with `update where: { id, servicesRemaining: { gt: 0 } }` and check affected rows; or add a DB check constraint `servicesRemaining >= 0`.

### [P1] InventoryItem.quantityInStock has no DB constraint to prevent negative — concurrent consumption can over-issue
_id:_ `stock-no-negative-guard` · _category:_ race-condition · _file:_ `apps/web/prisma/schema.prisma:556-591, 593-610`

```
quantityInStock Decimal @default(0) @db.Decimal(12, 2)
reservedQuantity Decimal @default(0) @db.Decimal(12, 2)
// no CHECK constraint; StockMovement records before/after but is non-transactional contract
```
**Impact.** Two jobCards reserving/consuming the same SKU simultaneously can drive stock below 0. Decimal allows the bug to go silent (no overflow); reconciling later requires manual audit of StockMovement log.

**Fix.** Add raw SQL CHECK constraint `quantityInStock >= 0` via migration; ensure every consumption uses `update where: { id, quantityInStock: { gte: qty } }` inside a $transaction and verifies affected count.

### [P2] Invoice.invoiceNumber unique globally but no yearly/garage scope; nanoid 8-char alpha collision possible at scale
_id:_ `invoice-no-tenant-or-yearly-scope` · _category:_ business-logic · _file:_ `apps/web/prisma/schema.prisma:612-649, apps/web/src/lib/id-generators.ts:4-8`

```
invoiceNumber String @unique
// generated by `INV-${nanoid(8)}` over [0-9A-Z] (~2.8e12 space) — birthday collisions at ~1.6M invoices is ~50%
```
**Impact.** Single-garage SaaS is fine, but the alphanumeric random IDs are user-visible and not sequential — bad UX for accountants (no GST sequence), and at scale the global unique constraint will start throwing P2002 from random collisions. No retry logic exists in id-generators.

**Fix.** Either (a) use a sequence per fiscal year (`INV-2026-000123`) backed by a DB sequence/atomic counter, or (b) wrap generation in a retry loop on P2002. For Indian GST compliance, sequential numbering is effectively required.

### [P2] Pooler tuning hardcoded to Supabase hostname — any other Postgres host gets default settings
_id:_ `prisma-pool-only-supabase` · _category:_ config · _file:_ `apps/web/src/lib/prisma.ts:5-22`

```
const isSupabasePooler = url.hostname.includes('pooler.supabase.com');
if (!isSupabasePooler) return databaseUrl;
```
**Impact.** If the team moves to Neon/RDS/PlanetScale Postgres, the serverless connection-limit=1 fix silently disengages and Vercel functions exhaust connections.

**Fix.** Trigger the pgbouncer/connection_limit logic on any URL with `pgbouncer=true` query or a documented env flag; log which mode is active at boot.

### [P2] handleApiError P2002/P2003 echoes raw DB column names back to client
_id:_ `errors-prisma-leaks-field-names` · _category:_ security · _file:_ `apps/web/src/lib/errors.ts:68-89`

```
const fields = (error.meta?.target as string[])?.join(', ') || 'field';
return NextResponse.json({ ... message: `A record with this ${fields} already exists` })
```
**Impact.** Public endpoints (booking, estimate token) can return messages like `A record with this customerId_roleId already exists` — leaks schema and enables enumeration. Low severity but trivially fixable.

**Fix.** Map common targets to user-facing labels; for unknown targets return a generic 'duplicate value'.

### [P2] paginate() caps pageSize at 500 — abusable on public/list routes for memory and DB load
_id:_ `pagination-bound-too-high` · _category:_ performance · _file:_ `apps/web/src/lib/pagination.ts:1-5`

```
const take = Math.min(Math.max(pageSize, 1), 500);
```
**Impact.** Anyone hitting `?pageSize=500` (or just a misbehaving client) pulls 500-row joins on inventory/customers/jobCards which include heavy nested includes elsewhere. constants.ts even defines MAX_PAGE_SIZE = 100 — paginate() ignores it.

**Fix.** Import and use MAX_PAGE_SIZE (100) from constants; require explicit opt-in for >100.

### [P1 · BLOCKER] JobCardStatus drift will cause runtime UI crashes when finalized jobs show novel statuses
_id:_ `domain-jobcard-status-shipped-to-client` · _category:_ ux · _file:_ `packages/types/src/domain.ts:26-32`

```
export type JobCardStatus = 'OPEN' | 'ESTIMATE_READY' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'CANCELLED';  // schema has CREATED, UNDER_INSPECTION, ESTIMATE_PREPARED, AWAITING_CUSTOMER_APPROVAL, APPROVED, REJECTED, PARTS_PENDING, WORK_IN_PROGRESS, QUALITY_CHECK, READY_FOR_DELIVERY, DELIVERED, CANCELLED, CLOSED
```
**Impact.** Any switch/badge mapping on the frontend will fall through to 'unknown' for every real status. Default-case rendering on customer-facing pages becomes 'undefined'/blank.

**Fix.** Sync types — same fix as types-domain-drift but flagged here because it has direct UX blast radius today.

  _Adversarial verify:_ **REFUTED** (now P3) — The type drift between packages/types/src/domain.ts (6 statuses) and apps/web/prisma/schema.prisma JobCardStatus enum (13 statuses) is real. However, the claimed UX blast radius is not supported. The shared StatusBadge component in packages/ui/src/components/status-badge.tsx accepts status: string, falls back to a neutral gray DEFAULT_COLOR for unknown values, and renders the actual status text via status.replace(/_/g, ' ') — so unknown statuses display as a readable label (e.g. "UNDER INSPECTION") in a gray pill, not 'undefined'/blank, and there is no crash. Call sites use `any`-typed data from the API, so the type drift does not cause runtime fallthroughs either. This is a real types-package hygiene issue (already covered by the related types-domain-drift finding) but not a P1 go-live blocker on its own.

### [P1 · BLOCKER] Seed uses snake-case permission keys that don't match PERMISSIONS dot-case constants
_id:_ `permissions-seed-mismatch` · _category:_ auth · _file:_ `apps/web/prisma/seed.ts:34-38 vs packages/types/src/domain.ts:78-115`

```
seed.ts: `const perms = ['CUSTOMERS_VIEW','CUSTOMERS_EDIT', ... 'NOTIFICATIONS_MANAGE'];`
domain.ts: `CUSTOMERS_VIEW: 'customers.view', ...`
```
**Impact.** After a fresh seed, requirePermission('customers.view') checks against permissions seeded as 'CUSTOMERS_VIEW' — no match → 403 on every route. Either the auth code falls back to role-based check (then permissions table is dead weight) or the whole app is locked out post-seed.

**Fix.** Rewrite seed.ts to iterate Object.values(PERMISSIONS) from @gearup/types and create matching role mappings via ROLE_PERMISSIONS.

  _Adversarial verify:_ **REFUTED** (now P3) — The login route (apps/web/src/app/api/admin/auth/login/route.ts) builds JWT permissions from the in-code ROLE_PERMISSIONS map in @gearup/types (dot-case strings), NOT from the seeded Permission/RolePermission tables. requirePermission in apps/web/src/lib/auth.ts checks the JWT payload's permissions array, so the snake-case seed rows are never consulted at runtime. The seeded Permission table is effectively dead weight (worth cleaning up), but the claimed lockout/403 impact does not occur — downgraded to P3 cleanup, not a go-live blocker.

### [P3] formatRegNumber regex greedy match breaks for BH-series and 3-letter state codes (DL, etc.)
_id:_ `format-reg-overlapping-regex` · _category:_ validation · _file:_ `apps/web/src/lib/format-reg.ts:8-21`

```
const state = clean.slice(i).match(/^[A-Z]{1,2}/)?.[0] || '';  // BH-series is 'BH' then year digits — works
// but DL5SAB1234 → state='DL', dist='5', series='SAB', num='1234' OK; KL01CA1234 OK. However a typo with no district digits → entire alpha block consumed as state-then-series mash
```
**Impact.** Minor — display-only formatting. Validation `isValidRegNumber` only checks length >= 4, so junk like 'AAAAA' passes.

**Fix.** Tighten isValidRegNumber with a regex matching real Indian reg formats; keep formatter forgiving but add unit tests for BH and 3-letter series.

### [P1] next.config.mjs has no security headers (CSP, X-Frame-Options, Referrer-Policy)
_id:_ `next-config-no-headers-csp` · _category:_ security · _file:_ `apps/web/next.config.mjs:1-9`

```
const nextConfig = { transpilePackages: [...], experimental: { serverComponentsExternalPackages: [...] } };  // no `headers()` function, no CSP
```
**Impact.** Admin login page is clickjackable; no defense against injected scripts; no Referrer-Policy means tokens in query string leak to third-party links.

**Fix.** Add `async headers()` returning X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy minimal, and a reasonable CSP (allow self, Sentry, Vercel analytics).

### [P2] turbo.json globalEnv missing NEXT_PUBLIC_SENTRY_DSN and SUPABASE refs — cache hits across env changes
_id:_ `turbo-missing-public-env` · _category:_ config · _file:_ `turbo.json:1-31`

```
"globalEnv": ["DATABASE_URL", "DIRECT_URL", "JWT_SECRET", "NODE_ENV"]  // missing NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_*, any feature flags
```
**Impact.** Turbo build cache will not invalidate when DSN or other env values change, producing stale `next build` artifacts with wrong baked-in NEXT_PUBLIC_ values.

**Fix.** Add NEXT_PUBLIC_SENTRY_DSN and any NEXT_PUBLIC_* envs to globalEnv; consider envMode 'strict'.

### [P1] api/client.ts does window.location.href = '/admin/login' inside a GET fetch — public-page calls hijack navigation
_id:_ `client-cache-redirect-side-effect` · _category:_ ux · _file:_ `apps/web/src/lib/api/client.ts:55-60, 128-133`

```
if (res.status === 401 && typeof window !== 'undefined') { ... window.location.href = '/admin/login'; return { success: false, ... }; }
```
**Impact.** A public booking page that calls a misconfigured/protected endpoint receives 401 and is forcibly redirected to admin login. Same for any cross-tenant URL probe. Also fights the user's back button.

**Fix.** Only redirect when the calling page is under /admin; otherwise return the 401 and let the caller render an inline error.

### [P2] Missing composite indexes on hot reporting queries (customerId+status, vehicleId+status, invoiceDate range)
_id:_ `jobcard-no-composite-status-index` · _category:_ performance · _file:_ `apps/web/prisma/schema.prisma:433-481, 612-649`

```
JobCard has @@index([customerId]), @@index([status]) separately. Same for Invoice. Dashboards filtering 'open jobs by customer' or 'unpaid invoices this month' do two index lookups instead of one composite.
```
**Impact.** Slow dashboard queries as data grows; not blocker for go-live but will bite within months.

**Fix.** Add `@@index([customerId, status])`, `@@index([vehicleId, status])` on JobCard; `@@index([invoiceDate, paymentStatus])` on Invoice.

### [P3] Prisma log levels include 'error' but no event listener is attached — errors only hit stdout
_id:_ `prisma-no-error-event-listener` · _category:_ observability · _file:_ `apps/web/src/lib/prisma.ts:24-29`

```
new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'], ... })
```
**Impact.** Without `{ emit: 'event', level: 'error' }` + a Sentry forwarder, slow queries and connection errors are invisible in prod log streams.

**Fix.** Switch to event emitters and forward errors/slow-query warnings to Sentry once Sentry is actually initialized.

### [P2] scripts/with-root-env.mjs silently continues without env file — masks misconfigured CI
_id:_ `with-root-env-no-validation` · _category:_ config · _file:_ `apps/web/scripts/with-root-env.mjs:12-15`

```
if (existsSync(rootEnvPath)) { dotenv.config({ path: rootEnvPath, override: false }); }
// no else branch — no warning if file missing
```
**Impact.** On Vercel (where the file doesn't exist), behavior relies on Vercel env injection — fine. But in a misconfigured CI runner with neither file nor injected env, the build silently runs against undefined DATABASE_URL and only fails deep in Prisma generate.

**Fix.** After loading, validate required envs (DATABASE_URL, JWT_SECRET in prod) using a small zod schema; fail fast with a clear message.

### [P2] generateInvoiceNumber/JobCardNumber have no retry on unique-constraint collision
_id:_ `id-generators-no-collision-retry` · _category:_ error-handling · _file:_ `apps/web/src/lib/id-generators.ts:6-10`

```
export const generateInvoiceNumber = () => `${INVOICE_PREFIX}-${alphanumeric()}`;  // caller does prisma.invoice.create; if duplicate, P2002 propagates to handleApiError → 409 to user
```
**Impact.** Although unlikely at small scale, a real collision (or even a backfill that includes existing IDs) returns 409 to the user trying to create an invoice. Should self-heal with a retry.

**Fix.** Wrap create in a 3-attempt retry loop that regenerates the ID on P2002 for the *invoiceNumber* target only.

### [P2] Several FK columns lack explicit indexes (Appointment.confirmedByAdminId, Appointment.assignedWorkerId, JobCardTask.assignedWorkerId, Invoice.createdByAdminId, Payment.receivedByAdminId, Expense.createdByAdminId, AmcServiceUsage.amcContractId is indexed but contract→plan FK amcPlanId not)
_id:_ `schema-unindexed-fks` · _category:_ performance · _file:_ `apps/web/prisma/schema.prisma:308-339, 499-517, 612-685, 812-839`

```
Postgres does NOT auto-create indexes on FK columns; Prisma only creates indexes on @@index/@@unique. Filters like 'invoices created by me' or 'appointments I confirmed' will table-scan.
```
**Impact.** Slow admin filters, slow CASCADE on AdminUser delete (unlikely but possible).

**Fix.** Add @@index on every FK column that is queried; minimally on AmcContract.amcPlanId, Invoice.createdByAdminId, Payment.receivedByAdminId, Appointment.assignedWorkerId.
