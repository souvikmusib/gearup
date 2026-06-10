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

Target file: `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts`

## Findings (2)

### [P2] PATCH allows ACTIVE→ACTIVE but no automatic EXPIRED detection
- id: `contract-status-no-expired-transition` · category: business-logic
- location: `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts:24-33`
- evidence:
```
const body = z.object({ status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']).optional(), notes: z.string().optional() }).parse(...);
const contract = await prisma.amcContract.update({ where: { id: params.id }, data: body as any });
```
- impact: Contracts past endDate stay status=ACTIVE forever; GET filter `status=ACTIVE` returns expired contracts. The POST (Use Service) does check `new Date() > contract.endDate`, but listings + UI badge mislead. No transition guards (CANCELLED→ACTIVE legal here).
- proposed fix: Add a daily cron / on-read derivation that sets EXPIRED when endDate<now. Validate transitions (e.g. CANCELLED is terminal).

### [P2] AMC contract DELETE wipes usage history without preserving for finance
- id: `amc-contract-delete-cascades-usage` · category: data-integrity
- location: `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts:36-44`
- evidence:
```
await prisma.$transaction(async (tx: any) => {
  await tx.amcServiceUsage.deleteMany({ where: { amcContractId: params.id } });
  await tx.amcContract.delete({ where: { id: params.id } });
});
```
- impact: Deletes paid-for contract + service-redemption history with one click + browser confirm(). Cannot reconstruct what services were honored under this contract for accounting/customer dispute.
- proposed fix: Soft-delete via status=CANCELLED + archivedAt; restrict hard-delete to contracts with zero usages and within 24h of creation; add logActivity with full snapshot.