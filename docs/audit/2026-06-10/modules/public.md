# Public surface: booking, contact, estimate, track + public APIs (HIGH RISK) — module audit

_Module key:_ `public`

## Summary

The public surface is the highest-risk attack surface and has several go-live blockers. Rate limiting exists but is in-memory per-instance (useless on serverless/multi-instance Vercel) and trusts spoofable x-forwarded-for. Critically, the estimate approval endpoint uses the JobCard primary key (cuid) as the public "token" — exposed in URL/logs, no expiry, no scoping nonce, and the GET has no precondition (anyone with the cuid can read full estimate including customer name, vehicle reg, notes, prices). The track endpoint is a phone+vehicle enumeration oracle (no rate limit per phone, no captcha, NotFoundError leaks "no matching"). The service-request endpoint silently overwrites an existing customer's fullName/email by phone collision (account takeover-by-typo). Several transactions are subtly racy (slot capacity check is non-locking, double-submit possible). CORS is wide-open (Allow-Origin: *) on every API including auth-cookie routes. Sentry directory is empty. No request-size limits. The estimate flow has no token rotation post-decision.

## Routes audited

- `POST /api/public/service-requests`
- `GET /api/public/customer-lookup`
- `GET /api/public/available-slots`
- `GET /api/public/estimate/[token]`
- `POST /api/public/estimate/[token]`
- `POST /api/public/track`
- `GET /api/health`

## Files audited

- `apps/web/src/app/api/public/service-requests/route.ts`
- `apps/web/src/app/api/public/customer-lookup/route.ts`
- `apps/web/src/app/api/public/available-slots/route.ts`
- `apps/web/src/app/api/public/estimate/[token]/route.ts`
- `apps/web/src/app/api/public/track/route.ts`
- `apps/web/src/app/api/health/route.ts`
- `apps/web/src/app/(public)/book-service/page.tsx`
- `apps/web/src/app/(public)/contact/page.tsx`
- `apps/web/src/app/(public)/estimate/[token]/page.tsx`
- `apps/web/src/app/(public)/track/page.tsx`
- `apps/web/src/components/public/landing-experience.tsx`
- `apps/web/src/middleware.ts`
- `apps/web/src/lib/errors.ts`
- `apps/web/src/lib/activity-logger.ts`
- `apps/web/src/lib/id-generators.ts`
- `apps/web/prisma/schema.prisma (Customer/Vehicle/ServiceRequest/Appointment/JobCard regions)`

## Coupling

Depends on: lib/prisma (singleton), lib/errors (handleApiError + AppError tree), lib/activity-logger (fire-and-forget logActivity), lib/id-generators (nanoid 8-char alphanumeric for referenceId/jobCardNumber), middleware.ts (CORS + naive in-memory rate limiter), Prisma schema (Customer.phoneNumber NOT unique, JobCard.id used as estimate token, Appointment.appointmentDate has index but slot capacity not enforced at DB). Consumed by: public landing/book-service/track/estimate/contact pages; the same JobCard model is mutated by admin job-card routes (concurrent admin edit + customer decision race possible).

## Findings

### [P0 · BLOCKER] Public estimate 'token' is the JobCard primary key — not a token
_id:_ `estimate-token-is-jobcard-pk` · _category:_ auth · _file:_ `apps/web/src/app/api/public/estimate/[token]/route.ts:44-50, 62-63`

```
const jobCard = await prisma.jobCard.findUnique({ where: { id: params.token }, include: { customer: { select: { fullName: true } }, vehicle: { select: { registrationNumber: true, brand: true, model: true } } } });
```
**Impact.** Anyone who guesses or learns a JobCard cuid (URL sharing, server logs, analytics, browser history, support tickets) can read the customer's full name, vehicle registration number, issue summary, internal notes, and approve or reject the estimate on their behalf. There is no scoping phone/OTP, no expiry, no single-use nonce. cuid is not designed to be a secret; collisions with internal admin tools that surface job-card IDs (job-card listings, audit logs) leak directly into public-readable estimates. Approval action is irreversible business state.

**Fix.** Add a dedicated JobCard.estimateToken (32-byte random base64url) column with optional expiresAt, generated on the same write that sets approvalStatus=PENDING. Public route looks up by token (not id), checks expiry, and the token field is never returned by any admin endpoint. Optionally require last 4 digits of phone as a soft second factor before showing money.

  _Adversarial verify:_ **CONFIRMED** (now P0) — Verified at apps/web/src/app/api/public/estimate/[token]/route.ts lines 44-50 and 62-63: both GET and POST use prisma.jobCard.findUnique({ where: { id: params.token } }) — params.token IS the JobCard primary key (cuid), not a dedicated secret token. No phone/OTP scoping, no expiresAt, no single-use nonce. Anyone with a JobCard id (leaked via URL shares, server logs, support tickets, or any admin endpoint that returns job-card ids) can read customer PII (full name, vehicle reg, issue summary, internal notes) and irreversibly approve/reject the estimate on the customer's behalf. cuids are not cryptographic secrets. The PENDING-status guard in the transaction only prevents re-approval after a first unauthorized approval — it does not prevent the initial attack. P0 / go-live blocker confirmed.

### [P0 · BLOCKER] Track endpoint is an unthrottled phone + vehicle enumeration oracle
_id:_ `track-enumeration-oracle` · _category:_ security · _file:_ `apps/web/src/app/api/public/track/route.ts:79-111`

```
const sr = await prisma.serviceRequest.findFirst({ where: { referenceId: referenceId.trim().toUpperCase(), customer: { phoneNumber: phone } }, select: requestSelect }); if (!sr) throw new NotFoundError('No matching request found.');
```
**Impact.** With only a phone number + 8-char alphanumeric ref, an attacker can enumerate which phones are customers and (via vehicle search) which vehicles belong to which phone. NotFoundError vs success cleanly distinguishes hits. Middleware rate-limit is 30/min per spoofable x-forwarded-for and in-memory (resets every cold start on Vercel). The response then leaks customer.fullName, vehicle, invoice amounts, etc.

**Fix.** (1) Replace the in-memory limiter with a Redis/Upstash sliding window scoped to (phone, ip) and return identical timing/response shape for hit vs miss. (2) Require both referenceId AND phone to match — already the case for reference mode but vehicle mode returns ALL of a phone's requests if the vehicle substring matches, which is over-broad. (3) Consider HMAC-signed deep links emailed/WhatsApp'd to the customer instead of self-service lookup.

  _Adversarial verify:_ **CONFIRMED** (now P0) — Verified at apps/web/src/app/api/public/track/route.ts and src/middleware.ts. The endpoint accepts {phoneNumber, referenceId|vehicleNumber} with no OTP/auth, returns NotFoundError on miss vs full payload (customer.fullName, vehicle reg, invoice grandTotal/amountDue) on hit — a clean enumeration oracle. The only guard is an in-memory Map rate limiter (30/min) keyed on the spoofable x-forwarded-for header that resets on every serverless cold start, so it is effectively bypassable at scale. Vehicle mode is even broader: it fetches ALL serviceRequests for the phone then filters in JS, confirming phone ownership even when the vehicle substring is wrong-but-empty-match. P0 go-live blocker is appropriate; proposed fixes (durable per-(phone,ip) limiter, uniform response shape/timing, or HMAC deep links) are sound.

### [P0 · BLOCKER] Service-request mutates existing customer's name/email on phone match (data-integrity / takeover-by-typo)
_id:_ `customer-overwrite-on-phone-collision` · _category:_ data-integrity · _file:_ `apps/web/src/app/api/public/service-requests/route.ts:23-28`

```
let customer = await tx.customer.findFirst({ where: { phoneNumber } });
if (!customer) { customer = await tx.customer.create({...}) }
else { customer = await tx.customer.update({ where: { id: customer.id }, data: { fullName: body.fullName || customer.fullName, email: body.email || customer.email } }); }
```
**Impact.** Customer.phoneNumber has no unique constraint (schema.prisma:244 only @@index), so findFirst could pick an arbitrary one of multiple records. More importantly, anyone who types another customer's phone into the public booking form silently rewrites that customer's fullName and email in the DB, plus attaches a new vehicle/SR to their account. This is unauthenticated PII overwrite and lets a malicious actor pollute every record by walking phone numbers.

**Fix.** Never update an existing customer from an unauthenticated form. If phone matches, attach the SR (with the submitted name/email captured ONLY on the ServiceRequest row), and let admin reconcile. Also add @@unique on Customer.phoneNumber (with explicit handling for legacy duplicates) and switch findFirst→findUnique.

  _Adversarial verify:_ **CONFIRMED** (now P0) — Verified in apps/web/src/app/api/public/service-requests/route.ts line 27: an unauthenticated POST endpoint does findFirst({where:{phoneNumber}}) then unconditionally updates that customer's fullName and email with attacker-supplied values. Confirmed in schema.prisma that Customer.phoneNumber has only @@index (line 244), no @@unique, so findFirst can hit any matching row. Anyone who guesses/types another user's phone in the public booking form silently overwrites that user's PII and attaches new vehicles/SRs to their account — a clear unauthenticated data-integrity / account-pollution vector. Body validation requires fullName (min 1), so the overwrite always fires with attacker input. Genuine go-live blocker.

### [P0 · BLOCKER] Rate limiter is in-memory per-instance and trusts spoofable x-forwarded-for
_id:_ `rate-limiter-in-memory-spoofable` · _category:_ security · _file:_ `apps/web/src/middleware.ts:5-18, 35-48`

```
const rateMap = new Map<string, { count: number; resetAt: number }>();
...
const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
```
**Impact.** On Vercel (and any horizontally scaled deploy) each lambda instance has its own Map, so the real limit is N_instances × 30/min, and cold starts wipe state. x-forwarded-for is a client-supplied header that any tool can rotate to bypass entirely. Effective protection ≈ zero. This affects the login route too.

**Fix.** Use Upstash @upstash/ratelimit or Vercel KV with a sliding window keyed on req.ip (Next 14: request.ip, which Vercel populates from the trusted edge), composite with the form field (phone for booking, jobCardId for estimate). For login, also key on username. Always fall back to deny on storage failure, not allow.

  _Adversarial verify:_ **CONFIRMED** (now P1) — Confirmed: middleware.ts uses an in-memory Map and keys on the raw x-forwarded-for header without validating it's from a trusted proxy. On Vercel serverless this Map is per-instance and wiped on cold start, and any attacker can rotate x-forwarded-for to bypass entirely (defaulting to 'unknown' aggregates all unkeyed requests). Affects both /api/admin/auth/login (10/min) and /api/public/* POST routes (30/min). Downgrading to P1 rather than P0: the limiter is not the sole protection (login still requires valid credentials and presumably bcrypt; public endpoints likely have validation/uniqueness constraints), so effective security isn't zero, but the rate-limit control as designed is essentially non-functional and should be replaced with Upstash/KV keyed on request.ip plus form fields before scale.

### [P1 · BLOCKER] CORS: Access-Control-Allow-Origin: * on every API including auth-cookie routes
_id:_ `cors-allow-origin-wildcard` · _category:_ security · _file:_ `apps/web/src/middleware.ts:25-28`

```
response.headers.set('Access-Control-Allow-Origin', '*');
response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
```
**Impact.** Wildcard is applied to /api/admin/* including auth/login. Browsers will block credentialed requests so this isn't immediate session-theft, but it permits any origin to issue unauthenticated POSTs (including the public estimate approve/reject) as CSRF-by-CORS, and allows third-party JS to read all public endpoint responses. There is no CSRF token on any POST.

**Fix.** Restrict to an allowlist: only /api/public/* gets a configurable Allow-Origin (or no CORS at all if all clients are same-origin). Never set Allow-Origin:* on admin routes. Add a CSRF token (or SameSite=Strict + Origin check) on cookie-authenticated mutations.

  _Adversarial verify:_ **CONFIRMED** (now P1) — Confirmed at apps/web/src/middleware.ts:25-28. The middleware matcher is /api/:path* and unconditionally sets Access-Control-Allow-Origin: * on every API route, including /api/admin/auth/login and other admin/cookie-authenticated endpoints. While wildcard with credentials is blocked by browsers (so cookie-bearing requests can't be read cross-origin), it still allows any third-party site's JS to read responses from public endpoints (e.g., estimate approve/reject) and there is no CSRF token visible in the middleware on POSTs. P1 go-live blocker is appropriate: scope CORS to /api/public/* with an allowlist and add CSRF/Origin checks on cookie-auth mutations.

### [P1] available-slots and appointment creation are TOCTOU racy on capacity
_id:_ `slot-capacity-race` · _category:_ race-condition · _file:_ `apps/web/src/app/api/public/available-slots/route.ts:20, 37 + apps/web/src/app/api/public/service-requests/route.ts:38-43`

```
const existingAppts = await prisma.appointment.count({ where: { appointmentDate: targetDate, status: { notIn: ['CANCELLED','NO_SHOW'] } } });
...
available: !isBlocked && existingAppts < rule.maxCapacity
--- and in service-requests ---
appointment = await tx.appointment.create({ data: { ... } });
```
**Impact.** available-slots counts appointments for the whole day, not the chosen slot, so capacity logic is wrong (treats the day as one slot). Booking does not re-check capacity at all — it just inserts. Two concurrent submissions trivially over-book; the only protection is the post-hoc admin review.

**Fix.** Group existingAppts by slotStart and compare per slot. In the booking transaction, run a SELECT count() ... WHERE slotStart=... FOR UPDATE (or use a unique partial index on (slotStart, status) with a serial slot number) before tx.appointment.create. Reject with a 409 if full.

### [P1] Estimate approval doesn't pin the prices the customer saw
_id:_ `estimate-no-version-check-on-prices` · _category:_ business-logic · _file:_ `apps/web/src/app/api/public/estimate/[token]/route.ts:82-89`

```
const result = await tx.jobCard.updateMany({ where: { id: params.token, approvalStatus: 'PENDING' }, data: { approvalStatus, status, customerVisibleNotes } });
```
**Impact.** An admin can edit estimatedPartsCost/estimatedLaborCost between the time the customer opened the page and the time they clicked Approve. The customer is then bound to a price they never saw. There is also no snapshot of the estimate stored on approval, so audit cannot reconstruct what was approved.

**Fix.** Have the GET return an estimateRevision (hash of {partsCost, laborCost, total, notes}); POST must include it; updateMany's where clause must include that revision. On approval, snapshot the numeric values into a JobCardEstimateApproval row.

### [P1 · BLOCKER] customer-lookup leaks fullName/email/all vehicles given only a phone number
_id:_ `customer-lookup-unauthenticated-pii` · _category:_ security · _file:_ `apps/web/src/app/api/public/customer-lookup/route.ts:5-26`

```
const customer = await prisma.customer.findFirst({ where: { phoneNumber: phone }, select: { id: true, fullName: true, phoneNumber: true, email: true, vehicles: { ... select: { id, registrationNumber, vehicleType, brand, model, variant } } } });
```
**Impact.** GET endpoint with no auth, no rate limit (middleware only rate-limits POST), returns full PII + every vehicle registration tied to any phone number. Trivially scriptable to dump the entire customer base (10-digit Indian mobile space = 10^10, but real numbers are clustered and this still yields targeted enumeration). Vehicle registration is sensitive (linked to RC).

**Fix.** (1) Require a same-session signed challenge from book-service (e.g. CAPTCHA-derived nonce). (2) Add POST-style rate limit to GET. (3) Return only a coarse 'we have records for this phone — continue?' boolean and hydrate the rest after the booking is created. (4) Don't return vehicle.id; use registrationNumber as the picker key.

  _Adversarial verify:_ **CONFIRMED** (now P1) — Confirmed at apps/web/src/app/api/public/customer-lookup/route.ts:5-28: GET handler accepts a phone query param with no auth/CAPTCHA/nonce and returns fullName, email, phoneNumber, plus every vehicle's registrationNumber, brand, model, variant. Middleware at apps/web/src/middleware.ts:43 only applies the 30/min rate limit to POST requests under /api/public/, so GET is completely unthrottled. This is enumerable PII + vehicle-registration leakage from a public endpoint — go-live blocker.

### [P2] available-slots accepts arbitrary 'date' string, no zod, NaN passes through
_id:_ `available-slots-no-input-validation` · _category:_ validation · _file:_ `apps/web/src/app/api/public/available-slots/route.ts:7-15`

```
const date = req.nextUrl.searchParams.get('date');
if (!date) throw new ValidationError('date query parameter required');
const [year, month, day] = date.split('-').map(Number);
const targetDate = new Date(Date.UTC(year, month - 1, day));
```
**Impact.** date='abc' yields NaN-NaN-NaN → Date is Invalid; new Date(Date.UTC(NaN,...)) returns Invalid Date; dayOfWeek = NaN; prisma query runs with NaN and likely throws. Also accepts past dates and dates 1000 years out — no bounds. Easy DoS vector if any of these branches do expensive work.

**Fix.** const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse({ date }); bound to today..+90 days.

### [P2] email zod chain accepts empty strings as 'undefined' but invalid emails still bypass via .optional after .pipe
_id:_ `service-request-email-validation-quirk` · _category:_ validation · _file:_ `apps/web/src/app/api/public/service-requests/route.ts:10`

```
email: z.string().optional().transform(v => v?.trim() || undefined).pipe(z.string().email().optional()),
```
**Impact.** The trailing .optional() inside .pipe means the inner schema treats undefined as valid, so the intended 'empty→undefined' works. But if v is whitespace-only after trim it becomes undefined which is intended. Bigger issue: vehicleId is accepted as any string with no z.cuid() check; passing another customer's vehicleId would fall back to findFirst({where:{id, customerId: customer.id}})→null which is then re-resolved by registrationNumber+customerId, so safe. Still flag the loose typing.

**Fix.** Tighten: vehicleId: z.string().cuid().optional(); phoneNumber: z.string().regex(/^\d{10}$/) (post-strip); registrationNumber: z.string().regex(/^[A-Z0-9-]{6,15}$/); add max() bounds on every string (e.g. issueDescription max 2000).

### [P2] No request body size limit on public POSTs (issueDescription/notes unbounded)
_id:_ `no-request-body-size-limit` · _category:_ security · _file:_ `apps/web/src/app/api/public/service-requests/route.ts:8-15, 17-19`

```
const schema = z.object({ ... issueDescription: z.string().min(1), ... notes: z.string().optional(), });
...
const body = schema.parse(await req.json());
```
**Impact.** Zod has no .max() on issueDescription, notes, fullName, brand, model. Next.js default body limit (1 MB) is the only guardrail. Attacker can persist megabytes of garbage per request — cheap to write, expensive to index, blow up activity_log JSON.

**Fix.** Add explicit .max(2000) on long text, .max(100) on names; consider runtime export const maxDuration = 10 and an explicit content-length check in middleware (reject > 32 KB on public POSTs).

### [P2] Public API routes don't opt out of caching; risk of stale/leaked responses
_id:_ `public-routes-cached-statically` · _category:_ config · _file:_ `apps/web/src/app/api/public/*`

```
grep -rn 'noStore|dynamic\s*=' apps/web/src/app/api/public/ → no matches
```
**Impact.** App Router may statically optimize GET routes (customer-lookup, available-slots, estimate GET) and cache responses. Cached PII leak: a slot-availability or estimate response for one customer could be served to another behind a CDN. Less critical for POSTs but still better to be explicit.

**Fix.** Add export const dynamic = 'force-dynamic'; export const revalidate = 0; to every file under app/api/public, or call noStore() at top of handler.

### [P1] lib/sentry is empty (.gitkeep only) — no error reporting in production
_id:_ `sentry-empty` · _category:_ observability · _file:_ `apps/web/src/lib/sentry/`

```
ls apps/web/src/lib/sentry/ → (only sentry directory exists, no source files); handleApiError logs unhandled errors to console only (errors.ts:91)
```
**Impact.** 500s, unhandled rejections, Prisma errors, and security signals (rate-limit breaches, repeated NotFound on track) are not captured. You will go live blind. console.error in serverless = best-effort log search only.

**Fix.** Wire @sentry/nextjs with instrumentation.ts; add Sentry.captureException in handleApiError's default branch and around logActivity catch; instrument middleware to log 429s.

### [P2] logActivity is fire-and-forget outside the transaction → can silently lose audit records
_id:_ `activity-log-fire-and-forget` · _category:_ observability · _file:_ `apps/web/src/lib/activity-logger.ts:18-33, called from service-requests/route.ts:46`

```
export function logActivity(params: LogActivityParams) {
  prisma.activityLog.create({ data: { ... } }).catch((e) => console.error('Activity log failed:', e.message));
}
```
**Impact.** For unauthenticated mutations the audit trail is THE only record of who did what. Calling outside the transaction means the business write commits even if activity-log write fails (orphaned mutation), and there's no retry — only a console line. requestId/ipAddress/userAgent not captured on service-requests (only on estimate POST).

**Fix.** Insert the log inside the same prisma.$transaction. Always capture ip/userAgent/x-request-id from req.headers in service-requests route too.

### [P2] book-service form has no client-side dedupe; submit() not idempotent
_id:_ `double-click-double-booking` · _category:_ ux · _file:_ `apps/web/src/app/(public)/book-service/page.tsx:123-136`

```
const submit = async (e: React.FormEvent) => { e.preventDefault(); ... setLoading(true); const res = await api.post(...); setLoading(false); ... }
```
**Impact.** Disabling the button via loading mostly helps but the button isn't disabled until after the validate sync block; rapid double-click can fire two POSTs (and the server has no idempotency-key). Result: two ServiceRequests, two referenceIds. Same problem in the estimate page handleAction (estimate POST is idempotent server-side via updateMany where approvalStatus:'PENDING' though — that one is OK).

**Fix.** Move setLoading(true) before validate, or gate with a useRef boolean. Accept an Idempotency-Key header on POST /public/service-requests and dedupe in Redis for 60s.

### [P2] 8-char alphanumeric reference IDs are guessable for an enumeration attacker
_id:_ `reference-id-entropy` · _category:_ security · _file:_ `apps/web/src/lib/id-generators.ts:4-6`

```
const alphanumeric = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
export const generateReferenceId = () => `${REFERENCE_ID_PREFIX}-${alphanumeric()}`;
```
**Impact.** 36^8 ≈ 2.8e12 — not directly brute-forceable, but combined with the track endpoint requiring (referenceId, phoneNumber), a targeted attacker with a phone number only needs ~10^12 attempts. The bigger issue is collisions: 8 chars + nanoid without DB unique enforcement at the application logic level only relies on the @unique constraint catching collisions at insert (which would 500 the user). Acceptable but tighten.

**Fix.** Bump to 12 chars (36^12 ≈ 4.7e18). Same for jobCardNumber and invoiceNumber.

### [P3] Holiday name is concatenated raw into a user-facing message field
_id:_ `holiday-message-html-injection` · _category:_ validation · _file:_ `apps/web/src/app/api/public/available-slots/route.ts:17`

```
if (holidays.length) return NextResponse.json({ success: true, data: { date, slots: [], message: 'Closed – ' + holidays[0].holidayName } });
```
**Impact.** holidayName is admin-controlled but rendered client-side; if admin types HTML it would render via dangerouslySetInnerHTML somewhere — currently not used so low risk, but it's a XSS-via-stored-string surface.

**Fix.** Sanitize on the admin-side write, or always render as text (already does).

### [P2] isBlocked comparison conflates date and time-of-day; blockStartTime is a full DateTime
_id:_ `available-slots-blocked-time-bug` · _category:_ business-logic · _file:_ `apps/web/src/app/api/public/available-slots/route.ts:19, 32`

```
const blocked = await prisma.blockedSlot.findMany({ where: { blockDate: targetDate, appliesToAll: true } });
...
const isBlocked = blocked.some((b: any) => start >= new Date(b.blockStartTime) && end <= new Date(b.blockEndTime));
```
**Impact.** blockStartTime/blockEndTime are DateTime columns. If the admin saves them with a different date component than blockDate (timezone bugs are likely — see UTC handling above), no slot ever overlaps, and 'blocked' becomes a no-op. Also blocked rows where appliesToAll=false (worker/bay specific) are ignored entirely — fine for a public preview but worth documenting.

**Fix.** Compare only the time-of-day component, or normalize both sides to the same Y-M-D before comparison. Add a unit test covering DST/IST.

### [P2] Track vehicle mode fetches ALL service requests for a phone before filtering
_id:_ `track-vehicle-mode-overbroad-query` · _category:_ performance · _file:_ `apps/web/src/app/api/public/track/route.ts:92-101`

```
const requests = await prisma.serviceRequest.findMany({ where: { customer: { phoneNumber: phone } }, orderBy: { createdAt: 'desc' }, select: requestSelect });
const needle = normalizeVehicle(vehicle);
const matches = requests.filter((sr: any) => normalizeVehicle(sr.vehicle.registrationNumber).includes(needle)).slice(0, 12);
```
**Impact.** For a power customer (or after enumeration pollution) this materializes the entire SR history with deeply nested includes (jobCards→invoices) in memory, then JS-filters. N+1-ish (each include is a join but the .filter() happens in Node). Also leaks all SRs to anyone with the phone before filter, just not over the wire — DB still does the work.

**Fix.** Push the vehicle filter into the where clause: where: { customer: { phoneNumber: phone }, vehicle: { registrationNumber: { contains: needle, mode: 'insensitive' } } }, take: 12. Then no filter step.

### [P2 · BLOCKER] Estimate POST/GET not covered by middleware rate limiter (POST is, but GET isn't, and the action is in URL params)
_id:_ `estimate-no-rate-limit` · _category:_ security · _file:_ `apps/web/src/middleware.ts:43-48 + apps/web/src/app/api/public/estimate/[token]/route.ts`

```
if (pathname.startsWith('/api/public/') && request.method === 'POST') { ...rate limit... }
```
**Impact.** GET /public/estimate/[token] has no limit, so an attacker can brute-force cuids freely (combined with finding 'estimate-token-is-jobcard-pk', this is the live exploitation path). cuid space is large (~10^21) but timing analysis or partial leaks reduce it.

**Fix.** Apply the rate limiter to all methods on public routes. Even better: see fix in 'estimate-token-is-jobcard-pk'.

  _Adversarial verify:_ **CONFIRMED** (now P2) — Verified. middleware.ts:43 gates the public rate limiter on `request.method === 'POST'`, so GET requests to `/api/public/*` bypass it entirely. The estimate route at `apps/web/src/app/api/public/estimate/[token]/route.ts` exposes a GET handler that does `prisma.jobCard.findUnique({ where: { id: params.token } })` with no auth, no token-vs-PK separation, and no per-IP throttle. Combined with the token-equals-jobcard-PK issue, this is a real brute-force surface. P2 is appropriate: cuid keyspace is large so practical exploitation requires partial leaks or other side channels, but the missing rate limit is clearly a go-live concern and the fix (extend the limiter to all methods, or matcher-scope it) is trivial.

### [P3] Transaction callback typed as any — loses Prisma type safety
_id:_ `prisma-tx-any-typing` · _category:_ type-safety · _file:_ `apps/web/src/app/api/public/service-requests/route.ts:22, 22-43; available-slots/route.ts:22, 32`

```
const result = await prisma.$transaction(async (tx: any) => { ... });
...
rules.flatMap((rule: any) => { ... });
blocked.some((b: any) => ...);
```
**Impact.** Removes IDE/compile-time guarantees that the model fields are correct; refactors to schema silently miss these spots.

**Fix.** Drop `: any` — Prisma infers the tx client type. Use Prisma.AppointmentSlotRuleGetPayload etc. for the array elements.

### [P3] Service-request trusts client-supplied vehicleId before falling back to lookup
_id:_ `vehicle-id-trust-from-client` · _category:_ validation · _file:_ `apps/web/src/app/api/public/service-requests/route.ts:30-34`

```
let vehicle = body.vehicleId ? await tx.vehicle.findFirst({ where: { id: body.vehicleId, customerId: customer.id } }) : null;
```
**Impact.** The customerId scoping prevents cross-tenant IDOR, BUT note this happens AFTER the customer.update path which can have switched the 'customer' record to someone else (see customer-overwrite finding). The vehicleId path is therefore safe iff customer identity is correctly resolved — which it isn't if phone collides.

**Fix.** Once customer-overwrite is fixed, this is moot. Otherwise reject client-supplied vehicleId on public routes entirely and always re-derive from registrationNumber.

### [P3] Health route swallows errors silently with empty catch (no logging)
_id:_ `health-route-leaks-stack-on-cold-start` · _category:_ observability · _file:_ `apps/web/src/app/api/health/route.ts:8-10`

```
} catch {
  return NextResponse.json({ status: 'error', db: 'disconnected' }, { status: 503 });
}
```
**Impact.** DB-down events never reach Sentry/console. Hard to diagnose flapping. Not a security issue.

**Fix.** } catch (e) { console.error('health: db check failed', e); ... }

### [P3] POST /public/track returns one of two shapes; client uses 'as any' branch
_id:_ `track-success-data-shape-inconsistent` · _category:_ consistency · _file:_ `apps/web/src/app/api/public/track/route.ts:102, 111 + apps/web/src/app/(public)/track/page.tsx:28`

```
return NextResponse.json({ success: true, data: { lookupType: 'vehicle', requests: ... } });
...
return NextResponse.json({ success: true, data: { lookupType: 'reference', request: ... } });
```
**Impact.** Polymorphic API forces the client into runtime discriminated-union handling; easy to forget a case. Already type-tagged via lookupType which mitigates.

**Fix.** Either always return `{ requests: Request[] }` (single-element for reference mode) or split into two routes /track/by-ref and /track/by-vehicle.

### [P3] Estimate comment is concatenated into customerVisibleNotes without sanitization
_id:_ `estimate-comment-no-html-escape` · _category:_ validation · _file:_ `apps/web/src/app/api/public/estimate/[token]/route.ts:78-80`

```
const customerVisibleNotes = body.comment ? [jobCard.customerVisibleNotes, `Customer ${body.action} estimate: ${body.comment}`].filter(Boolean).join('\n\n') : jobCard.customerVisibleNotes;
```
**Impact.** If any admin UI later renders customerVisibleNotes as HTML (dangerouslySetInnerHTML), this becomes stored XSS. Currently the estimate page renders it as text via <p>, so low.

**Fix.** Strip control chars / clamp max length (already max(1000) in zod which is fine). Ensure all renderers treat it as text.

### [P3] Slot duration silently falls back to 30 min if no rule for that day
_id:_ `slot-duration-fallback` · _category:_ business-logic · _file:_ `apps/web/src/app/api/public/service-requests/route.ts:40-42`

```
const slotRule = await tx.appointmentSlotRule.findFirst({ where: { dayOfWeek: preferredDate.getUTCDay(), isActive: true } });
const duration = (slotRule?.slotDurationMinutes ?? 30) * 60_000;
```
**Impact.** If the workshop has no active rule for that weekday (e.g. Sunday closed), the appointment is still created with a 30-min slot on a closed day. Also dayOfWeek is computed in UTC while admin probably entered IST.

**Fix.** If no rule exists or it's a holiday, refuse the booking with 422 — don't fabricate a slot. Compute dayOfWeek in the workshop's timezone (constants.ts likely has TIMEZONE; use date-fns-tz).

### [P3] Success screen tells user to track but doesn't deep-link with the new ref
_id:_ `booking-success-no-followup-link` · _category:_ ux · _file:_ `apps/web/src/app/(public)/book-service/page.tsx:138-148`

```
<p className="mt-2 text-3xl font-mono font-bold text-blue-600">{result.referenceId}</p>
<p className="mt-4 text-sm text-gray-500 ...">Save this ID to track your service request. We'll notify you via WhatsApp/email.</p>
```
**Impact.** UX miss — user has to manually copy/paste into /track. Track page already supports ?referenceId=... query (track/page.tsx:54-57).

**Fix.** Add a primary CTA <Link href={`/track?referenceId=${result.referenceId}`}>Track this request</Link> and a Copy button.
