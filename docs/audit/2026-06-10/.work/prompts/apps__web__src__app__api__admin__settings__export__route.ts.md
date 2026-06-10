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

Target file: `apps/web/src/app/api/admin/settings/export/route.ts`

## Findings to fix in this file (3)

### 1. [P0 · BLOCKER] Backup export streams ALL customer PII + payments + admin records in one unpaginated, unstreamed JSON blob
- _id_: `settings-export-pii-dump` · _category_: security
- _location_: `apps/web/src/app/api/admin/settings/export/route.ts:7-39`
- _evidence_:
```
requirePermission(PERMISSIONS.SETTINGS_MANAGE);
const [customers, vehicles, workers, serviceRequests, appointments, jobCards, invoices, payments, expenses, ...] = await Promise.all([
  prisma.customer.findMany(),
  prisma.vehicle.findMany(),
  ...
  prisma.payment.findMany(),
  ...
]);
```
- _impact_: (a) Exfiltration surface: one compromised SETTINGS_MANAGE token dumps every customer phone/email/address + every invoice + every payment record. (b) Server OOM: at 10k customers + invoices+lineItems the JSON.stringify of jobCards.include(tasks,parts,assignments) plus invoices.include(lineItems) plus payments can be hundreds of MB held entirely in RAM. (c) Will block the Node event loop for seconds. (d) No audit log entry for the export itself, no rate limit. (e) settings table may include integration tokens — exported in plaintext.
- _proposed fix_: Split into per-entity paginated CSV/JSON exports, stream responses (Response with ReadableStream), require a dedicated DATA_EXPORT permission distinct from SETTINGS_MANAGE, redact secrets from settings before serialising, logActivity({action:'data.exported'}) with row counts and actor, add rate-limit (1 per hour per admin), and stamp the file with a watermark.
- _verifier said_: real=True, Verified at apps/web/src/app/api/admin/settings/export/route.ts:7-39. The handler runs 13 parallel unbounded findMany() calls (including customers, payments, invoices+lineItems, jobCards+tasks/parts/assignments, and the raw settings table) then JSON.stringify's the entire result into memory with no streaming, no pagination, no rate limit, and no audit log. Auth is a single SETTINGS_MANAGE check with no dedicated export permission, and settings rows are emitted verbatim so any plaintext tokens/credentials stored there leak. All elements of the claim hold: exfiltration surface, OOM/event-loop risk at scale, and missing controls are all directly visible in the source.

### 2. [P1] Backup export gated only on SETTINGS_MANAGE — same permission a non-data-owner uses to toggle notification flags
- _id_: `settings-export-permission-too-broad` · _category_: auth
- _location_: `apps/web/src/app/api/admin/settings/export/route.ts:9`
- _evidence_:
```
requirePermission(PERMISSIONS.SETTINGS_MANAGE);
```
- _impact_: Anyone who can toggle settings can exfiltrate all customer data + payments + integration creds. Principle of least privilege violation.
- _proposed fix_: Introduce a dedicated DATA_EXPORT permission only assigned to OWNER role. Combine with rate limit + 2FA challenge.

### 3. [P1] Backup export does not call logActivity
- _id_: `settings-export-no-audit` · _category_: observability
- _location_: `apps/web/src/app/api/admin/settings/export/route.ts:7-39`
- _evidence_:
```
export async function GET() {
  try {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const [customers, vehicles, workers, serviceRequests, appointments, jobCards, invoices, payments, expenses, ...] = await Promise.all([...]);
    const backup = { exportedAt: ..., customers, ... };
    return new NextResponse(JSON.stringify(backup, null, 2), { headers: ... });
  } catch (e) { return handleApiError(e); }
}
```
- _impact_: Data exfiltration cannot be detected after-the-fact. Compliance requirement (DPDP Act in India for handling customer phone/email data) for tracking access.
- _proposed fix_: logActivity({ entityType: 'Backup', action: 'data.exported', newValue: { tables: [...], rowCounts: {...} }, actorType: 'ADMIN', actorId: user.sub, ipAddress, userAgent }) before returning.