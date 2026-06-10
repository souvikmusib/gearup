# Auth & RBAC — module audit

_Module key:_ `auth-rbac`

## Summary

The auth module is built on JWT in localStorage with bcrypt password hashing, role-based permissions via in-memory ROLE_PERMISSIONS, a basic in-memory rate limiter in middleware, and lockout-after-N-failed-attempts. Foundations are sound but there are several go-live concerns: tokens are stored in localStorage (XSS-exfiltratable) rather than httpOnly cookies, CORS is set to wildcard `*` on every API response (including authenticated ones), the in-memory rate limiter is per-instance and useless behind any multi-instance deploy (Vercel serverless), x-forwarded-for is trusted blindly for both rate limiting and audit logs (spoofable to bypass rate limits), the login endpoint leaks stack traces to server logs and unnecessary error info, the admin-management POST/PATCH route uses spread for mass-assignment, deletes-then-creates role assignments without a transaction (window with zero roles), and there is no DELETE handler for admins yet. Bcrypt cost is inconsistent (10 for admin mgmt, 12 for self-change-password). No CSRF protection beyond bearer-header pattern, which is fine if tokens never live in cookies — but the dev fallback JWT secret and missing env validation are risky. Sentry directory is empty (.gitkeep) — no error reporting wired.

## Routes audited

- `POST /api/admin/auth/login`
- `GET /api/admin/auth/me`
- `POST /api/admin/auth/change-password`
- `GET /api/admin/settings/admins`
- `POST /api/admin/settings/admins`
- `PATCH /api/admin/settings/admins`
- `middleware on /api/*`

## Files audited

- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/middleware.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/auth.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/jwt-secret.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/auth/auth-context.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/errors.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/activity-logger.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/auth/login/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/auth/me/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/auth/change-password/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/login/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/settings/admins/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/packages/types/src/auth.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/constants.ts`

## Coupling

verifyAuth/requirePermission in lib/auth.ts is consumed by every protected admin route. ROLE_PERMISSIONS map from @gearup/types/auth drives both login token issuance and /me. activity-logger.ts is a fire-and-forget singleton used everywhere. The JWT secret resolution (jwt-secret.ts) is shared across login/verify. AuthProvider on the client controls all admin routing decisions. Middleware applies to every `/api/*` route — its CORS and rate-limit behavior affects every endpoint in the app, not just auth.

## Findings

### [P0 · BLOCKER] CORS Access-Control-Allow-Origin: * on every API route
_id:_ `cors-wildcard-on-authed-api` · _category:_ security · _file:_ `apps/web/src/middleware.ts:26-28`

```
response.headers.set('Access-Control-Allow-Origin', '*');
response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
```
**Impact.** Any website can call your admin and public APIs from a victim's browser. Because tokens are in localStorage and sent via Authorization header (not cookies), browsers won't auto-attach them — but any page that obtains a token (XSS, phishing) can call any API cross-origin without restriction, and public booking/estimate endpoints are also exposed for abuse. Also blocks any future move to cookie-based auth.

**Fix.** Whitelist explicit origins (env CORS_ALLOWED_ORIGINS) and echo only matching Origin header. Never use '*' on routes that accept Authorization.

  _Adversarial verify:_ **CONFIRMED** (now P1) — Confirmed at apps/web/src/middleware.ts:26-28: middleware unconditionally sets Access-Control-Allow-Origin: * on all /api/* routes, including admin routes that accept Authorization headers. The wildcard does prevent credentialed cookie-based requests, and since tokens live in localStorage (not auto-attached cookies), a random origin cannot read another user's authed responses without first stealing the token via XSS/phishing. However, public endpoints (booking/estimate POSTs) are exposed to abuse from any origin, and the policy blocks any future migration to cookie-based auth and weakens defense-in-depth. Real issue and worth fixing pre-launch, but I'd grade it P1 rather than a hard P0 go-live blocker since exploitation requires a separate token-theft vector.

### [P1] JWT stored in localStorage instead of httpOnly cookie
_id:_ `token-in-localstorage-xss` · _category:_ security · _file:_ `apps/web/src/lib/auth/auth-context.tsx:36-37,80`

```
const token = localStorage.getItem('gearup_token');
...
localStorage.setItem('gearup_token', token);
```
**Impact.** Any XSS anywhere in the admin SPA (npm dep, markdown render, dangerouslySetInnerHTML, future ad/analytics script) gives full account takeover by stealing the token. JWTs are valid 24h with no server-side revocation list. httpOnly + Secure + SameSite=Strict cookies would block JS exfiltration entirely.

**Fix.** Move token to httpOnly Secure SameSite=Strict cookie set on /api/admin/auth/login response. Have auth.ts read from cookie via next/headers cookies(). Add /logout endpoint that clears it. Then drop localStorage reads.

### [P0 · BLOCKER] Rate limiter is per-process in-memory — useless on Vercel/serverless
_id:_ `in-memory-rate-limiter-broken-on-serverless` · _category:_ security · _file:_ `apps/web/src/middleware.ts:4-18`

```
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW = 60_000; // 1 minute
function isRateLimited(ip: string, limit = RATE_LIMIT): boolean { ... entry.count++; return entry.count > limit; }
```
**Impact.** Every serverless instance has its own Map. With N warm instances an attacker effectively gets N*10 login attempts/min and can brute-force the 30-day lockout window or hammer public endpoints. Map also grows unbounded — small memory leak.

**Fix.** Use a shared store: Upstash Redis ratelimit, Vercel KV, or DB-backed sliding window keyed by `${ip}:${path}`. Add LRU cap if keeping in-memory as best-effort layer.

  _Adversarial verify:_ **CONFIRMED** (now P1) — Confirmed: middleware.ts uses a module-level Map for rate limiting, which on Vercel/serverless is per-instance and per-cold-start. The login limit of 10/min and public 30/min are effectively multiplied by warm instance count, weakening brute-force protection on /api/admin/auth/login. The Map also grows unbounded with no LRU/TTL cleanup beyond per-key reset. Downgrading from P0 to P1 because the route still has some throttling and the login endpoint likely has additional protections (lockout window mentioned), but it remains a real go-live concern that should be backed by Upstash/Vercel KV.

### [P1] x-forwarded-for trusted blindly — rate limit bypass
_id:_ `x-forwarded-for-spoof` · _category:_ security · _file:_ `apps/web/src/middleware.ts:36`

```
const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
```
**Impact.** Attacker sets X-Forwarded-For: random.fake.ip on each request and trivially defeats the per-IP login limiter and lockout-by-account-id (paired with brute-forcing admin IDs). Same header is also stored in audit log as actor IP — unreliable forensics.

**Fix.** On Vercel, use the platform-provided trusted client IP (e.g., request.ip or the right index from XFF based on known proxy hop count). Document trust boundary. Also key login rate limit on adminUserId, not just IP.

### [P1] Dev fallback JWT secret + no startup env validation
_id:_ `dev-jwt-fallback-and-no-env-validation` · _category:_ config · _file:_ `apps/web/src/lib/jwt-secret.ts:1-12`

```
const DEV_FALLBACK_JWT_SECRET = 'dev-only-jwt-secret-change-me';
...
if (process.env.NODE_ENV !== 'production') { console.warn(...); return DEV_FALLBACK_JWT_SECRET; }
throw new Error('JWT_SECRET is required in production ...');
```
**Impact.** Production protection relies on NODE_ENV being exactly 'production'. A preview deploy or misconfigured env sets it to 'development' and signs/accepts tokens with a public secret. There is no boot-time validation — error only surfaces on first auth request. Also: no JWT_SECRET rotation story.

**Fix.** Validate required envs at module load via zod (env.ts). Refuse to start without JWT_SECRET regardless of NODE_ENV. Treat anything not literally 'production' as require-real-secret-anyway in deployed envs (or branch on VERCEL_ENV).

### [P1] PATCH admins: deleteMany + create roles outside transaction
_id:_ `admin-mgmt-no-transaction-role-swap` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/settings/admins/route.ts:91-94`

```
if (roleId) {
  await prisma.adminUserRole.deleteMany({ where: { adminUserId: id } });
  await prisma.adminUserRole.create({ data: { adminUserId: id, roleId } });
}
```
**Impact.** Window between delete and create where the user has zero roles. If the create fails (FK violation, transient DB error), user is left permission-less and locked out of work — recovery requires DB access. Concurrent PATCHes can also race and create duplicate AdminUserRole rows.

**Fix.** Wrap user update + role swap in prisma.$transaction([deleteMany, create]). Also wrap the password update + role swap together so the whole PATCH is atomic.

### [P2] PATCH admins uses `...data` spread into Prisma update
_id:_ `admin-mgmt-mass-assignment-spread` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/settings/admins/route.ts:85-89`

```
const { id, password, roleId, ...data } = body;
const updateData: any = { ...data };
if (password) updateData.passwordHash = await bcrypt.hash(password, 10);

const user = await prisma.adminUser.update({ where: { id }, data: updateData, ... });
```
**Impact.** Currently safe because zod schema enumerates fields explicitly. But the `updateData: any` plus spread is the classic mass-assignment shape — any future addition to the schema without updating types/cast will silently allow writes to fields the API never intended (e.g., status='ACTIVE' bypassing LOCKED). Type-unsafe.

**Fix.** Build updateData with explicit assignments per field. Drop `any`. Or use Prisma's typed `AdminUserUpdateInput` so TS catches unintended additions.

### [P2] bcrypt cost factor inconsistent (10 vs 12)
_id:_ `bcrypt-cost-inconsistent` · _category:_ security · _file:_ `apps/web/src/app/api/admin/settings/admins/route.ts:54,87 + apps/web/src/app/api/admin/auth/change-password/route.ts:15`

```
admins POST: bcrypt.hash(body.password, 10)
admins PATCH: bcrypt.hash(password, 10)
change-password: bcrypt.hash(newPassword, 12)
```
**Impact.** Passwords created by an admin or via password reset are weaker (cost 10) than self-changed passwords (cost 12). Minor but inconsistent — also makes rotation policy unclear.

**Fix.** Centralize: export const BCRYPT_COST = 12 in lib/constants.ts and use everywhere.

### [P1] PATCH/POST admins has no guard against demoting/disabling self or last super-admin
_id:_ `no-admin-self-lockout-guard` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/settings/admins/route.ts:73-100`

```
export async function PATCH(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const body = z.object({ id, fullName, password, phone, status, roleId }).parse(...)
    // ... no check that caller isn't disabling themselves
    // ... no check that this isn't the last role holder of ADMIN_USERS_MANAGE
```
**Impact.** An admin can flip their own status to INACTIVE, or swap themselves to a role without ADMIN_USERS_MANAGE, locking the entire org out of user management. There is no DELETE handler — but the same is achievable via PATCH status=INACTIVE.

**Fix.** Reject if body.id === auth.sub and (status=INACTIVE or roleId removes ADMIN_USERS_MANAGE). Reject if this would leave zero users with ADMIN_USERS_MANAGE.

### [P2] Login route logs stack trace on every failed login
_id:_ `login-leaks-stack-in-server-log` · _category:_ observability · _file:_ `apps/web/src/app/api/admin/auth/login/route.ts:37-39`

```
} catch (e: any) {
  console.error('Login error:', e?.message, e?.stack);
  return handleApiError(e);
}
```
**Impact.** Every invalid-credentials attempt logs a full stack — log noise, makes real errors invisible, and on shared logging infra leaks code paths. `e: any` also defeats the AppError typing.

**Fix.** Only console.error for unexpected errors (not instanceof AppError). Drop the `any` cast; let handleApiError do its job.

### [P2] Token permissions snapshot — admin role/permission changes don't take effect until re-login
_id:_ `permissions-not-rechecked-on-me` · _category:_ auth · _file:_ `apps/web/src/app/api/admin/auth/login/route.ts:31-33`

```
const roleKeys = user.roles.map((r: any) => r.role.key as RoleKey);
const permissions = [...new Set(roleKeys.flatMap((k: RoleKey) => ROLE_PERMISSIONS[k] ?? []))];
const token = jwt.sign({ sub: user.id, adminUserId, roles: roleKeys, permissions }, ...);
```
**Impact.** Permissions are baked into the JWT for 24h. requirePermission() reads from the token, not the DB, so revoking a role or setting status=INACTIVE does NOT log the user out — they keep all their permissions for up to 24h. Even /me re-resolves from DB but middleware/auth.ts does not. No revocation list.

**Fix.** Either (a) shorten token TTL to ~15min with a refresh token, or (b) have verifyAuth() check DB status on each request (cache 30s), or (c) maintain a `tokenVersion` per user — increment on role change/disable, compare in verifyAuth.

### [P2] No CSRF protection — only mitigated by bearer-header convention
_id:_ `no-csrf-on-changepassword-and-mutations` · _category:_ security · _file:_ `apps/web/src/lib/auth.ts:7-12`

```
export function getAuthToken(): string {
  const h = headers();
  const auth = h.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token');
  return auth.slice(7);
}
```
**Impact.** Currently safe: cookies aren't auto-attached, so a cross-site form POST has no auth. But the CORS wildcard plus future move to cookies (recommended above) would open CSRF. Tightly coupled to the localStorage decision — choose one model coherently.

**Fix.** Pick a model: (a) bearer header + strict CORS allowlist (current direction), OR (b) httpOnly cookie + same-site=strict + CSRF double-submit token. Document the decision.

### [P2] No DELETE handler for /api/admin/settings/admins
_id:_ `no-delete-admin-endpoint` · _category:_ dead-code · _file:_ `apps/web/src/app/api/admin/settings/admins/route.ts`

```
GET, POST, PATCH defined — no DELETE export. UI presumably uses PATCH status=INACTIVE for deactivation.
```
**Impact.** If the UI exposes a Delete button, it 405s. If soft-delete via INACTIVE is the policy, that's fine but should be explicit. Right now nothing reflects intent.

**Fix.** Either add DELETE (with last-admin guard above) or document INACTIVE as the deletion mechanism in a comment.

### [P3] `as any` cast hides role type errors
_id:_ `auth-roles-cast-as-any` · _category:_ type-safety · _file:_ `apps/web/src/app/api/admin/auth/login/route.ts:31 + apps/web/src/app/api/admin/auth/me/route.ts:11`

```
const roleKeys = user.roles.map((r: any) => r.role.key as RoleKey);
```
**Impact.** Prisma's generated types already give the right shape on the include — `r: any` defeats type checking. If schema renames `key`, code compiles and breaks at runtime.

**Fix.** Let TS infer or annotate with the Prisma payload type `(typeof user)['roles'][number]`.

### [P2] logActivity is fire-and-forget with bare .catch — failures invisible
_id:_ `activitylog-floating-promise` · _category:_ observability · _file:_ `apps/web/src/lib/activity-logger.ts:18-33`

```
export function logActivity(params: LogActivityParams) {
  prisma.activityLog.create({ data: { ... } }).catch((e) => console.error('Activity log failed:', e.message));
}
```
**Impact.** Audit log writes can silently fail with no metric/alert. On serverless, the function can be torn down before the promise resolves, dropping audit entries entirely (Vercel/Lambda kills background tasks after response). Audit log is a compliance/forensics tool — silent loss is bad.

**Fix.** Either await the write (small latency hit, but reliable), or use `waitUntil(promise)` from next/server on the route's response. Send failures to Sentry, not just console.

### [P1] Sentry directory is empty — no error reporting
_id:_ `sentry-empty` · _category:_ observability · _file:_ `apps/web/src/lib/sentry/`

```
ls apps/web/src/lib/sentry/ -> (empty directory; .gitkeep)
```
**Impact.** All 500s and unhandled errors disappear into stdout. handleApiError() ends with `console.error('Unhandled API error:', error)` — no aggregation, no alerts. Day 1 of production you will not know what's breaking.

**Fix.** Wire @sentry/nextjs (sentry.client.config + sentry.server.config + sentry.edge.config). Capture from handleApiError when error is NOT an AppError. Add release/environment tags.

### [P3] /me uses findUniqueOrThrow — deleted/disabled users get 500 not 401
_id:_ `me-handler-throws-on-deleted-user` · _category:_ error-handling · _file:_ `apps/web/src/app/api/admin/auth/me/route.ts:10`

```
const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: auth.sub }, include: { roles: { include: { role: true } } } });
```
**Impact.** If a user's row is deleted while their JWT is still valid, /me returns 404 (mapped from P2025) instead of 401, and the AuthProvider treats it as an error rather than clearing the token. Same for INACTIVE — token is still honored.

**Fix.** findUnique + explicit check: if !user || user.status !== 'ACTIVE' throw UnauthorizedError. Also recompute and return permissions from DB (you already do this — good).

### [P3] Login: timing side-channel between unknown user and bad password
_id:_ `login-username-enumeration-timing` · _category:_ security · _file:_ `apps/web/src/app/api/admin/auth/login/route.ts:17-22`

```
const user = await prisma.adminUser.findUnique({ where: { adminUserId }, ... });
if (!user || user.status === 'INACTIVE') throw new UnauthorizedError('Invalid credentials');
if (user.status === 'LOCKED' && user.lockedUntil && user.lockedUntil > new Date()) throw new UnauthorizedError('Account locked. Try again later.');

const valid = await bcrypt.compare(password, user.passwordHash);
```
**Impact.** Unknown adminUserId returns ~5ms. Known adminUserId runs bcrypt.compare (~200ms). Attacker can enumerate valid admin IDs by timing. 'Account locked' message also confirms account exists.

**Fix.** On unknown user, run a dummy bcrypt.compare against a fixed hash to equalize timing. Return identical 'Invalid credentials' for unknown/locked/bad-password (keep lockout-info only after a correct password).

### [P2] Lockout is per-account but rate limit is per-IP only — distributed brute force trivial
_id:_ `login-no-account-id-rate-limit` · _category:_ security · _file:_ `apps/web/src/middleware.ts:35-40 + login route lockout at constants MAX_LOGIN_ATTEMPTS=5`

```
if (pathname === '/api/admin/auth/login' && request.method === 'POST') {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (isRateLimited(ip, 10)) { return 429 }
}
```
**Impact.** Combined with the in-memory limiter and XFF spoof, an attacker can lock out a target admin (5 attempts → 30min lockout) from many IPs as a denial-of-service. There is no captcha or progressive delay; lockout state has no notification to the user.

**Fix.** Add per-adminUserId attempt counter with progressive delay (not just hard lockout). Notify the admin (email) on lock. Consider captcha after 3 failures.

### [P3] Login button disable depends only on loading state — no idempotency on server
_id:_ `login-form-no-double-submit-guard` · _category:_ ux · _file:_ `apps/web/src/app/admin/login/page.tsx:17-30`

```
const submit = async (e) => { e.preventDefault(); setError(''); setLoading(true); try { const res = await api.post(...); ... } catch { ... } };
```
**Impact.** Double-tap or slow network can fire two POST /login requests. Both run bcrypt, both bump failedLoginAttempts on wrong password — could lock account in fewer attempts than expected.

**Fix.** Disable button via `loading` (already done) plus add `aria-busy` and ignore submit if loading. Server-side: optionally debounce attempts within ~500ms window per (ip, adminUserId).

### [P2] AuthProvider trusts localStorage-cached user for first render
_id:_ `auth-context-cached-user-stale-permissions` · _category:_ auth · _file:_ `apps/web/src/lib/auth/auth-context.tsx:66-72,90`

```
const cachedUser = readCachedUser();
if (cachedUser) {
  setUser(cachedUser);
  setLoading(false);
  void fetchMe({ keepCurrent: true });
  return;
}
...
const hasPermission = (p: string) => !!user?.permissions.includes(p);
```
**Impact.** After a permission downgrade, the user keeps elevated UI access until the background /me call returns — typically 100-500ms but visible. More importantly, an attacker who can write to localStorage can inject permissions and unlock admin UI (server checks still gate API calls, so it's UI-only — but it's a confusing audit signal).

**Fix.** Don't render permission-gated UI from cached user — show a skeleton until /me resolves. Or stamp cached payload with a hash signed by the token and validate before trusting.

### [P3] handleApiError leaks Prisma field names to client on P2003
_id:_ `errors-prisma-p2003-leaks-field-name` · _category:_ security · _file:_ `apps/web/src/lib/errors.ts:82-88`

```
case 'P2003': {
  const field = (error.meta?.field_name as string) || 'reference';
  return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Invalid ${field}: referenced record does not exist` } }, { status: 400 });
}
```
**Impact.** Reveals internal DB column names (e.g., `AdminUserRole_roleId_fkey`) to API consumers. Mild info disclosure useful to attackers mapping the schema.

**Fix.** Return a generic 'Invalid reference' message. Log the field name server-side only.

### [P2] Password change does not invalidate existing tokens
_id:_ `change-password-no-revoke-other-sessions` · _category:_ auth · _file:_ `apps/web/src/app/api/admin/auth/change-password/route.ts:15-17`

```
await prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
logActivity({ entityType: 'AdminUser', entityId: user.id, action: 'auth.password-changed', actorType: 'ADMIN', actorId: user.id });
return NextResponse.json({ success: true });
```
**Impact.** If a user changes password because they suspect compromise, old JWTs remain valid for up to 24h. Standard expectation is 'change password → log out everywhere'.

**Fix.** Add `tokenVersion` (int) to AdminUser. Include in JWT. verifyAuth() compares against DB (cached). Bump on password change and on role/status change.

### [P3] Password policy: only min length 8, no complexity, no breach check
_id:_ `change-password-no-strength-check` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/auth/change-password/route.ts:12 + admins POST/PATCH min(6)`

```
z.object({ currentPassword: z.string(), newPassword: z.string().min(8) })
// admins POST: password: z.string().min(6)
// admins PATCH: password: z.string().min(6).optional()
```
**Impact.** Admin-created passwords accept 6 chars. Self-change requires 8. No complexity, no haveibeenpwned check, no prevention of `password123`. Inconsistent floor across endpoints.

**Fix.** Centralize policy: min 12, mixed character classes or passphrase length 16+, reject most-common list. Apply identically across all password-setting endpoints.

### [P3] OPTIONS preflight short-circuits before any auth, but it's fine — note for completeness
_id:_ `options-skips-rate-limit-and-auth` · _category:_ consistency · _file:_ `apps/web/src/middleware.ts:30-32`

```
if (request.method === 'OPTIONS') {
  return new NextResponse(null, { status: 204, headers: response.headers });
}
```
**Impact.** Returns 204 with wildcard CORS headers for any path under /api. Combined with cors-wildcard-on-authed-api this is an amplifier — every endpoint advertises itself as cross-origin OK. Fixing CORS allowlist also fixes this.

**Fix.** Same as cors-wildcard fix — only echo allowed origins on OPTIONS.

### [P3] No server-side logout — only client-side localStorage clear
_id:_ `no-logout-endpoint` · _category:_ auth · _file:_ `apps/web/src/lib/auth/auth-context.tsx:83-89`

```
const logout = () => {
  localStorage.removeItem('gearup_token');
  localStorage.removeItem('gearup_demo');
  writeCachedUser(null);
  api.clearCache();
  setUser(null);
};
```
**Impact.** Logout is purely client-side. Token remains valid server-side until 24h expiry. No audit log entry for logout. Combined with no-revocation list, there is no way for a user to forcibly end a session.

**Fix.** Add POST /api/admin/auth/logout that bumps tokenVersion (or stores token jti in a revocation set with TTL = remaining exp). Log activity.
