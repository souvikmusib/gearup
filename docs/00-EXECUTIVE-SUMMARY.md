---
mode: reference
updated: 2026-09-20
verified_against: bb1ba1c
---

# Executive summary

> **This describes the code, not the plan.** Verified on 2026-09-20 against
> `bb1ba1ca8fa20d3c0fac2cb9b5cecf5803aea88f`. The intended architecture in
> `docs/architecture.md` and the intended deployment in `docs/deployment.md`
> are, in places, out of date with the working tree (the API sits inside the
> Next.js app on Vercel, not in a sibling `apps/api` Express service on
> Render). Where this document and those documents disagree, this document
> reflects what the code does now. The forthcoming numbered spec set
> (`docs/00-` through `docs/17-`) will restate the current design and retire
> the stale prose.

> **Method.** I read `README.md`, `pnpm-workspace.yaml`, `package.json`,
> `apps/web/package.json`, `apps/web/vercel.json`, `docs/architecture.md`,
> `docs/deployment.md`, `docs/env.md` and the top of `docs/CODEBASE_CONTEXT.md`.
> I re-derived every load-bearing number in this file from a command against
> the working tree at `bb1ba1c`: file counts by
> `find apps/web/src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l`;
> route counts by `find apps/web/src/app/api -name route.ts | wc -l`; page
> counts by `find apps/web/src/app -name page.tsx | wc -l`; Prisma model count
> by `grep -c '^model ' apps/web/prisma/schema.prisma`; schema length by
> `wc -l apps/web/prisma/schema.prisma`; test count by
> `find apps/web -name '*.test.*' -o -name '*.spec.*' | grep -v node_modules | wc -l`;
> engineering days by `git log --format='%ad' --date=short | sort -u | wc -l`;
> author breakdown by `git log --format='%an' | sort | uniq -c`; total commits
> by `git rev-list --count HEAD`; PR numbers by
> `git log --oneline main | grep -oE '#[0-9]+' | head -30`; on-disk sizes by
> `du -sh apps packages docs`; and lines of source by
> `find apps/web/src -type f \( -name '*.ts' -o -name '*.tsx' \) -exec wc -l {} + | tail -1`.
> I also opened `apps/web/prisma/schema.prisma` far enough to list the model
> names and looked at the child directories under `apps/web/src/app/api/admin`
> and `apps/web/src/app/api/public`.

> **What this pass did NOT do.** It did not run `pnpm install`, `pnpm build`,
> `pnpm lint`, `pnpm test`, `pnpm test:int` or `pnpm test:e2e`, so the current
> pass, fail and lint counts against `bb1ba1c` are not stated here (the task
> forbids `pnpm install`, and none of the workspace binaries resolve without
> it in this sandbox). It did not connect to Supabase, did not read any `.env`
> file, did not query Vercel or Sentry, and did not read the two multi-megabyte
> HTML mockups under `docs/`. It did not audit RBAC coverage against
> `packages/types`, did not read all 1,060 lines of `prisma/schema.prisma`, and
> did not open the 60+ individual `route.ts` handlers. It did not verify the
> deployment surface against the actual Vercel project (`.vercel/project.json`
> is not committed and no `apps/web/.vercel/` exists in the tree), so the
> Vercel project id is not stated. It did not read PR bodies for #60 through
> #79; the PR list here is derived from merge commit messages on `main` only.

## 1. What this is

GearUp is a vehicle-servicing management system for an automobile workshop.
It is one working application: a public-facing service request and appointment
booking flow, and an admin console that runs the shop end to end. The admin
console covers customers and their vehicles, appointments and job cards,
worker assignments and leave, parts inventory with batch tracking and FIFO
consumption, invoices with GST and line-item pricing, estimates that convert
into job cards and invoices, expenses, salary slips, an AMC (annual
maintenance contract) product, HSN rate tables, activity logs, and reports.
The public tracking page lets a customer follow a job by token without
signing in. The workshop this is built for runs the software as its
operational system of record, not a supplement to one.

## 2. Stack (derived from `package.json`, `apps/web/package.json`, `pnpm-workspace.yaml`, `apps/web/vercel.json`)

**Runtime and framework.** Next.js 14.2.x (App Router) on Node 20 or newer.
Every API endpoint is a Next.js Route Handler under `apps/web/src/app/api/`;
there is no separate Express service in the working tree, and the
`apps/api` directory referenced in `docs/architecture.md` and
`docs/deployment.md` does not exist here. React 18.3, TypeScript 5.4.

**Data.** PostgreSQL hosted on Supabase, accessed through Prisma 5.14 (the
`@prisma/client` version in `apps/web/package.json`; `pnpm-lock.yaml` may
resolve a higher patch). Schema at `apps/web/prisma/schema.prisma` is 1,060
lines and defines 42 models. Storage buckets are named in the deployment
guide (Supabase Storage), but no Supabase Storage calls were audited in
this pass.

**Auth and access control.** Custom JWT (`jsonwebtoken` 9.0.2) with
bcrypt-hashed passwords (`bcryptjs` 2.4.3). Five roles per
`docs/rbac.md`: SUPER_ADMIN, ADMIN, SERVICE_MANAGER, WORKER, BILLING.
Permissions live in the shared `@gearup/types` workspace package.

**UI.** Tailwind CSS 3.4, `lucide-react` for icons, `recharts` 2.15 for
report charts, `gsap` 3.15 for motion, `three` 0.184 for 3D pieces,
FullCalendar 6.1.15 (`@fullcalendar/*`) for the appointment calendar.
`@vercel/analytics` and `@vercel/speed-insights` are wired in.

**Validation and utilities.** `zod` 3.23 for request validation, `nanoid`
3.3 for short ids, `dotenv` 16.6 for local env loading.

**Observability.** `@sentry/nextjs` 8.x. No Sentry DSNs are quoted here.

**Tests.** `vitest` 4.1 (unit and integration configs) and
`@playwright/test` 1.59 (E2E). No CI file was found in the tree during this
pass (see §5 caveats).

**Monorepo.** pnpm 9.6 workspaces + Turborepo 2.1 (`turbo.json` at root,
`pnpm-workspace.yaml` covers `apps/*` and `packages/*`). Root scripts
delegate to Turbo (`dev`, `build`, `lint`, `db:generate`, `db:push`,
`db:migrate`, `db:seed`). Prettier 3.2 and Husky 9.1 are dev-only.

**Deploy target.** `apps/web/vercel.json` pins `regions: ["hnd1"]` (Tokyo)
and sets `maxDuration: 30` seconds for every `app/api/**/*.ts` function.

## 3. Repo shape

Numbers below are from the commands named in the Method block, run against
`bb1ba1c` on 2026-09-20.

**Source tree.**

- `apps/web/src`: **216 TypeScript / TSX files**, **25,619 lines**.
- Route handlers (`route.ts` under `apps/web/src/app/api`): **83**.
- Page components (`page.tsx` under `apps/web/src/app`): **64**.
- Prisma models in `apps/web/prisma/schema.prisma`: **42**.
- Test files (`*.test.*` / `*.spec.*`, excluding `node_modules`): **17**
  (10 unit / integration files under `apps/web/src/**/__tests__` and
  `apps/web/src/lib/reports/*.test.ts`, 7 Playwright and setup files under
  `apps/web/e2e/`). The Playwright run is gated on a running server and
  seed data, so the count of executable specs is smaller than the file
  count.

**Language mix, `apps/` plus `packages/` (excluding `node_modules` and
`.next`).**

| Extension | Files |
|---|---:|
| `.ts` | 225 |
| `.tsx` | 95 |
| `.js` | 51 |
| `.json` | 19 |
| `.mjs` | 3 |
| `.css` | 3 |
| `.prisma` | 1 |

**On-disk size (working tree, excluding `node_modules`, `.next`, and the
untracked Chrome-cache artifact and `apps/web/output/`).**

- `apps/`: **9.2 MB**
- `packages/`: **128 KB**
- `docs/`: **1.9 MB**

**Workspaces.** One app (`apps/web`) and six packages
(`packages/config`, `packages/db`, `packages/notifications`,
`packages/tsconfig`, `packages/types`, `packages/ui`). `packages/db` is
present but the runtime Prisma client is instantiated inside `apps/web`;
the boundary between `packages/db` and `apps/web/src/lib` was not audited
in this pass.

**Prisma models (all 42).** AdminUser, Role, Permission, AdminUserRole,
RolePermission, Customer, Vehicle, ServiceRequest, Appointment,
AppointmentSlotRule, BlockedSlot, Holiday, Worker, WorkerLeave, JobCard,
WorkerAssignment, JobCardTask, JobCardPart, InventoryCategory, Supplier,
InventoryItem, StockMovement, StockBatch, Invoice, InvoiceLineItem, Payment,
ExpenseCategory, Expense, NotificationTemplate, Notification, ActivityLog,
Setting, AmcPlan, AmcContract, AmcServiceUsage, DocumentSequence,
VehicleBrand, VehicleModel, InventoryItemModel, HsnRate, Estimate,
EstimateItem.

**API surface (top level under `apps/web/src/app/api`).** Three sub-trees:
`admin/`, `public/`, `health/`. Under `admin/` there are 19 domain
directories (`amc`, `appointments`, `auth`, `customers`, `estimates`,
`expenses`, `hsn-rates`, `inventory`, `invoices`, `job-cards`, `logs`,
`notifications`, `payments`, `reports`, `salary-slips`, `service-requests`,
`settings`, `vehicles`, `workers`). Under `public/` the tracked handlers
include service request submission, customer lookup, available appointment
slots, tracking-by-token, and the estimate-by-token view.

## 4. Deployment surface

**Platform.** Vercel, single Next.js project at repo root building
`apps/web`. Region pin: `hnd1` (Tokyo). Function timeout: 30 seconds on
every API handler.

**Vercel project id.** Not inferable from the working tree in this pass.
There is no `.vercel/project.json` committed and no `apps/web/.vercel/`
directory. Sagnik or a maintainer should fill this in from the Vercel
dashboard when the numbered spec set lands.

**Custom domain and environments.** Not derivable from the tree alone;
the dev, preview and production URLs, and the environment variables
required at each stage, live in Vercel's project settings and in
`docs/env.md`. `docs/env.md` still lists an `apps/api` backend section
that no longer exists in the tree, so treat it as partially stale.

**Database.** Supabase Postgres. Connection is read from `DATABASE_URL`
via the `apps/web/scripts/with-root-env.mjs` wrapper (every `dev`,
`build`, `db:*` script runs through it), so the source of the value at
runtime is a single root `.env` file rather than per-app envs.

**Observability.** `@sentry/nextjs` present in dependencies; DSN values
were not read in this pass.

**Notifications.** `docs/notifications.md` documents a queued
`Notification` table plus WhatsApp / Email providers and a set of cron
jobs. The `Notification` model exists in the schema and admin routes for
`notifications` and `service-requests` exist under
`apps/web/src/app/api/admin/`; the actual cron scheduler and provider
adapters were not exercised in this pass.

## 5. Current health

**What I did not run, and why.** The task forbids `pnpm install`. Without
it, the workspace binaries `next`, `prisma`, `vitest`, `playwright`,
`eslint` and `tsc` do not resolve, so `pnpm build`, `pnpm lint`,
`pnpm test`, `pnpm test:int` and `pnpm test:e2e` were not run. The
counts below are therefore file counts and script definitions, not
observed pass or fail numbers.

**What exists as a script (in `apps/web/package.json`).** `dev`, `build`
(runs `prisma generate` then `next build`), `start`, `lint` (`next lint`),
`db:generate`, `db:push`, `db:migrate`, `db:seed`, `postinstall`
(`prisma generate`), `test` (`vitest`), `test:run` (`vitest run`),
`test:int` (`vitest run --config vitest.integration.config.ts`), `test:e2e`
(`playwright test`).

**CI.** No `.github/workflows/` directory was observed in the working tree
in this pass. If gates run in CI they should be re-verified against the
current Vercel and GitHub configuration; if they do not, that is worth
naming in the numbered spec set.

**Health endpoint.** `apps/web/src/app/api/health/route.ts` exists.

**Recent green.** The most recent commit on `main` is a merge of
PR #79 (`bb1ba1c`, 2026-09-16) landing an invoice line-item pricing fix
on top of PR #78 (estimates), so `main` was accepting merges as of that
date. Whether every gate was green at merge time was not re-verified in
this pass.

## 6. Recent work themes (last 30 commits on `main`)

Categorized from `git log --oneline main | head -30`. Every theme below
maps to at least one merged PR from the range #67 through #79.

- **Estimates (new feature area).** Create, view, print, delete an
  estimate; add parts with quantity and price before adding to the
  estimate; edit-mode; sidebar navigation; convert to job card and to
  invoice; new print template with a GST breakdown; catalog brand and
  model UI on the picker; print-page dark-mode bleed fix. Covers PRs
  #77 and #78 and several intermediate commits.
- **Invoice pricing correctness.** Use inventory item price for invoice
  lines (not the batch price) after the batch selling-price feature
  changed behavior; use batch MRP as `unitPrice` instead of a discounted
  `sellingPrice`; already-added part indicator in the picker; blank
  "estimated delivery" field on invoice print copies. Covers PRs #71,
  #75, #76, #79.
- **Stock and batch tracking.** Stock batch tracking with FIFO
  consumption; batch-wise selling price that splits invoice lines by
  batch price on FIFO. Covers PRs #69 and #70.
- **Salary slips.** Create, edit and delete salary slips with PDF
  generation. PR #72.
- **Reports.** Parts gross-profit column and income-composition on the
  revenue report; keep the list search input mounted while results
  reload. PR #73.
- **RBAC hardening.** Hide cost / purchase price from non-super-admin
  users. PR #68.
- **Inventory behavior.** Inventory delete-behavior fix. PR #67.
- **Test resilience.** Two commits switched a Playwright test off a
  hardcoded Monday to a dynamically computed future Monday, so the
  available-slots suite does not go red as the calendar advances.

The engineering shape of the last month is clear from the ratio: of the
30 commits, roughly two thirds are `feat(...)` and `fix(...)` inside
`estimates`, `invoices`, and `inventory`. Estimates is the newest domain
in the tree and it entered `main` in the last few weeks.

## 7. Recent PRs (from merge commits on `main`, most recent first)

**#79, #78, #77, #76, #75, #73, #72, #71, #70, #69, #68, #67, #66, #65,
#64, #63, #62, #61, #60.** #74 does not appear in the merge log on
`main` in this window; without opening GitHub, that could be a squash
merge without a `Merge pull request` line, a rebase, or a PR that never
merged. Do not assume it landed.

## 8. Known issues and executive-level concerns

The list below is what a reader of the tree and the existing docs can
see without opening a running app or a monitoring dashboard.

- **`docs/architecture.md` and `docs/deployment.md` disagree with the
  code.** Both describe an `apps/api` Express service on Render with a
  cron scheduler in the backend process. The tree has no `apps/api`
  directory and every handler lives inside the Next.js app on Vercel.
  `docs/env.md` still lists a backend `NODE_ENV` / `PORT` /
  `CORS_ALLOWED_ORIGINS` block that no longer applies. This is the
  single highest-value doc correction to make before the numbered spec
  set lands; readers new to the project will follow the wrong runbook.
- **No CI file was observed in the working tree during this pass.** If
  gates run in CI they should be surfaced explicitly in the spec set; if
  they do not, the workshop is relying on a maintainer to run
  `pnpm lint`, `pnpm test` and `pnpm test:int` before every merge.
- **No architecture or bundle-size gate.** The `frontmatter` reference
  document treats an unenforced gate as a live risk, and the same
  reasoning applies here: gates that live only in a maintainer's head
  are not gates.
- **Test coverage is thin relative to the domain surface.** 17 test
  files, 10 of them unit or integration, against a schema of 42 models,
  83 API handlers and a full workshop-operations product. The E2E suite
  exercises a smoke path, an admin path, a role-access path and a
  features path; the depth of each was not audited in this pass. In a
  system that is the shop's operational system of record, this is worth
  reading in full during the numbered spec set and calling out where
  coverage is empty.
- **Pricing correctness is a recurring class of bug.** PRs #69, #70,
  #71, #75, #76 and #79 all sit on the invoice / batch / selling-price
  axis. The FIFO batch-splitting behavior is new, and each of these PRs
  is a correction on top of the last. This is not a code smell so much
  as a signal that the pricing logic deserves its own numbered spec doc
  with worked examples and its own dedicated unit tests.
- **The `apps/api` package is documented but absent, and
  `packages/db` is present but not obviously the runtime path.** Both
  point to the same question: where is the authoritative Prisma client
  boundary? The spec set should state it plainly.
- **Two developer name identities in the git log.** Arnab Sen and
  souvikmusib (same person) account for **370 of 444 commits**; Sagnik
  Mitra accounts for **72**; there are two commits by "Vercel". The
  co-authored account fusion is worth normalizing so audit trails and
  bus-factor conversations use one canonical name per person.
- **Untracked artifacts sit at repo root.** `wokrshop-machine-chrome-cache/`
  and its extractor and outputs, `__pycache__/`, `apps/web/output/`, and
  a repro script under `apps/web/scripts/_repro-lineitems.mjs` are all
  present in the working tree per the initial `git status`. Nothing
  operationally load-bearing depends on them; the spec set should decide
  whether they belong in `.gitignore` or somewhere else on disk.
- **A June 2026 data-loss incident is documented in personal memory
  (`gearup-data-loss-incident-2026-06-10.md`) and the operating rules
  now require per-op approval for destructive DB writes and a pre-op
  `pg_dump`.** Every future doc that instructs a maintainer to run a
  Prisma migration, `db push`, or a raw SQL statement against Supabase
  should restate this gate at the point of use. It is the single most
  expensive lesson this repo has learned, and it is worth carrying
  forward into the numbered spec set as a load-bearing operating rule.

## 9. Existing `docs/` today

Files at `docs/` root (excluding the numbered spec set that is being
authored):

- `architecture.md` (stale in places, see §8).
- `deployment.md` (stale in places, see §8).
- `env.md` (partially stale, see §8).
- `CODEBASE_CONTEXT.md` (28 KB, top-level codebase orientation).
- `rbac.md` (5 roles, permission model).
- `notifications.md` (notification queue + provider design).
- `api-contracts.json` (API contract file).
- `qa-matrix.md`, `TEST_PLAN.md`, `TESTING_CHECKLIST.md`,
  `E2E_TESTING_REPORT.md` (test planning and reports).
- `WORKFLOW_DETAILS.md` (workflow prose).
- `handoff.md` (handoff notes).
- `timezone_plan.md` (timezone handling plan).
- `RESTORE.md` (restore procedure notes, post-incident).
- `CALENDAR_RESEARCH.md` (calendar research notes).
- `amc-invoice-mockup.html`, `amc-invoice-pdf-mockup.html`,
  `combined-copy-mockup.html` (visual mockups; large HTML files).

Subdirectories:

- `docs/audit/2026-06-10/` and `docs/audit/2026-06-12/` (post-incident
  audit trails around the June 2026 data-loss event).
- `docs/requirements/voice-notes-2026-06-16.md` (a single voice-note
  requirements capture).
- `docs/build/` (build-related notes).

**What the numbered spec set (`docs/00-` through `docs/17-`) will add.**
The new spec set is being authored to give this repo a single, current,
mutually consistent description of the product and the code. This file
(`docs/00-EXECUTIVE-SUMMARY.md`) is the entry point. The remaining
numbered files, `01` through `17`, will each hold one focused topic
(architecture as built, deployment as built, data model, RBAC, pricing
and invoicing, inventory and batch tracking, estimates, salary and
expenses, reports, notifications and cron, testing, environments and
secrets, runbook and incident response, and so on; the exact contract
per number is set by the file that authors them). The intent is that
after the spec set lands, the older files listed above are either
retired, superseded, or reduced to references.

## 10. What a newcomer should read next

Read `README.md` first (67 lines, current), then this document, then
open `apps/web/prisma/schema.prisma` and scroll the model list against
the 42 names in §3. Then walk `apps/web/src/app/api/admin/` to see the
API surface, and `apps/web/src/app/` to see the page tree.

Do not treat `docs/architecture.md`, `docs/deployment.md` or
`docs/env.md` as current on their own; cross-check them against the
tree, or wait for the numbered spec set. When a number in this document
matters for a decision, re-derive it with the exact command from the
Method block before quoting it downstream.
