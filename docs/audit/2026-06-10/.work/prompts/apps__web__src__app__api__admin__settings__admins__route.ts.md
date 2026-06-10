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

Target file: `apps/web/src/app/api/admin/settings/admins/route.ts`

## Findings to fix in this file (5)

### 1. [P1] PATCH admins: deleteMany + create roles outside transaction
- _id_: `admin-mgmt-no-transaction-role-swap` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/settings/admins/route.ts:91-94`
- _evidence_:
```
if (roleId) {
  await prisma.adminUserRole.deleteMany({ where: { adminUserId: id } });
  await prisma.adminUserRole.create({ data: { adminUserId: id, roleId } });
}
```
- _impact_: Window between delete and create where the user has zero roles. If the create fails (FK violation, transient DB error), user is left permission-less and locked out of work — recovery requires DB access. Concurrent PATCHes can also race and create duplicate AdminUserRole rows.
- _proposed fix_: Wrap user update + role swap in prisma.$transaction([deleteMany, create]). Also wrap the password update + role swap together so the whole PATCH is atomic.

### 2. [P1] PATCH/POST admins has no guard against demoting/disabling self or last super-admin
- _id_: `no-admin-self-lockout-guard` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/settings/admins/route.ts:73-100`
- _evidence_:
```
export async function PATCH(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const body = z.object({ id, fullName, password, phone, status, roleId }).parse(...)
    // ... no check that caller isn't disabling themselves
    // ... no check that this isn't the last role holder of ADMIN_USERS_MANAGE
```
- _impact_: An admin can flip their own status to INACTIVE, or swap themselves to a role without ADMIN_USERS_MANAGE, locking the entire org out of user management. There is no DELETE handler — but the same is achievable via PATCH status=INACTIVE.
- _proposed fix_: Reject if body.id === auth.sub and (status=INACTIVE or roleId removes ADMIN_USERS_MANAGE). Reject if this would leave zero users with ADMIN_USERS_MANAGE.

### 3. [P1] Admin user create is not transactional (role created via nested write — OK) but PATCH role swap is two-step non-atomic
- _id_: `admin-create-no-transaction` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/settings/admins/route.ts:88-94`
- _evidence_:
```
const user = await prisma.adminUser.update({ where: { id }, data: updateData, ... });
if (roleId) {
  await prisma.adminUserRole.deleteMany({ where: { adminUserId: id } });
  await prisma.adminUserRole.create({ data: { adminUserId: id, roleId } });
}
```
- _impact_: If the create() fails (e.g. roleId doesn't exist, FK violation), deleteMany has already removed all roles — user is left with NO roles and no way to act in the system. A concurrent request can also race between deleteMany and create, briefly leaving the user role-less. Worse: between the AdminUser update and the role swap, the user's password/status are already changed even if role swap fails.
- _proposed fix_: Wrap update + deleteMany + create in prisma.$transaction([...]). For multi-role support, diff roles instead of delete-all-then-add.

### 4. [P1] Admin PATCH lets an admin disable themselves or revoke their last admin role with no guard
- _id_: `admin-no-self-lockout-guard` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/settings/admins/route.ts:73-94`
- _evidence_:
```
requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
const body = z.object({ id: z.string(), ..., status: z.enum(['ACTIVE', 'INACTIVE']).optional(), roleId: z.string().optional() }).parse(await req.json());
...
const user = await prisma.adminUser.update({ where: { id }, data: updateData, ... });
```
- _impact_: Sole super-admin can disable themselves or downgrade their role, locking the entire org out of admin functions. Common foot-gun on go-live day.
- _proposed fix_: Disallow status=INACTIVE on self. Before role downgrade, count remaining ADMIN_USERS_MANAGE-bearing accounts and refuse if this would leave zero. Reject self-edit of own roleId entirely (force routing via another admin).

### 5. [P1] Admin password minimum is 6 chars with no complexity rule
- _id_: `admin-password-policy-too-weak` · _category_: security
- _location_: `apps/web/src/app/api/admin/settings/admins/route.ts:48`
- _evidence_:
```
password: z.string().min(6),
...
const passwordHash = await bcrypt.hash(body.password, 10);
```
- _impact_: 6-char passwords with no class requirement are trivially brute-forced offline if the hash leaks; lockedUntil/failedLoginAttempts exist on the model but a weak password makes the lockout the only line of defence.
- _proposed fix_: min(10) + at-least-one-digit + one-letter, or integrate zxcvbn with a minimum score of 3. Surface the policy in UI helper text. Consider raising bcrypt cost to 12 for admin hashes.