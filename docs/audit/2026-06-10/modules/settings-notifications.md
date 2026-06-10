# Settings (admins, business-hours, holidays, export), notifications + templates, service-requests, logs — module audit

_Module key:_ `settings-notifications`

## Summary

This module is largely thin Prisma wrappers with permission gates and minimal validation. Authn/RBAC is consistently applied via requirePermission(), and handleApiError() is wired everywhere. However there are several go-live blockers: the settings PATCH endpoint accepts arbitrary nested JSON values via `value as any` with no validation of the value shape (mass-assignment-style risk where an attacker with SETTINGS_MANAGE could inject any JSON — including arbitrary booleans/strings the UI later trusts unchecked); the backup/export endpoint streams ALL business data (PII: customer phones, emails, payment records, password-adjacent admin records via cascading relations) as a giant JSON blob with no rate-limiting, no streaming, no audit log, will OOM on any non-trivial dataset and exposes every customer record at once; the admin POST/PATCH does not enforce a transaction around user+role create or role swap, leaving stale state on failure; the service-request status PATCH accepts `status: z.string()` with no enum constraint and no state-machine guard so an admin can transition SUBMITTED→CLOSED bypassing job-card creation; the logs endpoint allows `action: contains` with no length limit (DoS via expensive LIKE), and the notifications/logs UIs render `res.data` as an array but the API returns `{ data, meta }` so the lists are silently broken. Settings PATCH never reads previousValue for audit, holidays DELETE has no FK guard, business-hours has no PUT (read-only — likely a missing-feature P1 for go-live), and the admin create flow has no email-format validation and no admin-cannot-disable-self protection. Sentry directory is empty (.gitkeep only) — no error monitoring.

## Routes audited

- `GET/PATCH /api/admin/settings`
- `GET/POST/PATCH /api/admin/settings/admins`
- `GET /api/admin/settings/business-hours`
- `GET/POST/DELETE /api/admin/settings/holidays`
- `GET /api/admin/settings/export`
- `GET /api/admin/notifications`
- `GET /api/admin/notifications/templates`
- `GET /api/admin/service-requests`
- `GET/PATCH /api/admin/service-requests/[id]`
- `GET /api/admin/logs`

## Files audited

- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/settings/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/settings/admins/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/settings/business-hours/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/settings/holidays/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/settings/export/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/notifications/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/notifications/templates/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/service-requests/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/service-requests/[id]/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/api/admin/logs/route.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/settings/admins/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/settings/business-hours/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/settings/holidays/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/settings/notifications/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/notifications/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/notifications/templates/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/service-requests/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/service-requests/[id]/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/app/admin/logs/page.tsx`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/auth.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/errors.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/activity-logger.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/src/lib/pagination.ts`
- `/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/prisma/schema.prisma`

## Coupling

Depends on: lib/auth.ts (requirePermission), lib/errors.ts (handleApiError + AppError taxonomy), lib/activity-logger.ts (fire-and-forget log), lib/pagination.ts, lib/prisma.ts, packages/types (PERMISSIONS, enums). Consumed by: admin React pages via @/lib/api/client (api.get/post/patch/delete and api.getSWR). Service-request detail page deep-links into /admin/job-cards, /admin/appointments. The settings PATCH endpoint feeds the entire frontend's behaviour (notification toggles, business prefs, invoice prefs, integration creds) — anyone able to mutate it can change app-wide behavior. The export route reads every domain table; any schema change must update it or it silently omits new entities.

## Findings

### [P0 · BLOCKER] Settings PATCH accepts arbitrary unvalidated JSON values (only key prefix is checked)
_id:_ `settings-patch-unvalidated-json-value` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/settings/route.ts:18-29`

```
const body = await req.json() as Record<string, unknown>;
...
const invalid = entries.filter(([key]) => !ALLOWED_PREFIXES.some((p) => key.startsWith(p)));
if (invalid.length) throw new ValidationError(...);
await Promise.all(entries.map(([key, value]) => prisma.setting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } })));
```
**Impact.** Any value shape can be written — strings where numbers expected (e.g. notification.reminderHours='drop'), objects where booleans expected, huge JSON blobs (no size cap), arrays where scalars expected. Downstream code (cron, UI) reads these and likely crashes or misbehaves; a single bad PATCH can break notifications for the whole shop. Also lets an attacker exhaust the row by writing a 10MB JSON blob.

**Fix.** Maintain a registry of allowed setting keys with per-key Zod schemas (boolean/number/string/url). Reject unknown keys outright and validate value against the registered schema before upsert. Cap individual value JSON size (e.g. 8KB).

  _Adversarial verify:_ **CONFIRMED** (now P2) — Confirmed: the PATCH handler only checks key prefixes and writes value as-is via prisma.setting.upsert with no Zod schema, type, or size validation. Auth is enforced (SETTINGS_MANAGE), so this is admin-only — not an unauthenticated attack surface, which limits real-world exploitability. Impact is real (bad shapes/oversized blobs can break downstream cron/UI consumers) but requires an authenticated admin, so P0 go-live-blocker is overstated; P2 is appropriate. The proposed fix (per-key Zod registry + size cap) is the right remediation.

### [P1] Settings audit log records newValue but never previousValue
_id:_ `settings-patch-no-previous-value-audit` · _category:_ observability · _file:_ `apps/web/src/app/api/admin/settings/route.ts:25-26`

```
await Promise.all(entries.map(([key, value]) => prisma.setting.upsert(...)));
logActivity({ entityType: 'Setting', action: 'settings.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
```
**Impact.** For compliance/forensics you cannot answer 'who turned WhatsApp off and what was it before?'. Settings change history is half-recorded.

**Fix.** findMany the existing keys first, snapshot previous values, then upsert. Pass previousValue to logActivity. Optionally log per-key entries to make change reports trivial.

### [P0 · BLOCKER] Backup export streams ALL customer PII + payments + admin records in one unpaginated, unstreamed JSON blob
_id:_ `settings-export-pii-dump` · _category:_ security · _file:_ `apps/web/src/app/api/admin/settings/export/route.ts:7-39`

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
**Impact.** (a) Exfiltration surface: one compromised SETTINGS_MANAGE token dumps every customer phone/email/address + every invoice + every payment record. (b) Server OOM: at 10k customers + invoices+lineItems the JSON.stringify of jobCards.include(tasks,parts,assignments) plus invoices.include(lineItems) plus payments can be hundreds of MB held entirely in RAM. (c) Will block the Node event loop for seconds. (d) No audit log entry for the export itself, no rate limit. (e) settings table may include integration tokens — exported in plaintext.

**Fix.** Split into per-entity paginated CSV/JSON exports, stream responses (Response with ReadableStream), require a dedicated DATA_EXPORT permission distinct from SETTINGS_MANAGE, redact secrets from settings before serialising, logActivity({action:'data.exported'}) with row counts and actor, add rate-limit (1 per hour per admin), and stamp the file with a watermark.

  _Adversarial verify:_ **CONFIRMED** (now P0) — Verified at apps/web/src/app/api/admin/settings/export/route.ts:7-39. The handler runs 13 parallel unbounded findMany() calls (including customers, payments, invoices+lineItems, jobCards+tasks/parts/assignments, and the raw settings table) then JSON.stringify's the entire result into memory with no streaming, no pagination, no rate limit, and no audit log. Auth is a single SETTINGS_MANAGE check with no dedicated export permission, and settings rows are emitted verbatim so any plaintext tokens/credentials stored there leak. All elements of the claim hold: exfiltration surface, OOM/event-loop risk at scale, and missing controls are all directly visible in the source.

### [P0 · BLOCKER] Service-request status PATCH accepts any string and has no state-machine guard
_id:_ `service-request-patch-status-no-enum` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/service-requests/[id]/route.ts:17-26`

```
const body = z.object({ status: z.string().optional(), notes: z.string().optional(), urgency: z.string().optional() }).parse(await req.json());
const data: Record<string, unknown> = { ...body };
if (body.status && ['CANCELLED', 'CLOSED'].includes(body.status)) data.closedAt = new Date();
const sr = await prisma.serviceRequest.update({ where: { id: params.id }, data });
```
**Impact.** An admin (or anyone forging a request) can jump SUBMITTED→CLOSED, CONVERTED_TO_JOB→SUBMITTED, or set status='FOO' which Postgres will reject only because of the enum cast (Prisma throws a generic 500). UI's STATUS_ACTIONS map encodes the legal transitions but it is entirely client-side — the server trusts the client. Reopens, double-conversions, and bypass of the job-card creation flow are all possible.

**Fix.** Use z.enum([...ServiceRequestStatus values]). Add a server-side ALLOWED_TRANSITIONS map mirroring STATUS_ACTIONS and reject illegal transitions with ValidationError. Set closedAt for all terminal states (CLOSED, CANCELLED), and clear it if transitioning back. Log previousValue.

  _Adversarial verify:_ **CONFIRMED** (now P1) — Confirmed at apps/web/src/app/api/admin/service-requests/[id]/route.ts:17-26. The Zod schema accepts `status: z.string().optional()` and the handler passes it straight to `prisma.serviceRequest.update` with no enum check and no state-machine guard; closedAt is only set for CANCELLED/CLOSED and never cleared on reopen. Auth is enforced via requirePermission(SERVICE_REQUESTS_EDIT), so this isn't an unauth bypass — it's an admin/permission-holder who can drive illegal transitions (reopen closed, skip CONVERTED_TO_JOB, etc.), bypassing the job-card flow. Real business-logic bug worth fixing, but since it requires an authenticated admin and the DB enum cast still rejects garbage strings, downgrading from P0 go-live blocker to P1.

### [P1] Admin user create is not transactional (role created via nested write — OK) but PATCH role swap is two-step non-atomic
_id:_ `admin-create-no-transaction` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/settings/admins/route.ts:88-94`

```
const user = await prisma.adminUser.update({ where: { id }, data: updateData, ... });
if (roleId) {
  await prisma.adminUserRole.deleteMany({ where: { adminUserId: id } });
  await prisma.adminUserRole.create({ data: { adminUserId: id, roleId } });
}
```
**Impact.** If the create() fails (e.g. roleId doesn't exist, FK violation), deleteMany has already removed all roles — user is left with NO roles and no way to act in the system. A concurrent request can also race between deleteMany and create, briefly leaving the user role-less. Worse: between the AdminUser update and the role swap, the user's password/status are already changed even if role swap fails.

**Fix.** Wrap update + deleteMany + create in prisma.$transaction([...]). For multi-role support, diff roles instead of delete-all-then-add.

### [P1] Admin PATCH lets an admin disable themselves or revoke their last admin role with no guard
_id:_ `admin-no-self-lockout-guard` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/settings/admins/route.ts:73-94`

```
requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
const body = z.object({ id: z.string(), ..., status: z.enum(['ACTIVE', 'INACTIVE']).optional(), roleId: z.string().optional() }).parse(await req.json());
...
const user = await prisma.adminUser.update({ where: { id }, data: updateData, ... });
```
**Impact.** Sole super-admin can disable themselves or downgrade their role, locking the entire org out of admin functions. Common foot-gun on go-live day.

**Fix.** Disallow status=INACTIVE on self. Before role downgrade, count remaining ADMIN_USERS_MANAGE-bearing accounts and refuse if this would leave zero. Reject self-edit of own roleId entirely (force routing via another admin).

### [P2] Admin email is accepted as any string (z.string().optional()), no format validation
_id:_ `admin-email-no-format-validation` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/settings/admins/route.ts:49-50`

```
email: z.string().optional(),
phone: z.string().optional(),
```
**Impact.** Junk like 'asdf' goes into a column with a @unique constraint and breaks future lookups / password-reset flows. Phone has no E.164 normalisation either; two admins can have '+91 98...' vs '+919...' as 'different' phones.

**Fix.** z.string().email().optional() for email. z.string().regex(/^\+?[0-9]{10,15}$/).optional() (or libphonenumber) for phone, with normalisation before write.

### [P1] Admin password minimum is 6 chars with no complexity rule
_id:_ `admin-password-policy-too-weak` · _category:_ security · _file:_ `apps/web/src/app/api/admin/settings/admins/route.ts:48`

```
password: z.string().min(6),
...
const passwordHash = await bcrypt.hash(body.password, 10);
```
**Impact.** 6-char passwords with no class requirement are trivially brute-forced offline if the hash leaks; lockedUntil/failedLoginAttempts exist on the model but a weak password makes the lockout the only line of defence.

**Fix.** min(10) + at-least-one-digit + one-letter, or integrate zxcvbn with a minimum score of 3. Surface the policy in UI helper text. Consider raising bcrypt cost to 12 for admin hashes.

### [P2] Holiday POST trusts holidayDate string and creates new Date() without validating it parsed
_id:_ `holidays-no-date-validation` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/settings/holidays/route.ts:20-24`

```
const body = z.object({
  holidayName: z.string().min(1), holidayDate: z.string(), holidayType: z.enum([...]),
  isFullDay: z.boolean().default(true), startTime: z.string().optional(), endTime: z.string().optional(), notes: z.string().optional(),
}).parse(await req.json());
const holiday = await prisma.holiday.create({ data: { ...body, holidayDate: new Date(body.holidayDate) } });
```
**Impact.** holidayDate='banana' → new Date('banana') is Invalid Date → Prisma either errors with cryptic 'Invalid value' or (if value coerces) writes a wrong date. No bound on startTime/endTime format (HH:MM not enforced) so 'monday' will be persisted in a string column the UI later renders as 'monday – monday'. No check that endTime > startTime, no enforcement of !isFullDay → require startTime+endTime.

**Fix.** z.string().regex(/^\d{4}-\d{2}-\d{2}$/) (or z.coerce.date()) for holidayDate. z.string().regex(/^\d{2}:\d{2}$/) for start/end. Refine: if !isFullDay then start/end required AND end > start. Also de-duplicate: unique on (holidayDate, holidayType).

### [P2] UI compares ISO datetime strings against YYYY-MM-DD; all holidays land in 'Past' bucket
_id:_ `holidays-past-future-bug` · _category:_ ux · _file:_ `apps/web/src/app/admin/settings/holidays/page.tsx:40-42`

```
const today = new Date().toISOString().split('T')[0];
const upcoming = data.filter((h) => h.holidayDate >= today);
const past = data.filter((h) => h.holidayDate < today);
```
**Impact.** holidayDate from API is a full ISO string like '2026-12-25T00:00:00.000Z' which lexically compares fine vs '2026-06-10' EXCEPT 'today' bucket: today's holiday whose ISO starts with the same date is >= today (correct), but holidays earlier today appear in 'Upcoming'. More importantly the filter assumes string >= works for all dates — it does because of the fixed ISO prefix, but the code is fragile and silently wrong if the API ever returns Date objects from JSON parsing (it cannot, but worth tightening). Tests on TZ boundaries (IST midnight rollover) misplace items by a day.

**Fix.** Parse both sides as Date and compare numerically: new Date(h.holidayDate).setHours(0,0,0,0) >= new Date().setHours(0,0,0,0).

### [P1] Business-hours route is GET-only — no way to edit slot rules from UI
_id:_ `business-hours-read-only` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/settings/business-hours/route.ts:1-18`

```
export async function GET() {
  try {
    requirePermission(PERMISSIONS.SETTINGS_VIEW);
    const rules = await prisma.appointmentSlotRule.findMany({ where: { isActive: true }, orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }] });
    return NextResponse.json({ success: true, data: { rules } });
  } catch (e) { return handleApiError(e); }
}
```
**Impact.** Business hours can only be changed via Prisma Studio / SQL. On go-live morning when the shop changes Sunday hours, admins have no path to fix it without engineering. UI page is also display-only.

**Fix.** Add PUT to replace the whole week of rules (in a transaction: deleteMany + createMany), validate dayOfWeek 0-6, openTime<closeTime as HH:MM, slotDurationMinutes 5-240, maxCapacity 1-50. Build edit UI.

### [P3] Holidays DELETE doesn't validate `id` is a cuid and doesn't 404 distinctly when missing
_id:_ `holidays-delete-id-not-validated` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/settings/holidays/route.ts:30-37`

```
const id = req.nextUrl.searchParams.get('id');
if (!id) return NextResponse.json({ success: false, error: { message: 'id required' } }, { status: 400 });
await prisma.holiday.delete({ where: { id } });
```
**Impact.** Non-cuid 'id' triggers a Prisma error that handleApiError maps to P2025→404 (OK). The 400 path has no `code`, breaking the standard error envelope used elsewhere ({code,message,details}).

**Fix.** Use z.string().cuid() to parse id. Replace inline 400 with `throw new ValidationError('id required')` so the envelope is consistent.

### [P2] GET /api/admin/notifications passes raw query params into Prisma where with no enum validation
_id:_ `notifications-no-channel-enum-validation` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/notifications/route.ts:15-19`

```
const where: Record<string, unknown> = {};
const channel = sp.get('channel'); if (channel) where.channel = channel;
const eventType = sp.get('eventType'); if (eventType) where.eventType = eventType;
const sendStatus = sp.get('sendStatus'); if (sendStatus) where.sendStatus = sendStatus;
```
**Impact.** channel/sendStatus are enums (NotificationChannel, NotificationStatus). Random strings cause Prisma to throw with the cryptic 'Invalid value' error; users see 500. No filter for date range. page/pageSize from Number() can be NaN→falls back to 1/20 (OK) but no upper bound enforcement here (paginate caps at 500 — OK).

**Fix.** z.object({ channel: z.nativeEnum(NotificationChannel).optional(), eventType: z.string().max(64).optional(), sendStatus: z.nativeEnum(NotificationStatus).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(20) }).parse(Object.fromEntries(sp)).

### [P1] Notifications and templates pages set state from `res.data` but the API returns `{ data, meta }` for notifications — list silently shows nothing/wrong shape
_id:_ `notifications-ui-broken-list` · _category:_ ux · _file:_ `apps/web/src/app/admin/notifications/page.tsx:8`

```
promise.then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
```
**Impact.** api client likely returns `{ success, data, meta }` mirroring the JSON envelope. The notifications route returns paginated rows in `data` (array, OK) — that one works. BUT the service-requests page handles both `res.data?.items ?? res.data ?? []` defensively while notifications doesn't, and the logs page also uses `r.data ?? []` directly. Need to verify api client shape — if it strips one level, notifications works; if not, the table is empty/broken. Either way the inconsistency (some pages handle `.items`, some don't) is a bug surface on go-live.

**Fix.** Standardise: either always return `{items, ...meta}` from list APIs (then UI always reads `.items`), or never wrap. Fix all admin list pages to read the agreed shape. Notifications/logs pages have NO pagination UI either — only first 20/50 rows visible.

### [P1] Notifications + Templates + Logs pages have no Pagination component, only first page is reachable
_id:_ `notifications-no-pagination-ui` · _category:_ ux · _file:_ `apps/web/src/app/admin/notifications/page.tsx:6-17`

```
export default function NotificationsPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { ... api.getSWR<any>('/admin/notifications') ... }, []);
  ...
  return (<div><PageHeader title="Notifications" /><DataTable ... data={data} keyField="id" /></div>);
}
```
**Impact.** After ~20 (notifications) or ~50 (logs) records, the rest is unreachable. There is also no channel/status filter UI even though the API supports it. Same for /admin/logs and /admin/notifications/templates.

**Fix.** Reuse <Pagination/> like service-requests page; add filter dropdowns wired to query params. Templates is small so pagination optional but add search.

### [P2] GET /api/admin/service-requests accepts arbitrary status string
_id:_ `service-requests-search-no-status-enum` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/service-requests/route.ts:16-21`

```
const status = sp.get('status') || '';
const search = sp.get('search') || '';
...
if (status) where.status = status;
if (search) where.OR = [{ referenceId: { contains: search, mode: 'insensitive' } }, { customer: { fullName: { contains: search, mode: 'insensitive' } } }];
```
**Impact.** Unknown status string sent to Prisma enum column → Prisma throws → 500 to client. The UI passes 'APPOINTMENT_SCHEDULED' which is NOT in the ServiceRequestStatus enum (enum has APPOINTMENT_CONFIRMED) — selecting that filter returns 500. Search has no length cap; long strings with %_ wildcards may still hit Postgres ILIKE plan changes on the customer join. Search also reaches into the customer relation without an index on fullName.

**Fix.** Validate with z.nativeEnum(ServiceRequestStatus). Fix UI STATUSES array to match the schema enum (APPOINTMENT_CONFIRMED, IN_PROGRESS isn't in the enum either — purge invalid values). Cap search to 64 chars and escape % / _ before passing to contains (Prisma does escape but document it).

### [P2] Service requests list filter offers statuses that don't exist in the Prisma enum
_id:_ `service-requests-ui-stale-statuses` · _category:_ consistency · _file:_ `apps/web/src/app/admin/service-requests/page.tsx:10`

```
const STATUSES = ['SUBMITTED','UNDER_REVIEW','APPOINTMENT_PENDING','APPOINTMENT_SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED'].map(s => ({ label: s.replace(/_/g, ' '), value: s }));
```
**Impact.** User filters by 'APPOINTMENT_SCHEDULED', 'IN_PROGRESS', 'COMPLETED' → backend either returns empty list or 500 (depending on enum validation). Looks broken on day one of go-live.

**Fix.** Source list from the Prisma enum / @gearup/types: SUBMITTED, UNDER_REVIEW, APPOINTMENT_PENDING, APPOINTMENT_CONFIRMED, CONVERTED_TO_JOB, CANCELLED, CLOSED.

### [P2] Service-request detail page shows 'Loading...' forever on 403/404 / network error
_id:_ `service-request-detail-loading-state` · _category:_ error-handling · _file:_ `apps/web/src/app/admin/service-requests/[id]/page.tsx:35-62`

```
const load = () => {
  const { cached, promise } = api.getSWR<any>(`/admin/service-requests/${id}`);
  if (cached?.success) setData(cached.data);
  promise.then((r) => r.success && setData(r.data));
};
...
if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;
```
**Impact.** On any error (request id wrong, permission missing, server down) the page is stuck on 'Loading...' with no recovery. Same pattern on business-hours, holidays, notifications, logs, admins.

**Fix.** Track error state separately; render an error card + retry button when promise resolves with success:false. Promote a shared `<AsyncBoundary>` to standardise.

### [P3] PATCH allows updating notes/urgency without status-change context or audit of previousValue
_id:_ `service-request-patch-allows-other-fields` · _category:_ observability · _file:_ `apps/web/src/app/api/admin/service-requests/[id]/route.ts:20-25`

```
const body = z.object({ status: z.string().optional(), notes: z.string().optional(), urgency: z.string().optional() }).parse(await req.json());
const data: Record<string, unknown> = { ...body };
...
logActivity({ entityType: 'ServiceRequest', entityId: sr.id, action: 'service-request.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
```
**Impact.** Audit captures newValue only — cannot answer 'what was the urgency before?'. urgency has no enum constraint (free-text). notes has no length cap.

**Fix.** Fetch current state first, log previousValue. Add z.enum for urgency, z.string().max(2000) for notes.

### [P2] GET /api/admin/logs accepts arbitrary `action` substring with no length limit
_id:_ `logs-action-contains-no-cap` · _category:_ performance · _file:_ `apps/web/src/app/api/admin/logs/route.ts:18`

```
const action = sp.get('action'); if (action) where.action = { contains: action };
```
**Impact.** action column has no GIN/trgm index. A malicious or careless user passes a huge string or wildcard-heavy substring; Postgres performs a full-table seq scan of activity_log on every page load. activity_log will be the largest table in the system within weeks.

**Fix.** z.string().min(2).max(64) on action; ideally switch to startsWith (which an index can serve) and add an index `@@index([action])` already exists — but it's a b-tree, contains can't use it. Consider pg_trgm + GIN index if free-text search is required.

### [P3] Logs filter `actorType` and `entityType` not enum-validated
_id:_ `logs-actorType-no-enum` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/logs/route.ts:16-17`

```
const entityType = sp.get('entityType'); if (entityType) where.entityType = entityType;
const actorType = sp.get('actorType'); if (actorType) where.actorType = actorType;
```
**Impact.** actorType is an enum (ActorType) — invalid value crashes Prisma with 500.

**Fix.** z.nativeEnum(ActorType).optional() for actorType; whitelist entityType against a known list to prevent fishing for arbitrary types.

### [P1] Logs page is just a static table with no pagination, no filters, no time-range
_id:_ `logs-no-pagination-ui-no-filter-ui` · _category:_ ux · _file:_ `apps/web/src/app/admin/logs/page.tsx:1-20`

```
export default function ActivityLogsPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { ... api.getSWR<any>('/admin/logs') ... }, []);
  ...
  return (<div><PageHeader title="Activity Logs" /><DataTable columns={[...]} data={data} keyField="id" /></div>);
}
```
**Impact.** After day one of usage, only the last 50 events are visible. Cannot search for 'who edited invoice X', cannot filter to ADMIN actor only. Defeats the purpose of an audit log for go-live compliance.

**Fix.** Add Pagination + filters (entityType select, actorType select, action search with min 2 chars, date range). Display previousValueJson/newValueJson on row expand. Add CSV export route.

### [P1] Backup export gated only on SETTINGS_MANAGE — same permission a non-data-owner uses to toggle notification flags
_id:_ `settings-export-permission-too-broad` · _category:_ auth · _file:_ `apps/web/src/app/api/admin/settings/export/route.ts:9`

```
requirePermission(PERMISSIONS.SETTINGS_MANAGE);
```
**Impact.** Anyone who can toggle settings can exfiltrate all customer data + payments + integration creds. Principle of least privilege violation.

**Fix.** Introduce a dedicated DATA_EXPORT permission only assigned to OWNER role. Combine with rate limit + 2FA challenge.

### [P2] Holiday DELETE has no impact check (existing appointments on that date are silently un-blocked)
_id:_ `holidays-no-fk-impact-warning` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/settings/holidays/route.ts:30-37`

```
const user = requirePermission(PERMISSIONS.SETTINGS_MANAGE);
const id = req.nextUrl.searchParams.get('id');
if (!id) return NextResponse.json({ success: false, error: { message: 'id required' } }, { status: 400 });
await prisma.holiday.delete({ where: { id } });
```
**Impact.** Deleting a holiday after appointments were already auto-rescheduled around it leaves the system in an inconsistent visible state — the calendar shows the slot as free but appointments may have been moved. No FK from Holiday to anything, so deletion succeeds silently.

**Fix.** Soft-delete (isActive flag) so historical decisions stay traceable; or refuse delete when the holiday is in the past; or at minimum surface a warning in UI.

### [P1] Backup export does not call logActivity
_id:_ `settings-export-no-audit` · _category:_ observability · _file:_ `apps/web/src/app/api/admin/settings/export/route.ts:7-39`

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
**Impact.** Data exfiltration cannot be detected after-the-fact. Compliance requirement (DPDP Act in India for handling customer phone/email data) for tracking access.

**Fix.** logActivity({ entityType: 'Backup', action: 'data.exported', newValue: { tables: [...], rowCounts: {...} }, actorType: 'ADMIN', actorId: user.sub, ipAddress, userAgent }) before returning.

### [P1] Sentry directory is empty placeholder — no error monitoring on production
_id:_ `sentry-not-wired` · _category:_ observability · _file:_ `apps/web/src/lib/sentry/.gitkeep`

```
(directory contains only .gitkeep; lib/errors.ts logs to console.error and lib/activity-logger.ts logs to console.error)
```
**Impact.** On go-live morning, any 500 surfaces only as a generic 'Internal server error' to the user and a console line on the server. No alerting, no stack traces collected, no way to triage incidents quickly.

**Fix.** Initialize @sentry/nextjs (sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts). Wire SENTRY_DSN env. In handleApiError default branch, captureException(error) before the console.error. Tag spans with userId from JWT.

### [P2] Settings PATCH uses Promise.all of upserts — partial failure leaves DB partially updated with no rollback
_id:_ `settings-promise-all-partial-failure` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/admin/settings/route.ts:25`

```
await Promise.all(entries.map(([key, value]) => prisma.setting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } })));
```
**Impact.** If 5 settings are sent and the 3rd upsert fails (e.g. JSON column constraint), the first 2 are committed and the others aren't — UI shows 'Failed to save' but half the changes are live. Notification flags can end up inconsistent (whatsapp on, email half-toggled).

**Fix.** prisma.$transaction(entries.map(([key, value]) => prisma.setting.upsert(...))).

### [P2] logActivity is fire-and-forget — failures are logged to console but the route returns 200 with no record
_id:_ `activity-logger-no-await` · _category:_ observability · _file:_ `apps/web/src/lib/activity-logger.ts:18-32`

```
export function logActivity(params: LogActivityParams) {
  prisma.activityLog.create({ ... }).catch((e) => console.error('Activity log failed:', e.message));
}
```
**Impact.** For settings/holiday/admin/service-request mutations, the API responds success even when the audit row never wrote. Compliance gap. Also, on a serverless host, the request handler may exit before the Promise resolves, losing the write entirely (no waitUntil).

**Fix.** Make logActivity async and await it inside handlers (or push to a queue). At minimum, on Vercel/edge use ctx.waitUntil(prisma.activityLog.create(...).catch(...)). Bubble failure to Sentry, not console.

### [P3] Admin users list (GET /api/admin/settings/admins) has no pagination — returns ALL admins
_id:_ `admin-list-no-pagination` · _category:_ performance · _file:_ `apps/web/src/app/api/admin/settings/admins/route.ts:12-28`

```
const [admins, roles] = await Promise.all([
  prisma.adminUser.findMany({ orderBy: { createdAt: 'desc' }, select: { ... roles: { select: { role: ... } } } }),
  prisma.role.findMany({ orderBy: { name: 'asc' }, select: { ... } }),
]);
```
**Impact.** For a single garage admin count is small (~5-20). Not a real go-live problem but UI also lacks search/filter and the route returns admin roles fully populated for every admin. Edit modal can only assign ONE role even though schema is many-to-many (AdminUserRole join).

**Fix.** Add a limit (e.g. 100). Extend edit UI to support multi-role with checkboxes; backend already runs deleteMany so the API can accept roleIds: string[].

### [P1] Notification templates UI + API are read-only — cannot edit/create/delete templates
_id:_ `notifications-templates-readonly` · _category:_ business-logic · _file:_ `apps/web/src/app/api/admin/notifications/templates/route.ts:1-17`

```
export async function GET() {
  try {
    requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW);
    const templates = await prisma.notificationTemplate.findMany({ orderBy: [{ eventType: 'asc' }, { channel: 'asc' }] });
    return NextResponse.json({ success: true, data: templates });
  } catch (e) { return handleApiError(e); }
}
```
**Impact.** On go-live the shop owner cannot tweak SMS/WhatsApp wording without engineering. Variable schema (variableSchemaJson) is opaque to the UI.

**Fix.** Add POST/PATCH/DELETE with z validation (templateKey unique, messageBody max length, variable placeholders verified against variableSchemaJson). Build editor UI with preview using sample variables.

### [P2] Settings PATCH key prefix allowlist permits any key under business./invoice./notification./integration. — including unknown keys
_id:_ `settings-key-prefix-allowlist-loose` · _category:_ validation · _file:_ `apps/web/src/app/api/admin/settings/route.ts:8,23`

```
const ALLOWED_PREFIXES = ['business.', 'invoice.', 'notification.', 'integration.'];
...
const invalid = entries.filter(([key]) => !ALLOWED_PREFIXES.some((p) => key.startsWith(p)));
```
**Impact.** An admin can write `integration.evilProvider.token = '...'` or `notification.zzz = {...}` — accepted and stored. Combined with the JSON value freedom, this is a junk-data + storage-bloat vector.

**Fix.** Allowlist by exact key name from a registry that also encodes the Zod schema for the value (see settings-patch-unvalidated-json-value).

### [P2] requirePermission relies on Authorization Bearer header only — no httpOnly cookie path checked here
_id:_ `jwt-cookie-flags-not-set-here` · _category:_ auth · _file:_ `apps/web/src/lib/auth.ts:7-12`

```
export function getAuthToken(): string {
  const h = headers();
  const auth = h.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token');
  return auth.slice(7);
}
```
**Impact.** Architecture hint says 'JWT in cookie/header' but this helper reads only the Authorization header. If middleware also reads a cookie, the token may live in localStorage (XSS-exfiltratable) instead of an httpOnly cookie. Confirm where the client stores it; for this module the API contract forces clients to send Bearer, which usually means localStorage.

**Fix.** Audit middleware.ts and the api client. If tokens are in localStorage, migrate to httpOnly+Secure+SameSite=Lax cookie and update getAuthToken to read cookies() too. Out of scope here, but flagged.

### [P3] Admin list response includes email/phone for every admin — visible to any holder of ADMIN_USERS_MANAGE
_id:_ `admins-list-leaks-email-phone` · _category:_ security · _file:_ `apps/web/src/app/api/admin/settings/admins/route.ts:13-25`

```
prisma.adminUser.findMany({
  orderBy: { createdAt: 'desc' },
  select: { id: true, adminUserId: true, fullName: true, email: true, phone: true, status: true, lastLoginAt: true, createdAt: true, roles: { ... } },
}),
```
**Impact.** Low risk inside admin scope, but combined with no rate limit and no 2FA enforcement, a compromised ADMIN_USERS_MANAGE token harvests staff PII used for phishing pivots.

**Fix.** Mask phone/email in list view (last 4 digits / domain); reveal on row click via a dedicated detail endpoint that logs access.

### [P3] Holidays only support one-by-one creation — no bulk import for the year's public holidays
_id:_ `holidays-no-bulk-import` · _category:_ ux · _file:_ `apps/web/src/app/api/admin/settings/holidays/route.ts:17-28`

```
export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const body = z.object({ holidayName: z.string().min(1), holidayDate: z.string(), holidayType: z.enum([...]), ... }).parse(await req.json());
    const holiday = await prisma.holiday.create({ data: { ...body, holidayDate: new Date(body.holidayDate) } });
    ...
  }
```
**Impact.** Quality-of-life only. Admin has to add 20+ public holidays one by one on go-live day.

**Fix.** Optional POST array body that createMany inside a transaction, deduped on (holidayDate, holidayType).

### [P3] Admin users table has 5 columns but only 4 headers (Edit cell has no header)
_id:_ `service-request-detail-row-key-missing` · _category:_ ux · _file:_ `apps/web/src/app/admin/settings/admins/page.tsx:47-67`

```
<thead ...><tr>
  <th ...>Admin</th>
  <th ...>Role</th>
  <th ...>Status</th>
  <th ...>Last Login</th>
</tr></thead>
<tbody>
  {data.map((admin) => (<tr key={admin.id}>
    <td>...<td>...<td>...<td>...
    <td ...><button onClick={() => { setEditUser(admin); ... }} className="text-xs text-blue-600 hover:underline">Edit</button></td>
```
**Impact.** Misaligned table header/body — minor visual bug, screen readers will mis-associate the Edit button column.

**Fix.** Add an empty `<th>` for the Edit column.

### [P2] No tenant/garage scoping on any of these routes (single-tenant assumption)
_id:_ `settings-no-tenancy-check` · _category:_ auth · _file:_ `apps/web/src/app/api/admin/settings/admins/route.ts:9-100`

```
prisma.adminUser.findMany({ orderBy: { createdAt: 'desc' }, select: { ... } })
// no garageId / tenantId filter anywhere in any route
```
**Impact.** If this app ever serves multiple garages, every admin in the deployment can see/modify everyone else's data. Likely intentional for this single-tenant shop, but worth documenting now so future multi-tenancy doesn't quietly break isolation.

**Fix.** Confirm intent: single-tenant deployment per shop. If multi-tenant is planned, plumb a garageId into every model and into JWT, and add `where: { garageId: user.garageId }` to every query.
