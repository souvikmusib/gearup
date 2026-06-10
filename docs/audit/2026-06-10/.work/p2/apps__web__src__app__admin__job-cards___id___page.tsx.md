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

Target file: `apps/web/src/app/admin/job-cards/[id]/page.tsx`

## Findings (1)

### [P2] UI uses window.confirm for destructive delete; no in-app modal, no double-confirm of consequences
- id: `jobcard-detail-window-confirm` · category: ux
- location: `apps/web/src/app/admin/job-cards/[id]/page.tsx:241-243`
- evidence:
```
if (!confirm(msg)) return;
const res = await api.delete(`/admin/job-cards/${id}`);
if (res.success) router.push('/admin/job-cards');
```
- impact: window.confirm is blocked by some browsers, doesn't follow dark theme, and a fat-finger 'Enter' confirms it. For a destructive action that wipes invoices + payments, this is too thin.
- proposed fix: Use the existing Modal component with a typed-confirmation ('type DELETE to confirm') for any job card with payments > 0.