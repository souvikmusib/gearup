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

Target file: `apps/web/src/app/api/admin/settings/route.ts`

## Findings (2)

### [P2] Settings PATCH uses Promise.all of upserts — partial failure leaves DB partially updated with no rollback
- id: `settings-promise-all-partial-failure` · category: data-integrity
- location: `apps/web/src/app/api/admin/settings/route.ts:25`
- evidence:
```
await Promise.all(entries.map(([key, value]) => prisma.setting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } })));
```
- impact: If 5 settings are sent and the 3rd upsert fails (e.g. JSON column constraint), the first 2 are committed and the others aren't — UI shows 'Failed to save' but half the changes are live. Notification flags can end up inconsistent (whatsapp on, email half-toggled).
- proposed fix: prisma.$transaction(entries.map(([key, value]) => prisma.setting.upsert(...))).

### [P2] Settings PATCH key prefix allowlist permits any key under business./invoice./notification./integration. — including unknown keys
- id: `settings-key-prefix-allowlist-loose` · category: validation
- location: `apps/web/src/app/api/admin/settings/route.ts:8,23`
- evidence:
```
const ALLOWED_PREFIXES = ['business.', 'invoice.', 'notification.', 'integration.'];
...
const invalid = entries.filter(([key]) => !ALLOWED_PREFIXES.some((p) => key.startsWith(p)));
```
- impact: An admin can write `integration.evilProvider.token = '...'` or `notification.zzz = {...}` — accepted and stored. Combined with the JSON value freedom, this is a junk-data + storage-bloat vector.
- proposed fix: Allowlist by exact key name from a registry that also encodes the Zod schema for the value (see settings-patch-unvalidated-json-value).