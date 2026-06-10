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

Target file: `apps/web/src/lib/id-generators.ts`

## Findings (2)

### [P2] 8-char alphanumeric reference IDs are guessable for an enumeration attacker
- id: `reference-id-entropy` · category: security
- location: `apps/web/src/lib/id-generators.ts:4-6`
- evidence:
```
const alphanumeric = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
export const generateReferenceId = () => `${REFERENCE_ID_PREFIX}-${alphanumeric()}`;
```
- impact: 36^8 ≈ 2.8e12 — not directly brute-forceable, but combined with the track endpoint requiring (referenceId, phoneNumber), a targeted attacker with a phone number only needs ~10^12 attempts. The bigger issue is collisions: 8 chars + nanoid without DB unique enforcement at the application logic level only relies on the @unique constraint catching collisions at insert (which would 500 the user). Acceptable but tighten.
- proposed fix: Bump to 12 chars (36^12 ≈ 4.7e18). Same for jobCardNumber and invoiceNumber.

### [P2] generateInvoiceNumber/JobCardNumber have no retry on unique-constraint collision
- id: `id-generators-no-collision-retry` · category: error-handling
- location: `apps/web/src/lib/id-generators.ts:6-10`
- evidence:
```
export const generateInvoiceNumber = () => `${INVOICE_PREFIX}-${alphanumeric()}`;  // caller does prisma.invoice.create; if duplicate, P2002 propagates to handleApiError → 409 to user
```
- impact: Although unlikely at small scale, a real collision (or even a backfill that includes existing IDs) returns 409 to the user trying to create an invoice. Should self-heal with a retry.
- proposed fix: Wrap create in a 3-attempt retry loop that regenerates the ID on P2002 for the *invoiceNumber* target only.