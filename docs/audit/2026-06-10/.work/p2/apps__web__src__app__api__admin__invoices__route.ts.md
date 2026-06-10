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

Target file: `apps/web/src/app/api/admin/invoices/route.ts`

## Findings (3)

### [P2] Pagination has no max pageSize — clients can request unbounded reads
- id: `pagination-no-max-cap` · category: performance
- location: `apps/web/src/app/api/admin/invoices/route.ts:38 + apps/web/src/app/api/admin/payments/route.ts:13`
- evidence:
```
const pageSize = Number(sp.get('pageSize')) || 20;
const p = paginate({ page, pageSize });
```
- impact: Unless `paginate()` clamps the value (not verified in this audit — see lib/pagination), an admin could request `pageSize=1000000` and OOM the server while pulling every invoice + customer + vehicle join. Same for payments. Also `Number(...) || 20` accepts negative and NaN inputs without validation.
- proposed fix: In lib/pagination clamp pageSize between 1 and 100. Validate with Zod: `z.coerce.number().int().min(1).max(100).default(20)`.

### [P2] `tx: any` and `as any` litter the invoice transactions — loses Prisma type safety
- id: `as-any-tx` · category: type-safety
- location: `apps/web/src/app/api/admin/invoices/route.ts:68,78,90 + payments/route.ts:22,45,55`
- evidence:
```
invoice = await prisma.$transaction(async (tx: any) => {
  ...
  const mode = (li as any).discountMode || 'flat';
  ...
  data: { ... lineItems: { create: lines } } as any,
});
// payments
await prisma.$transaction(async (tx: any) => { ...
  data: { ... paymentMode: body.paymentMode as any, ...
```
- impact: `any` on tx hides real type errors when the schema changes (e.g. renaming a field silently compiles). `paymentMode as any` skips the PaymentMode enum check — an invalid mode string passes Zod (`z.string()`) and then Prisma errors at runtime as a P2003-ish 500 instead of a clean 400.
- proposed fix: Type tx as `Prisma.TransactionClient`. Replace `paymentMode: z.string()` with `paymentMode: z.nativeEnum(PaymentMode)` (or the enum from @gearup/types). Remove `as any` casts.

### [P2] Invoice create line-item schema allows negative quantities and prices, missing description min
- id: `line-item-input-validation-thin` · category: validation
- location: `apps/web/src/app/api/admin/invoices/route.ts:11-17`
- evidence:
```
const lineItemSchema = z.object({
  lineType: z.enum([...]),
  referenceItemId: z.string().optional(), description: z.string(),
  quantity: z.number().default(1), unitPrice: z.number().default(0),
  taxRate: z.number().default(0), sortOrder: z.number().default(0),
  discountMode: z.enum(['flat', 'percent']).optional(),
});
```
- impact: `description: z.string()` accepts empty string. `quantity` and `unitPrice` accept negative numbers and NaN (z.number() rejects NaN actually, but accepts -1e10). A negative quantity on a non-DISCOUNT line silently becomes a negative lineTotal, producing free invoices. taxRate has no 0..100 bound. The add-line endpoint correctly bounds discountPercent 0..100 but not taxRate.
- proposed fix: `description: z.string().trim().min(1)`, `quantity: z.number().positive()` (or `nonnegative()` for adjustments), `unitPrice: z.number().nonnegative()`, `taxRate: z.number().min(0).max(100)`. Apply consistently across both POST routes.