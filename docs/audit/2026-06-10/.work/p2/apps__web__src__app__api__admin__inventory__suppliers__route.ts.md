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

Target file: `apps/web/src/app/api/admin/inventory/suppliers/route.ts`

## Findings (1)

### [P2] Supplier email and phone accept any string (no format validation)
- id: `supplier-email-no-format` · category: validation
- location: `apps/web/src/app/api/admin/inventory/suppliers/route.ts:20-23`
- evidence:
```
supplierName: z.string().min(1), phone: z.string().optional(), email: z.string().optional(),
address: z.string().optional(), contactPerson: z.string().optional(), notes: z.string().optional(),
```
- impact: Garbage emails ('abc') and phones get stored; later notification flows will fail at send-time. PATCH route has the same gap.
- proposed fix: Use z.string().email().optional() for email, z.string().regex(/^\+?\d[\d\s-]{7,15}$/) for phone (or share a phone validator from lib/validators).