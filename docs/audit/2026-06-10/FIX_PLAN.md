# FIX_PLAN.md — Go-Live Plan

## DO TONIGHT — Verified P0 Blockers (must-fix before deploy)

### 1. Wrap all multi-table writes in `prisma.$transaction`
- [ ] `apps/web/src/app/api/admin/job-cards/route.ts:46-53` — wrap jobCard.create + serviceRequest.update + vehicle.update + invoice.create in `prisma.$transaction(async tx => ...)`.
- [ ] `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:25-114` — wrap POST/PATCH/DELETE handler bodies in a single tx; pass `tx` to all helpers (`recalcTotals`, `syncJobCard`, stock adjust, AMC decrement).
- [ ] `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:62-81` — move the post-tx invoice sync (`findFirst invoice` + `invoiceLineItem.create` + `invoice.update` totals) inside the existing `prisma.$transaction`.
- [ ] `apps/web/src/app/api/admin/job-cards/[id]/route.ts:36-54` (DELETE) — wrap cascade in tx; before deleting JobCardPart rows, iterate and call `adjustStock(tx, item, qty, 'RELEASED', jobCardId)`.
- [ ] `apps/web/src/app/api/admin/customers/[id]/route.ts:38-48` — wrap counts + deletes in interactive tx; re-count inside; add `amcContracts` to precheck.

### 2. Lock-out the AMC double-spend
- [ ] `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts:57-77` — replace read-then-decrement with conditional `updateMany({where:{id,status:'ACTIVE',servicesRemaining:{gt:0},endDate:{gte:new Date()}},data:{servicesUsed:{increment:1},servicesRemaining:{decrement:1}}})`; assert `count===1` before inserting usage.
- [ ] `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:47-56` — **defer** AMC decrement to finalize/full-payment; remove the DRAFT-time decrement. Add rollback in DELETE handler.

### 3. Fix permission on destructive routes
- [ ] `apps/web/src/app/api/admin/job-cards/[id]/route.ts:38` — add `PERMISSIONS.JOB_CARDS_DELETE` to `packages/types/src/auth.ts`, assign only to SuperAdmin role, gate DELETE on it. Reject when status=DELIVERED or non-DRAFT invoices/payments exist.

### 4. Stop matching inventory by free-text name
- [ ] `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:77-91` — add `inventoryItemId` to zod schema; UI already has dropdown — pass the id. Use `updateMany({where:{id,quantityInStock:{gte:body.quantity}},data:{quantityInStock:{decrement:body.quantity}}})` and reject if `count===0`.

### 5. Kill the `count()+1` AMC contract numbers
- [ ] `apps/web/src/app/api/admin/amc/contracts/route.ts:55-56` AND `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:74-77` — replace `count+1` with `generateAmcContractNumber()` using cuid suffix (e.g. `AMC-${nanoid(8).toUpperCase()}`) OR a Postgres sequence `nextval('amc_contract_seq')` via `$queryRaw`.

### 6. Prevent appointment double-booking
- [ ] `apps/web/src/app/api/admin/appointments/route.ts:39-49` — inside a serializable tx, pre-query overlap on (assignedWorkerId, slotStart/slotEnd) where status NOT IN (CANCELLED, NO_SHOW), and WorkerLeave APPROVED in window. Reject on overlap.
- [ ] Add migration: partial unique index in raw SQL — `CREATE UNIQUE INDEX appt_worker_slot ON "Appointment"("assignedWorkerId","slotStart") WHERE status NOT IN ('CANCELLED','NO_SHOW');`

### 7. Smoke-test the fixes (tonight, on staging DB clone)
- [ ] Concurrent script: 5x parallel `Use Service` on same contract → expect 4 reject, 1 success.
- [ ] Concurrent script: 5x parallel POST /appointments same worker same slot → expect 4 reject.
- [ ] Concurrent script: 5x parallel POST /job-cards same payload → no orphan invoices.
- [ ] Manual: add PART line with description not matching any item → expect 400, not silent miss.
- [ ] Manual: add AMC line to DRAFT invoice, delete invoice → servicesRemaining unchanged.
- [ ] Manual: DELETE job card without DELETE perm → expect 403.

---

## DO TOMORROW MORNING — Pre-Launch Smoke Test

### Auth & Routing
- [ ] `POST /api/admin/auth/login` valid + invalid creds (expect 200 / 401, no stack trace).
- [ ] `GET /api/admin/auth/me` with token.
- [ ] `POST /api/admin/auth/change-password` round-trip.
- [ ] Confirm middleware CORS headers (`curl -i -H "Origin: https://evil.com"`); decide if wildcard is acceptable for launch.
- [ ] Verify `JWT_SECRET` env var is set in production (not the dev fallback).

### Customers / Vehicles / AMC
- [ ] Create customer → create vehicle → create AMC contract → use service.
- [ ] Try duplicate registration number (should fail post-fix).
- [ ] Cancel AMC contract → check status flip and audit log.

### Job Cards
- [ ] Convert ServiceRequest → JobCard → verify DRAFT invoice auto-created.
- [ ] Add part → check inventory decrement + invoice line.
- [ ] Mark consumed → reservedQuantity drops (post-fix).
- [ ] Assign 2 workers; try assigning same worker twice (expect 409).
- [ ] Transition to DELIVERED; try editing finalTotal (should 403/reject).
- [ ] DELETE job card (with DELETE permission) → verify cascade + stock release.

### Appointments
- [ ] Book appointment; try overlap (expect 409 post-fix).
- [ ] Day-view query `?date=YYYY-MM-DD` — verify results appear (post-fix).

### Inventory
- [ ] Create item with opening stock → verify StockMovement row exists.
- [ ] Stock adjust IN / OUT → check ledger.
- [ ] Low-stock page renders.

### Invoices / Payments
- [ ] Add PART line by `inventoryItemId` (post-fix).
- [ ] Add AMC line on DRAFT — verify servicesRemaining UNCHANGED (post-fix).
- [ ] Finalize → second finalize call → expect 400 (post-fix).
- [ ] Record partial payment, then full payment → status=PAID → JobCard=DELIVERED → AmcContract created.
- [ ] Counter sale path (no jobCard, no vehicle) — verify AMC plan purchase works or fails cleanly.
- [ ] Download PDF; inspect for customer name with `<script>` (post-XSS-fix).

### Observability
- [ ] Vercel logs: trigger an intentional 500, confirm visible.
- [ ] Audit log: mutate a customer, check `/customers/[id]/history` shows entry.

---

## FIRST WEEK POST-LAUNCH — P1 Backlog

| Day | Work | Est. |
|---|---|---|
| Mon | Wire Sentry (@sentry/nextjs); `Sentry.captureException` in `handleApiError`. | 2h |
| Mon | Move JWT to httpOnly Secure SameSite=Strict cookie; add /logout endpoint; drop localStorage. | 4h |
| Tue | Replace in-memory rate-limit with `@upstash/ratelimit` + Vercel KV. | 3h |
| Tue | CORS allowlist via `CORS_ALLOWED_ORIGINS` env. | 1h |
| Tue | Zod env validation at boot (`env.ts`), refuse start without secrets. | 1h |
| Tue | `escapeHtml()` for PDF templates (XSS). | 2h |
| Wed | Schema migration: `Vehicle.registrationNumber @unique`, `Invoice.jobCardId @unique`, `@@unique([jobCardId,inventoryItemId])` on JobCardPart, `@@unique([amcContractId,jobCardId])` on AmcServiceUsage, partial unique on (workerId, slotStart) for appointments. | 4h |
| Wed | Conditional `updateMany` for finalize + payment optimistic-lock. | 2h |
| Thu | Job-card status transition validation + cost-field lock on DELIVERED. | 3h |
| Thu | AMC ownership check on Use Service (jobCard.customerId === contract.customerId). | 1h |
| Fri | Tenant scope for `JOB_CARDS_VIEW_OWN`. | 2h |
| Fri | Worker leave: defer status flip until startDate; daily cron to revert on endDate. | 2h |
| Fri | Centralize bcrypt cost (12), unify password policy. | 1h |
| Fri | Trust `request.ip` (Vercel) for rate-limit, key login limit on adminUserId. | 1h |
| Following week | `as any` removal across all `data: body as any` sites; type with Prisma input types. | 1d |
| Following week | Discount math single-source-of-truth; unit tests for invoice totals. | 1d |
| Following week | Move admin search inputs to debounced pattern (vehicles, appointments). | 0.5d |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation / Rollback |
|---|---|---|---|
| Production `JWT_SECRET` env not set → app silently uses dev fallback | Med | Critical | Verify env in Vercel dashboard before deploy; consider env-validation `env.ts` tonight. Rollback: rotate secret + invalidate sessions. |
| Concurrent AMC contract creation collides on `count+1` despite fix | Low (if fix lands) | Med | If sequence migration fails, retry-loop in handler. Rollback: feature-flag AMC contract creation to single-writer admin. |
| New transaction wrappers cause unintended P2034 (transaction conflict) retries timing out | Med | Med | Add 3x retry on P2034 in catch. Monitor Vercel logs first hour. |
| PART line UI doesn't pass `inventoryItemId` after schema change | High if UI not updated together | High | **Ensure UI change ships with API change** — block deploy if not. |
| DELETE job-card permission change locks out existing users who relied on it | High | Med | Grant `JOB_CARDS_DELETE` to existing ADMIN/SuperAdmin role in migration seed. |
| CORS:* left in place; public booking endpoint abused | Med | Low | Acceptable for launch day; add Cloudflare WAF / Vercel firewall if seen. |
| No Sentry → blind on first-day errors | Certain | High | Tail Vercel logs live during launch window; assign one engineer to logs for the first 4 hours. |
| Customer name with `<script>` in PDF (XSS) | Low (admin must open PDF) | High | Defer to Mon; meanwhile coach team not to render PDFs for suspicious-looking customer rows. Better: ship escapeHtml tonight if time. |
| Appointment overlap fix has off-by-one on slot boundaries | Low | Med | Manual test before launch; rollback by reverting unique index migration. |

**Global rollback:** all fixes are additive (wrapping in tx, adding guards, swapping permission constants). One Vercel rollback to previous deployment reverts in <1min. Schema migrations are forward-compatible (adding constraints only) — keep `prisma migrate diff` output on hand to roll back if a unique constraint fails on existing dup data.
