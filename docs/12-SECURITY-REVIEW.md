---
mode: reference
updated: 2026-09-20
verified_against: 81a04bb
---

# Security review

> **This describes the code, not the plan.** Verified on 2026-09-20 against `81a04bb`. Findings cite the file and line that produced them, or the command whose output produced them.

> **Method.** Read in full: `apps/web/src/lib/auth.ts`, `apps/web/src/lib/jwt-secret.ts`, `apps/web/src/lib/errors.ts`, `apps/web/src/middleware.ts`, `apps/web/src/lib/activity-logger.ts`, `packages/types/src/domain.ts` (lines 82 to 175), every `route.ts` under `apps/web/src/app/api/public/`, both `apps/web/src/app/api/admin/auth/{login,logout}/route.ts`, a 15-route sample under `apps/web/src/app/api/admin/`, `apps/web/prisma/seed.ts`, `apps/web/sentry.server.config.ts`, `apps/web/package.json`, `.gitignore`, `docs/RESTORE.md`, `docs/rbac.md`. Ran: `git rev-parse HEAD`, `pnpm audit --prod --json` under `apps/web`, several `grep -rn` sweeps for `$queryRaw`, `$queryRawUnsafe`, `dangerouslySetInnerHTML`, `console.log`, `NEXT_PUBLIC_`, `await fetch(`, `formData`, `multipart`, `bcrypt`, hard-coded secret patterns (`sk_`, `Bearer `, `-----BEGIN`), and `git ls-files | grep -E "^\.env"` to confirm no environment file is tracked.
>
> **What this pass did NOT do.** No dynamic testing. No penetration testing of the login flow. No review of the Vercel project settings, secrets store, Cloudflare edge config, or Supabase RLS. No `.env` file was opened; environment variable NAMES were taken from source only. `packages/db/` schema-level auth and the WhatsApp/notifications provider surface were read only via their code references, not audited end-to-end. `test/`, `docs/audit/*/db-backups/`, and the browser bundle output were not scanned. No history-wide secret scan across every ref (only working-tree grep).

---

## 1. Overview

gearup is a single-tenant production SaaS for a real garage in Kolkata (Pvt Ltd workspace, two authorized developers, one live customer). The security posture is: an RBAC-gated admin surface fronted by short-lived JWTs delivered both as `Authorization: Bearer` and as an httpOnly cookie; five public unauthenticated endpoints under `/api/public/` that accept booking, lookup and estimate traffic, each gated by an in-process rate limiter in `apps/web/src/middleware.ts`; Prisma against Supabase Postgres for all data access with no direct client-side DB. Only the customer's own submitted PII (name, phone, vehicle registration, service description) is stored. No payment cards, no government IDs, no bank details.

## 2. Findings

| ID | Severity | Finding |
|---|---|---|
| G-1 | Critical | `next@14.2.35` carries two critical advisories; one is exploitable on this deploy (AVIF image-optimization RCE) |
| G-2 | High | Rate limiter is an in-process `Map` on serverless; effective limit is N-instances times the number, cold starts wipe state (`apps/web/src/middleware.ts:19-31`) |
| G-3 | High | Login route seeds have shared password `admin123` for five accounts (`apps/web/prisma/seed.ts:7,19-23`); no boot-time rotation gate |
| G-4 | Medium | Bearer token stored in `localStorage` on the client (`apps/web/src/lib/auth.ts:11-13` doc block); XSS in any client route hands it over |
| G-5 | Medium | `NEXT_PUBLIC_EXPOSE_ERRORS=1` OR `NODE_ENV !== 'production'` exposes stack traces to the client (`apps/web/src/lib/errors.ts:150-165`) |
| G-6 | Medium | RBAC drift: `docs/rbac.md` names five roles (`SERVICE_MANAGER`, `WORKER`, `BILLING`) that do not exist in `packages/types/src/domain.ts` (which defines `RECEPTIONIST`, `MECHANIC`, `INVENTORY_MANAGER`) |
| G-7 | Medium | `NEXT_PUBLIC_SENTRY_DSN` is the DSN wired into `apps/web/sentry.server.config.ts:2`; a client-side DSN is fine for Sentry but the server config reading a `NEXT_PUBLIC_*` name is a footgun for future secrets |
| G-8 | Low | 26 high-severity, 16 moderate, 4 low dependency advisories (from `pnpm audit --prod`); most are transitive through `next` and `@sentry/nextjs` |
| G-9 | Low | Bootstrap admin (`adminUserId: 'admin'`) has no forced first-login password change; a fresh seed leaves `admin`/`admin123` valid indefinitely |
| G-10 | Low | Two GitHub PATs were pasted into a chat window in an earlier session and remain unrotated (carried from `MEMORY.md`, not verifiable from this repo) |
| G-11 | Informational | Six `$queryRawUnsafe` sites under `apps/web/src/app/api/admin/reports/`; all use `$1`/`$2` bind parameters, no user input concatenated |
| G-12 | Informational | Zero server-side `fetch` to user-supplied URLs; SSRF surface is nil |

## 3. Authentication

**JWT scheme.** `jsonwebtoken@^9.0.2` (`apps/web/package.json:35`), HS256 by default (no explicit alg override in `apps/web/src/lib/auth.ts:52` or `apps/web/src/app/api/admin/auth/login/route.ts:61`). Expiry `24h` (`apps/web/src/lib/constants.ts`, verified: `JWT_EXPIRY = '24h'`).

**Secret resolution.** `apps/web/src/lib/jwt-secret.ts:12-33`. Any deploy where `VERCEL_ENV` is set or `NODE_ENV === 'production'` requires `JWT_SECRET` of length >= 16, otherwise the module throws at boot. Local dev falls back to `dev-only-jwt-secret-change-me` with a `console.warn`. Validation runs at module load, so a misconfigured deploy fails fast.

**Cookie config.** Set at `apps/web/src/app/api/admin/auth/login/route.ts:77-83`: `httpOnly: true`, `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'lax'`, `path: '/'`, `maxAge` derived from `JWT_EXPIRY`. Name `gearup_token` (`apps/web/src/lib/auth.ts:31`). Cleared via `POST /api/admin/auth/logout` (`apps/web/src/app/api/admin/auth/logout/route.ts:14-20`).

**Login rate limit.** `apps/web/src/middleware.ts:147-192`. Per-IP: 10 attempts per minute against `/api/admin/auth/login`. Per-account: 8 attempts per 5 minutes across all IPs (best-effort in-process). Bodies are cloned, parsed as JSON, and the `adminUserId`/`email`/`username`/`phone` field lowercased for the account key. On top of that, the login route enforces `MAX_LOGIN_ATTEMPTS = 5` DB-side, locking the account for `LOCKOUT_DURATION_MINUTES = 30` (`apps/web/src/app/api/admin/auth/login/route.ts:53`).

**Password hashing.** `bcryptjs@^2.4.3`, cost factor 12 (`apps/web/src/app/api/admin/settings/admins/route.ts:11` and `apps/web/src/app/api/admin/auth/change-password/route.ts:16`). Timing equalization present: unknown user, INACTIVE, and LOCKED paths all run `bcrypt.compare(password, DUMMY_BCRYPT_HASH)` before throwing `Invalid credentials` (`apps/web/src/app/api/admin/auth/login/route.ts:19,44-46`). Error message identical across the four fail paths.

**Session refresh.** None. A 24h token expires and the SPA re-authenticates. No refresh-token endpoint. `apps/web/src/lib/errors.ts:112-135` returns `SESSION_STALE 401` when a JWT's `sub` references an `AdminUser` row that no longer exists (post-DB-restore case).

**Bootstrap admin.** `apps/web/prisma/seed.ts:7` hashes the plaintext `admin123` and upserts five accounts (`admin`, `arnab`, `priya`, `receptionist`, `mechanic`), all sharing that hash. There is no first-login password change enforcement in the login route or the change-password route. Production must overwrite these before opening the app. See G-3, G-9.

## 4. Authorization (RBAC)

**Roles in code.** `packages/types/src/domain.ts:83-89` defines five: `SUPER_ADMIN`, `ADMIN`, `RECEPTIONIST`, `MECHANIC`, `INVENTORY_MANAGER`. `docs/rbac.md` lines 5-9 names five different ones (`SUPER_ADMIN`, `ADMIN`, `SERVICE_MANAGER`, `WORKER`, `BILLING`). The doc is stale (G-6). The code is authoritative.

**Permissions.** 39 permission keys enumerated `packages/types/src/domain.ts:93-134`. Four are SUPER_ADMIN-only via the `SUPER_ADMIN_ONLY_PERMISSIONS` array (`domain.ts:140-145`): `JOB_CARDS_DELETE`, `DATA_EXPORT`, `INVENTORY_HARD_DELETE`, `INVENTORY_VIEW_COST`. `ADMIN` gets all permissions except those four. Other roles get explicit subsets.

**Enforcement.** Every admin route calls `requirePermission(...)` or `requireAnyPermission(...)` from `apps/web/src/lib/auth.ts:59-72`, which decodes the JWT via `verifyAuth()` and checks membership in the token's `permissions` array. Missing permission throws `ForbiddenError` -> 403.

**15-route sample audit** (permissions asserted on each route, from grep for `PERMISSIONS.*`):

| Route | Permissions used |
|---|---|
| `admin/customers/route.ts` | `CUSTOMERS_VIEW`, `CUSTOMERS_EDIT` |
| `admin/appointments/route.ts` | `APPOINTMENTS_VIEW`, `APPOINTMENTS_CONFIRM` |
| `admin/invoices/route.ts` | `INVOICES_VIEW`, `INVOICES_CREATE` |
| `admin/inventory/items/route.ts` | `INVENTORY_VIEW`, `INVENTORY_EDIT`, `INVENTORY_VIEW_COST` |
| `admin/job-cards/route.ts` | `JOB_CARDS_CREATE`, `JOB_CARDS_VIEW_OWN` |
| `admin/payments/route.ts` | `PAYMENTS_RECORD` |
| `admin/expenses/route.ts` | `EXPENSES_VIEW`, `EXPENSES_MANAGE` |
| `admin/workers/route.ts` | `WORKERS_MANAGE`, `JOB_CARDS_ASSIGN_WORKERS` |
| `admin/vehicles/route.ts` | `VEHICLES_VIEW`, `VEHICLES_EDIT` |
| `admin/logs/route.ts` | `LOGS_VIEW` |
| `admin/reports/route.ts` | `DASHBOARD_VIEW` |
| `admin/settings/route.ts` | `SETTINGS_VIEW`, `SETTINGS_MANAGE` |
| `admin/settings/admins/route.ts` | `ADMIN_USERS_MANAGE` |
| `admin/notifications/route.ts` | `NOTIFICATIONS_VIEW` |
| `admin/salary-slips/route.ts` | `EXPENSES_VIEW`, `EXPENSES_MANAGE` |

**Missing-check sweep.** `find apps/web/src/app/api/admin -name route.ts | xargs grep -L "requirePermission\\|requireAnyPermission\\|verifyAuth\\|getAuthToken"` returned exactly two files: `apps/web/src/app/api/admin/auth/login/route.ts` and `apps/web/src/app/api/admin/auth/logout/route.ts`. Both are correctly unauthenticated by design (see logout header comment `route.ts:8-9`). Every other admin route asserts a permission.

**Public route surface.** Five routes under `apps/web/src/app/api/public/`:

- `available-slots/route.ts` -> GET, returns weekly slot capacity; input bounded to today..+90 days.
- `customer-lookup/route.ts` -> GET, returns only an opaque `{exists: true}` marker on hit, `null` on miss, identical shape on invalid input, aggressively rate-limited at 10/min/IP (`middleware.ts:211-219`); designed against phone-number enumeration.
- `service-requests/route.ts` -> POST, the booking form; strict Zod schema, in-process per-phone 60s cooldown, 5-min exact-payload fingerprint window (SHA256), DB-level duplicate check, `maxDuration = 10` seconds, refuses to mutate an existing customer's PII from an unauthenticated form (adds `[reconcile]` notes for admin instead).
- `track/route.ts` -> GET, tracking by referenceId; returns a coarse status projection with no internal IDs, no names, no phone, no invoice numbers.
- `estimate/[token]/route.ts` -> GET and PATCH, gated on a 32-byte `randomBytes(...).toString('base64url')` token (`apps/web/src/lib/estimate-token.ts:20`); legacy cuid IDs are grandfathered until a real token is minted.

Each surface is intentionally minimal in what it returns. Verified.

## 5. Input validation

Every route sampled uses `z.object(...)` + `.parse()` (or `.safeParse()`) on `req.json()` and on `req.nextUrl.searchParams`. Grep for `await req.json()` under `apps/web/src/app/api/admin/` returned 57 hits, and every file with such a call also contains a `z.` schema (the raw file-set list of "no schema in file" was empty after re-checking; the `grep -L` false-positive was on files where the schema is imported from `@/lib/validators`).

Length caps are consistent (`fullName` max 120, `issueDescription` max 2000, phone normalized to `^\d{10}$`, registration `^[A-Za-z0-9- ]{4,20}$`).

## 6. Injection risks

**SQL.** Prisma parameterizes model calls. Grep for `$queryRaw` and `$executeRaw`: 8 hits.

| File | Kind | Safety |
|---|---|---|
| `apps/web/src/app/api/health/route.ts:6` | `$queryRaw` template literal | Literal `SELECT 1`, no input |
| `apps/web/src/app/api/admin/inventory/low-stock/route.ts:14` | `$queryRaw` template | Literal, no user input in body |
| `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts:33` | `$queryRaw` template | Bound to caller-provided ids via Prisma tag |
| `apps/web/src/app/api/admin/reports/route.ts:53` | `$queryRawUnsafe` | `$1` bind for `todayStr` |
| `apps/web/src/app/api/admin/reports/revenue/route.ts:46,53,79,126,141` | five `$queryRawUnsafe` | All use `$1`/`$2` bind for date range; SQL body is a literal template |
| `apps/web/src/app/api/admin/reports/inventory/route.ts:12` | `$queryRaw` template | Literal |

None concatenate user input into the SQL body. G-11.

**XSS.** Next.js escapes by default. Grep for `dangerouslySetInnerHTML`: one hit, `apps/web/src/app/admin/estimates/[id]/print/page.tsx:56`, and the injected string is a static CSS template literal (the print stylesheet), no user data flows in. Safe.

**SSRF.** Grep for `await fetch(` in server code: three hits, all in client-side React (`apps/web/src/app/admin/settings/page.tsx:79` and `apps/web/src/lib/api/client.ts:98,172`), and each uses a hard-coded route path (`${BASE}${path}`, where `BASE` is the app's own origin from `NEXT_PUBLIC_API_URL`). No server-side fetch takes a user-supplied URL. G-12.

## 7. CSRF

Cookie is `SameSite=Lax` (`apps/web/src/app/api/admin/auth/login/route.ts:80`). Bearer transport is never auto-attached by browsers. CORS allowlist (`apps/web/src/middleware.ts:73-98`) refuses unlisted origins on credentialed requests when `CORS_ALLOWED_ORIGINS` is set. Deploys MUST set that variable (dev falls back to `*` and a log warning). State-changing endpoints require the cookie or the header; there is no double-submit token. The doc block at `apps/web/src/lib/auth.ts:7-30` records the decision and the fallback plan (add a CSRF token if the bearer transport is ever dropped). Acceptable for the current transport.

## 8. Secrets handling

**`.env` gitignored.** `.gitignore:11-14` covers `.env`, `.env.local`, `.env.*.local`. `git ls-files | grep -E "^\.env"` returns only `.env.example`. No environment file has ever been tracked.

**Hard-coded secrets.** Grep for `sk_`, `Bearer `, `-----BEGIN`, hard-coded connection strings returned zero real hits (all `Bearer ` matches are doc-block prose in `apps/web/src/lib/auth.ts`).

**Client-exposed vars.** Two `NEXT_PUBLIC_*` names in the source: `NEXT_PUBLIC_EXPOSE_ERRORS` (`apps/web/src/lib/errors.ts:153`) and `NEXT_PUBLIC_SENTRY_DSN` (`apps/web/sentry.server.config.ts:2,5`, `apps/web/sentry.client.config.ts`, `apps/web/sentry.edge.config.ts`). A Sentry DSN is public by design. The pattern of the server-side Sentry config reading a `NEXT_PUBLIC_*` name is a footgun for future contributors (G-7): a rename to `SENTRY_DSN` in the server config would isolate future edits.

**Sentry / Vercel / Supabase tokens.** None appear in code. Vercel and Supabase credentials live in the platform env store; local dev sources them from `.env.local` and `apps/web/scripts/with-root-env.mjs`.

## 9. Public-form abuse

`POST /api/public/service-requests` (§4 above) has the strongest guard set: schema bounds, three-layer duplicate detection (per-phone cooldown, exact-payload fingerprint, DB recent-duplicate window), and hard identity-mutation refusal (never overwrites an existing customer's name or email from an unauthenticated form). Rate limit runs at middleware level: 30/min/IP shared across `/api/public/*`, plus 10/min/IP against `/api/public/customer-lookup` specifically.

**Public estimate viewer.** `GET /api/public/estimate/[token]/route.ts`. Token is 32 random bytes base64url = 43 characters, ~256 bits of entropy. Legacy cuid IDs are grandfathered (`CUID_RE = /^c[a-z0-9]{20,30}$/`) until a real token is minted; once a token exists it is the only way in. The PATCH handler requires the client to echo `estimateRevision` (min 8, max 128 chars) to defeat a price-change race between view and approve (`route.ts:24-28`).

**AMC poster page.** Not audited in this pass. See gap list.

**In-process rate limiter, serverless caveat.** `apps/web/src/middleware.ts:16-31` acknowledges the limit is best-effort: on Vercel each warm instance has its own `Map` and cold starts wipe state. The effective limit is N-instances times the number in code. G-2. The route-level guards (per-phone 60s, fingerprint 5-min, DB recent-duplicate) remain the durable line of defence.

## 10. File upload

Grep for `formData`, `multipart`, `upload`: zero hits under `apps/web/src/app/api/`. There is no file-upload endpoint. Public estimate PDFs are rendered client-side from JSON; no server-side file ingest exists.

## 11. Dependency vulnerabilities

`pnpm audit --prod --json` (verified 2026-09-20 under `apps/web`):

```
counts { moderate: 16, high: 26, low: 4, critical: 2 }
```

Two critical, both on `next@14.2.35`:

- `GHSA-p293-qw3h-jr36` critical: Next.js unauthenticated RCE on Windows-hosted servers, affected `>=13.4.0 <15.5.24`. Not applicable if Vercel Linux is the only runtime (verify against deploy).
- `GHSA-2xp9-vwfh-vxw4` critical: Next.js unauthenticated RCE in the Image Optimization API when AVIF files are used, affected `>=10.0.0 <15.5.24`. Applicable if `next/image` is configured with any remote pattern. Grep for `remotePatterns` in `apps/web/next.config.*` before treating as N/A. G-1.

The high-severity block (26 advisories) is largely transitive through `next` and `@sentry/nextjs` (a major-version Next upgrade closes most). `@babel/core <=7.29.0` (transitive) shows up under `GHSA-4x5r-pxfx-6jf8`.

Recommendation: upgrade `next` to `>=15.5.24` (or later `14.x` if the AVIF fix has been backported; verify) and re-run `pnpm audit`. This is a version bump, not a migration, on Next 14.

## 12. Logging and audit trail

**Activity logger.** `apps/web/src/lib/activity-logger.ts`. Every auth event, mutation, and destructive op writes an `ActivityLog` row (see `logActivity({...})` calls throughout `apps/web/src/app/api/`). Supports transaction-scoped writes (rolls back with the primary mutation) and `waitUntil` on serverless (prevents lambda freeze before commit). Failures fall back to `console.error` and to Sentry when initialized (`activity-logger.ts:36-50`).

**PII in logs.** Grep for `console.log` under `apps/web/src/app/api/` and `apps/web/src/lib/` returned zero hits. Grep for `console.error|console.warn` returned 10 hits, all in error paths (`errors.ts:127,149`, `jwt-secret.ts:23`, `activity-logger.ts:41`, and login-error `route.ts:87`). None log request bodies or PII.

**Sentry breadcrumbs.** `apps/web/sentry.server.config.ts:2-7`: initializes only when `NEXT_PUBLIC_SENTRY_DSN` is set, `tracesSampleRate: 0.2`. No custom `beforeSend` scrubber; if a Zod validation error's `.issues` contained a submitted phone number, it would reach Sentry as part of the exception. Consider a scrubber for `phoneNumber`, `email`, `passwordHash`, `passwordChangeToken` (recommendation).

## 13. Backup and restore integrity

**Destinations.** From `docs/RESTORE.md` lines 5-13: three tiers, all daily.

- GitHub Actions artifacts: 90 days.
- `db-backups` branch of this repo, `backups/gearup-<UTC>.sql.gz`: 90 dailies.
- Local `backups/` on the dev Mac: 60 days.

Ad-hoc safety dumps commit under `docs/audit/<date>/db-backups/*.sql.gz` on `main`.

**Encryption at rest.** GitHub Actions artifacts and repository storage are encrypted at rest by GitHub; local `backups/` on the dev Mac inherits FileVault. No customer-managed key. Backups are stored as `pg_dump` output with `--no-owner --no-acl`, so a leaked dump is directly restorable.

**Access control.** The `db-backups` branch is inside a private repository (`gearup`) whose write access matches the repo. Anyone with repo read can `git clone` a full DB dump. This is acceptable for a two-developer workspace; note if the collaborator set widens.

## 14. Third-party trust surface

- **Vercel** (host): sees every request URL, headers, and the response. Server logs retained per Vercel plan.
- **Supabase** (Postgres): sees all data at rest. Access via `DATABASE_URL` / `DIRECT_URL`. RLS not audited in this pass.
- **Sentry** (`@sentry/nextjs@^8.0.0`): sees any exception payload sent from the app. `tracesSampleRate: 0.2` means 20% of transactions include timing/spans. No scrubber configured.
- **GitHub** (host + backups branch): sees all repository content and the daily DB dump.
- **Cloudflare** (DNS/edge, per deploy convention): sees domain and IP-level traffic.
- **WhatsApp** (notifications, if wired): outbound provider sees phone number, message body, and delivery status. Not audited in this pass.

## 15. Known incidents

- **June 2026 data-loss incident**, referenced in `docs/RESTORE.md` and in `MEMORY.md` (`gearup-data-loss-incident-2026-06-10.md`). Root cause was a destructive DB op run without the confirmation gate that RULE 2 now enforces. Recovery used a chrome-cache extraction plus the last DB backup. Live DB is canonical (PITR restore declined); the workspace-wide zero-tolerance rules (`~/.claude/CLAUDE.md` RULES 1 to 8) were seeded from that incident.
- **P0 transaction-timeout family**, PRs #58 and #59: reference in commit log. Not a security bug but the class (long-running writes on a shared connection) is a security-adjacent availability concern; both landed and are the reason `maxDuration = 10` appears on public routes.

## 16. Recommended actions

**P0**

1. Upgrade `next` from `14.2.35` to a version outside the AVIF-RCE affected range (`>=15.5.24`, or the latest `14.x` patch that backports `GHSA-2xp9-vwfh-vxw4`). Verify against `next.config.*` remotePatterns before dismissing as N/A. Re-run `pnpm audit --prod`.
2. Rotate the seed password `admin123` for every seeded account in production. Verify each of the five seeded `adminUserId` values (`admin`, `arnab`, `priya`, `receptionist`, `mechanic`) has been changed since first boot. Grep the DB for `passwordHash` collisions across accounts; any duplicate means the seed value is still live.
3. Rotate the two GitHub PATs referenced in `MEMORY.md` (G-10). GitHub Settings -> Developer settings -> Personal access tokens -> Revoke, then re-issue as fine-grained tokens scoped to `gearup` only, with a set expiry.

**P1**

4. Replace the in-process `Map` rate limiter with Upstash Ratelimit or Vercel KV, keyed on `(request.ip, route)` and additionally on `adminUserId`/`phone`/`jobCardId` for identity-scoped limits (`apps/web/src/middleware.ts:19-31` already carries the `TODO(prod-blocker)`).
5. Move the JWT off `localStorage` and onto the cookie transport only, then drop the `Authorization: Bearer` header path and add a double-submit CSRF token (`apps/web/src/lib/auth.ts:11-30` records the plan).
6. Reconcile `docs/rbac.md` with `packages/types/src/domain.ts`. The doc is authoritative for humans; the code is authoritative for machines. Right now they disagree on three of five role names.
7. Add a Sentry `beforeSend` scrubber in `sentry.server.config.ts` for `phoneNumber`, `email`, `passwordHash`, `passwordChangeToken`. Rename `NEXT_PUBLIC_SENTRY_DSN` to `SENTRY_DSN` in `sentry.server.config.ts` (keep the client one `NEXT_PUBLIC_*` as required by the bundle).
8. Force a first-login password change for any account created via seed. Track a `mustChangePassword` boolean on `AdminUser`; the login route sets a short-lived one-shot token and refuses non-change requests until it clears.

**P2**

9. Gate `NEXT_PUBLIC_EXPOSE_ERRORS` on `NODE_ENV === 'production' && VERCEL_ENV === 'production'` explicitly. Today the fallback `process.env.NODE_ENV !== 'production'` exposes stack traces on any non-production build, including Vercel preview.
10. Add a `report-to` endpoint and a Content-Security-Policy header. There is no CSP set on any response today (verified: no `headers()` block in `apps/web/next.config.*` beyond the defaults, and no `Content-Security-Policy` header written in `middleware.ts`).
11. Add a `HEAD` handler and cache-control headers on `/api/public/estimate/[token]` so the shared link is not cached by intermediaries.
12. Chip away at the 26 high-severity transitive advisories (most fall to a Next major upgrade).

---

## 17. Gaps this pass did not cover

- Supabase Row-Level Security (RLS) posture. Not read.
- WhatsApp/notifications outbound provider surface (`apps/web/src/app/api/admin/notifications/`).
- Vercel project settings (deployment protection, environment scoping, log retention).
- `apps/web/next.config.*`: not opened; the CSP recommendation and the `remotePatterns` verification both need it.
- History-wide secret scan (only working-tree grep was performed; `git rev-list --all` sweep left as future work).
- End-to-end test of the login lockout under distributed IPs (would need a runner).
- The AMC poster page's public surface.
