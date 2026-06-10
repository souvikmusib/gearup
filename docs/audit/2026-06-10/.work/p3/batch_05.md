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


## Target: `apps/web/src/app/api/admin/amc/plans/route.ts` (1 findings)

### [P3] AmcPlan coveredItems accepts arbitrary JSON without schema
- id: `plan-coveredItems-z-any` · cat: validation
- loc: `apps/web/src/app/api/admin/amc/plans/route.ts:16, /amc/plans/[id]/route.ts:29`
- evidence:
```
coveredItems: z.any().optional()
```
- impact: Admin can post {coveredItems: { __proto__: ... }} or huge nested JSON; bloats DB and is unprintable. Not a security hole (admin only) but a debt.
- fix: Define `z.array(z.string()).optional()` or a concrete object schema.

---

## Target: `apps/web/src/app/api/admin/auth/change-password/route.ts` (1 findings)

### [P3] Password policy: only min length 8, no complexity, no breach check
- id: `change-password-no-strength-check` · cat: validation
- loc: `apps/web/src/app/api/admin/auth/change-password/route.ts:12 + admins POST/PATCH min(6)`
- evidence:
```
z.object({ currentPassword: z.string(), newPassword: z.string().min(8) })
// admins POST: password: z.string().min(6)
// admins PATCH: password: z.string().min(6).optional()
```
- impact: Admin-created passwords accept 6 chars. Self-change requires 8. No complexity, no haveibeenpwned check, no prevention of `password123`. Inconsistent floor across endpoints.
- fix: Centralize policy: min 12, mixed character classes or passphrase length 16+, reject most-common list. Apply identically across all password-setting endpoints.

---

## Target: `apps/web/src/app/api/admin/auth/login/route.ts` (2 findings)

### [P3] `as any` cast hides role type errors
- id: `auth-roles-cast-as-any` · cat: type-safety
- loc: `apps/web/src/app/api/admin/auth/login/route.ts:31 + apps/web/src/app/api/admin/auth/me/route.ts:11`
- evidence:
```
const roleKeys = user.roles.map((r: any) => r.role.key as RoleKey);
```
- impact: Prisma's generated types already give the right shape on the include — `r: any` defeats type checking. If schema renames `key`, code compiles and breaks at runtime.
- fix: Let TS infer or annotate with the Prisma payload type `(typeof user)['roles'][number]`.

### [P3] Login: timing side-channel between unknown user and bad password
- id: `login-username-enumeration-timing` · cat: security
- loc: `apps/web/src/app/api/admin/auth/login/route.ts:17-22`
- evidence:
```
const user = await prisma.adminUser.findUnique({ where: { adminUserId }, ... });
if (!user || user.status === 'INACTIVE') throw new UnauthorizedError('Invalid credentials');
if (user.status === 'LOCKED' && user.lockedUntil && user.lockedUntil > new Date()) throw new UnauthorizedError('Account locked. Try again later.');

const valid = await bcrypt.compare(password, user.passwordHash);
```
- impact: Unknown adminUserId returns ~5ms. Known adminUserId runs bcrypt.compare (~200ms). Attacker can enumerate valid admin IDs by timing. 'Account locked' message also confirms account exists.
- fix: On unknown user, run a dummy bcrypt.compare against a fixed hash to equalize timing. Return identical 'Invalid credentials' for unknown/locked/bad-password (keep lockout-info only after a correct password).

---

## Target: `apps/web/src/app/api/admin/auth/me/route.ts` (1 findings)

### [P3] /me uses findUniqueOrThrow — deleted/disabled users get 500 not 401
- id: `me-handler-throws-on-deleted-user` · cat: error-handling
- loc: `apps/web/src/app/api/admin/auth/me/route.ts:10`
- evidence:
```
const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: auth.sub }, include: { roles: { include: { role: true } } } });
```
- impact: If a user's row is deleted while their JWT is still valid, /me returns 404 (mapped from P2025) instead of 401, and the AuthProvider treats it as an error rather than clearing the token. Same for INACTIVE — token is still honored.
- fix: findUnique + explicit check: if !user || user.status !== 'ACTIVE' throw UnauthorizedError. Also recompute and return permissions from DB (you already do this — good).

---

## Target: `apps/web/src/app/api/admin/customers/[id]/history/route.ts` (1 findings)

### [P3] Customer history route returns 50 hardcoded entries, no pagination
- id: `history-route-no-pagination` · cat: performance
- loc: `apps/web/src/app/api/admin/customers/[id]/history/route.ts:10`
- evidence:
```
const logs = await prisma.activityLog.findMany({ where: { entityType: 'Customer', entityId: params.id }, orderBy: { createdAt: 'desc' }, take: 50 });
```
- impact: Heavy customers (years of edits) will show only last 50; no way to see older history. Not a launch blocker since UI may not surface this yet.
- fix: Accept `page`/`pageSize` query, return paginationMeta; index activityLog on (entityType, entityId, createdAt) if not already.