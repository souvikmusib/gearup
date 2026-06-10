# EXECUTIVE_SUMMARY.md — Go-Live Readiness

## Overall Health: AMBER (conditional ship)

The gearup codebase has a solid architectural spine — every admin route is auth + RBAC-gated, inputs are Zod-validated, Decimal columns are used correctly, the schema is normalized, and `handleApiError` gives consistent error responses. But the money-touching flows (job-card → invoice → payment → AMC) have **12 verified P0 issues** that share one root cause: **multi-table writes are not wrapped in `prisma.$transaction`**. Tonight is a transaction-wrapping sprint plus a handful of targeted guards. If those land cleanly, you can ship tomorrow. If not, hold.

## Top 5 Risks (Plainspoken)

1. **Any user who can create a job card can delete any job card, its invoice, and all payments on it.** The DELETE route is gated by the *create* permission. (`apps/web/src/app/api/admin/job-cards/[id]/route.ts:38`)
2. **Parts get charged to customers but stock isn't decremented when descriptions don't match inventory names exactly.** PART lines match by free-text `itemName` substring. Typo → silent miss → inventory drifts forever from day one. (`invoices/[id]/line-items/route.ts:77`)
3. **AMC prepaid services get burnt when an admin merely *adds* an AMC line to a DRAFT invoice.** Delete the invoice → service is still gone. Concurrent adds double-decrement. (`invoices/[id]/line-items/route.ts:47`)
4. **Two admins can book the same worker into the same slot.** No overlap check on appointments. Same race lets AMC contract numbers and "Use Service" decrement collide. (`appointments/route.ts:39`, `amc/contracts/[id]/route.ts:57`)
5. **Job-card creation writes 4 tables with no transaction.** Invoice failure mid-flow leaves an orphan job card the rest of the UI assumes has a DRAFT invoice — repeats burn job-card-numbers. (`job-cards/route.ts:46`)

## What's Solid

- **Auth/RBAC layer is consistent and well-factored.** `requirePermission` / `requireAnyPermission` is used on every admin route; permission constants live in shared `@gearup/types`.
- **Zod schemas everywhere.** Validation is present even if some are too loose.
- **Decimal columns for money.** Not floats. Tax/discount math respects precision.
- **`handleApiError` taxonomy.** Prisma errors mapped to clean 4xx responses; consistent envelope.
- **Stock-adjustment route uses a transaction + `updateMany` with `gte` guard.** This is the correct pattern — it just needs to be replicated to the other 10 places.
- **Inventory module's stock route + activity-log pattern is the model the rest of the app should follow.**
- **Audit log infrastructure exists** (`activity-logger.ts` + `ActivityLog` model + `customers/[id]/history` viewer), even if not called everywhere yet.
- **Schema is clean and normalized**, with sensible indexes and enums.

## Architecture Observations

- **Three god-nodes:** `lib/auth.ts` (every admin route), `middleware.ts` (every API request, including CORS:* affecting public + admin alike), and `lib/errors.ts`. Changes here ripple everywhere — bless and curse.
- **The Invoice ↔ Job-card ↔ Inventory triangle is the single highest-risk surface.** Five of the twelve P0s live in this triangle. Worth a single dedicated refactor: one helper that adds a line item, reserves stock, and updates totals inside one transaction.
- **`referenceItemId` is overloaded** to point to InventoryItem (PART) / AmcPlan (AMC) / AmcContract (AMC usage). Disambiguated only by `lineType`. A typed split or a `referenceType` discriminator would prevent a class of future bugs.
- **`Vehicle.customerId` is `onDelete: Cascade`** but the customer DELETE route has an app-level guard against deleting customers with vehicles. The cascade wins — the guard is theatre.
- **Sentry directory is empty (`.gitkeep`).** Every module audit independently flagged this. Day-one errors will be visible only in Vercel's ephemeral logs.
- **`data: body as any` appears in ~20 routes**, defeating Prisma's type safety. A schema rename will compile and break at runtime. Worth a sweep next week.

## Recommendation: **CONDITIONAL SHIP**

Ship tomorrow **only if** the 7 items in `DO TONIGHT` of `FIX_PLAN.md` land and pass the concurrency smoke tests. Specifically the four transaction wrappers, the AMC double-spend fix, the JOB_CARDS_DELETE permission, the inventoryItemId requirement on PART lines, the AMC contract-number generator swap, and the appointment overlap guard.

If any one of those slips, **hold 24 hours**. The codebase is close — these are not architectural rewrites, they are surgical fixes in well-bounded files. A single focused evening from one or two engineers gets you to green. Without them, the first busy Saturday will produce duplicate invoices, drifted inventory, burnt AMC services, and double-booked workers — exactly the failure modes that a workshop SaaS cannot recover trust from.

The week-1 backlog (Sentry, cookie auth, Upstash rate-limit, PDF XSS, schema unique constraints) is large but linear and safe to ship incrementally.
