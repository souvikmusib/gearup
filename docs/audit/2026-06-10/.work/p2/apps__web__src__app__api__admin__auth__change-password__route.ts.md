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

Target file: `apps/web/src/app/api/admin/auth/change-password/route.ts`

## Findings (1)

### [P2] Password change does not invalidate existing tokens
- id: `change-password-no-revoke-other-sessions` · category: auth
- location: `apps/web/src/app/api/admin/auth/change-password/route.ts:15-17`
- evidence:
```
await prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
logActivity({ entityType: 'AdminUser', entityId: user.id, action: 'auth.password-changed', actorType: 'ADMIN', actorId: user.id });
return NextResponse.json({ success: true });
```
- impact: If a user changes password because they suspect compromise, old JWTs remain valid for up to 24h. Standard expectation is 'change password → log out everywhere'.
- proposed fix: Add `tokenVersion` (int) to AdminUser. Include in JWT. verifyAuth() compares against DB (cached). Bump on password change and on role/status change.