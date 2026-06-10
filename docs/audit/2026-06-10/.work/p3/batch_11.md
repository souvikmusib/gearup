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


## Target: `apps/web/src/lib/id-generators.ts` (1 findings)

### [P3] generateJobCardNumber/generateInvoiceNumber/generateAppointmentRef collisions not covered by retry
- id: `jobcard-id-generator-collision-risk` · cat: data-integrity
- loc: `apps/web/src/lib/id-generators.ts`
- evidence:
```
jobCardNumber: generateJobCardNumber()  // unique in schema
invoiceNumber: generateInvoiceNumber()  // unique
referenceId: generateAppointmentRef()   // unique
```
- impact: If the generators are time- or random-based and two requests collide, P2002 is mapped to 409 by handleApiError and the user sees 'A record with this jobCardNumber already exists' — confusing for an admin creating a job card. Worse, the auto-invoice in the same POST is created after the job card row exists, so a collision on invoiceNumber leaves an orphan job card with no invoice (compounds finding jobcard-create-no-transaction).
- fix: Audit id-generators.ts (out of scope but flag). At minimum, retry up to 3 times on P2002 for these synthetic ids inside the (to-be-added) transaction.

---

## Target: `apps/web/src/lib/prisma.ts` (1 findings)

### [P3] Prisma log levels include 'error' but no event listener is attached — errors only hit stdout
- id: `prisma-no-error-event-listener` · cat: observability
- loc: `apps/web/src/lib/prisma.ts:24-29`
- evidence:
```
new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'], ... })
```
- impact: Without `{ emit: 'event', level: 'error' }` + a Sentry forwarder, slow queries and connection errors are invisible in prod log streams.
- fix: Switch to event emitters and forward errors/slow-query warnings to Sentry once Sentry is actually initialized.

---

## Target: `apps/web/src/middleware.ts` (1 findings)

### [P3] OPTIONS preflight short-circuits before any auth, but it's fine — note for completeness
- id: `options-skips-rate-limit-and-auth` · cat: consistency
- loc: `apps/web/src/middleware.ts:30-32`
- evidence:
```
if (request.method === 'OPTIONS') {
  return new NextResponse(null, { status: 204, headers: response.headers });
}
```
- impact: Returns 204 with wildcard CORS headers for any path under /api. Combined with cors-wildcard-on-authed-api this is an amplifier — every endpoint advertises itself as cross-origin OK. Fixing CORS allowlist also fixes this.
- fix: Same as cors-wildcard fix — only echo allowed origins on OPTIONS.