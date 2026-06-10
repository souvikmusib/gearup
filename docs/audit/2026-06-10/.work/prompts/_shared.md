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



# SHARED INFRA PROMPT — handle ALL of the following files

You are the shared-infrastructure coordinator. You must edit MULTIPLE files in one pass, in the order: types → schema → libs → middleware → config. Other agents will rely on your changes.

For schema.prisma changes: after editing, run `cd /Users/sagnikmitra/Desktop/GitHub/gearup/apps/web && npx prisma generate` via Bash (do NOT run migrations — main coordinator handles that).

## File: `apps/web/src/middleware.ts` (5 findings)

### 1. [P0 · BLOCKER] CORS Access-Control-Allow-Origin: * on every API route
- _id_: `cors-wildcard-on-authed-api` · _category_: security
- _location_: `apps/web/src/middleware.ts:26-28`
- _evidence_:
```
response.headers.set('Access-Control-Allow-Origin', '*');
response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
```
- _impact_: Any website can call your admin and public APIs from a victim's browser. Because tokens are in localStorage and sent via Authorization header (not cookies), browsers won't auto-attach them — but any page that obtains a token (XSS, phishing) can call any API cross-origin without restriction, and public booking/estimate endpoints are also exposed for abuse. Also blocks any future move to cookie-based auth.
- _proposed fix_: Whitelist explicit origins (env CORS_ALLOWED_ORIGINS) and echo only matching Origin header. Never use '*' on routes that accept Authorization.
- _verifier said_: real=True, Confirmed at apps/web/src/middleware.ts:26-28: middleware unconditionally sets Access-Control-Allow-Origin: * on all /api/* routes, including admin routes that accept Authorization headers. The wildcard does prevent credentialed cookie-based requests, and since tokens live in localStorage (not auto-attached cookies), a random origin cannot read another user's authed responses without first stealing the token via XSS/phishing. However, public endpoints (booking/estimate POSTs) are exposed to abuse from any origin, and the policy blocks any future migration to cookie-based auth and weakens defense-in-depth. Real issue and worth fixing pre-launch, but I'd grade it P1 rather than a hard P0 go-live blocker since exploitation requires a separate token-theft vector.

### 2. [P0 · BLOCKER] Rate limiter is per-process in-memory — useless on Vercel/serverless
- _id_: `in-memory-rate-limiter-broken-on-serverless` · _category_: security
- _location_: `apps/web/src/middleware.ts:4-18`
- _evidence_:
```
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW = 60_000; // 1 minute
function isRateLimited(ip: string, limit = RATE_LIMIT): boolean { ... entry.count++; return entry.count > limit; }
```
- _impact_: Every serverless instance has its own Map. With N warm instances an attacker effectively gets N*10 login attempts/min and can brute-force the 30-day lockout window or hammer public endpoints. Map also grows unbounded — small memory leak.
- _proposed fix_: Use a shared store: Upstash Redis ratelimit, Vercel KV, or DB-backed sliding window keyed by `${ip}:${path}`. Add LRU cap if keeping in-memory as best-effort layer.
- _verifier said_: real=True, Confirmed: middleware.ts uses a module-level Map for rate limiting, which on Vercel/serverless is per-instance and per-cold-start. The login limit of 10/min and public 30/min are effectively multiplied by warm instance count, weakening brute-force protection on /api/admin/auth/login. The Map also grows unbounded with no LRU/TTL cleanup beyond per-key reset. Downgrading from P0 to P1 because the route still has some throttling and the login endpoint likely has additional protections (lockout window mentioned), but it remains a real go-live concern that should be backed by Upstash/Vercel KV.

### 3. [P1] x-forwarded-for trusted blindly — rate limit bypass
- _id_: `x-forwarded-for-spoof` · _category_: security
- _location_: `apps/web/src/middleware.ts:36`
- _evidence_:
```
const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
```
- _impact_: Attacker sets X-Forwarded-For: random.fake.ip on each request and trivially defeats the per-IP login limiter and lockout-by-account-id (paired with brute-forcing admin IDs). Same header is also stored in audit log as actor IP — unreliable forensics.
- _proposed fix_: On Vercel, use the platform-provided trusted client IP (e.g., request.ip or the right index from XFF based on known proxy hop count). Document trust boundary. Also key login rate limit on adminUserId, not just IP.

### 4. [P0 · BLOCKER] Rate limiter is in-memory per-instance and trusts spoofable x-forwarded-for
- _id_: `rate-limiter-in-memory-spoofable` · _category_: security
- _location_: `apps/web/src/middleware.ts:5-18, 35-48`
- _evidence_:
```
const rateMap = new Map<string, { count: number; resetAt: number }>();
...
const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
```
- _impact_: On Vercel (and any horizontally scaled deploy) each lambda instance has its own Map, so the real limit is N_instances × 30/min, and cold starts wipe state. x-forwarded-for is a client-supplied header that any tool can rotate to bypass entirely. Effective protection ≈ zero. This affects the login route too.
- _proposed fix_: Use Upstash @upstash/ratelimit or Vercel KV with a sliding window keyed on req.ip (Next 14: request.ip, which Vercel populates from the trusted edge), composite with the form field (phone for booking, jobCardId for estimate). For login, also key on username. Always fall back to deny on storage failure, not allow.
- _verifier said_: real=True, Confirmed: middleware.ts uses an in-memory Map and keys on the raw x-forwarded-for header without validating it's from a trusted proxy. On Vercel serverless this Map is per-instance and wiped on cold start, and any attacker can rotate x-forwarded-for to bypass entirely (defaulting to 'unknown' aggregates all unkeyed requests). Affects both /api/admin/auth/login (10/min) and /api/public/* POST routes (30/min). Downgrading to P1 rather than P0: the limiter is not the sole protection (login still requires valid credentials and presumably bcrypt; public endpoints likely have validation/uniqueness constraints), so effective security isn't zero, but the rate-limit control as designed is essentially non-functional and should be replaced with Upstash/KV keyed on request.ip plus form fields before scale.

### 5. [P1 · BLOCKER] CORS: Access-Control-Allow-Origin: * on every API including auth-cookie routes
- _id_: `cors-allow-origin-wildcard` · _category_: security
- _location_: `apps/web/src/middleware.ts:25-28`
- _evidence_:
```
response.headers.set('Access-Control-Allow-Origin', '*');
response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
```
- _impact_: Wildcard is applied to /api/admin/* including auth/login. Browsers will block credentialed requests so this isn't immediate session-theft, but it permits any origin to issue unauthenticated POSTs (including the public estimate approve/reject) as CSRF-by-CORS, and allows third-party JS to read all public endpoint responses. There is no CSRF token on any POST.
- _proposed fix_: Restrict to an allowlist: only /api/public/* gets a configurable Allow-Origin (or no CORS at all if all clients are same-origin). Never set Allow-Origin:* on admin routes. Add a CSRF token (or SameSite=Strict + Origin check) on cookie-authenticated mutations.
- _verifier said_: real=True, Confirmed at apps/web/src/middleware.ts:25-28. The middleware matcher is /api/:path* and unconditionally sets Access-Control-Allow-Origin: * on every API route, including /api/admin/auth/login and other admin/cookie-authenticated endpoints. While wildcard with credentials is blocked by browsers (so cookie-bearing requests can't be read cross-origin), it still allows any third-party site's JS to read responses from public endpoints (e.g., estimate approve/reject) and there is no CSRF token visible in the middleware on POSTs. P1 go-live blocker is appropriate: scope CORS to /api/public/* with an allowlist and add CSRF/Origin checks on cookie-auth mutations.
## File: `apps/web/src/lib/auth/auth-context.tsx` (1 findings)

### 1. [P1] JWT stored in localStorage instead of httpOnly cookie
- _id_: `token-in-localstorage-xss` · _category_: security
- _location_: `apps/web/src/lib/auth/auth-context.tsx:36-37,80`
- _evidence_:
```
const token = localStorage.getItem('gearup_token');
...
localStorage.setItem('gearup_token', token);
```
- _impact_: Any XSS anywhere in the admin SPA (npm dep, markdown render, dangerouslySetInnerHTML, future ad/analytics script) gives full account takeover by stealing the token. JWTs are valid 24h with no server-side revocation list. httpOnly + Secure + SameSite=Strict cookies would block JS exfiltration entirely.
- _proposed fix_: Move token to httpOnly Secure SameSite=Strict cookie set on /api/admin/auth/login response. Have auth.ts read from cookie via next/headers cookies(). Add /logout endpoint that clears it. Then drop localStorage reads.
## File: `apps/web/src/lib/jwt-secret.ts` (1 findings)

### 1. [P1] Dev fallback JWT secret + no startup env validation
- _id_: `dev-jwt-fallback-and-no-env-validation` · _category_: config
- _location_: `apps/web/src/lib/jwt-secret.ts:1-12`
- _evidence_:
```
const DEV_FALLBACK_JWT_SECRET = 'dev-only-jwt-secret-change-me';
...
if (process.env.NODE_ENV !== 'production') { console.warn(...); return DEV_FALLBACK_JWT_SECRET; }
throw new Error('JWT_SECRET is required in production ...');
```
- _impact_: Production protection relies on NODE_ENV being exactly 'production'. A preview deploy or misconfigured env sets it to 'development' and signs/accepts tokens with a public secret. There is no boot-time validation — error only surfaces on first auth request. Also: no JWT_SECRET rotation story.
- _proposed fix_: Validate required envs at module load via zod (env.ts). Refuse to start without JWT_SECRET regardless of NODE_ENV. Treat anything not literally 'production' as require-real-secret-anyway in deployed envs (or branch on VERCEL_ENV).
## File: `apps/web/prisma/schema.prisma` (5 findings)

### 1. [P1] Vehicle.registrationNumber has no unique constraint
- _id_: `vehicle-reg-not-unique` · _category_: data-integrity
- _location_: `apps/web/prisma/schema.prisma:252,277`
- _evidence_:
```
registrationNumber String
...
@@index([registrationNumber])
```
- _impact_: Same plate can be registered to multiple customers; duplicates corrupt job-card/invoice attribution and AMC contract eligibility.
- _proposed fix_: Add `@unique` on registrationNumber (or `@@unique([registrationNumber])` if case-insensitive needed via citext). Add migration + handle existing duplicates first.

### 2. [P0 · BLOCKER] "One invoice per job card" enforced only in app code — DB has no unique constraint
- _id_: `job-card-invoice-no-db-unique` · _category_: data-integrity
- _location_: `apps/web/prisma/schema.prisma:617 + apps/web/src/app/api/admin/invoices/route.ts:62-65`
- _evidence_:
```
// route.ts
if (body.jobCardId) {
  const existing = await prisma.invoice.findFirst({ where: { jobCardId: body.jobCardId } });
  if (existing) return NextResponse.json(..., { status: 409 });
}
// schema.prisma — Invoice.jobCardId has @@index but NO @@unique
```
- _impact_: Two concurrent POST /invoices with same jobCardId both pass the findFirst check and both create invoices. The downstream catch for P2002 on `jobCardId` will never fire because there is no unique index. Result: duplicate invoices per job card, broken billing reconciliation. The isUniqueJobCardInvoiceError handler is therefore dead code.
- _proposed fix_: Add `jobCardId String? @unique` (or `@@unique([jobCardId])` allowing nulls in Postgres) to the Invoice model, run a migration, then remove the redundant findFirst pre-check.
- _verifier said_: real=True, Verified: schema.prisma line 617 declares `jobCardId String?` with only `@@index([jobCardId])` at line 646 — no `@unique` or `@@unique`. The route's check-then-create at line 62-65 is a classic TOCTOU race: two concurrent POSTs can both pass findFirst and both insert. The `isUniqueJobCardInvoiceError` P2002 handler is indeed dead code since no unique constraint exists. Downgraded from P0 to P1 because the race window is narrow (requires concurrent requests for the same job card within milliseconds, typically same admin user clicking twice) and the impact is duplicate invoices that are recoverable via manual reconciliation, not data corruption or security breach. Still a real data-integrity bug worth fixing pre-go-live by adding `@unique` to jobCardId.

### 3. [P1] Customer.phoneNumber and Vehicle.registrationNumber have no @unique — duplicate customers/vehicles will accumulate
- _id_: `schema-missing-unique-phone-rego` · _category_: data-integrity
- _location_: `apps/web/prisma/schema.prisma:220-246, 248-278`
- _evidence_:
```
model Customer { phoneNumber String  @@index([phoneNumber]) }  // no @unique
model Vehicle { registrationNumber String  @@index([registrationNumber]) } // no @unique
```
- _impact_: Public booking and admin create flows can each insert duplicate customers/vehicles. Reporting double-counts, AMC matches wrong vehicle, payments may collide. Once data exists with duplicates, adding @unique later requires manual dedupe.
- _proposed fix_: Add `@unique` (or `@@unique([phoneNumber])` and `@@unique([registrationNumber])`); use upsert in customer/vehicle creation paths; backfill before promoting constraint.

### 4. [P1] AmcContract servicesUsed/servicesRemaining are denormalized counters with no DB-level guard
- _id_: `amc-servicesused-not-atomic` · _category_: race-condition
- _location_: `apps/web/prisma/schema.prisma:812-839, 841-855`
- _evidence_:
```
servicesUsed Int @default(0)
servicesRemaining Int
// AmcServiceUsage rows reference contract — but nothing prevents servicesRemaining going negative or two concurrent jobCard usages incrementing past totalServices.
```
- _impact_: Two concurrent JobCard completions can both consume the last AMC service slot, customer gets a free service they're not entitled to.
- _proposed fix_: Wrap usage creation + counter update in $transaction with `update where: { id, servicesRemaining: { gt: 0 } }` and check affected rows; or add a DB check constraint `servicesRemaining >= 0`.

### 5. [P1] InventoryItem.quantityInStock has no DB constraint to prevent negative — concurrent consumption can over-issue
- _id_: `stock-no-negative-guard` · _category_: race-condition
- _location_: `apps/web/prisma/schema.prisma:556-591, 593-610`
- _evidence_:
```
quantityInStock Decimal @default(0) @db.Decimal(12, 2)
reservedQuantity Decimal @default(0) @db.Decimal(12, 2)
// no CHECK constraint; StockMovement records before/after but is non-transactional contract
```
- _impact_: Two jobCards reserving/consuming the same SKU simultaneously can drive stock below 0. Decimal allows the bug to go silent (no overflow); reconciling later requires manual audit of StockMovement log.
- _proposed fix_: Add raw SQL CHECK constraint `quantityInStock >= 0` via migration; ensure every consumption uses `update where: { id, quantityInStock: { gte: qty } }` inside a $transaction and verifies affected count.
## File: `apps/web/src/lib/auth.ts` (1 findings)

### 1. [P1] lib/auth.ts only reads Authorization: Bearer header; cookie-based session not parsed here
- _id_: `auth-bearer-only-no-cookie` · _category_: auth
- _location_: `apps/web/src/lib/auth.ts:7-12`
- _evidence_:
```
export function getAuthToken(): string {
  const h = headers();
  const auth = h.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token');
  return auth.slice(7);
}
```
- _impact_: The audit scope mentions JWT in cookie + middleware-parsed. Here every admin API route demands the client to set Authorization manually. If a browser navigation/SSR call lacks the header (e.g. a Next server-component fetching server-side), it will 401. Confirm the middleware actually proxies cookie->Authorization; otherwise admin pages may silently fail or rely on client-only auth (the .tsx pages all use api.get from the client, suggesting yes — but document this).
- _proposed fix_: If cookie auth is intended, parse cookies too: const c = cookies().get('token')?.value. Document the contract. Ensure cookies set with httpOnly + secure + sameSite=Lax (audit middleware/login route — out of scope here).
## File: `apps/web/next.config.mjs` (2 findings)

### 1. [P0 · BLOCKER] Sentry server/edge config never loads — App Router requires instrumentation.ts + withSentryConfig
- _id_: `sentry-not-initialized-app-router` · _category_: observability
- _location_: `apps/web/next.config.mjs:1-9 / apps/web/sentry.server.config.ts:1-8`
- _evidence_:
```
next.config.mjs has no withSentryConfig wrapper and no `instrumentation.ts` exists in apps/web/. sentry.server.config.ts and sentry.edge.config.ts will not be auto-loaded by @sentry/nextjs v8 on Next 14 App Router without the instrumentation hook.
```
- _impact_: Production errors will not be captured server-side. Console-only logging in handleApiError (`console.error('Unhandled API error:', error)`) is the only signal — invisible on Vercel without log drains.
- _proposed fix_: Add `apps/web/instrumentation.ts` that imports the appropriate sentry config based on runtime, and wrap next.config.mjs with `withSentryConfig`. Also set `NEXT_PUBLIC_SENTRY_DSN` in turbo.json globalEnv.
- _verifier said_: real=True, Verified: next.config.mjs has no withSentryConfig wrapper, and no instrumentation.ts exists anywhere in apps/web (checked root, src, and via find). @sentry/nextjs v8 is installed and sentry.server.config.ts / sentry.edge.config.ts files exist but will not be loaded — v8 requires the instrumentation hook to bootstrap server/edge SDK. Client-side errors will still be captured via sentry.client.config.ts (auto-injected), but server/edge errors will be invisible. Downgrading from P0 to P1: the app technically runs and ships, client-side telemetry partially exists, and handleApiError still console.errors (visible in Vercel runtime logs even without drains) — it's a serious observability gap but not strictly a launch blocker.

### 2. [P1] next.config.mjs has no security headers (CSP, X-Frame-Options, Referrer-Policy)
- _id_: `next-config-no-headers-csp` · _category_: security
- _location_: `apps/web/next.config.mjs:1-9`
- _evidence_:
```
const nextConfig = { transpilePackages: [...], experimental: { serverComponentsExternalPackages: [...] } };  // no `headers()` function, no CSP
```
- _impact_: Admin login page is clickjackable; no defense against injected scripts; no Referrer-Policy means tokens in query string leak to third-party links.
- _proposed fix_: Add `async headers()` returning X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy minimal, and a reasonable CSP (allow self, Sentry, Vercel analytics).
## File: `packages/types/src/domain.ts` (1 findings)

### 1. [P0 · BLOCKER] packages/types/domain.ts enums are stale vs schema.prisma — unsound casts everywhere
- _id_: `types-domain-drift` · _category_: type-safety
- _location_: `packages/types/src/domain.ts:5,26-32,54-56`
- _evidence_:
```
VehicleType = 'CAR' | 'BIKE' | 'OTHER' (missing SCOOTY).
JobCardStatus = 'OPEN' | 'ESTIMATE_READY' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'CANCELLED' — schema has 13 values (CREATED, UNDER_INSPECTION, ESTIMATE_PREPARED, AWAITING_CUSTOMER_APPROVAL, APPROVED, REJECTED, PARTS_PENDING, WORK_IN_PROGRESS, QUALITY_CHECK, READY_FOR_DELIVERY, DELIVERED, CANCELLED, CLOSED).
InvoiceLineType missing SERVICE_CHARGE and AMC.
```
- _impact_: Frontend status badges, switch statements, narrowing all silently coerce. A real JobCard with status 'WORK_IN_PROGRESS' is typed as never on the client. Forms that submit SCOOTY won't typecheck.
- _proposed fix_: Regenerate domain.ts from Prisma enums or import the Prisma-generated enum types directly. Replace hardcoded unions with `${PrismaEnum}` patterns; add a CI check `prisma generate && tsc --noEmit`.
- _verifier said_: real=True, Verified drift exists: schema.prisma VehicleType includes SCOOTY (missing from domain.ts), InvoiceLineType includes SERVICE_CHARGE and AMC (missing), and JobCardStatus has 13 values vs 6. However the JobCardStatus mismatch is intentional — apps/web/src/app/admin/job-cards/[id]/page.tsx defines SIMPLE_STATUSES and explicit dbToSimple/simpleToDb mapping functions, so domain.ts JobCardStatus represents a UI-simplified projection, not unmediated DB drift. The VehicleType (SCOOTY) and InvoiceLineType (SERVICE_CHARGE/AMC) gaps are real and would cause form-submission/badge issues, but the impact is bounded and easily caught at runtime — not a go-live blocker. Downgraded from P0 to P2: real type-safety drift worth fixing, but not a hard blocker because the file uses string-union types and most frontend code already uses string parameters or explicit mapping.
## File: `apps/web/src/lib/activity-logger.ts` (1 findings)

### 1. [P1] logActivity is fire-and-forget on the shared prisma client — unsafe inside $transaction and silently swallows failures
- _id_: `activity-logger-tx-and-swallow` · _category_: data-integrity
- _location_: `apps/web/src/lib/activity-logger.ts:18-33`
- _evidence_:
```
export function logActivity(params) { prisma.activityLog.create({ data: { ... } }).catch((e) => console.error('Activity log failed:', e.message)); }
```
- _impact_: (1) Any caller awaiting nothing means audit log writes can be cut off when Lambda freezes after response (common on Vercel). (2) If callers run this inside an outer `prisma.$transaction` callback, it uses the *root* prisma — race against the in-flight tx and bypasses rollback (logs an action that may have been rolled back). (3) JSON.parse(JSON.stringify(...)) throws on BigInt/Decimal — those throws are caught only inside the .catch on the .create promise, NOT the synchronous serialization above, so a Decimal field causes an unhandled throw.
- _proposed fix_: Accept optional tx client param; await it where caller is awaiting the response anyway; sanitize Decimal/BigInt via a custom replacer; consider queueing.

Return JSON: {"files_edited": ["path1","path2",...], "applied_ids": [...], "notes": "..."}.
