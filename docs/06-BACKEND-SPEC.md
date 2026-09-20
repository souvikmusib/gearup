---
mode: reference
updated: 2026-09-20
verified_against: 5af8fc8
---

# Backend specification

> **This describes the code, not the plan.** Verified 2026-09-20 against
> `5af8fc8`. The forward-looking backend plan lives in the Phase 3A pack under
> `docs/requirements/` and the codebase context page at `docs/CODEBASE_CONTEXT.md`.

> **Method.** I read `apps/web/package.json`, `.github/workflows/ci.yml`,
> `apps/web/instrumentation.ts`, `apps/web/sentry.server.config.ts`,
> `apps/web/vitest.integration.config.ts`, `apps/web/test/integration/global-setup.ts`,
> `apps/web/src/middleware.ts` in full, and every file under `apps/web/src/lib/` that
> holds shared server logic: `prisma.ts`, `auth.ts`, `jwt-secret.ts`, `errors.ts`,
> `id-generators.ts`, `activity-logger.ts`, `hsn-rate.ts`, `invoice-calc.ts`,
> `time.ts`, `date-boundaries.ts`, plus the salary-slip and invoice-template
> barrels. For routes I sampled fifteen route handlers spanning
> `admin/auth/login`, `admin/invoices` (`route.ts`, `[id]/line-items`,
> `[id]/finalize`, `[id]/payments`, `[id]/pdf`), `admin/amc/contracts/[id]`,
> `admin/appointments`, `admin/reports`, `admin/settings/holidays`,
> `admin/job-cards/[id]`, `admin/job-cards/[id]/parts`, `admin/salary-slips`,
> `public/available-slots`, and `public/estimate/[token]`. I read
> `packages/types/src/domain.ts` for the RBAC census and `apps/web/prisma/schema.prisma`
> for the model shape. I ran `grep`, `wc`, `find`, and `git log` for the counts
> below. I did NOT run `next build`, `vitest`, `playwright`, or `prisma db push`.
>
> **What this pass did NOT do.** I did not open any `.env`, and I never read or
> printed a token, cookie, or JWT value. I did not make any outbound network
> call, no Vercel API, no Supabase console, no GitHub API beyond `git log`. I
> did not exhaustively read all 83 `route.ts` files, I sampled fifteen. I did
> not read `apps/web/prisma/seed.ts` in full or either migration script. I did
> not re-run the unit or integration suites, so counts of `passed` are quoted
> from CI configuration and file glob totals, not a fresh run.

---

## 1. Runtime

`apps/web/package.json` declares `next: ^14.2.0`, `react: ^18.3.0`,
`@prisma/client: ^5.14.0`, `@sentry/nextjs: ^8.0.0`, `zod: ^3.23.0`,
`jsonwebtoken: ^9.0.2`, `bcryptjs: ^2.4.3`, `nanoid: ^3.3.7`. There is
**no `.nvmrc`** at the repo root; CI pins `node-version: 20` in
`.github/workflows/ci.yml:38`.

Deployment target is Vercel (`docs/CODEBASE_CONTEXT.md:16`, "Single project,
root `apps/web`, Fluid Compute"). Every route handler runs on the Node.js
runtime by default. `grep -rE '^export const runtime' apps/web/src` returns
zero matches, so no handler opts into the Edge runtime. The middleware
(`apps/web/src/middleware.ts`) is the only file that runs on the Edge; it does
not import `@/lib/prisma`.

Cold start behavior is shaped by two module-load-time actions:
`apps/web/src/lib/jwt-secret.ts:37` resolves `JWT_SECRET` at import (throws when
`VERCEL_ENV` is set and the secret is missing or short), and
`apps/web/src/lib/prisma.ts:40` rewrites `process.env.DATABASE_URL` before
constructing `PrismaClient`. Both fire the first time any route imports these
modules; there is no lazy singleton.

---

## 2. Data layer

### 2.1 Prisma client singleton

`apps/web/src/lib/prisma.ts`, 49 lines. A single `PrismaClient` is hung off
`globalForPrisma.prisma` so dev hot reloads reuse it
(`prisma.ts:42-49`). Log level is `['warn', 'error']` in development and
`['error']` in production. **Default transaction options are set on the client:
`{ maxWait: 10000, timeout: 15000 }`** (`prisma.ts:46`).

### 2.2 Connection pool

`prisma.ts:5-38` wraps the connection string through `withServerlessPoolLimits`
before the client is constructed. Rules:

- If the host contains `pooler.supabase.com`, or the URL already carries
  `pgbouncer=true`, or `PRISMA_FORCE_POOL_TUNING=1`, the URL is rewritten with
  `pgbouncer=true`, `connection_limit=3` (production) or `5` (dev), and
  `pool_timeout=20` (`prisma.ts:21-25`).
- Otherwise the URL is passed through untouched.
- `PRISMA_DISABLE_URL_TUNING=1` skips the whole wrapper.

`docs/CODEBASE_CONTEXT.md:16-25` declares the two envs `DATABASE_URL` (Session
Pooler) and `DIRECT_URL` (direct connection, for migrations). The direct URL is
not consumed by the runtime client; Prisma's own migration commands read it
through `apps/web/prisma/schema.prisma`.

### 2.3 Transaction pattern

`grep -rn "\$transaction" apps/web/src` returns **45 matches** across route
handlers. Every transaction takes the form
`await prisma.$transaction(async (tx) => { ... })`. Nested transactions are not
used; guards run inside the callback.

**Recent per-call timeout override.** Four routes bump the timeout above the
15s default declared in `prisma.ts:46`:

- `apps/web/src/app/api/admin/invoices/route.ts:118`, `{ timeout: 30000, maxWait: 10000 }`
- `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:270`, `{ timeout: 30000, maxWait: 10000 }`
- `apps/web/src/app/api/admin/estimates/[id]/convert/route.ts:108`, `{ timeout: 30000, maxWait: 10000 }`
- `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:229`, `{ timeout: 30000, maxWait: 10000 }`

`git log --oneline --grep='P2028' -i` lists two commits:
`0bf6479 fix(P0): move HSN resolution outside tx in invoice creation route`
and `a5cbaee fix(P0): move HSN resolution outside tx + bump timeout 15s → 30s`.
The corresponding PRs `#58` and `#59` (from `git log --oneline`) are the
provenance of the 30-second convention. `618cdad fix: increase transaction
timeout for pgbouncer (10s wait, 15s timeout)` set the default in
`prisma.ts:46`.

### 2.4 Race-safe update patterns

`grep -rn "updateMany" apps/web/src/app/api` returns **14 call sites**. The
pattern is `updateMany` with a WHERE clause that carries the guard, then a
check on `result.count`:

- **AMC service decrement**, `admin/invoices/[id]/finalize/route.ts:32-38`
  and `admin/amc/contracts/[id]/route.ts:169-183`. Both guard
  `servicesRemaining: { gt: 0 }, status: 'ACTIVE'` and throw a 409 when
  `count === 0`.
- **Payment idempotency:**
  `admin/invoices/[id]/payments/route.ts:24-41` guards the invoice on
  `invoiceStatus: 'FINALIZED', paymentStatus: { not: 'PAID' }, amountDue: { gte: amount }`
  and then re-reads for the follow-up status update
  (`payments/route.ts:57-63`) with an optimistic lock on the prior `amountPaid`,
  raising 409 CONFLICT on concurrent payment.
- **Inventory decrement:**
  `admin/invoices/[id]/line-items/route.ts:173-179` and
  `admin/job-cards/[id]/parts/route.ts:32-46` guard
  `quantityInStock: { gte: qty }` and (for release)
  `reservedQuantity: { gte: qty }`.
- **Public estimate accept:**
  `public/estimate/[token]/route.ts:104-105` uses `updateMany` because the
  guard is on a non-unique nullable column (`estimateToken IS NULL`), which
  `update` cannot express.
- **Notification template default toggle:**
  `admin/notifications/templates/route.ts:209`.

### 2.5 Cache patterns

Only one shared in-memory cache exists on the server:
`apps/web/src/lib/hsn-rate.ts:17-32` holds a `Map<hsnCode, rate>` with a
60-second TTL (`CACHE_TTL_MS = 60_000`). It is invalidated by the exported
`invalidateHsnRateCache()`, called from the HSN admin routes when a rate is
added or updated. The cache is per-lambda instance; on serverless there is no
cross-instance coherence.

`admin/reports/route.ts:11` uses `export const revalidate = 30` to let Next
cache the dashboard counts for 30 seconds at the framework layer.

---

## 3. Auth and session

### 3.1 JWT

`apps/web/src/lib/auth.ts:49-56` verifies with `jsonwebtoken`'s default HS256
against `getJwtSecret()` from `apps/web/src/lib/jwt-secret.ts`. Expiry is
`JWT_EXPIRY = '24h'` (`apps/web/src/lib/constants.ts`). The token is signed on
successful login at `apps/web/src/app/api/admin/auth/login/route.ts:61` with
payload `{ sub, adminUserId, roles, permissions }`.

`jwt-secret.ts:14-33` enforces at module load: any environment with
`VERCEL_ENV` set or `NODE_ENV === 'production'` MUST provide a `JWT_SECRET`
that is at least 16 characters; otherwise it throws. Local dev without a
secret falls back to `'dev-only-jwt-secret-change-me'` with a `console.warn`.

### 3.2 Cookie

`auth.ts:31` names the cookie `gearup_token`.
`admin/auth/login/route.ts:78-84` sets it with `httpOnly: true`,
`secure: process.env.NODE_ENV === 'production'`, `sameSite: 'lax'`, `path: '/'`,
and `maxAge` derived from `JWT_EXPIRY` (parsed against `/^(\d+)([smhd])$/`,
default 24 hours).

### 3.3 Bearer + cookie transport

`auth.ts:33-47` reads `Authorization: Bearer <jwt>` first, then falls back to
the cookie. The header block on `auth.ts:7-30` names the CSRF posture: bearer
mode is not auto-attached by browsers; cookie mode leans on `SameSite=Lax`
plus the middleware CORS allowlist. There is no double-submit CSRF token.

### 3.4 Login rate limiting

The edge middleware (`apps/web/src/middleware.ts`) applies **two** in-process
limiters to the login route:

- **Per-IP**, 10 attempts per minute per IP on `POST /api/admin/auth/login`
  (`middleware.ts:145-152`).
- **Per-account**, 8 attempts per 5 minutes on the account key
  (`adminUserId`, `email`, `username`, or `phone` from the JSON body, lowercased
  and trimmed) (`middleware.ts:22-24`, `104-116`). This layer clones the request
  and peeks at the body; on any parse error it falls through.

A DB-side lockout runs inside the login handler: after
`MAX_LOGIN_ATTEMPTS = 5` failures the row's `status` is set to `LOCKED` for
`LOCKOUT_DURATION_MINUTES = 30` (`admin/auth/login/route.ts:50-53`,
`constants.ts`). The unknown-user, INACTIVE, and locked branches all run
`bcrypt.compare` against a fixed dummy hash (`login/route.ts:16-19, 44-48`) to
equalise timing.

The middleware also rate-limits every `/api/public/*` path at 30 req/min/IP
keyed per HTTP method (`middleware.ts:120-129`), and `/api/public/customer-lookup`
GET at 10 req/min/IP (`middleware.ts:131-139`) because it is a phone-number
enumeration vector.

### 3.5 Middleware coverage

`middleware.ts:225-227` sets `matcher: ['/api/:path*', '/admin/:path*']`. On
`/admin/*` the middleware only forwards the request with an `x-pathname` header
so the server-side layout guard can distinguish `/admin/login` from protected
pages (`middleware.ts:120-128`). On `/api/*` it applies CORS headers,
short-circuits `OPTIONS` with 204, and runs the rate limiters.

CORS allowlist: `process.env.CORS_ALLOWED_ORIGINS` is a comma-separated list
parsed once at module load (`middleware.ts:78-82`). When unset it falls back to
`Access-Control-Allow-Origin: *` for local dev (`middleware.ts:88-91`); deployed
environments MUST set it. When set, only exact-match origins get their `Origin`
echoed with `Vary: Origin`.

### 3.6 Permission helpers

`auth.ts:59-73` exports two guards, both of which call `verifyAuth()` first:

- `requirePermission(...required)`, AND semantics; throws `ForbiddenError` with
  the missing list.
- `requireAnyPermission(...required)`, OR semantics; throws when the caller
  holds none of the listed permissions.

`grep -rln "requirePermission\|requireAnyPermission" apps/web/src/app/api` hits
73 of 83 route files. The 10 that do not call either guard are `/api/health`,
the `/api/public/*` routes, and the login route (which authenticates rather
than authorises).

---

## 4. RBAC

**The code's role enum and the RBAC doc disagree.** `packages/types/src/domain.ts:83-89`
declares exactly five roles: `SUPER_ADMIN`, `ADMIN`, `RECEPTIONIST`,
`MECHANIC`, `INVENTORY_MANAGER`. `docs/rbac.md:6-12` lists five DIFFERENT
roles: `SUPER_ADMIN`, `ADMIN`, `SERVICE_MANAGER`, `WORKER`, `BILLING`. The
type-system enum wins at runtime; the doc is stale. This is a gap.

`packages/types/src/domain.ts:93-134` declares **40 permission keys** in
`PERMISSIONS` (dotted string constants). `PermissionKey` is
`(typeof PERMISSIONS)[keyof typeof PERMISSIONS]`.

Four permissions are SUPER_ADMIN-only, listed at
`domain.ts:140-145` in `SUPER_ADMIN_ONLY_PERMISSIONS`:
`JOB_CARDS_DELETE`, `DATA_EXPORT`, `INVENTORY_HARD_DELETE`,
`INVENTORY_VIEW_COST`. `ROLE_PERMISSIONS` (`domain.ts:147-203`) computes:

- `SUPER_ADMIN`: all 40 permissions.
- `ADMIN`: all except the four SUPER_ADMIN_ONLY.
- `RECEPTIONIST`: explicit list of 27, at `domain.ts:152-180`.
- `MECHANIC`: explicit list of 6, at `domain.ts:181-188`.
- `INVENTORY_MANAGER`: explicit list of 12, at `domain.ts:189-202`.

At login the handler flattens `roleKeys.flatMap((k) => ROLE_PERMISSIONS[k] ?? [])`
into a `Set` and embeds the deduped list in the JWT
(`admin/auth/login/route.ts:60-61`), so a subsequent
`requirePermission(...)` never re-reads the DB for authorisation.

---

## 5. Validation and error handling

### 5.1 Zod

Route validation is `zod: ^3.23.0`. `grep -l 'z.object\|z.string\|z.number' apps/web/src/app/api` finds
**58 of 83** route files that build at least one Zod schema; the remaining 25
either take no body or read query params directly.

### 5.2 Error taxonomy

`apps/web/src/lib/errors.ts` declares `AppError(statusCode, message, code, details?)`
and four subclasses: `NotFoundError` (404, `NOT_FOUND`), `ValidationError`
(400, `VALIDATION_ERROR`), `UnauthorizedError` (401, `UNAUTHORIZED`),
`ForbiddenError` (403, `FORBIDDEN`) (`errors.ts:5-39`).

### 5.3 `handleApiError`

`errors.ts:64-168` is the single funnel every route uses. Order of matching:

1. Next.js `DYNAMIC_SERVER_USAGE` digest, re-thrown so the framework can
   handle its own bailout (`errors.ts:65-72`).
2. `AppError` and subclasses, JSON with the declared status.
3. `ZodError`, 400 with per-path `details: Record<string, string[]>`
   (`errors.ts:80-90`).
4. `Prisma.PrismaClientKnownRequestError`:
   - `P2002` (unique), 409 `CONFLICT`, message humanised through the
     `UNIQUE_TARGET_LABELS` table (`errors.ts:41-53, 93-108`).
   - `P2025` (record not found), 404 `NOT_FOUND`, except when the missing
     target is an `AdminUser` in which case it becomes 401 `SESSION_STALE`
     (`errors.ts:109-124`).
   - `P2003` (FK violation), 400 `VALIDATION_ERROR`, except when the field
     name matches `/admin|actor/i` in which case it becomes 401 `SESSION_STALE`
     (`errors.ts:125-146`). The stale-session mapping is intentional: a JWT can
     outlive its row (for example after a DB restore) and the mapping keeps a
     write from surfacing as a spurious 400 or 404.
5. Fallthrough, 500 `INTERNAL_ERROR`. When
   `NEXT_PUBLIC_EXPOSE_ERRORS === '1'` or `NODE_ENV !== 'production'`, the
   response embeds a `detail` block with `rawName`, `rawMessage`, `rawCode`,
   `rawMeta`, and the first five stack lines for triage (`errors.ts:152-166`).

### 5.4 Response shape

Every error response has the same envelope
`{ success: false, error: { code, message, details? } }`; every success is
`{ success: true, data: <payload> }`.

---

## 6. ID generation

`apps/web/src/lib/id-generators.ts`, 129 lines.

**Non-sequential (nanoid).** `alphanumeric = customAlphabet('0-9A-Z', 12)`
(`id-generators.ts:5`) backs `generateReferenceId`, `generateAppointmentRef`,
and `generateAmcContractNumber`. These do not hit the DB.

**Sequence-per-day.** `nextSequence(kind, tx?)` (`id-generators.ts:37-49`)
performs a Prisma `upsert` against `documentSequence`:

```
where:  { kind_businessDate: { kind, businessDate } }
create: { kind, businessDate, lastSeq: 1 }
update: { lastSeq: { increment: 1 } }
```

The `kind_businessDate` compound unique index makes the upsert atomic:
concurrent callers on the same (kind, businessDate) either see the create
succeed (returning 1) or fall to the update path, so no two callers get the
same `lastSeq`.

Four format builders sit on top:

- `generateInvoiceNumber` → `INVGDDMMYYYYNNNN` (`id-generators.ts:55-59`).
- `generateJobCardNumber` → `JOBGDDMMYYYYNNNN` (`id-generators.ts:65-69`).
- `generateWorkerCode` → `WRK-DDMMYYYY-NNNN` (`id-generators.ts:75-79`).
- `generateEstimateNumber` → `ESTGDDMMYYYYNNNN` (`id-generators.ts:85-89`).

`DDMMYYYY` and `businessDate` both come from IST helpers:
`getISTDateStr()` (`id-generators.ts:15-22`) and `getISTBusinessDate()`
(`id-generators.ts:27-31`) shift `Date.now()` by 5.5 hours before slicing.
The `businessDate` used as the sequence key is the IST calendar day, so a
midnight-UTC crossover does not reset the Indian business day.

`isLegacyNumber(num)` (`id-generators.ts:94-102`) returns false for the four
new formats and true otherwise, gating call sites that need to identify pre-2026
records.

`withIdCollisionRetry(generateId, fn, uniqueTarget, attempts = 3)`
(`id-generators.ts:107-129`) retries a create up to three times when Prisma
throws `P2002` with a `meta.target` matching the passed column. Any other error
propagates.

---

## 7. Time and timezone

`apps/web/src/lib/time.ts`, 29 lines. `SHOP_TZ = 'Asia/Kolkata'` and
`IST_OFFSET_MS = 5.5 * 60 * 60 * 1000`. Three helpers: `istDayStart(at)`,
`istDayEnd(at)`, `formatIST(value, opts?)`, and `formatTimeIST(value)`.
Every helper builds an ISO string with the `+05:30` suffix rather than
composing UTC times numerically.

`apps/web/src/lib/date-boundaries.ts`, 22 lines. Two helpers:
`getISTDayBoundaries(now?)` returns `{ todayStart, tomorrowStart }` for the IST
calendar day of `now`, and `getISTRangeBoundaries(from, to)` maps a
`YYYY-MM-DD` pair to `{ start: from+'T00:00:00+05:30', end: to+'T23:59:59+05:30' }`.
Both are used by report and list routes to keep date-range queries IST-aware.

**Slot logic.** `apps/web/src/app/api/public/available-slots/route.ts` accepts a
`YYYY-MM-DD` query param, validates it round-trips through UTC (rejecting
`2026-02-31` and equivalent), bounds it to today..+90 days
(`route.ts:31-36`), fetches `AppointmentSlotRule` for the day of week, then
`Holiday` and `BlockedSlot`, then groups appointments by `slotStart` and
returns per-slot availability. The per-slot capacity is grouped by `slotStart`,
not by day; the file's own comment names this at line 44.

**Business hours / holiday enforcement.** `admin/settings/holidays/route.ts`
POST accepts a single object or an array up to 200 items (bulk import for a
year of public holidays). Bulk mode dedupes within the batch on
`(holidayDate, holidayType)` and skips rows that already exist rather than
throwing, so a re-import is safe. Single mode returns 409
`HOLIDAY_DUPLICATE` on collision.

---

## 8. Invoice and pricing engine

`apps/web/src/lib/invoice-calc.ts`, 86 lines.

### 8.1 `computeLineTotal`

The canonical per-line calculator (`invoice-calc.ts:48-66`).

- Non-discount line: `net = quantity * unitPrice * (1 - discountPercent/100)`;
  `taxAmount = net * (taxRate/100)`; `lineTotal = net + taxAmount`
  (`invoice-calc.ts:61-65`).
- Discount line (`lineType === 'DISCOUNT_ADJUSTMENT'`):
  - `discountMode === 'percent'`, `lineTotal = -(percentDiscountBase * unitPrice/100)`;
    `taxAmount = 0`.
  - `discountMode === 'flat'` (default), `lineTotal = -|quantity * unitPrice|`;
    `taxAmount = 0`.

### 8.2 `nonDiscountPreSubtotal`

`invoice-calc.ts:36-40` returns the sum of `quantity * unitPrice` across all
non-discount lines. The header comment fixes this as the canonical base for
any percent discount line, so semantics stay identical whether the discount is
added at invoice creation or appended later, and percent discounts do not
compound when several coexist.

### 8.3 `recomputeDiscountLineTotal`

`invoice-calc.ts:79-86` re-derives a percent-mode discount line against a fresh
`percentBase`. A discount line is percent-mode iff its stored `discountPercent`
is `> 0`; flat lines return their stored `lineTotal` unchanged.

### 8.4 `showGst` toggle

`apps/web/src/lib/hsn-rate.ts:88-101` implements the invoice's `showGst`
switch: when false, `taxRate = 0` regardless of the HSN lookup, so prices stay
the same and no tax row is emitted; when true, the HSN is resolved through
`resolveHsnCode` and the rate through `getGstRate`.

### 8.5 `recalcTotalsTx`

`apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:20-95` (called
from `line-items/route.ts:268`, `334`, `487`) is the single re-aggregator.
Steps in order:

1. Load all lines of the invoice.
2. Split non-discount and discount lines.
3. `subtotal = sum(lineTotal - taxAmount)` over non-discount lines.
4. `taxTotal = sum(taxAmount)` over non-discount lines.
5. Compute `percentBase = sum(quantity * unitPrice)` on non-discount lines and
   for every discount line, call `recomputeDiscountLineTotal`. If the recomputed
   total differs from the stored one by more than 0.005, write the new value
   back into the row so the discount line reflects the current base
   (`line-items/route.ts:37-42`).
6. `grandTotal = subtotal + taxTotal + discountFromLines - headerDiscountAmount`.

### 8.6 HSN and GST rate resolution

`apps/web/src/lib/hsn-rate.ts`, 109 lines.

- `DEFAULT_HSN` (`hsn-rate.ts:7-14`) maps line type to a fallback HSN/SAC:
  `SERVICE_CHARGE`, `LABOR`, `AMC` → `998714`; `CUSTOM_CHARGE` → `87141090`.
  `PART` is resolved from `InventoryItem.hsnCode`. `DISCOUNT_ADJUSTMENT` has no
  HSN.
- `getGstRate(hsnCode)` (`hsn-rate.ts:40-44`), no HSN → 0% (no GST); HSN
  present but not in the `HsnRate` table → 18% (safe default); HSN in table →
  exact rate.
- `resolveHsnCode(lineType, inventoryItemId?, explicitHsn?)`
  (`hsn-rate.ts:54-76`), precedence: `DISCOUNT_ADJUSTMENT` → null; explicit HSN
  wins; else PART → inventory row's `hsnCode`; else `DEFAULT_HSN[lineType]`,
  falling back to `'87141090'`.

The rate table is cached in memory for 60 seconds (§2.5).

---

## 9. AMC engine

Activation lives in `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:74-118`.
When a payment brings `paymentStatus` to `PAID` and the invoice carries at
least one `lineType === 'AMC'` line, the route fetches the referenced
`AmcPlan`, computes `endDate = now + plan.durationMonths` months, and calls
`tx.amcContract.createManyAndReturn` with one row per AMC line. The first
service is counted immediately: `servicesUsed: 1`,
`servicesRemaining: plan.totalServicesIncluded - 1`, and an `AmcServiceUsage`
row is created (`route.ts:109-116`). The `contractNumber` comes from the
nanoid-backed `generateAmcContractNumber` (no sequence).

Decrement race-safety: `admin/invoices/[id]/finalize/route.ts:32-38` and
`admin/amc/contracts/[id]/route.ts:169-183` both use `updateMany` with
`servicesRemaining: { gt: 0 }` and `status: 'ACTIVE'` in the WHERE clause and
throw 409 when `count === 0`. The finalize hook additionally requires
`invoice.jobCardId` and asserts `contract.status !== 'ACTIVE'` throws
`AMC contract is not active`.

Reversal of finalize (`finalize/route.ts:57-99`) walks the AMC lines in reverse:
delete the last `AmcServiceUsage` for the (contract, jobCard) pair and
`servicesUsed: { decrement: 1 }, servicesRemaining: { increment: 1 }`. There
is no WHERE guard on the reverse increment because the corresponding
usage row's existence is the guard.

Contract status transitions live in the schema (`Prisma enum
AmcContractStatus`) not in shared TS code. Transitions to `EXPIRED` are not
performed by any route I sampled; that is a scheduler concern, unverified in
this pass.

---

## 10. Notifications and side effects

### 10.1 Templates

`admin/notifications/templates/route.ts` manages template rows and enforces
that a template's `content` contains no unknown placeholder tokens (regex
`PLACEHOLDER_RE` at line 75). Default-template toggling uses a race-safe
`updateMany` at line 209.

### 10.2 Sender

There is **no server-side WhatsApp or email dispatcher wired in the tree at
`5af8fc8`**. `grep -rn 'sendWhatsApp\|WhatsAppSender' apps/web/src` returns no
matches. The only `WhatsApp` reference in server code is inside the settings
UI page and a shared `whatsapp-button` component that opens `wa.me` in a
browser tab. `docs/notifications.md` describes the intended provider; the
adapter is a gap.

### 10.3 PDF renderer

There is no headless browser dependency in `apps/web/package.json` (no
`puppeteer`, no `@sparticuz/chromium`, no `playwright` outside devDependencies).
The three PDF endpoints render HTML and return it verbatim with
`Content-Type: text/html`, leaving PDF conversion to the client's print dialog.
Files:

- `admin/invoices/[id]/pdf/route.ts` renders through
  `apps/web/src/lib/invoice-templates/*` (five templates: `invoice`,
  `combined`, `customer-draft`, `mechanic`, `amc-invoice`) plus a mode chosen
  from the query string (`route.ts:66-77`).
- `admin/salary-slips/[id]/pdf/route.ts` renders through
  `apps/web/src/lib/salary-slip-template.ts` (172 lines).
- `apps/web/src/lib/invoice-templates/helpers.ts` holds the shared helpers
  `esc`, `formatDateIST`, `numberToWords`.

### 10.4 Activity logger

`apps/web/src/lib/activity-logger.ts`, 166 lines, exports one function:
`logActivity(params)`.

Durability tiers, from strongest to weakest, are named in the file's header at
`activity-logger.ts:89-108`:

1. **tx**, pass `params.tx: Prisma.TransactionClient` and the audit row runs
   inside the caller's transaction; failures propagate so the whole tx rolls
   back and no business write commits without its audit row
   (`activity-logger.ts:137-141`).
2. **await**, no tx, but the caller `await`s the return; the audit row is
   attempted before the route responds and failures go to Sentry via
   `reportLogFailure` without crashing the handler (`activity-logger.ts:144-152`).
3. **waitUntil**, pass a runtime `waitUntil` (`next/server`'s `after()` or an
   edge `ctx.waitUntil`); the promise is registered so the serverless lambda
   does not freeze before the write commits (`activity-logger.ts:156-163`).
4. **Fire and forget**, no tx, no `waitUntil`, no `await`; the audit row can
   be lost on serverless freeze.

`safeJson(value)` (`activity-logger.ts:61-85`) handles `BigInt`, `Decimal`, and
`Date` by walking `JSON.stringify`'s replacer, so Prisma `Decimal` columns
serialise without throwing.

`reportLogFailure` (`activity-logger.ts:37-54`) dynamic-requires `@sentry/nextjs`
so the logger keeps working when Sentry is not initialised.

`grep -rn 'logActivity' apps/web/src/app/api` returns **127 call sites** across
route handlers.

---

## 11. Cross-cutting middlewares and hooks

`apps/web/instrumentation.ts` (17 lines): the Next.js `register()` hook
dynamically imports `sentry.server.config` on the Node runtime and
`sentry.edge.config` on the Edge runtime. Client init is auto-loaded by
`@sentry/nextjs` from `sentry.client.config.ts`.

`apps/web/sentry.server.config.ts` calls `Sentry.init({ dsn:
process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.2 })` when the DSN is
present. When the DSN is missing, Sentry is not initialised and every
`captureException` becomes a no-op that the activity logger swallows.

**Security headers.** There is no explicit `Content-Security-Policy`,
`Strict-Transport-Security`, or `X-Frame-Options` block in the middleware or
`next.config`. This is a gap for a production admin surface.

The middleware sets `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`
and `Access-Control-Allow-Headers: Content-Type, Authorization` on every API
response (`middleware.ts:95-97`).

---

## 12. Testing surface

**Unit tests.** `find apps/web -name '*.test.ts'` (excluding `node_modules`) →
**13 files** covering `id-generators`, `errors`, `format-reg`, `invoice-calc`,
`estimate-token`, `pagination`, `gst-hsn`, `date-boundaries`, `new-features`,
and three under `apps/web/src/lib/reports/`. Executed by `pnpm --filter
@gearup/web test` (Vitest); the number of assertions is not tracked in a
committed manifest.

**Integration tests.** `find apps/web/test -name '*.itest.ts'` → **22 files**.
Configured by `apps/web/vitest.integration.config.ts` (Vitest with
`pool: 'forks'`, `fileParallelism: false`, `testTimeout: 30000`). The harness
at `apps/web/test/integration/global-setup.ts:47-...` either uses
`process.env.TEST_DATABASE_URL` (provided by CI's Postgres service) or spins an
ephemeral local Postgres from Homebrew pg17 on a throwaway data dir at port
54330. The setup file is explicit that `prisma db push --accept-data-loss`
against the ephemeral DB is not a destructive operation on any real data.

**E2E tests.** `apps/web/e2e/` contains four Playwright spec files:
`admin-e2e.spec.ts`, `features-e2e.spec.ts`, `role-access.spec.ts`,
`ui-smoke.spec.ts`, plus global setup and teardown. Coverage includes booking
flow, auth, inventory, customer lookup, and role-gated route access.

**CI gate.** `.github/workflows/ci.yml` runs on push to `main` and every PR.
The `check` job runs, in order: Timezone lint (`scripts/check-tz.sh`), Prisma
generate, `tsc --noEmit`, `pnpm lint`, `pnpm --filter @gearup/web test`,
`prisma db push --skip-generate`, integration tests, `pnpm build`. The `e2e`
job depends on `check` and runs Playwright against a second Postgres service.
There is no coverage threshold gate.

---

## 13. Known performance concerns

### 13.1 P2028 transaction-timeout family (fixed)

The four routes named in §2.3 override the 15-second default with
`timeout: 30000`. The two provenance commits are `a5cbaee` (invoice create) and
`0bf6479` (moved HSN resolution outside the tx). The remedy pattern in both was
identical: pull `resolveHsnAndRate()` calls out of the transaction body (they
hit the DB) and raise the ceiling for the mutation itself. This is a
first-class recurring class in this codebase and the correct fix is always
"resolve first, mutate inside `$transaction`".

### 13.2 Sequential `await` loops inside transactions

`grep -B1 -rn "for (const" apps/web/src/app/api --include='*.ts'` finds five
transaction bodies that iterate with sequential `await`:

- `admin/invoices/route.ts:78`, `for (const li of body.lineItems)` performs
  `resolveHsnAndRate` per line **outside** the tx (fine; batched into
  `resolvedLines`).
- `admin/invoices/[id]/finalize/route.ts:27` and `:78`, `for (const line of
  amcLines)` does an AMC contract read + `updateMany` per line INSIDE the tx.
  Blast radius scales with the number of AMC lines on a single invoice, which
  is expected to be 1.
- `admin/invoices/[id]/line-items/route.ts:193`, `for (const batch of batches)`
  FIFO deducts stock batches one at a time inside the tx. This is a genuine
  fan-out on stock depth; a single line with a long tail of small batches is
  the natural worst case.
- `admin/invoices/[id]/line-items/route.ts:381`, per-movement update in a
  batch reconciliation branch.
- `admin/invoices/[id]/finalize/route.ts:78`, reverse pass of §9.

The 30s ceiling (§2.3) buys headroom, but a stock line spread across dozens of
small batches remains the most likely trigger for the next P2028.

### 13.3 Holidays bulk POST

`admin/settings/holidays/route.ts:44-63` iterates the array in sequence,
running `tx.holiday.findFirst` and `tx.holiday.create` per row inside the
transaction. Up to 200 items per call. A `createMany({ skipDuplicates: true })`
against a `(holidayDate, holidayType)` unique index would collapse the round
trips.

### 13.4 Job-card cascade

`admin/job-cards/[id]/route.ts:44-56` iterates `jobCardPart` rows and calls
`adjustStock` (an `inventoryItem.updateMany` + a `jobCardPart.update`) per row
inside the tx on cancel. Same shape as §13.2; capped by the number of parts on
one job card.

### 13.5 Denormalised aggregates

`recalcTotalsTx` (§8.5) writes back per-row `lineTotal` corrections whenever
percent-discount lines drift by more than 0.005 from the current `percentBase`.
This is deliberate consistency work, not a bug, but it is a per-mutation write
amplifier that scales with the number of discount lines.

---

## 14. Summary for a reader deciding what to do next

The backend is a Next.js 14 App Router surface with 83 route handlers, a
single-file Prisma singleton, and one shared Zod-plus-`AppError` funnel. The
choices that carry the most weight are:

1. **Race-safety via `updateMany` guards** (§2.4). Every payment, AMC
   decrement, and inventory decrement carries its precondition in the WHERE
   clause and gates on `result.count`. This is the pattern that made the
   payment idempotency and the AMC service-remaining decrement safe under
   Vercel's warm-instance concurrency.
2. **Transaction ceilings and the HSN-outside-tx rule** (§2.3, §13.1). PR #58
   and PR #59 institutionalised the 30-second ceiling and the "resolve HSN
   before entering the tx" convention; this eliminated the P2028 family for
   invoice creation, invoice line-items, estimate conversion, and job-card
   parts, and is the right shape to reach for on the next long-running route.
3. **Single-source pricing engine** (§8). `invoice-calc.ts` is the only place
   that decides what a line total is; `recalcTotalsTx` is the only place that
   decides what an invoice total is; `hsn-rate.ts` is the only place that
   decides what an HSN or a GST rate is.
4. **Time is always IST at the edge** (§7). Every date input crosses either
   `istDayStart`, `getISTBusinessDate`, or `getISTRangeBoundaries` before it
   touches the DB, and `check-tz.sh` polices the shape at CI.
5. **RBAC is baked into the JWT at login** (§4). No route re-reads the DB for
   authorisation; the token IS the authorisation. This makes revocation on
   role change slow (up to `JWT_EXPIRY = 24h`), which is a design decision, not
   a bug, and worth naming.

Gaps observed in this pass:

- **`docs/rbac.md` names five roles that the code does not have** (§4).
  `SERVICE_MANAGER`, `WORKER`, and `BILLING` do not exist in
  `packages/types/src/domain.ts`; the code has `RECEPTIONIST`, `MECHANIC`,
  `INVENTORY_MANAGER`. The doc is the stale one; the enum is the truth.
- **No server-side WhatsApp or email dispatcher is wired** (§10.2). The
  notifications settings and templates exist; the sender does not.
- **No CSP / HSTS / X-Frame-Options headers** in the middleware or
  `next.config` (§11).
- **PDF generation returns HTML**, not PDF (§10.3). No headless browser is a
  server dependency.
- **In-memory rate limiter is per-instance** (`middleware.ts:8-24`, comments
  at 12-19 call this out explicitly). The stated TODO is Upstash / Vercel KV.
- **CORS falls back to `*` when `CORS_ALLOWED_ORIGINS` is unset**
  (`middleware.ts:83-91`); deployed environments MUST set this or bearer-plus-cookie
  requests are permissive.
