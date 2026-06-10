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

Target file: `apps/web/src/app/(public)/book-service/page.tsx`

## Findings (1)

### [P2] book-service form has no client-side dedupe; submit() not idempotent
- id: `double-click-double-booking` · category: ux
- location: `apps/web/src/app/(public)/book-service/page.tsx:123-136`
- evidence:
```
const submit = async (e: React.FormEvent) => { e.preventDefault(); ... setLoading(true); const res = await api.post(...); setLoading(false); ... }
```
- impact: Disabling the button via loading mostly helps but the button isn't disabled until after the validate sync block; rapid double-click can fire two POSTs (and the server has no idempotency-key). Result: two ServiceRequests, two referenceIds. Same problem in the estimate page handleAction (estimate POST is idempotent server-side via updateMany where approvalStatus:'PENDING' though — that one is OK).
- proposed fix: Move setLoading(true) before validate, or gate with a useRef boolean. Accept an Idempotency-Key header on POST /public/service-requests and dedupe in Redis for 60s.