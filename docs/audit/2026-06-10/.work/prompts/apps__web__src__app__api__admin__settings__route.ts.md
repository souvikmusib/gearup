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

Target file: `apps/web/src/app/api/admin/settings/route.ts`

## Findings to fix in this file (2)

### 1. [P0 · BLOCKER] Settings PATCH accepts arbitrary unvalidated JSON values (only key prefix is checked)
- _id_: `settings-patch-unvalidated-json-value` · _category_: validation
- _location_: `apps/web/src/app/api/admin/settings/route.ts:18-29`
- _evidence_:
```
const body = await req.json() as Record<string, unknown>;
...
const invalid = entries.filter(([key]) => !ALLOWED_PREFIXES.some((p) => key.startsWith(p)));
if (invalid.length) throw new ValidationError(...);
await Promise.all(entries.map(([key, value]) => prisma.setting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } })));
```
- _impact_: Any value shape can be written — strings where numbers expected (e.g. notification.reminderHours='drop'), objects where booleans expected, huge JSON blobs (no size cap), arrays where scalars expected. Downstream code (cron, UI) reads these and likely crashes or misbehaves; a single bad PATCH can break notifications for the whole shop. Also lets an attacker exhaust the row by writing a 10MB JSON blob.
- _proposed fix_: Maintain a registry of allowed setting keys with per-key Zod schemas (boolean/number/string/url). Reject unknown keys outright and validate value against the registered schema before upsert. Cap individual value JSON size (e.g. 8KB).
- _verifier said_: real=True, Confirmed: the PATCH handler only checks key prefixes and writes value as-is via prisma.setting.upsert with no Zod schema, type, or size validation. Auth is enforced (SETTINGS_MANAGE), so this is admin-only — not an unauthenticated attack surface, which limits real-world exploitability. Impact is real (bad shapes/oversized blobs can break downstream cron/UI consumers) but requires an authenticated admin, so P0 go-live-blocker is overstated; P2 is appropriate. The proposed fix (per-key Zod registry + size cap) is the right remediation.

### 2. [P1] Settings audit log records newValue but never previousValue
- _id_: `settings-patch-no-previous-value-audit` · _category_: observability
- _location_: `apps/web/src/app/api/admin/settings/route.ts:25-26`
- _evidence_:
```
await Promise.all(entries.map(([key, value]) => prisma.setting.upsert(...)));
logActivity({ entityType: 'Setting', action: 'settings.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
```
- _impact_: For compliance/forensics you cannot answer 'who turned WhatsApp off and what was it before?'. Settings change history is half-recorded.
- _proposed fix_: findMany the existing keys first, snapshot previous values, then upsert. Pass previousValue to logActivity. Optionally log per-key entries to make change reports trivial.