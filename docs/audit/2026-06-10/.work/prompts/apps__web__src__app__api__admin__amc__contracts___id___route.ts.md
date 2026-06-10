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

Target file: `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts`

## Findings to fix in this file (3)

### 1. [P0 · BLOCKER] AMC Use Service has read-then-write race — services can go negative
- _id_: `amc-use-service-no-row-lock` · _category_: race-condition
- _location_: `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts:57-77`
- _evidence_:
```
const contract = await tx.amcContract.findUniqueOrThrow({ where: { id: params.id } });
if (contract.servicesRemaining <= 0) throw new ValidationError('No services remaining');
...
await tx.amcContract.update({ where: { id: params.id }, data: { servicesUsed: { increment: 1 }, servicesRemaining: { decrement: 1 } } });
```
- _impact_: Default Prisma tx isolation is READ COMMITTED. Two parallel POSTs read servicesRemaining=1, both pass guard, both decrement → servicesRemaining=-1 and an extra free service is granted. Same race lets an EXPIRED/CANCELLED contract be used if status flips mid-tx.
- _proposed fix_: Use conditional update with WHERE-guard: `updateMany({ where:{ id, status:'ACTIVE', servicesRemaining:{gt:0}, endDate:{gte: now} }, data:{ servicesUsed:{increment:1}, servicesRemaining:{decrement:1} } })` and assert count===1 before inserting usage. Or `SELECT ... FOR UPDATE` via $queryRaw, or set tx isolation to Serializable.
- _verifier said_: real=True, Confirmed at apps/web/src/app/api/admin/amc/contracts/[id]/route.ts:57-80. The POST handler reads the contract inside a default Prisma transaction (READ COMMITTED), checks servicesRemaining/status/endDate in JS, then issues an unconditional increment/decrement update. Two concurrent POSTs can both observe servicesRemaining=1 and both decrement to -1; same window allows a status flip mid-tx to be ignored. No unique constraint, row lock, or conditional WHERE guards this. Downgraded from P0 to P1 because the route requires AMC_CONTRACTS_MANAGE permission (staff-only), so exploitation requires an authenticated insider double-click / parallel request rather than a public attacker, but the data corruption (negative remaining count, granted free service) is genuine and the proposed updateMany-with-WHERE-guard fix is the right remediation.

### 2. [P1] AMC Use Service does not verify jobCard belongs to contract's vehicle/customer
- _id_: `amc-usage-no-ownership-check` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts:51-72`
- _evidence_:
```
const body = z.object({ jobCardId: z.string().min(1), ... }).parse(...);
...
const usage = await tx.amcServiceUsage.create({ data: { amcContractId: params.id, jobCardId: body.jobCardId, ... } });
```
- _impact_: Operator can record a service usage against an unrelated job card (different customer/vehicle), or paste a stale ID. Service quota is decremented for the wrong vehicle.
- _proposed fix_: Inside tx, `await tx.jobCard.findUniqueOrThrow({ where:{ id: body.jobCardId } })` and assert `jobCard.customerId === contract.customerId && jobCard.vehicleId === contract.vehicleId`. Also enforce uniqueness `@@unique([amcContractId, jobCardId])` so a single job card can't be used twice.

### 3. [P1] Same job card can be recorded multiple times against a contract
- _id_: `amc-usage-no-job-card-dedup` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts:64-77`
- _evidence_:
```
const usage = await tx.amcServiceUsage.create({ data: { amcContractId: params.id, jobCardId: body.jobCardId, serviceNumber: contract.servicesUsed + 1, ... } });
```
- _impact_: Operator clicks Submit twice (button doesn't disable double-submit on network slow), or two operators record same job card — duplicate decrement of servicesRemaining; quota drained spuriously.
- _proposed fix_: Add `@@unique([amcContractId, jobCardId])` to AmcServiceUsage; rely on P2002 in handler.