---
mode: reference
updated: 2026-09-20
verified_against: 81a04bb
---

# TESTING

> **This describes the code, not the plan.** Verified on 2026-09-20 against `81a04bb`. The strategy and the wishlist live in the spec pack; this file only reports what is on disk today.

> **Method.** I read `apps/web/vitest.config.ts`, `apps/web/vitest.integration.config.ts`, `apps/web/playwright.config.ts`, `apps/web/package.json`, `.github/workflows/ci.yml`, `.github/workflows/db-backup.yml`, and every file under `apps/web/e2e/`, `apps/web/test/integration/`, `apps/web/src/__tests__/`. I found the three co-located `*.test.ts` files under `apps/web/src/lib/reports/` with `find apps/web/src -name '*.test.*' -not -path '*/node_modules/*'`. I counted assertions per file with `grep -cE '^\s*(it|test)(\.[a-z]+)?\('` and derived module coverage from `apps/web/coverage/clover.xml` (an istanbul artifact left in the tree from an earlier run). I inspected `apps/web/test/integration/global-setup.ts` and `apps/web/e2e/global-setup.ts` to establish the ephemeral-Postgres bootstrap, and read `apps/web/test/integration/setup.ts` and `apps/web/test/integration/helpers.ts` for how each spec is armed. I ran `git log --since=2026-06-01 --oneline` filtered to test paths to reconstruct the flake and coverage-push history.
>
> **What this pass did NOT do.** I did not run `pnpm --filter @gearup/web test`, `test:int` or `test:e2e`. I did not spin the ephemeral Postgres. I did not measure fresh coverage; the numbers in §5 come from a Clover XML artifact whose `<project timestamp="1781236314354"` resolves to 2026-06-12 09:21 IST, three months before this write, so treat them as historical. I did not read every assertion inside every file; per-file summaries below name the imports each spec exercises, which is a proxy for what it covers, not a guarantee.

## 1. What test surfaces exist

Three, and only three:

| Surface | Runner | Config | Files | Cases (grepped) | Env |
|---|---|---|---|---|---|
| Vitest unit | `vitest` | `apps/web/vitest.config.ts` | 13 | 146 | in-process, no DB |
| Vitest integration | `vitest --config vitest.integration.config.ts` | `apps/web/vitest.integration.config.ts` | 22 | 203 | real Postgres (ephemeral or CI service) |
| Playwright E2E | `playwright test` | `apps/web/playwright.config.ts` | 4 spec files, only 1 in the gate | 4 in the gated file, 99 across all four | seeded Postgres + `next dev` |

Files were counted with `find apps/web/src -name '*.test.ts' -o -name '*.test.tsx' \| wc -l`, `find apps/web/test/integration -name '*.itest.ts' \| wc -l`, and `ls apps/web/e2e/*.spec.ts \| wc -l`. Case counts are `grep -cE '^\s*(it|test)(\.[a-z]+)?\(' <file>` summed by surface, which is a lower bound because table-driven `it.each` blocks are counted as one written call.

**CI gate.** `.github/workflows/ci.yml` runs on `push` to `main` and on every `pull_request`. Two jobs: `check` (typecheck, lint, unit, integration, build) and `e2e` (Playwright, `needs: check`). Both must be green to merge. There is no coverage gate. See §6 for the exact steps.

## 2. Vitest unit

**Config.** `apps/web/vitest.config.ts`, nine lines. `include: ['src/**/*.test.ts', 'src/**/*.test.tsx']`, `exclude: ['e2e/**', 'node_modules/**']`. No `setupFiles`, no `globals`, no `environment` override, no coverage block. Everything runs under vitest's Node default.

**Run command.** `pnpm --filter @gearup/web test` (an alias for `vitest`, watch-mode by default) or `pnpm --filter @gearup/web test:run` (single-shot). CI uses the alias in unit-mode; see §6.

**Files and what each covers.**

| File | Cases | Under test |
|---|---|---|
| `apps/web/src/__tests__/date-boundaries.test.ts` | 7 | `getISTDayBoundaries` / `getISTRangeBoundaries` from `src/lib/date-boundaries.ts`, IST-offset math around midnight |
| `apps/web/src/__tests__/new-features.test.ts` | 22 | `formatRegNumber` from `src/lib/format-reg.ts` (bike/scooter registration formatter) |
| `apps/web/src/__tests__/pagination.test.ts` | 9 | `paginate` / `paginationMeta` from `src/lib/pagination.ts` |
| `apps/web/src/__tests__/unit/errors.test.ts` | 13 | `handleApiError`, `AppError` and subclasses, Prisma and Zod error mapping in `src/lib/errors.ts` |
| `apps/web/src/__tests__/unit/estimate-token.test.ts` | 8 | `generateEstimateToken`, `computeEstimateRevision`, TTL constants in `src/lib/estimate-token.ts` |
| `apps/web/src/__tests__/unit/format-reg.test.ts` | 7 | Extra edge cases for `formatRegNumber` + `isValidRegNumber` |
| `apps/web/src/__tests__/unit/gst-hsn.test.ts` | 23 | HSN resolution and GST rate lookup in `src/lib/gst-hsn.ts`, with `prisma` mocked at module boundary |
| `apps/web/src/__tests__/unit/id-generators.test.ts` | 9 | `generateJobCardNumber`, `generateInvoiceNumber`, `generateAppointmentRef`, `generateWorkerCode`, `generateAmcContractNumber`, `withIdCollisionRetry` |
| `apps/web/src/__tests__/unit/invoice-calc.test.ts` | 13 | `nonDiscountPreSubtotal`, `computeLineTotal`, `recomputeDiscountLineTotal` in `src/lib/invoice-calc.ts` |
| `apps/web/src/__tests__/unit/pagination.test.ts` | 9 | Second pass over pagination against `MAX_PAGE_SIZE` from `src/lib/constants.ts` |
| `apps/web/src/lib/reports/date-presets.test.ts` | 7 | IST date-range presets in `date-presets.ts`, includes a UTC-vs-IST off-by-one case at 02:00 IST |
| `apps/web/src/lib/reports/income-breakdown.test.ts` | 11 | `buildIncomeBreakdown` in `income-breakdown.ts`, ex-GST math on line-type rows |
| `apps/web/src/lib/reports/parts-profit.test.ts` | 8 | `buildPartsProfit` in `parts-profit.ts`, FIFO cost basis on the parts revenue report |

Setup files: none. Every unit test wires its own mocks in-file (see `gst-hsn.test.ts` for the `vi.mock('../../lib/prisma')` pattern).

## 3. Vitest integration

**Config.** `apps/web/vitest.integration.config.ts`, 18 lines. Key settings:

```ts
include: ['test/integration/**/*.itest.ts'],
globalSetup: ['test/integration/global-setup.ts'],
setupFiles: ['test/integration/setup.ts'],
pool: 'forks',
fileParallelism: false,
testTimeout: 30000,
hookTimeout: 60000,
resolve.alias: { '@': resolve(__dirname, 'src') },
```

Serial execution in a single fork is deliberate: every spec resets and reseeds the same DB, and parallel runs would race on primary keys.

**Ephemeral Postgres harness.** `apps/web/test/integration/global-setup.ts` resolves the test database in this order:

1. `process.env.TEST_DATABASE_URL` if set (CI passes this from a `postgres:17` service container on port 5432).
2. Otherwise, spin a brand-new local Postgres on **port 54330**, DB name **`gearup_test`**, `postgres` user with `trust` auth. The datadir is `mkdtempSync(tmpdir(), 'gearup-itest-pg-')`, initdb'd with `--locale=C -E UTF8`, started via `pg_ctl` with `fsync=off`. Binary paths probed in order: `/opt/homebrew/opt/postgresql@17/bin`, `/usr/local/opt/postgresql@17/bin`, `/usr/lib/postgresql/17/bin`, `/usr/lib/postgresql/16/bin`, then `PATH`.
3. If neither is available, the setup throws `[integration] No TEST_DATABASE_URL and no local Postgres binaries found. Set TEST_DATABASE_URL or install postgresql@17.`

**Schema seed.** After the DB is up, the setup runs `npx prisma db push --skip-generate --accept-data-loss` against it. `--accept-data-loss` is safe here because the target is either an ephemeral throwaway created milliseconds earlier or the CI service DB, never production. No `prisma/seed.ts` is invoked; each spec calls `ensureSeedAdmin` and its own `seed()` helper for the rows it needs.

**Teardown.** If this run spun Postgres locally, `pg_ctl -m immediate stop` then `rmSync(dataDir, { recursive: true, force: true })`. CI-provided DBs are left alone.

**Per-worker setup.** `apps/web/test/integration/setup.ts` (29 lines) mocks `next/headers` so route handlers see the JWT the helpers inject via `globalThis.__TEST_AUTH_TOKEN__`. It sets `DATABASE_URL`, `DIRECT_URL`, `PRISMA_DISABLE_URL_TUNING=1`, `JWT_SECRET`, `NODE_ENV=test` before `src/lib/prisma.ts` evaluates.

**Helpers.** `apps/web/test/integration/helpers.ts` (150 lines) exposes `asRole(role)` (mint a role JWT), `asRawToken(token)`, `clearAuth()`, `req(method, url, body)` (build a `NextRequest`), `invoke(handler, req, params?)` (call an app-router handler as a plain function), `ensureSeedAdmin()`, `resetDb()`, `seed()`, and the shared `prisma` client.

**Run command.** `pnpm --filter @gearup/web test:int` (calls `vitest run --config vitest.integration.config.ts`).

**Files and what each covers.** Every file imports route handlers by name (`POST as finalize`) and drives them through `invoke`.

| File | Cases | Route handlers exercised |
|---|---|---|
| `admin-mgmt.itest.ts` | 13 | admin CRUD (`settings/admins`), AMC plans, AMC contracts, contract usages |
| `auth.itest.ts` | 8 | `auth/login`, `auth/me`, `auth/change-password`, `MAX_LOGIN_ATTEMPTS` lockout |
| `catalog.itest.ts` | 11 | `inventory/catalog`, `inventory/items`, item PATCH |
| `concurrency.itest.ts` | 2 | job-card create + invoice line + finalize + payment + parts race under `Promise.all` |
| `coverage-final.itest.ts` | 9 | invoice finalize, PDF route, payments, appointments (breadth pass) |
| `coverage-final2.itest.ts` | 7 | invoice line PATCH/DELETE, AMC plan create, appointment create (second breadth pass) |
| `coverage-push.itest.ts` | 16 | admin PATCH, job-card DELETE/PATCH, public estimate POST, raw JWT paths |
| `crud-modules.itest.ts` | 13 | vehicles, inventory categories, suppliers, expenses (basic CRUD) |
| `customers.itest.ts` | 10 | customers list/create/get/patch under `asRole` and `asPermissions` |
| `deeper-routes.itest.ts` | 14 | invoices list/create, payments list, appointments create/list, invoice line item PATCH/DELETE, finalize |
| `detail-routes.itest.ts` | 15 | invoice GET/PATCH, invoice PDF, expense GET/PATCH/DELETE |
| `edge-cases.itest.ts` | 10 | invoice finalize + unfinalize, payments, AMC plans and contracts (error paths) |
| `final-push.itest.ts` | 7 | job-card list/create, AMC plan/contract, usage record + delete, invoice line add |
| `inventory.itest.ts` | 7 | inventory item create/list, stock movements, low-stock query |
| `invoices-money.itest.ts` | 6 | finalize/unfinalize with payments, AMC contract discount, money arithmetic |
| `job-card-children.itest.ts` | 5 | job-card tasks, worker assign/unassign, parts CRUD, invoice line CRUD |
| `job-cards.itest.ts` | 7 | job-card PATCH/DELETE, adding parts |
| `public-pipeline.itest.ts` | 8 | public service-requests, available-slots, customer-lookup, track (no auth) |
| `rbac-matrix.itest.ts` | 4 | forbid/allow across customers, inventory, expenses, settings, invoices with raw JWT permission slices |
| `settings-amc-reports.itest.ts` | 14 | settings GET/PATCH, admins list, holidays, business hours, AMC plans CRUD |
| `small-routes.itest.ts` | 11 | logs list/export, inventory movements, expense-category PATCH/DELETE |
| `workers-appointments.itest.ts` | 6 | worker create/patch, leave, worker assignment to job cards, appointment create |

**Known constraints.**

- The harness requires Postgres 17 or 16 on the local machine, or `TEST_DATABASE_URL` pointing at any reachable Postgres. There is no fallback to sqlite, Docker or an in-process DB.
- `execFileSync` calls `npx prisma db push` with `stdio: 'inherit'`, so the schema-push output prints straight into vitest's console every run.
- `fsync=off` is fine for throwaway data but would corrupt any real DB pointed at with `TEST_DATABASE_URL`; do not aim it at a persistent instance.
- `pool: 'forks'` with `fileParallelism: false` means the wall clock scales linearly with the number of `.itest.ts` files; a broken spec that leaves rows behind will show up as a P2002 in the next file, not the same one.

## 4. Playwright E2E

**Config.** `apps/web/playwright.config.ts`, 46 lines.

- `testDir: './e2e'`, `testMatch: ['ui-smoke.spec.ts']`. **The other three spec files in `e2e/` are on disk but not in the gate**, the comment on line 13-15 says they were written pre-restore against production and are held until refreshed.
- `timeout: 60000`, `expect.timeout: 15000`, `fullyParallel: false`.
- `retries: process.env.CI ? 1 : 0`.
- `reporter: [['list']]`, no HTML report by default.
- `globalSetup: './e2e/global-setup.ts'`, `globalTeardown: './e2e/global-teardown.ts'`.
- `use.baseURL`: `E2E_BASE_URL` if set, else `http://localhost:3100`. `use.headless: true`. `screenshot: 'only-on-failure'`. `trace: process.env.CI ? 'retain-on-failure' : 'off'`.
- `webServer.command: 'pnpm exec next dev -p 3100'`. Plain `next dev`, deliberately not the `with-root-env.mjs` wrapper, so it does not pick up production `.env`. Timeout 180000. `reuseExistingServer: !process.env.CI`.
- `webServer.env`: `DATABASE_URL` and `DIRECT_URL` both set to the ephemeral E2E URL, `JWT_SECRET` set to `e2e-test-secret-0123456789`, `PRISMA_DISABLE_URL_TUNING=1`.

**Global setup.** `apps/web/e2e/global-setup.ts` (56 lines) mirrors the integration harness but on a separate port and database:

- Port **54331** (integration is on 54330; the two harnesses do not collide).
- DB name **`gearup_e2e`**.
- Same Postgres 17/16 binary probe. Throws if none found and `E2E_DATABASE_URL` is not set.
- After the DB is up: `npx prisma db push --skip-generate --accept-data-loss`, then `npx tsx prisma/seed.ts`. Unlike the integration harness, E2E runs the full seed (five admins, four roles, all fixture inventory/customers) because the browser tests need a login that works.

**Global teardown.** `apps/web/e2e/global-teardown.ts` (12 lines), stops the ephemeral Postgres and removes the datadir.

**Browsers.** No `projects` array in the config, so Playwright's default project runs. CI installs only Chromium: `pnpm --filter @gearup/web exec playwright install --with-deps chromium`.

**Run command.** `pnpm --filter @gearup/web test:e2e` (calls `playwright test`).

**Flows in the gate (`ui-smoke.spec.ts`, 4 tests).**

1. Public landing (`/`) renders.
2. Public booking page (`/book-service`) renders a form with `book|service|name|phone`.
3. Wrong password on `/admin/login` keeps you on the login screen.
4. Authenticated admin journey: login via the real form, then hit `/admin/dashboard`, `/admin/customers`, `/admin/inventory/items`, `/admin/reports/revenue`, asserting each page's copy contains the expected keyword and does not fall back to the login page.

**Flows in the directory but excluded from the gate.**

- `admin-e2e.spec.ts` (586 lines, 58 cases): API-driven admin CRUD across every module. `const BASE = 'https://gearup.sgnk.ai'` hardcoded to production, which is why it is excluded.
- `features-e2e.spec.ts` (423 lines, 29 cases): feature matrix. `BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'` (note: port 3000, not the 3100 the config webServer boots on).
- `role-access.spec.ts` (175 lines, 8 cases): RBAC per role, browser-driven. Same `sgnk.ai` default base URL.

Ungating any of these means fixing the base-URL constant and re-running against the seeded ephemeral DB.

**Flows NOT covered by any current spec that are business-critical.**

- **Invoice finalize** in the browser. The API path is tested by `deeper-routes.itest.ts`, `edge-cases.itest.ts`, `coverage-final.itest.ts`, `invoices-money.itest.ts` and `concurrency.itest.ts` at the handler level. No spec drives the finalize button in the admin UI.
- **Payment recording** in the browser. Same story: `POST /api/admin/invoices/[id]/payments` is exercised in five integration files. The UI form for it has no coverage.
- **AMC contract activation** end to end. Integration covers `settings-amc-reports.itest.ts`, `admin-mgmt.itest.ts`, `final-push.itest.ts`. The customer-facing "purchase and activate a plan" flow is not driven by any test at any layer.
- **Job-card cascade delete.** `job-cards.itest.ts` and `coverage-push.itest.ts` cover `DELETE /api/admin/job-cards/[id]` at the handler level. Whether the cascade correctly nulls out `Invoice.jobCardId` and releases reserved parts is asserted through the API, not through the delete-confirmation modal in `/admin/job-cards`.

## 5. Coverage

**Tool.** Istanbul (`clover.xml`, `coverage-final.json`, HTML report under `apps/web/coverage/src/`). The report is checked into the working tree but is **not currently produced by any script**. `apps/web/package.json` has `test`, `test:run`, `test:int`, `test:e2e`, and none of them enable coverage. `vitest.config.ts` has no `coverage` block. No `@vitest/coverage-*` package appears in `devDependencies`.

**Numbers.** From `apps/web/coverage/clover.xml`, `<project timestamp="1781236314354">` = **2026-06-12 09:21 IST**, three months before this write. Treat these as historical, not current.

| Metric | Covered / Total | Percent |
|---|---|---|
| Statements | 1953 / 2341 | 83.42% |
| Branches (conditionals) | 953 / 1625 | 58.64% |
| Functions | 305 / 364 | 83.79% |

The commit that landed those numbers is `adefebb` (`test: backend line coverage 80.4% → 83.4% (target 82% reached)`), consistent with the 83.42% above.

**Thresholds enforced in CI.** None. `.github/workflows/ci.yml` runs `pnpm --filter @gearup/web test` (unit) and `pnpm --filter @gearup/web test:int` (integration) with no coverage flag. A regression from 83% to 40% would still merge.

**What a fresh coverage run would need.** Add `@vitest/coverage-v8` (or istanbul) to `devDependencies`, add `coverage: { provider: 'v8', reporter: ['text', 'clover', 'html'], reportsDirectory: 'coverage' }` to both vitest configs, add a `test:coverage` script, and gate CI on it. Nothing above is in place today.

## 6. CI gating

**Workflow.** `.github/workflows/ci.yml`, triggered on `push: [main]` and every `pull_request`. Concurrency group `ci-${{ github.ref }}` with `cancel-in-progress: true` (a new push to the same branch cancels the running job). One extra workflow lives in the repo: `db-backup.yml`, a nightly cron that has nothing to do with tests.

**Job `check`** on `ubuntu-latest`, `postgres:17` service on port 5432, `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gearup_test`, `JWT_SECRET=ci-placeholder-secret`. Steps:

1. `actions/checkout@v4`
2. `pnpm/action-setup@v4` (version comes from `packageManager` in `package.json`)
3. `actions/setup-node@v4` with `node-version: 20` and pnpm cache
4. `pnpm install --frozen-lockfile`
5. **Timezone lint**: `bash scripts/check-tz.sh`
6. `pnpm --filter @gearup/web exec prisma generate`
7. **Typecheck**: `pnpm --filter @gearup/web exec tsc --noEmit`
8. **Lint**: `pnpm lint`
9. **Unit tests**: `pnpm --filter @gearup/web test`
10. `pnpm --filter @gearup/web exec prisma db push --skip-generate`
11. **Integration tests**: `pnpm --filter @gearup/web test:int`
12. **Build**: `pnpm build`

**Job `e2e`** on `ubuntu-latest`, `needs: check` (does not run if `check` fails). Same OS, its own `postgres:17` service, `E2E_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gearup_e2e`, its own `JWT_SECRET`. Steps: checkout, pnpm setup, install, `prisma generate`, cache `~/.cache/ms-playwright`, `playwright install --with-deps chromium`, `prisma db push --skip-generate`, `pnpm --filter @gearup/web test:e2e`. On failure it uploads `apps/web/playwright-report/` as an artifact with 7-day retention.

**What fails a PR.** Any step above returning non-zero. In practice: a type error, a lint error, a red vitest run in unit or integration, a build failure, or a red Playwright run. Coverage does not gate. The seed running out-of-date against the migrated schema does not gate (`prisma db push` is authoritative).

**Flake history from git.** `git log --since=2026-06-01 --oneline` filtered to test paths returns 30 commits. The ones that read like flake, hotfix, or CI plumbing:

- `4c09b83 fix(test): use dynamic future Monday for available-slots test` (a time-of-week flake).
- `d153ed6 fix(ci): install eslint, add missing test scripts, fix env vars`.
- `4dba70b fix(ci): remove broken test files (pre-existing failures from mismatched imports)`.
- `857f530 fix: comprehensive IST timezone handling` (motivated the `check-tz.sh` gate on line 41 of `ci.yml`).
- `14535ef fix(ci): let pnpm/action-setup read version from packageManager field`.

The rest are feature commits with tests attached or coverage-pushes (`adefebb`, `0dbf5fd`, `6975596`, `c17920d`, `163265d`, `b66080f`, `3a000ec`, `6e5e055`). No commit in the last three months looks like a Playwright flake in `ui-smoke.spec.ts`; the E2E job was added in `8854370 test(e2e): browser UI smoke gate + Playwright CI job + pre-push e2e` and has not needed a follow-up.

## 7. Test data

**Fixtures.** There is no `apps/web/test/fixtures/` directory. Every integration and E2E test builds its data through the `seed()` helper in `apps/web/test/integration/helpers.ts` or through direct `prisma.*.create` calls. Unit tests carry inline literals (see `parts-profit.test.ts` for a documented fixture).

**Factory functions.** Live in `apps/web/test/integration/helpers.ts` (150 lines). The exported surface: `asRole`, `asRawToken`, `asPermissions`, `clearAuth`, `req`, `invoke`, `ensureSeedAdmin`, `resetDb`, `seed`, `prisma`. `asRole(role)` mints a JWT with the full `ROLE_PERMISSIONS[role]` slice from `@gearup/types`. `resetDb()` truncates every table in dependency order. `seed()` builds a minimal customer/vehicle/inventory tree that most specs then extend.

**Prisma seed vs test-specific seed.** `apps/web/prisma/seed.ts` (353 lines) seeds five named admins (`admin`, `arnab`, `priya`, `receptionist`, `mechanic`, all password `admin123`), four roles, and a workshop of customers/vehicles/inventory. It is invoked by:

- The E2E harness (`e2e/global-setup.ts` line 53).
- `pnpm --filter @gearup/web db:seed` on demand.

The integration harness **does not** run this seed; it uses `ensureSeedAdmin` (a single admin row with a fixed UUID) plus per-file `seed()`. This is why the two DBs live on different ports and different names, they hold different fixture worlds.

## 8. What is untested and why it matters

Ranked by cost of the failure it would catch, not by line count.

1. **Payment reconciliation UI.** No spec drives the payment form; a floating-point regression in the received-amount field would ship. Integration covers the handler with 5 files, none assert on rounding at the second decimal place under a mixed-currency payment.
2. **AMC contract activation end to end.** Neither the buy flow nor the "first service under active AMC" flow is driven from a browser. A discount misapplication would land silently.
3. **Job-card cascade delete.** The DELETE handler is covered; the confirmation modal is not, and neither is the post-delete state of `Invoice.jobCardId` in a rendered invoice list.
4. **Public estimate approval flow.** `coverage-push.itest.ts` calls `POST /api/public/estimate/[token]/route` once. There is no browser test for the customer clicking the emailed estimate link.
5. **Auth lockout behaviour in the UI.** `auth.itest.ts` covers `MAX_LOGIN_ATTEMPTS` at the API. `ui-smoke.spec.ts` tests one wrong password. The 6th-attempt lockout copy is unverified in the browser.
6. **The three excluded E2E specs.** `admin-e2e.spec.ts`, `features-e2e.spec.ts`, `role-access.spec.ts` sum to 1,184 lines and 95 cases. They are dead weight until the base-URL constant is fixed and they are added back to `testMatch`.
7. **`src/lib/reports/parts-profit.ts`** has a unit test with a documented fixture but no integration test that runs the raw query against a real DB with FIFO batches. The comment above the fixture says the numbers were "the verbatim output of the revenue report's parts query"; a change to that query would silently invalidate the fixture without failing anything.
8. **Timezone regressions past `check-tz.sh`.** The pre-CI script blocks new `new Date()` calls in report paths, but existing IST-handling assertions live in a small number of files. A silent shift from IST to UTC would fail `date-boundaries.test.ts` (7 cases) and nothing else.
9. **`src/app/api/public/**` breadth.** `public-pipeline.itest.ts` covers 4 of the public routes with 8 cases. Public endpoints are the ones with no auth wall, so a broken 500 there is customer-visible.
10. **Coverage tooling itself.** The stale June 12 report is the largest ambient risk on this page. Six code paths added since then are invisible to any coverage claim.

**Concrete next 10 tests, in the order they should be added.**

1. Playwright: invoice finalize from the admin UI (`/admin/invoices/[id]` → finalize button → success toast).
2. Playwright: record a partial payment against a finalized invoice, assert the outstanding-amount tile.
3. Integration: `coverage-push` style pass on `payments` route with a Decimal round-half-even edge case.
4. Playwright: AMC contract create + first-service-under-AMC discount, end to end.
5. Playwright: job-card delete with a linked invoice, assert the invoice list still renders.
6. Integration: `public/estimate/[token]` approve and reject paths (currently one POST test).
7. Playwright: 6th-attempt login lockout copy on `/admin/login`.
8. Integration: `parts-profit` against a real FIFO batch tree, comparing against the fixture in `parts-profit.test.ts` to prove the query still returns those numbers.
9. Integration: `public/available-slots` around a holiday and around DST-adjacent dates (paired with `check-tz.sh`).
10. CI: add `@vitest/coverage-v8`, wire a `test:coverage` job, publish the HTML report as an artifact, gate on a floor rather than an equality.

## 9. How to add a new test

**Unit (Vitest).**

1. Pick the source file. If it lives at `apps/web/src/lib/foo.ts`, create either `apps/web/src/__tests__/unit/foo.test.ts` (with the rest of the unit suite) or `apps/web/src/lib/foo.test.ts` (co-located, works because of the `src/**/*.test.ts` include glob).
2. Import from `vitest`: `import { describe, it, expect, vi } from 'vitest';`.
3. Mock any dependency that hits IO (`vi.mock('../lib/prisma')`), see `gst-hsn.test.ts` for the pattern.
4. Run with `pnpm --filter @gearup/web test` (watch) or `pnpm --filter @gearup/web test:run` (once).

**Integration (Vitest against real Postgres).**

1. Create `apps/web/test/integration/<name>.itest.ts`. The `.itest.ts` suffix is required by the include glob.
2. Import handlers by name: `import { POST as createFoo } from '@/app/api/admin/foos/route';`.
3. Import helpers: `import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';`.
4. In `beforeAll`, `await resetDb(); await ensureSeedAdmin(); await seed();`.
5. In each `it`, arm auth with `asRole('MANAGER')` (or a raw JWT via `asRawToken`), build a request with `req('POST', '/api/...', body)`, and drive the handler with `invoke(createFoo, request, { params: { id } })`.
6. Assert against `prisma.*.findMany` for state changes; assert on the returned `NextResponse` for status and body.
7. Run with `pnpm --filter @gearup/web test:int`. Postgres 17 must be reachable, or set `TEST_DATABASE_URL`.

**E2E (Playwright).**

1. If the new spec should gate, add it to `apps/web/e2e/` and add its filename to `testMatch` in `playwright.config.ts` (currently `['ui-smoke.spec.ts']`).
2. Use `page.goto('/admin/...')`, `page.locator(...)`, `page.getByRole(...)`. Base URL is set by the config; do not hardcode `sgnk.ai`.
3. For anything past the login screen, call the `loginViaForm` helper from `ui-smoke.spec.ts` (copy it, or extract it to `e2e/fixtures/` if a second spec starts using it).
4. Assert with `await expect(...)`. Default `expect.timeout` is 15s; do not add per-call timeouts unless the page genuinely needs longer.
5. Run with `pnpm --filter @gearup/web test:e2e`. The harness will spin an ephemeral Postgres on 54331, seed it, and start `next dev` on 3100.

## 10. Local run cheatsheet

```bash
# Unit (watch mode; drop 'test' for 'test:run' to run once and exit)
pnpm --filter @gearup/web test

# Unit, single-shot (what CI runs)
pnpm --filter @gearup/web test:run

# Integration (needs Postgres 17/16 on PATH, or TEST_DATABASE_URL)
pnpm --filter @gearup/web test:int

# End-to-end (needs Postgres 17/16, boots next dev on 3100)
pnpm --filter @gearup/web test:e2e

# Point integration at your own Postgres instead of spinning one
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/mydb \
  pnpm --filter @gearup/web test:int

# Point E2E at an already-running Next server
E2E_BASE_URL=http://localhost:3000 \
  pnpm --filter @gearup/web test:e2e

# Reseed the E2E-style database for manual poking
pnpm --filter @gearup/web db:seed

# Timezone lint (runs in CI before tests)
bash scripts/check-tz.sh
```

There is no `test:coverage` script yet. To add one see §5.

## 11. Reproducing this page

```bash
git rev-parse HEAD                                                     # 81a04bb...
find apps/web/src -name '*.test.ts' -o -name '*.test.tsx' | wc -l      # 13
find apps/web/test/integration -name '*.itest.ts' | wc -l              # 22
ls apps/web/e2e/*.spec.ts | wc -l                                      # 4
grep -cE '^\s*(it|test)(\.[a-z]+)?\(' apps/web/src/__tests__/**/*.test.ts \
  apps/web/src/lib/reports/*.test.ts | awk -F: '{s+=$2} END {print s}' # 146
grep -cE '^\s*(it|test)(\.[a-z]+)?\(' apps/web/test/integration/*.itest.ts \
  | awk -F: '{s+=$2} END {print s}'                                    # 203
grep -cE '^\s*test\(' apps/web/e2e/*.spec.ts | awk -F: '{s+=$2} END {print s}'  # 99
grep -oE '<project timestamp="[0-9]+"' apps/web/coverage/clover.xml    # 1781236314354
```
