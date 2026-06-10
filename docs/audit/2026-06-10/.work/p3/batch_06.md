Apply small P3 nit fixes to gearup. Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup.
- Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- PERMISSIONS at `packages/types/src/domain.ts` (`@gearup/types`).
- AppError signature: `(statusCode: number, message: string, code: string)`.
- logActivity params: `actorType, actorId, action, entityType, entityId, previousValue?, newValue?, tx?`.
  NEVER use `adminUserId` or `metadata` — use `actorId: user.sub` and `previousValue/newValue`.
- handleApiError from `@/lib/errors`.

Rules:
1. Read each file before editing.
2. Apply EVERY finding to its target file. P3s are quality nits — make them ALL.
3. Preserve unrelated code. No reformatting outside the fix.
4. Don't run build.

Return JSON: {"files_edited": [...], "applied_ids": [...], "skipped": [{"id":"","reason":""}], "notes":"..."}.


## Target: `apps/web/src/app/api/admin/customers/route.ts` (1 findings)

### [P3] Customer email validator pipes optional through email() — accepts non-canonical empty
- id: `customer-email-validator-quirk` · cat: validation
- loc: `apps/web/src/app/api/admin/customers/route.ts:12, /customers/[id]/route.ts:11`
- evidence:
```
email: z.string().optional().transform(v => v?.trim() || undefined).pipe(z.string().email().optional()),
```
- impact: `undefined` is allowed at both ends but `null` from client crashes (z.string() rejects null with 'Expected string, received null'). Edit page sends `email || ''`, which trims to '' → transform → undefined → fine, but the UX 'clear email' workflow is fragile.
- fix: Use `z.preprocess((v) => (typeof v === 'string' ? v.trim() || undefined : v ?? undefined), z.string().email().optional())`. Same fix for phoneNumber/postalCode if optional clearing wanted.

---

## Target: `apps/web/src/app/api/admin/expenses/[id]/route.ts` (1 findings)

### [P3] PATCH accepts fully empty body — bumps updatedAt + writes audit log
- id: `expense-patch-empty-body-noop` · cat: ux
- loc: `apps/web/src/app/api/admin/expenses/[id]/route.ts:20`
- evidence:
```
all fields optional; const expense = await prisma.expense.update({ where: { id: params.id }, data });
```
- impact: Spurious audit entries and updatedAt churn when modal saved without changes.
- fix: If Object.keys(data).length === 0 return 400 NO_CHANGES, or skip the update + log.

---

## Target: `apps/web/src/app/api/admin/expenses/route.ts` (1 findings)

### [P3] Expense list `where` typed Record<string, unknown> — loses Prisma type safety
- id: `expense-where-untyped` · cat: type-safety
- loc: `apps/web/src/app/api/admin/expenses/route.ts:19`
- evidence:
```
const where: Record<string, unknown> = {};
```
- impact: Same pattern across every report route. Typo silently filters nothing. ILIKE search has no trigram index.
- fix: Use Prisma.ExpenseWhereInput. Add pg_trgm GIN index if expense rows scale.

---

## Target: `apps/web/src/app/api/admin/inventory/**/route.ts` (1 findings)

### [P3] No rate limiting on inventory mutating endpoints
- id: `no-rate-limit-mutations` · cat: security
- loc: `apps/web/src/app/api/admin/inventory/**/route.ts`
- evidence:
```
All POST/PATCH/DELETE handlers call requirePermission() then proceed directly with no per-IP or per-user throttle.
```
- impact: Admin role is trusted, so risk is low, but a leaked token can rapidly drain or corrupt stock via the stock route in a loop.
- fix: Wrap mutating routes in a lightweight token-bucket (e.g. @upstash/ratelimit or in-memory per process) keyed by user.sub. Match whatever the rest of the app uses.

---

## Target: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts` (1 findings)

### [P3] Stock adjustment quantity.positive() prevents 0 but allows arbitrary decimal precision
- id: `stock-zero-allowed-via-decimal` · cat: validation
- loc: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts:9-13`
- evidence:
```
const schema = z.object({
  type: z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE']),
  quantity: z.number().positive(),
  reason: z.string().optional(),
});
```
- impact: Schema column is Decimal(12,2). A request with quantity=0.005 will be silently rounded by Postgres to 0.01 or 0.00. previousQuantity/newQuantity bookkeeping is off by rounding.
- fix: z.number().positive().multipleOf(0.01) or step at API boundary; consistent with the Decimal(12,2) storage.