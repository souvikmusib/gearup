# GearUp — End-to-End Audit & Test Coverage Report

**Date:** 2026-06-12 (~04:00 IST) · **HEAD at audit:** `6d16d36` → fixes shipped during audit
**Scope:** UI, components, all API operations, DB persistence, queries, transactions, live E2E lifecycle, test infrastructure.
**Method:** 3 parallel static audits + 50-step live E2E run against the real stack (local dev → production Supabase DB), all writes tagged `DUMMY-DATA-E2E`. Zero destructive operations.

---

## 1. LIVE E2E LIFECYCLE — 43 checks, every layer touched

Full chain executed against the running app + real DB, persistence verified by SQL after each step:

| # | Step | Result |
|---|---|---|
| 1 | Create customer + vehicle (dummy) | ✅ 201, persisted |
| 2 | Create job-card → auto-DRAFT invoice spawned | ✅ `INV-44S4EGL0W380` linked |
| 3 | Add task, assign worker | ✅ |
| 4 | Add part → stock **reserved** (0→1), movement row written | ✅ |
| 5 | Part auto-synced to invoice line | ✅ (subtotal included it — by design) |
| 6 | LABOR + SERVICE_CHARGE + 10% DISCOUNT lines | ✅ math exact: 1058.4 × 0.9 → ₹953 |
| 7 | AMC: dummy plan + contract → ₹0 covered line → **finalize decrements** servicesRemaining 4→3 | ✅ |
| 8 | **Unfinalize refunds** AMC service 3→4 | ✅ rollback symmetric |
| 9 | Payment partial ₹200 → `PARTIALLY_PAID`; remainder → `PAID`, due=0 | ✅ |
| 10 | Overpay attempt | ✅ rejected: "Invoice is already fully paid" |
| 11 | PDF render (8.9 KB) | ✅ |
| 12 | Expense create → category FK intact | ✅ |
| 13 | Revenue report reflects today's dummy payments (₹953 in `daily`) | ✅ persistence→reporting chain proven |
| 14 | Insufficient-stock guard (2nd reserve on qty-1 item) | ✅ correctly refused |
| 15 | Duplicate worker assignment | ❌ accepted (DB unique constraint pending `prisma db push`) |
| 16 | **Cancel job-card → reserved stock leaked** | 🔴 CONFIRMED LIVE → **FIXED + re-verified** (reserved 1→0, `RELEASED` movement logged) |

**Found-and-fixed during this audit:**
- 🔴 **P1: reservation leak on status→CANCELLED** — fixed in `job-cards/[id]/route.ts` PATCH (transactional release mirroring DELETE), verified live before/after.
- The phantom reservation it created on the real ENGINE OIL item self-cleared via the fix.

**Dummy data left in DB (all tagged, all in terminal states):**
| Entity | Identifier |
|---|---|
| Customer | `DUMMY-DATA-E2E Test Customer` / 9999900002 |
| Vehicle | `DD-99-EE-0002` |
| Job-cards ×2 | both CANCELLED (`…full lifecycle test`, `…cancel-leak demo`) |
| Invoice | `INV-44S4EGL0W380` — FINALIZED/PAID ₹953 (excludable from real revenue by customer) |
| Payments ×2 | ₹200 CASH + ₹753 UPI on that invoice |
| AMC plan + contract | `DUMMY-DATA-E2E Plan` (4/4 services after refund test… 3/4 — one consumed by re-finalize) |
| Expense | `DUMMY-DATA-E2E expense` ₹1 |
| Stock movements | RESERVED/RELEASED pair on ENGINE OIL (net zero) |

Owner can archive/ignore; totals impact: ₹953 revenue + ₹1 expense clearly labelled.

---

## 2. UI LAYER (static audit)

**Pages:** 13 routes inventoried (dashboard, customers, appointments, invoices+detail, payments, job-cards, public home/book/track/contact/estimate). **Components:** all 13 shared components used — zero dead code.

| Check | Verdict |
|---|---|
| API client 401 → login redirect; cache invalidation on mutations | ✅ |
| Double-submit guards on financial buttons (pay/finalize/booking) | ✅ all protected (disabled-state + ref lock) |
| Empty-string enum traps remaining | ✅ none (b9925e3 covered all) |
| Null-deref loading guards | ✅ detail pages guarded; ⚠ `customers/[id]`, `service-requests/[id]` assume data |
| Dashboard charts on API failure | ⚠ silently empty (no error toast) |
| Pie chart `key={i}` index-key | ⚠ minor |

## 3. DATA LAYER (static audit)

| Check | Verdict |
|---|---|
| Transactions: 15+ `$transaction` blocks — stock+invoice+AMC ops all atomic | ✅ strong |
| Decimal handling: 50+ sites, all `Number()`-wrapped | ✅ |
| Unique constraints in schema vs P2002 catches | ✅ all aligned |
| Unbounded queries | ⚠ `settings/export` loads 13 whole tables (by design, double-permission-gated) |
| N+1 | ⚠ AMC finalize loops contracts per line (fine at ≤3 lines; batch later) |
| Timezone | ⚠ IST hardcoded 3 places (`payments` filter, PDF dates, invoice `T23:59:59` ambiguity) — works for single-garage IST reality; flag for any future TZ |
| Phantom `saleType` filter in invoices route (field not in schema) | ⚠ dead code |
| Pending: unique indexes + composite indexes from audit schema | ⏳ `prisma db push` (gated, with dupe pre-check) |

## 4. TEST INFRASTRUCTURE — before vs after tonight

| Item | Before | After |
|---|---|---|
| Unit tests | 22 tests existed but **unrunnable** (vitest not installed) | ✅ vitest installed, `vitest.config.ts`, `pnpm test` → **22/22 pass in 182ms** |
| E2E specs | 1,184 lines of Playwright (admin-e2e 586, features-e2e 423, role-access 175) — never executed in CI | ⏳ runnable locally (`npx playwright test` with `E2E_BASE_URL`); CI wiring = phase 2 (needs DB fixture strategy) |
| CI gates on push/PR | **NONE** (only the backup cron) | ✅ `.github/workflows/ci.yml`: install → prisma generate → **vitest → tsc → lint → build** on every push/PR |
| Pre-commit hooks | none | ⏳ recommended (husky + lint-staged) |
| Live smoke harness | — | ✅ `/tmp/e2e_lifecycle.py` pattern proven (50 steps; candidate for `scripts/e2e-smoke.py`) |

**"No code push goes in blind" — status: from zero gates to 4 gates tonight.** A PR that breaks types, lint, build, or the 22 unit tests now fails CI.

## 5. COVERAGE MATRIX — the honest path to 100%

Current automated coverage: **unit ~5% of lib code, integration 0%, E2E 0% in CI** (Playwright exists but unwired). What 100% functional coverage requires:

| Module | Covered today (unit/E2E-spec) | NOT covered — needed test cases |
|---|---|---|
| Auth | role-access.spec (exists, unwired) | lockout after 5 fails; locked-account login; expired JWT; SESSION_STALE path; change-password wrong-old |
| Customers | admin-e2e partial | dupe-phone create; archive flow; delete-with-history guard; search edge (special chars) |
| Vehicles | admin-e2e partial | dupe registration; enum '' rejection; delete-with-jobcards guard |
| Booking public | features-e2e partial | slot capacity exhaustion; holiday/blocked-slot exclusion; rate-limit 429; PII-mismatch note; phone cooldown |
| Appointments | — | illegal status transitions; worker overlap reject; CANCELLED-not-counted capacity (known bug); reschedule overlap (known gap) |
| Job-cards | — | auto-invoice creation; SR→CONVERTED; odometer sync; **cancel releases reserves (regression test for tonight's P1 fix)**; delete guards (delivered/finalized/paid) |
| Inventory | — | reserve/consume/release lifecycle; oversell guard; negative-stock prevention; low-stock threshold; SKU dupe 409 |
| Invoices | unit (rounding, words, SERVICE_CHARGE) | line add/edit/remove recompute; % vs flat discount; discount+tax ordering; finalize-empty guard; unfinalize-after-payment guard |
| Payments | — | partial→full transitions; overpay reject; concurrent payment race (optimistic-lock); DRAFT reject |
| AMC | — | covered-line requires ACTIVE+remaining; finalize decrement / unfinalize refund (proven manually tonight — codify); plan purchase → contract creation on payment; expiry |
| Workers | — | leave overlap reject; INACTIVE-with-open-jobs guard; ON_LEAVE window (known gap — no cron) |
| Expenses | — | category FK; date filters |
| Reports | — | revenue math vs fixtures (daily/byType/byWorker); date-range boundaries (IST midnight!) |
| Settings/RBAC | role-access.spec | last-admin guards; export redaction; business-hours overlap reject |
| PDF | — | renders with 0 lines / 12 lines / long names; XSS payload escaped |

**Estimated effort to 100% functional coverage:** ~120–150 test cases. Recommended order:
1. **Week 1:** regression tests for every bug found this week (validator '' x13, SESSION_STALE, reservation leak, expenses FK, revenue fields) — these are the proven failure modes. ~25 cases.
2. **Week 2:** financial core (invoices/payments/AMC) integration suite against a disposable Postgres (docker) — ~40 cases.
3. **Week 3:** wire the existing 1,184-line Playwright suite into CI with a seeded test DB; booking + RBAC paths. ~40 cases.
4. Then enable coverage reporting (`vitest --coverage`) with a ratchet (fail CI if % drops).

## 6. SHIPPED DURING THIS AUDIT

| Commit | What |
|---|---|
| (tonight, earlier) `072a219` | Revenue report: 4 missing datasets |
| (tonight, earlier) `6d16d36` | SESSION_STALE 401 mapping |
| **this commit** | P1 reservation-release on cancel + vitest wiring + CI pipeline + this report |

## 7. KNOWN-REMAINING (priority order)

1. `prisma db push` for unique/composite indexes (gated; blocks dup-assign hole #15)
2. Appointment capacity counts CANCELLED (1-line); reschedule overlap re-check
3. Admin dupe guards (phone/reg); `archivedAt` semantics decision
4. Worker ON_LEAVE auto-flip (needs cron); AMC finalize N+1 batch; timezone centralization; `saleType` dead code removal
5. Playwright-in-CI (phase 2 of test plan)

---

## 8. TEST COVERAGE — built this session (update)

Went from **0 runnable tests** to a real, CI-gated suite.

### Numbers
| Suite | Tests | Runtime | What it exercises |
|---|---|---|---|
| Unit (`pnpm test`) | **74** | ~0.3s | invoice-calc (discount/tax math), estimate-token (hash/pinning), pagination, id-collision-retry, **errors→SESSION_STALE mapping**, format/words/IST |
| Integration (`pnpm test:int`) | **44** | ~6s | Real ephemeral Postgres; route handlers invoked directly with minted JWT |
| **Total** | **118** | | |

Backend coverage (admin API routes + business libs) measured via the integration run: **~25% lines / 26% functions** — concentrated on the **critical paths**: money (invoice line math, discount %/flat, payments partial→full→overpay, AMC decrement/refund), auth (login, lockout, change-password, /me), job-cards (auto-invoice, **cancel-releases-reservation P1 regression**, delete guards), inventory (stock in/out, SKU dupe, low-stock), workers (leave overlap, INACTIVE guard), appointments (slot validation). Pure business libs are near-100% via unit tests.

### The harness (so anyone can add tests)
- `test/integration/global-setup.ts` — spins a throwaway PG17 (or uses CI's `TEST_DATABASE_URL`), runs `prisma db push` for the exact live schema. **Real DB, never mocked Prisma** — raw SQL, transactions, Decimal, P2002 all genuinely exercised.
- `test/integration/setup.ts` — mocks `next/headers` so handlers read a test-injected JWT.
- `test/integration/helpers.ts` — `asRole()/asPermissions()`, `req()/invoke()`, `seed.*`, `resetDb()`.
- Adding a route test is now ~10 lines.

### CI gate (was: none)
`.github/workflows/ci.yml` runs on every push/PR: install → prisma generate → **unit → integration (Postgres service) → typecheck → lint → build**. A regression in any covered path now fails CI. **No push goes in blind anymore.**

### Regression tests locking in this week's fixes
- empty-string priority enum (b9925e3) — job-cards accepts `priority:''`
- SESSION_STALE 401 mapping (6d16d36) — errors unit test
- reservation leak on cancel (31a831d) — job-cards integration test, asserts reserved→0 + RELEASED movement
- discount math 600−10%=540 — both unit and integration
- payment overpay/draft guards, AMC decrement/refund symmetry

### Remaining to 100% (honest)
~25% backend today → the gap is the **breadth** of CRUD list/detail/patch/delete on every module + settings/reports/notifications/expenses-categories + the public booking pipeline + frontend pages (Playwright, phase 2). The roadmap in §5 still holds; each module now needs its remaining ~6–10 cases written against the existing harness, plus the 1,184-line Playwright suite wired into CI with a seeded DB. Estimated ~90 more cases to reach ~90%+ line coverage on the backend; frontend needs the Playwright-in-CI phase.

**Add a coverage ratchet** once we cross 80%: `vitest --coverage --coverage.thresholds.lines=<current>` in CI so the number can only go up.
