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


## Target: `apps/web/src/app/api/admin/job-cards/route.ts` (1 findings)

### [P3] Auto-created DRAFT invoice has no subtotal/grandTotal init — relies on Prisma defaults being 0
- id: `jobcard-invoice-create-decimal-defaults` · cat: data-integrity
- loc: `apps/web/src/app/api/admin/job-cards/route.ts:50-51`
- evidence:
```
const invData: any = { invoiceNumber: generateInvoiceNumber(), jobCard: { connect: { id: jc.id } }, customer: { connect: { id: body.customerId } }, vehicle: { connect: { id: body.vehicleId } }, createdBy: { connect: { id: user.sub } }, invoiceDate: new Date(), invoiceStatus: 'DRAFT', paymentStatus: 'UNPAID' };
await prisma.invoice.create({ data: invData });
```
- impact: Works today (schema defaults), but `as any` (the cast through invData: any) hides the next time someone adds a required field. Also no audit log entry for the implicit invoice creation, so the audit trail will show a job card created and an invoice appearing 'from nowhere'.
- fix: Type with Prisma.InvoiceCreateInput; emit a second logActivity for the invoice creation referencing actorId=user.sub and parent jobCardId.

---

## Target: `apps/web/src/app/api/admin/logs/route.ts` (1 findings)

### [P3] Logs filter `actorType` and `entityType` not enum-validated
- id: `logs-actorType-no-enum` · cat: validation
- loc: `apps/web/src/app/api/admin/logs/route.ts:16-17`
- evidence:
```
const entityType = sp.get('entityType'); if (entityType) where.entityType = entityType;
const actorType = sp.get('actorType'); if (actorType) where.actorType = actorType;
```
- impact: actorType is an enum (ActorType) — invalid value crashes Prisma with 500.
- fix: z.nativeEnum(ActorType).optional() for actorType; whitelist entityType against a known list to prevent fishing for arbitrary types.

---

## Target: `apps/web/src/app/api/admin/service-requests/[id]/route.ts` (1 findings)

### [P3] PATCH allows updating notes/urgency without status-change context or audit of previousValue
- id: `service-request-patch-allows-other-fields` · cat: observability
- loc: `apps/web/src/app/api/admin/service-requests/[id]/route.ts:20-25`
- evidence:
```
const body = z.object({ status: z.string().optional(), notes: z.string().optional(), urgency: z.string().optional() }).parse(await req.json());
const data: Record<string, unknown> = { ...body };
...
logActivity({ entityType: 'ServiceRequest', entityId: sr.id, action: 'service-request.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
```
- impact: Audit captures newValue only — cannot answer 'what was the urgency before?'. urgency has no enum constraint (free-text). notes has no length cap.
- fix: Fetch current state first, log previousValue. Add z.enum for urgency, z.string().max(2000) for notes.

---

## Target: `apps/web/src/app/api/admin/settings/admins/route.ts` (2 findings)

### [P3] Admin users list (GET /api/admin/settings/admins) has no pagination — returns ALL admins
- id: `admin-list-no-pagination` · cat: performance
- loc: `apps/web/src/app/api/admin/settings/admins/route.ts:12-28`
- evidence:
```
const [admins, roles] = await Promise.all([
  prisma.adminUser.findMany({ orderBy: { createdAt: 'desc' }, select: { ... roles: { select: { role: ... } } } }),
  prisma.role.findMany({ orderBy: { name: 'asc' }, select: { ... } }),
]);
```
- impact: For a single garage admin count is small (~5-20). Not a real go-live problem but UI also lacks search/filter and the route returns admin roles fully populated for every admin. Edit modal can only assign ONE role even though schema is many-to-many (AdminUserRole join).
- fix: Add a limit (e.g. 100). Extend edit UI to support multi-role with checkboxes; backend already runs deleteMany so the API can accept roleIds: string[].

### [P3] Admin list response includes email/phone for every admin — visible to any holder of ADMIN_USERS_MANAGE
- id: `admins-list-leaks-email-phone` · cat: security
- loc: `apps/web/src/app/api/admin/settings/admins/route.ts:13-25`
- evidence:
```
prisma.adminUser.findMany({
  orderBy: { createdAt: 'desc' },
  select: { id: true, adminUserId: true, fullName: true, email: true, phone: true, status: true, lastLoginAt: true, createdAt: true, roles: { ... } },
}),
```
- impact: Low risk inside admin scope, but combined with no rate limit and no 2FA enforcement, a compromised ADMIN_USERS_MANAGE token harvests staff PII used for phishing pivots.
- fix: Mask phone/email in list view (last 4 digits / domain); reveal on row click via a dedicated detail endpoint that logs access.

---

## Target: `apps/web/src/app/api/admin/settings/holidays/route.ts` (2 findings)

### [P3] Holidays DELETE doesn't validate `id` is a cuid and doesn't 404 distinctly when missing
- id: `holidays-delete-id-not-validated` · cat: validation
- loc: `apps/web/src/app/api/admin/settings/holidays/route.ts:30-37`
- evidence:
```
const id = req.nextUrl.searchParams.get('id');
if (!id) return NextResponse.json({ success: false, error: { message: 'id required' } }, { status: 400 });
await prisma.holiday.delete({ where: { id } });
```
- impact: Non-cuid 'id' triggers a Prisma error that handleApiError maps to P2025→404 (OK). The 400 path has no `code`, breaking the standard error envelope used elsewhere ({code,message,details}).
- fix: Use z.string().cuid() to parse id. Replace inline 400 with `throw new ValidationError('id required')` so the envelope is consistent.

### [P3] Holidays only support one-by-one creation — no bulk import for the year's public holidays
- id: `holidays-no-bulk-import` · cat: ux
- loc: `apps/web/src/app/api/admin/settings/holidays/route.ts:17-28`
- evidence:
```
export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const body = z.object({ holidayName: z.string().min(1), holidayDate: z.string(), holidayType: z.enum([...]), ... }).parse(await req.json());
    const holiday = await prisma.holiday.create({ data: { ...body, holidayDate: new Date(body.holidayDate) } });
    ...
  }
```
- impact: Quality-of-life only. Admin has to add 20+ public holidays one by one on go-live day.
- fix: Optional POST array body that createMany inside a transaction, deduped on (holidayDate, holidayType).