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


## Target: `apps/web/src/app/api/health/route.ts` (1 findings)

### [P3] Health route swallows errors silently with empty catch (no logging)
- id: `health-route-leaks-stack-on-cold-start` · cat: observability
- loc: `apps/web/src/app/api/health/route.ts:8-10`
- evidence:
```
} catch {
  return NextResponse.json({ status: 'error', db: 'disconnected' }, { status: 503 });
}
```
- impact: DB-down events never reach Sentry/console. Hard to diagnose flapping. Not a security issue.
- fix: } catch (e) { console.error('health: db check failed', e); ... }

---

## Target: `apps/web/src/app/api/public/available-slots/route.ts` (1 findings)

### [P3] Holiday name is concatenated raw into a user-facing message field
- id: `holiday-message-html-injection` · cat: validation
- loc: `apps/web/src/app/api/public/available-slots/route.ts:17`
- evidence:
```
if (holidays.length) return NextResponse.json({ success: true, data: { date, slots: [], message: 'Closed – ' + holidays[0].holidayName } });
```
- impact: holidayName is admin-controlled but rendered client-side; if admin types HTML it would render via dangerouslySetInnerHTML somewhere — currently not used so low risk, but it's a XSS-via-stored-string surface.
- fix: Sanitize on the admin-side write, or always render as text (already does).

---

## Target: `apps/web/src/app/api/public/estimate/[token]/route.ts` (1 findings)

### [P3] Estimate comment is concatenated into customerVisibleNotes without sanitization
- id: `estimate-comment-no-html-escape` · cat: validation
- loc: `apps/web/src/app/api/public/estimate/[token]/route.ts:78-80`
- evidence:
```
const customerVisibleNotes = body.comment ? [jobCard.customerVisibleNotes, `Customer ${body.action} estimate: ${body.comment}`].filter(Boolean).join('\n\n') : jobCard.customerVisibleNotes;
```
- impact: If any admin UI later renders customerVisibleNotes as HTML (dangerouslySetInnerHTML), this becomes stored XSS. Currently the estimate page renders it as text via <p>, so low.
- fix: Strip control chars / clamp max length (already max(1000) in zod which is fine). Ensure all renderers treat it as text.

---

## Target: `apps/web/src/app/api/public/service-requests/route.ts` (3 findings)

### [P3] Transaction callback typed as any — loses Prisma type safety
- id: `prisma-tx-any-typing` · cat: type-safety
- loc: `apps/web/src/app/api/public/service-requests/route.ts:22, 22-43; available-slots/route.ts:22, 32`
- evidence:
```
const result = await prisma.$transaction(async (tx: any) => { ... });
...
rules.flatMap((rule: any) => { ... });
blocked.some((b: any) => ...);
```
- impact: Removes IDE/compile-time guarantees that the model fields are correct; refactors to schema silently miss these spots.
- fix: Drop `: any` — Prisma infers the tx client type. Use Prisma.AppointmentSlotRuleGetPayload etc. for the array elements.

### [P3] Service-request trusts client-supplied vehicleId before falling back to lookup
- id: `vehicle-id-trust-from-client` · cat: validation
- loc: `apps/web/src/app/api/public/service-requests/route.ts:30-34`
- evidence:
```
let vehicle = body.vehicleId ? await tx.vehicle.findFirst({ where: { id: body.vehicleId, customerId: customer.id } }) : null;
```
- impact: The customerId scoping prevents cross-tenant IDOR, BUT note this happens AFTER the customer.update path which can have switched the 'customer' record to someone else (see customer-overwrite finding). The vehicleId path is therefore safe iff customer identity is correctly resolved — which it isn't if phone collides.
- fix: Once customer-overwrite is fixed, this is moot. Otherwise reject client-supplied vehicleId on public routes entirely and always re-derive from registrationNumber.

### [P3] Slot duration silently falls back to 30 min if no rule for that day
- id: `slot-duration-fallback` · cat: business-logic
- loc: `apps/web/src/app/api/public/service-requests/route.ts:40-42`
- evidence:
```
const slotRule = await tx.appointmentSlotRule.findFirst({ where: { dayOfWeek: preferredDate.getUTCDay(), isActive: true } });
const duration = (slotRule?.slotDurationMinutes ?? 30) * 60_000;
```
- impact: If the workshop has no active rule for that weekday (e.g. Sunday closed), the appointment is still created with a 30-min slot on a closed day. Also dayOfWeek is computed in UTC while admin probably entered IST.
- fix: If no rule exists or it's a holiday, refuse the booking with 422 — don't fabricate a slot. Compute dayOfWeek in the workshop's timezone (constants.ts likely has TIMEZONE; use date-fns-tz).

---

## Target: `apps/web/src/app/api/public/track/route.ts` (1 findings)

### [P3] POST /public/track returns one of two shapes; client uses 'as any' branch
- id: `track-success-data-shape-inconsistent` · cat: consistency
- loc: `apps/web/src/app/api/public/track/route.ts:102, 111 + apps/web/src/app/(public)/track/page.tsx:28`
- evidence:
```
return NextResponse.json({ success: true, data: { lookupType: 'vehicle', requests: ... } });
...
return NextResponse.json({ success: true, data: { lookupType: 'reference', request: ... } });
```
- impact: Polymorphic API forces the client into runtime discriminated-union handling; easy to forget a case. Already type-tagged via lookupType which mitigates.
- fix: Either always return `{ requests: Request[] }` (single-element for reference mode) or split into two routes /track/by-ref and /track/by-vehicle.