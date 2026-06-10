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

Target file: `apps/web/src/app/api/admin/job-cards/route.ts`

## Findings (3)

### [P2] PATCH /job-cards spreads validated body but Zod schema is permissive and 'as any' casts hide drift
- id: `jobcard-patch-spread-body-mass-assignment` · category: type-safety
- location: `apps/web/src/app/api/admin/job-cards/route.ts:46`
- evidence:
```
const jc = await prisma.jobCard.create({ data: { jobCardNumber: generateJobCardNumber(), ...body, intakeDate: new Date(), estimatedDeliveryAt: body.estimatedDeliveryAt ? new Date(body.estimatedDeliveryAt) : undefined } as any });
```
- impact: `as any` lets unknown fields (priority as untrusted string, fuelIndicator) flow into Prisma. If a schema field changes the cast hides it. priority is z.string() with no enum — UI offers HIGH/URGENT but API accepts anything, breaking workerFilter aggregation.
- proposed fix: Type via Prisma.JobCardUncheckedCreateInput; constrain priority with z.enum(['HIGH','MEDIUM','LOW','URGENT']).optional(). Same fix needed in workers POST/PATCH (line 42 and 28) and appointments POST (line 44).

### [P2] Job-card search joins customer.fullName + jobCardNumber on every keystroke without DB-level FTS
- id: `jobcard-search-customer-no-index` · category: performance
- location: `apps/web/src/app/api/admin/job-cards/route.ts:29-37`
- evidence:
```
if (search) where.OR = [{ jobCardNumber: { contains: search, mode: 'insensitive' } }, { customer: { fullName: { contains: search, mode: 'insensitive' } } }];
```
- impact: `contains insensitive` triggers a sequential scan in Postgres without a trigram index. Combined with page.tsx firing on every onChange (no debounce, unlike workers/page.tsx which debounces 300ms), this hits the DB on every keystroke. Will brown out on a few hundred job cards.
- proposed fix: Debounce search input (use the same useRef pattern from workers page). Add pg_trgm GIN indexes on JobCard.jobCardNumber and Customer.fullName, or move to dedicated search.

### [P2] No rate limiting on any admin route; no IP throttle
- id: `jobcard-routes-no-rate-limit` · category: security
- location: `apps/web/src/app/api/admin/job-cards/route.ts:18-55`
- evidence:
```
export async function GET(req: NextRequest) { try { const user = requireAnyPermission(...); ... }
export async function POST(req: NextRequest) { try { const user = requirePermission(...); ... }
```
- impact: Authenticated admins are trusted absolutely. A leaked token or a buggy script (e.g. a debounce regression) can hammer /job-cards or create thousands of job cards instantly, exhausting jobCardNumber sequence and creating thousands of DRAFT invoices.
- proposed fix: Add edge-rate-limit middleware (e.g. @upstash/ratelimit or a simple in-memory token bucket per user.sub for mutations).