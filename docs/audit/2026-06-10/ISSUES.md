# ISSUES.md — All Findings Across 10 Module Audits

Counts: **180 findings** — **12 verified P0 go-live blockers**, **~45 P1**, **~70 P2**, **~53 P3**.

---

## P0 — VERIFIED GO-LIVE BLOCKERS

### Security / Auth

| ID | Title | Module | File:Line | Impact | Fix |
|---|---|---|---|---|---|
| `jobcard-delete-wrong-permission` | DELETE /job-cards gated by `JOB_CARDS_CREATE` not a destructive perm | Job-cards | `apps/web/src/app/api/admin/job-cards/[id]/route.ts:38` | Any creator can wipe any job card + invoices + payments. No ownership/status check. | Add `PERMISSIONS.JOB_CARDS_DELETE`; reject if status=DELIVERED or paid invoices exist. |

### Data Integrity / Race Conditions

| ID | Title | Module | File:Line | Impact | Fix |
|---|---|---|---|---|---|
| `jobcard-create-no-transaction` | POST /job-cards: 4 writes (jobCard + serviceRequest + vehicle + invoice) with no `$transaction` | Job-cards | `apps/web/src/app/api/admin/job-cards/route.ts:46-53` | Invoice failure leaves orphan job-card without DRAFT invoice; whole billing flow assumes the pair. | Wrap all four in `prisma.$transaction(async tx => ...)`. |
| `line-items-no-transaction` | Invoice line-item POST/PATCH/DELETE: stock + AMC + line + totals + jobCard sync all OUTSIDE any tx | Invoices | `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:25-114` | Stock can drift, AMC services burnt with no line, totals incorrect, no compensation on failure. | Wrap full handler bodies in `prisma.$transaction`, pass tx through helpers. |
| `amc-services-decremented-on-draft` | Adding AMC line to DRAFT invoice permanently burns a prepaid service | Invoices/AMC | `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:47-56` | Delete line / never finalize → customer loses service forever. Concurrent adds double-decrement. | Defer decrement to finalize/full-payment. Use conditional updateMany guard. Add rollback in DELETE. |
| `part-invoice-sync-outside-tx` | Add-part stock tx commits before invoice sync writes | Job-cards | `apps/web/src/app/api/admin/job-cards/[id]/parts/route.ts:62-81` | Stock reserved + part row exist; invoice line/totals can fail leaving permanent drift; concurrent grandTotal race. | Move invoice sync inside the same `prisma.$transaction`. |
| `part-stock-matched-by-name` | PART line decrements inventory via `findFirst({where:{itemName: description}})` | Invoices | `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:77-91` | Typo/duplicate name → wrong item decremented or silent miss; no `quantityInStock >= qty` guard → negative stock. | Require `inventoryItemId` in body; use `updateMany` with `gte` guard. |
| `amc-contract-number-race` (invoices/payments) | Payment-on-full creates AmcContract with `AMC-${count+1}` inside tx | Invoices/AMC | `apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:74-77` | READ COMMITTED → two concurrent payments collide on unique `contractNumber`, rolling back entire payment tx. | Use cuid+prefix or Postgres sequence; never derive monotonic ids from count(). |
| `customer-delete-toctou` | DELETE /customers counts outside tx; `Vehicle.customerId` cascades anyway | Customers | `apps/web/src/app/api/admin/customers/[id]/route.ts:38-48` | Vehicles inserted mid-delete are silently destroyed by cascade; guard is theatre. | Wrap in `$transaction`, re-count inside, remove cascade or make explicit. |
| `appointment-no-double-booking-guard` | POST /appointments has no overlap/leave/capacity check | Appointments | `apps/web/src/app/api/admin/appointments/route.ts:39-49` | Same worker double-booked, or booked on approved leave. | Pre-query overlap + WorkerLeave + AppointmentSlotRule inside serializable tx; add partial unique index on (workerId, slotStart). |
| `jobcard-delete-no-transaction` | DELETE /job-cards cascades 5+ tables without tx, no stock release on parts | Job-cards | `apps/web/src/app/api/admin/job-cards/[id]/route.ts:36-54` | Mid-failure orphans; reserved stock never released; silent inventory corruption. | Wrap in `$transaction`; iterate JobCardPart and call adjustStock RELEASED before delete. |
| `amc-contract-number-race` (AMC module) | Same `count()+1` race in standalone AMC contract creation | AMC | `apps/web/src/app/api/admin/amc/contracts/route.ts:55-56` | Concurrent POSTs collide on unique contractNumber → 500. | Postgres sequence or NumberSequence row-lock. |
| `amc-use-service-no-row-lock` | AMC Use Service: read servicesRemaining → decrement, no row lock | AMC | `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts:57-77` | Two concurrent uses → servicesRemaining=-1, extra free service. | Conditional `updateMany({where:{servicesRemaining:{gt:0},status:'ACTIVE'},...})` and assert count=1. |

---

## P0 — UNVERIFIED / DOWNGRADED BY VERIFIER

| Original ID | Claim | Verifier Verdict | Notes |
|---|---|---|---|
| `cors-wildcard-on-authed-api` | CORS:* on every API route | **Real, downgraded to P1** | Exploitation needs token theft first (Auth header not auto-attached). Still fix pre-launch. |
| `in-memory-rate-limiter-broken-on-serverless` | Per-instance Map breaks on Vercel | **Real, downgraded to P1** | Genuine brute-force amplifier but login lockout provides some defense. |
| `amc-contract-number-race` (AMC) | Race on contractNumber | **Real, downgraded to P1** | Admin-only, unique constraint prevents silent dupes — fails with confusing 500. |
| `amc-use-service-no-row-lock` | Read-then-decrement race | **Real, downgraded to P1** | Insider/double-click only, but real corruption (negative count). |
| `jobcard-delete-no-transaction` | No tx on cascade | **Real, downgraded to P1** | Admin-only, infrequent path, but stock corruption is real. |
| `job-card-invoice-no-db-unique` | App-level "one invoice per JC" race | **Real, downgraded to P1** | Narrow race window, recoverable manually. |

> Verifier was conservative on access-gated insider races. Treat the downgrades as "fix this week, monitor tonight" rather than dismiss.

---

## P1 — Ship Within a Week

### Security
- `token-in-localstorage-xss` — JWT in localStorage; any XSS = full takeover. **Fix:** move to httpOnly Secure SameSite=Strict cookie.
- `x-forwarded-for-spoof` — XFF trusted blindly. **Fix:** use Vercel `request.ip`.
- `dev-jwt-fallback-and-no-env-validation` — Public fallback secret in non-prod NODE_ENV. **Fix:** zod env validation at boot.
- `pdf-html-xss` — Customer name / description interpolated into PDF HTML unsanitized. **Fix:** `escapeHtml()` helper on every `${...}`.
- `cors-wildcard-on-authed-api` — see above.
- `in-memory-rate-limiter-broken-on-serverless` — Upstash/Vercel KV ratelimit.

### Data Integrity
- `vehicle-reg-not-unique` — Schema lacks `@unique` on `Vehicle.registrationNumber`.
- `amc-contract-duplicate-active` — No partial unique on (vehicleId, status=ACTIVE).
- `customer-delete-missing-amc-check` — Precheck omits AmcContract.
- `vehicle-delete-toctou` — Same TOCTOU pattern as customer delete.
- `vehicletype-enum-mismatch` — Vehicle vs AmcPlan enums diverge (BIKE vs SCOOTY).
- `amc-usage-no-ownership-check` — Usage POST doesn't verify jobCard belongs to contract's vehicle/customer.
- `amc-usage-no-job-card-dedup` — No `@@unique([amcContractId,jobCardId])`.
- `item-create-no-stock-movement` — Opening stock not logged to ledger.
- `item-delete-non-transactional` — `deleteMany(stockMovements) + delete(item)` outside tx.
- `stock-prev-qty-race` — `previousQuantity = newQty - delta` after second read can be wrong under concurrency.
- `part-patch-allows-setting-consumed-without-stock-move` — consumedQty grows but reservedQuantity never released.
- `part-delete-double-release` — releaseQty fallback can over-release when consumedQty>0.
- `part-post-race-double-add-no-unique` — No `@@unique([jobCardId,inventoryItemId])`.

### Auth / Business Logic
- `no-admin-self-lockout-guard` — Can demote/disable self or last super-admin.
- `jobcard-patch-status-no-transition-validation` — Any string accepted as status.
- `jobcard-patch-cost-fields-can-edit-when-locked` — Can rewrite finalTotal on delivered paid job.
- `worker-patch-status-self-assigned` — Setting INACTIVE leaves open assignments orphaned.
- `worker-leave-approval-sets-status-blindly` — Future leave flips status today, never reverts.
- `appointment-list-date-filter-equality` — DateTime equality filter never matches day-view UI.
- `finalize-no-conditional-update` — Read-then-write double-finalize race.
- `payment-double-update-window` — Second invoice update can clobber concurrent payment.
- `discount-calc-inconsistent` — Discount base differs between create vs add-line endpoints.
- `amc-use-service-job-card-id-prompt` — UI asks operator to paste cuid by hand.
- `missing-activity-log` — Many mutating routes (AMC contract/plan, vehicle PATCH, usage POST/DELETE) don't log.
- `sentry-empty` / `sentry-not-initialized` — No error reporting in production (referenced by ALL 10 reports).
- `auth-bearer-only-no-cookie` — Bearer-only; document the contract.
- `jobcard-routes-no-rate-limit` → P2 but worth mentioning.

---

## P2 — Quality

### Validation
- `mass-assignment-as-any` — `data: body as any` across customers, vehicles, AMC plans/contracts, job-cards, workers, invoices, inventory. Pervasive.
- `appointment-no-validation-end-after-start` — slotEnd can be < slotStart.
- `appointment-patch-cancel-no-reason-required` — CANCELLED with no reason.
- `worker-leave-overlap-not-checked` — Overlapping APPROVED leaves accepted.
- `jobcard-tasks-no-status-enum` — Task.status is free-form string.
- `vehicle-customerid-no-ownership` — No `.min(1)` on customerId.
- `supplier-email-no-format` — No email/phone format validation.
- `line-item-input-validation-thin` — Negative quantities/prices accepted on invoice create.
- `payment-amount-zero-allowed` — Records ₹0 payments.

### Performance
- `unbounded-page-size` — No max pageSize on items/movements/invoices/payments.
- `pagination-no-max-cap` — Centralize cap in `lib/pagination`.
- `low-stock-in-memory-filter` — Fetch-all-then-filter pattern.
- `amc-on-paid-n+1` — Sequential awaits in tx for AMC plan activation.
- `workers-calendar-take-200-no-pagination` — Hardcoded take:200 silently truncates.
- `jobcard-search-customer-no-index` — `contains insensitive` on every keystroke, no pg_trgm.
- `customer-detail-include-explosion` — 4-deep relational include on vehicle detail.

### UX
- `items-create-no-saving-guard` — Double-submit duplicate SKU silent 409.
- `appointment-page-load-not-paged-on-filter` — Page not reset to 1 on filter change.
- `jobcard-detail-no-disable-on-save` — Double-click duplicate tasks/assignments.
- `jobcard-detail-window-confirm` — `window.confirm` for destructive delete with payments.
- `category-supplier-delete-no-fk-guard` — Confusing P2003 message; need guarded count.
- `customer-detail-double-button` — `justify-between` flex with 3 children breaks layout.
- `vehicles-search-no-debounce` — Hits API on every keystroke.
- `movements-page-no-pagination-ui` — UI ignores paginationMeta.

### Business Logic
- `amc-cancel-no-status-check` — Cancelling cancelled/expired silently; no refund.
- `amc-end-date-month-overflow` — JS month-add overflow on EOM dates.
- `amc-contract-startdate-validation` — `z.string()` accepts garbage dates.
- `amc-contract-delete-cascades-usage` — Wipes paid contract + usage with one click.
- `amc-usage-delete-no-status-guard` — Can increment servicesRemaining beyond total.
- `invoice-update-strict-but-no-finalized-guard` — Discount mutable on FINALIZED.
- `counter-sale-vehicleid-missing` — AMC plan purchase on counter sale may FK-violate.
- `recalc-totals-loses-discount` — Header + line discounts double-counted.
- `delete-ignores-reserved-quantity` — Item delete ignores reservedQuantity.

### Auth / Observability
- `no-csrf-on-changepassword-and-mutations` — Coupled to localStorage decision.
- `permissions-not-rechecked-on-me` — Permissions baked in JWT for 24h.
- `auth-context-cached-user-stale-permissions` — UI trusts cached user for first render.
- `change-password-no-revoke-other-sessions` — No tokenVersion bump.
- `bcrypt-cost-inconsistent` — 10 vs 12.
- `login-leaks-stack-in-server-log` — Logs full stack on every bad login.
- `activitylog-floating-promise` — Fire-and-forget can drop audit entries on serverless.
- `jobcard-no-tenant-scope` — `VIEW_OWN` permission not actually scoped in queries.
- `appointment-patch-status-no-enum` — Free-form status string.
- `line-items-no-ownership-check` — `findUnique` with extra fields, defense-in-depth.

---

## P3 — Nits

- `me-handler-throws-on-deleted-user` — 404 on deleted user instead of 401.
- `login-username-enumeration-timing` — Bcrypt timing leaks valid IDs.
- `login-no-account-id-rate-limit` — DoS via distributed brute force.
- `login-form-no-double-submit-guard` — Double-tap inflates failedLoginAttempts.
- `errors-prisma-p2003-leaks-field-name` — Internal column names leak.
- `change-password-no-strength-check` — No complexity, no breach check.
- `options-skips-rate-limit-and-auth` — Returns 204 with wildcard CORS.
- `no-logout-endpoint` — Logout is client-only.
- `auth-roles-cast-as-any` — Defeats Prisma types.
- `plan-coveredItems-z-any` — Arbitrary JSON accepted.
- `customer-email-validator-quirk` — Null vs '' fragility.
- `vehicles-search-no-debounce` (moved to P2 list above)
- `amc-contracts-list-no-search` — Only status filter.
- `customer-detail-double-button` (P2 list)
- `empty-string-jobcardid-bypass` — serviceDate accepts garbage.
- `history-route-no-pagination` — Hardcoded 50.
- `plan-delete-no-block-active-contract` — Once contracted, never deletable.
- `no-rate-limit-public-vector` — Admin-side.
- `worker-assignment-duplicate-no-unique` — Same worker assigned twice.
- `appointment-patch-status-no-enum` (P2 list)
- `sku-no-format-no-duplicate-handling-ux` — Modal stays open on dupe SKU.
- `logactivity-not-awaited` — Unhandled rejection risk.
- `stock-zero-allowed-via-decimal` — Sub-cent rounding.
- `items-list-where-spread-untyped` — Misspelled keys widen results.
- `createdat-filter-missing` — No date range on movements.
- `supplier-delete-no-detach-items` — Generic 400 with no UI feedback.
- `items-page-categoryid-not-validated` — No `.min(1)`.
- `dead-unique-error-handler` — P2002 fallback never fires.
- `activity-log-fire-and-forget` — Repeated across modules.
- `ui-add-line-no-await-block` — removeLine has no error rollback.
- `counter-sale-button-overlap` — 3-child justify-between layout bug.
- `line-item-amc-plan-without-contract` — `referenceItemId` overloaded across types.
- `jobcard-id-generator-collision-risk` — No retry on P2002.
- `jobcard-list-status-filter-uses-db-values` — DB enum exposed in filter; QUALITY_CHECK invisible.
- `jobcard-page-active-count-from-current-page-only` — Counts current page only.
