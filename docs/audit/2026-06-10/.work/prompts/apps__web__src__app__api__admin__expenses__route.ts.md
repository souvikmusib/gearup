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

Target file: `apps/web/src/app/api/admin/expenses/route.ts`

## Findings to fix in this file (3)

### 1. [P1] Expense POST/PATCH bypass PaymentMode enum via `as any`
- _id_: `expense-post-paymentmode-as-any` · _category_: type-safety
- _location_: `apps/web/src/app/api/admin/expenses/route.ts:38`
- _evidence_:
```
body: z.object({ ... paymentMode: z.string().optional() ... });
const expense = await prisma.expense.create({ data: { ...body, expenseDate: new Date(body.expenseDate), paymentMode: body.paymentMode as any, createdByAdminId: user.sub } as any });
```
- _impact_: Any arbitrary string is accepted for paymentMode. Prisma rejects at DB-runtime with a non-mapped error (translated to 500). Silent enum drift risk.
- _proposed fix_: Replace z.string() with z.nativeEnum(PaymentMode) on POST + PATCH. Drop the two `as any` casts.

### 2. [P1] Expense POST mass-assigns body via spread + outer `as any`
- _id_: `expense-mass-assignment-spread` · _category_: validation
- _location_: `apps/web/src/app/api/admin/expenses/route.ts:38`
- _evidence_:
```
const expense = await prisma.expense.create({ data: { ...body, ..., createdByAdminId: user.sub } as any });
```
- _impact_: Outer `as any` removes Prisma's compile-time guard. Any future addition to the Zod schema (e.g. `id`, `createdAt`) becomes silently writable. Mass-assignment regression risk.
- _proposed fix_: Destructure explicitly, drop the `as any`.

### 3. [P1] Amount accepted as JS number, stored in Decimal(12,2); no bounds
- _id_: `expense-amount-decimal-precision` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/expenses/route.ts:34`
- _evidence_:
```
amount: z.number(), ... schema: amount Decimal @db.Decimal(12, 2)
```
- _impact_: Binary-float imprecision for paise amounts; no min(0) guard — negative or absurdly large amounts can be saved.
- _proposed fix_: z.number().nonnegative().multipleOf(0.01).max(99999999.99), or accept a regex string and pass as Decimal.