You are applying P2 quality fixes to gearup. Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup.
Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- PERMISSIONS enum: `packages/types/src/domain.ts` (import via `@gearup/types`)
- DB: `import { prisma } from '@/lib/prisma'`. For multi-step writes use `prisma.$transaction`.
- Errors: `handleApiError(err)` in `@/lib/errors`. `AppError(statusCode: number, message: string, code: string)` — note arg order: STATUS first.
- Activity log: `logActivity({ adminUserId, action, entityType, entityId, metadata, tx })` from `@/lib/activity-logger` (supports optional tx).
- Gold stock pattern: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts`.

Rules:
1. Read the file first.
2. Apply EVERY finding. P2 = quality (consistency, perf, ux, type-safety, dead-code) — no skipping.
3. Preserve unrelated code; no reformatting.
4. Imports: add what you need; don't remove used ones.
5. No backward-compat shims.

Return JSON: {"file":"...","applied":[...ids],"skipped":[{"id":"","reason":""}],"notes":"..."}.

Target file: `apps/web/src/app/api/admin/settings/admins/route.ts`

## Findings (5)

### [P2] PATCH admins uses `...data` spread into Prisma update
- id: `admin-mgmt-mass-assignment-spread` · category: validation
- location: `apps/web/src/app/api/admin/settings/admins/route.ts:85-89`
- evidence:
```
const { id, password, roleId, ...data } = body;
const updateData: any = { ...data };
if (password) updateData.passwordHash = await bcrypt.hash(password, 10);

const user = await prisma.adminUser.update({ where: { id }, data: updateData, ... });
```
- impact: Currently safe because zod schema enumerates fields explicitly. But the `updateData: any` plus spread is the classic mass-assignment shape — any future addition to the schema without updating types/cast will silently allow writes to fields the API never intended (e.g., status='ACTIVE' bypassing LOCKED). Type-unsafe.
- proposed fix: Build updateData with explicit assignments per field. Drop `any`. Or use Prisma's typed `AdminUserUpdateInput` so TS catches unintended additions.

### [P2] bcrypt cost factor inconsistent (10 vs 12)
- id: `bcrypt-cost-inconsistent` · category: security
- location: `apps/web/src/app/api/admin/settings/admins/route.ts:54,87 + apps/web/src/app/api/admin/auth/change-password/route.ts:15`
- evidence:
```
admins POST: bcrypt.hash(body.password, 10)
admins PATCH: bcrypt.hash(password, 10)
change-password: bcrypt.hash(newPassword, 12)
```
- impact: Passwords created by an admin or via password reset are weaker (cost 10) than self-changed passwords (cost 12). Minor but inconsistent — also makes rotation policy unclear.
- proposed fix: Centralize: export const BCRYPT_COST = 12 in lib/constants.ts and use everywhere.

### [P2] No DELETE handler for /api/admin/settings/admins
- id: `no-delete-admin-endpoint` · category: dead-code
- location: `apps/web/src/app/api/admin/settings/admins/route.ts`
- evidence:
```
GET, POST, PATCH defined — no DELETE export. UI presumably uses PATCH status=INACTIVE for deactivation.
```
- impact: If the UI exposes a Delete button, it 405s. If soft-delete via INACTIVE is the policy, that's fine but should be explicit. Right now nothing reflects intent.
- proposed fix: Either add DELETE (with last-admin guard above) or document INACTIVE as the deletion mechanism in a comment.

### [P2] Admin email is accepted as any string (z.string().optional()), no format validation
- id: `admin-email-no-format-validation` · category: validation
- location: `apps/web/src/app/api/admin/settings/admins/route.ts:49-50`
- evidence:
```
email: z.string().optional(),
phone: z.string().optional(),
```
- impact: Junk like 'asdf' goes into a column with a @unique constraint and breaks future lookups / password-reset flows. Phone has no E.164 normalisation either; two admins can have '+91 98...' vs '+919...' as 'different' phones.
- proposed fix: z.string().email().optional() for email. z.string().regex(/^\+?[0-9]{10,15}$/).optional() (or libphonenumber) for phone, with normalisation before write.

### [P2] No tenant/garage scoping on any of these routes (single-tenant assumption)
- id: `settings-no-tenancy-check` · category: auth
- location: `apps/web/src/app/api/admin/settings/admins/route.ts:9-100`
- evidence:
```
prisma.adminUser.findMany({ orderBy: { createdAt: 'desc' }, select: { ... } })
// no garageId / tenantId filter anywhere in any route
```
- impact: If this app ever serves multiple garages, every admin in the deployment can see/modify everyone else's data. Likely intentional for this single-tenant shop, but worth documenting now so future multi-tenancy doesn't quietly break isolation.
- proposed fix: Confirm intent: single-tenant deployment per shop. If multi-tenant is planned, plumb a garageId into every model and into JWT, and add `where: { garageId: user.garageId }` to every query.