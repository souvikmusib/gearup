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

Target file: `apps/web/src/app/api/admin/notifications/route.ts`

## Findings (1)

### [P2] GET /api/admin/notifications passes raw query params into Prisma where with no enum validation
- id: `notifications-no-channel-enum-validation` · category: validation
- location: `apps/web/src/app/api/admin/notifications/route.ts:15-19`
- evidence:
```
const where: Record<string, unknown> = {};
const channel = sp.get('channel'); if (channel) where.channel = channel;
const eventType = sp.get('eventType'); if (eventType) where.eventType = eventType;
const sendStatus = sp.get('sendStatus'); if (sendStatus) where.sendStatus = sendStatus;
```
- impact: channel/sendStatus are enums (NotificationChannel, NotificationStatus). Random strings cause Prisma to throw with the cryptic 'Invalid value' error; users see 500. No filter for date range. page/pageSize from Number() can be NaN→falls back to 1/20 (OK) but no upper bound enforcement here (paginate caps at 500 — OK).
- proposed fix: z.object({ channel: z.nativeEnum(NotificationChannel).optional(), eventType: z.string().max(64).optional(), sendStatus: z.nativeEnum(NotificationStatus).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(20) }).parse(Object.fromEntries(sp)).