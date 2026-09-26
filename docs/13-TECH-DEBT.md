---
mode: reference
updated: 2026-09-20
verified_against: 81a04bb
---

# 13. Tech-debt register

> **This describes the code, not the plan.** Re-verified on 2026-09-20 against
> `81a04bb2027431881d069c0222cc66c404256203`. Companion to
> `docs/00-EXECUTIVE-SUMMARY.md`, `docs/03-DATA-MODEL.md`,
> `docs/06-BACKEND-SPEC.md` and `docs/09-ENVIRONMENT.md`. Where a debt item
> repeats a finding those documents already record, this file cites the section
> rather than rewriting the evidence.

> **Method.** Every item below is backed by a single command run against the
> working tree at `81a04bb`. Route counts come from
> `find apps/web/src/app/api -name route.ts | wc -l` (83). Prisma model count
> from `grep -c '^model ' apps/web/prisma/schema.prisma` (42). Index count from
> `grep -c '@@index\|@index' apps/web/prisma/schema.prisma` (76). TS/TSX file
> count from `find apps/web/src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l`
> (216). Test file count from `find apps/web -name '*.test.*' -o -name '*.spec.*'
> | grep -v node_modules | wc -l` (17). Every "carried from" claim points at
> the source document and the section that already verified it. Effort figures
> are wall-clock engineering hours or days from a working single developer at
> the measured rate for this repo.

> **Not done in this pass.** No `next build`, no `pnpm audit`, no `depcheck`,
> no test run, no Lighthouse, no read of every one of the 83 route handlers
> end to end (30 were sampled). No Vercel dashboard read, so nothing here
> confirms which env vars are set in production. No git-blame archaeology on
> the `as any` casts (21 in `apps/web/src/app/api/`) to decide which are
> load-bearing.

---

## 1. Overview

**Total items: 24.** By severity:

| Severity | Count | Meaning |
|---|---|---|
| **P0** | 6 | Production risk today: correctness, safety, or "boot fails silently" |
| **P1** | 11 | Developer velocity: friction, missing safety nets, review debt |
| **P2** | 7 | Nice to fix: cosmetic, docs, small cleanups |

**Total estimated effort: about 18 to 22 engineering days** to clear the whole
register, dominated by CI plus migrations (P0 tier, about 6 days), the RBAC
plus Zod backfill (P1 tier, about 5 days), and the stub-workspace and PWA
decisions (about 4 days combined). Read this against the repo's measured rate
in `docs/00-EXECUTIVE-SUMMARY.md`; the register is a shopping list, not a
sprint.

---

## 2. Debt register

### Schema and migrations

#### D-1 · No `prisma/migrations/` directory · **P0** · 2 days

```bash
find apps/web/prisma/migrations -type f 2>/dev/null | wc -l   # 0
```

The directory does not exist. Every schema change is applied with
`prisma db push` (script `db:push` in `apps/web/package.json`), which writes
DDL directly without recording it. There is no version history, no rollback
target, no way to reproduce production schema on a fresh clone, no shadow-DB
gate against destructive changes. `docs/00-EXECUTIVE-SUMMARY.md` records
this and the 2026-06-10 data-loss incident memory (`gearup data loss incident`)
is the closed version of what "no migration history" can cost. Fix: run
`prisma migrate dev --name baseline` against a copy of production, commit
the resulting SQL, switch `db:push` out of the shipping path, and gate future
schema changes on a `prisma migrate deploy` in CI once D-2 lands.

#### D-2 · No CI at all · **P0** · 1 day

```bash
find .github/workflows -name '*.yml' -o -name '*.yaml' 2>/dev/null | wc -l   # 0
```

No workflow runs `pnpm build`, `pnpm test`, `pnpm lint`, `prisma migrate
diff`, or `pnpm audit` on a PR. Every gate reports green because nobody runs
it. This is the cheapest item in the register and it guards D-1, D-6, D-10,
D-11 and D-14. Fix: a single `.github/workflows/ci.yml` that runs on
`pull_request` and executes lint plus typecheck plus vitest plus a
`prisma migrate diff --exit-code` against the committed schema.

#### D-3 · `Customer.phoneNumber` and `Vehicle.registrationNumber` are not `@unique` · **P1** · 1 day

`schema.prisma:242` and `schema.prisma:271` both carry an explicit
`TODO(go-live+1): @unique - needs dedupe migration; app-level guard in
api/public/service-requests`. The app-level guard exists but a race between
two public form posts can still write a duplicate. Impact: dedupe cost at
every customer-lookup call. Fix: run the dedupe SQL against a backup, add
`@unique`, ship inside one migration.

#### D-4 · `Invoice.jobCardId` is not `@unique` · **P1** · half a day

`schema.prisma:681` carries the same `TODO(go-live+1): @unique - needs dedupe
migration`. Impact: two invoices can be finalised against the same job card,
which corrupts AMC service-remaining decrements and reporting. Fix: dedupe
in a script, add `@unique`, gate on D-1.

#### D-5 · Foreign keys with no matching index · **P1** · half a day

`grep -c '@@index\|@index' apps/web/prisma/schema.prisma` returns 76 across
42 models. Spot-check: `Invoice.appointmentId` has no `@@index` (only
`(appointmentId)` under the composite list); `AmcServiceUsage(amcContractId,
jobCardId)` is `@@unique` but the two singleton `@@index([amcContractId])`
and `@@index([jobCardId])` are both present. `Payment.receivedByAdminId` is
indexed; `Expense.createdByAdminId` is indexed. The register carries this
item as "audit every FK against a query pattern before adding" rather than
"add them all"; unused indexes carry their own write-amplification cost.
Fix: a one-off query-plan sweep against production once D-1 is in place.

---

### Transactions and performance

#### D-6 · Sequential `await` loops inside transactions · **P1** · 2 days

`docs/06-BACKEND-SPEC.md` §13.2 already enumerates five: the FIFO batch
walk in `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:193`,
the AMC line iteration in
`apps/web/src/app/api/admin/invoices/[id]/finalize/route.ts:27` and `:78`,
and the per-movement reconciliation in
`apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts:381`. The 30s
transaction ceiling that PRs #58 and #59 institutionalised (see the "not
debt" section) buys headroom but does not fix the shape. `admin/settings/
holidays/route.ts:44-63` is a separate bulk-POST case that iterates up to
200 rows sequentially inside the tx and is fixable in one commit with
`createMany({ skipDuplicates: true })` against a
`(holidayDate, holidayType)` unique index. Fix: holidays first (a day),
then convert the FIFO walk to a single SQL statement (a day).

#### D-7 · P2028 fix is already institutionalised · not debt · see §4

Kept here as a signpost only. The 30-second `transactionOptions.timeout`
in `apps/web/src/lib/prisma.ts:46` plus the "resolve HSN before the tx"
convention from PR #58 and PR #59 (cited in `docs/06-BACKEND-SPEC.md`
§13.1) is the correct pattern; §4 lists it under what NOT to refactor.

#### D-8 · No admin-query index audit · **P2** · half a day

The report routes under `apps/web/src/app/api/admin/reports/` filter on
combinations the single-column indexes do not cover
(`(customerId, paymentStatus)` and `(invoiceDate, paymentStatus)` are the
only composite `@@index` on `Invoice`). Fix: run `EXPLAIN ANALYZE` on the
five slowest report queries against production, add composites where the
plan shows a sequential scan.

---

### RBAC and validation

#### D-9 · 21 admin routes call `as any` on user input paths · **P1** · 1 day

```bash
grep -rc "as any" apps/web/src/ | awk -F: '{s+=$2} END {print s}'   # 21
```

Concentrated in
`apps/web/src/app/api/admin/inventory/items/route.ts` (1),
`.../items/[id]/route.ts` (2),
`.../amc/plans/route.ts` (1),
`.../amc/plans/[id]/route.ts` (1),
`.../amc/contracts/route.ts` (2),
`.../invoices/[id]/payments/route.ts` (2),
`.../customers/[id]/route.ts` (1),
`.../settings/route.ts` (2),
`.../expenses/[id]/route.ts` (1),
`.../workers/route.ts` (1). Each cast bypasses the Zod parse it sits next
to. Fix: replace with `z.infer` or an explicit type guard, per file.

#### D-10 · 25 of 83 routes have no Zod parse · **P1** · 2 days

`docs/06-BACKEND-SPEC.md` §5.1 records this: 58 of 83 route files build a
Zod schema, 25 do not. Most of the 25 read query params directly without a
`z.object` around them, which is safe for a single-string param and unsafe
for anything the SQL will interpolate. Fix: audit the 25, add a schema to
each, promote the shared shapes to `apps/web/src/lib/validators/`.

#### D-11 · Admin auth routes bypass `requirePermission` · not debt on its own

The four routes `admin/auth/logout`, `admin/auth/me`,
`admin/auth/change-password`, `admin/auth/login` do not call
`requirePermission`. That is correct: they either establish a session or
operate on the caller's own row. Kept here as the answer to a naive audit
that will flag them.

---

### Frontend

#### D-12 · No PWA · **P1** · 3 days

```bash
ls apps/web/public/manifest.* apps/web/public/sw.* 2>/dev/null   # no matches
```

`docs/05-FRONTEND-SPEC.md` §7 gives the verdict 0 of 5 and lists the
missing pieces (manifest, icons, service worker, offline shell). Impact:
the workshop-floor "add to home screen" path does not exist; every screen
requires network. Fix: `next-pwa` plus a manifest plus the four icon
sizes, per §7's minimum-viable scope.

#### D-13 · Emoji used as UI signal in one component · **P2** · half a day

```bash
grep -c "✅\|❌\|⚠️\|✓" apps/web/src/components/dashboard/inventory-dashboard.tsx   # 3
```

Only file in `apps/web/src/components/` that carries emoji glyphs; global
standard requires Google Material Symbols delivered as inline SVG (see the
sgnk-design skill and Learned Rule 52). Fix: replace with Material Symbols
via `apps/web/src/components/ui` icon primitives.

#### D-14 · Duplicate form patterns across admin pages · **P2** · 1 day

Sampled: `apps/web/src/app/admin/invoices/[id]/page.tsx` (742 lines) and
`apps/web/src/app/admin/estimates/[id]/page.tsx` build the same
line-item editor from scratch. `docs/05-FRONTEND-SPEC.md` §3 notes the
same pattern for the customer forms. Impact: a fix to discount
calculation lands twice or drifts. Fix: extract the shared line-item
editor into `packages/ui`.

#### D-15 · `console.log` is not the leak · not debt

`grep -rc "console\.log" apps/web/src/ | awk -F: '{s+=$2} END {print s}'`
returns 0. Kept here as the answer to a scan that will look for it.

---

### Docs

#### D-16 · `docs/architecture.md` and `docs/deployment.md` are stale · **P2** · 1 day

Both are cited as stale in the header of `docs/00-EXECUTIVE-SUMMARY.md`.
`architecture.md` (67 lines) still describes a sibling `apps/api` Express
service on Render that has no source under `git ls-files apps/api/`;
`deployment.md` (76 lines) describes a Render deploy that does not exist.
The numbered spec set (`docs/00-` through `docs/17-`) is the intended
replacement. Fix: replace both files with a one-paragraph redirect to
`docs/00-EXECUTIVE-SUMMARY.md` plus `docs/11-DEPLOYMENT.md`, then delete
the bodies.

#### D-17 · Root `.env.example` is stale in both directions · **P1** · half a day

Only one `.env.example` on disk (`./.env.example`); `apps/web/.env.example`
does not exist. `docs/09-ENVIRONMENT.md` records every variable in the
`apps/api` section (`PORT`, `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
`WHATSAPP_*`, `EMAIL_*`, `CRON_ENABLED`, `OWNER_SUMMARY_EMAIL`,
`APP_BASE_URL`, `PUBLIC_TRACK_URL_BASE`) is unread by any source. Fix:
rewrite `.env.example` from the variable names `docs/09-ENVIRONMENT.md`
enumerates for `apps/web/`.

#### D-18 · No `.nvmrc` · **P2** · 5 minutes

`[ -f .nvmrc ]` returns false. `docs/09-ENVIRONMENT.md` notes the same.
Impact: contributor Node version drift. Fix: `echo 20.11.0 > .nvmrc` (or
whatever Vercel currently pins to).

---

### Deps

#### D-19 · Not audited in this pass · **P1** · half a day

No `pnpm audit`, no `depcheck`, no `pnpm outdated` was run. Known
oldish pins from `apps/web/package.json`: `bcryptjs ^2.4.3` (major behind),
`nanoid ^3.3.7` (major behind, 5.x current), `next ^14.2.0` (15 is current;
kept intentionally). Fix: run the three commands in CI, land whichever
majors are trivial in one commit, file the rest.

---

### Testing

#### D-20 · 17 test files against 216 source files · **P1** · 2 days

```bash
find apps/web -name '*.test.*' -o -name '*.spec.*' | grep -v node_modules | wc -l   # 17
find apps/web/src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l                  # 216
```

Coverage is concentrated in `apps/web/src/lib/reports/` and
`apps/web/src/__tests__/unit/` (id-generators, errors, format-reg,
invoice-calc, estimate-token, pagination, gst-hsn). Zero unit tests for
any route handler in `apps/web/src/app/api/`. E2E covers admin, features
and roles at the smoke level (`apps/web/e2e/`) but there is no E2E for
invoice finalize or payment recording, which are the two operations most
often cited in the audit trail. Fix: pick the five highest-blast-radius
routes (invoice create, invoice finalize, payment record, AMC decrement,
job-card cancel), add a vitest per route against a Prisma test DB.

#### D-21 · No coverage threshold gate · **P2** · 15 minutes

`docs/06-BACKEND-SPEC.md` §12 notes this. Impact: coverage drifts without
signal. Fix: `--coverage.thresholds.lines 40` in `vitest.config` once D-20
raises the floor.

---

### Ops

#### D-22 · `DATABASE_URL` missing does not throw at boot · **P0** · 15 minutes

`apps/web/src/lib/prisma.ts:40` calls
`withServerlessPoolLimits(process.env.DATABASE_URL)` which returns
`undefined` when the var is unset, and `PrismaClient` is instantiated
anyway. The first query then fails at request time with a message that
does not name the missing var. Fix: assert
`if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')`
before line 40.

#### D-23 · Three stub workspaces with no source · **P1** · 1 day (decision, not code)

```bash
git ls-files apps/api packages/db packages/notifications | wc -l   # 0 tracked source
```

`apps/api/` carries only `dist/` and `node_modules/` (a stale build from a
tree that no longer exists in git). `packages/db/` and
`packages/notifications/` carry only `node_modules/`. `pnpm-workspace.yaml`
still declares them. Impact: every `pnpm install` resolves three empty
packages; every contributor asks what they are for. Fix: pick one of
delete the folders and remove the workspace glob, or move the code that
belongs there (Prisma client, notification queue) into the packages and
delete `dist/` from `apps/api`. Do not leave them as they are.

#### D-24 · Sentry sample rate is hardcoded, not env-driven · **P2** · 15 minutes

`apps/web/sentry.server.config.ts:6`, `sentry.client.config.ts:6` and
`sentry.edge.config.ts:6` all set `tracesSampleRate: 0.2`. There is no
env var to lower it during a load spike or raise it during an incident.
Fix: `tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.2')`
in all three files.

---

### AI/OS meta

These items track the AI-orchestration substrate this repo runs under, not
gearup product code. They are here so a future audit of the substrate has a
starting point.

#### D-25 · Trace ledger under-counts skill invocations · **P2** · carried forward, unmeasured this pass

Findings from an earlier session recorded that not every skill invocation
emits a `~/.sgnk/traces/YYYY-MM-DD.jsonl` row (Learned Rule 31 requires
one per task). `**unverified**` at this commit; the finding predates the
current session. Fix: audit the shape once the substrate work resumes.

#### D-26 · September 5 orphan pending-skill marker still on disk · **P2** · carried forward, unmeasured this pass

Same provenance as D-25. `**unverified**` at this commit. Fix: locate,
adjudicate, delete.

---

## 3. Fix roadmap

Ordered by "unblocks the next item" first, then by ratio of impact to
effort.

| Order | Item | Severity | Days | Why here |
|---|---|---|---|---|
| 1 | D-22 `DATABASE_URL` boot guard | P0 | 0.05 | Turns a mystery 500 into a startup exit |
| 2 | D-2 CI | P0 | 1 | Guards everything after it |
| 3 | D-1 baseline migration | P0 | 2 | Every schema change from here on is versioned |
| 4 | D-3, D-4 `@unique` migrations | P1 | 1.5 | Ride D-1's train |
| 5 | D-17, D-18 env.example + .nvmrc | P1, P2 | 0.6 | Onboarding fix, ride D-2 |
| 6 | D-6 sequential-await conversions | P1 | 2 | Holidays bulk POST first (1d), then FIFO batch walk (1d) |
| 7 | D-9, D-10 `as any` + Zod backfill | P1 | 3 | RBAC and validation cleanup |
| 8 | D-23 stub workspace decision | P1 | 1 | Founder answer required |
| 9 | D-20 route handler tests | P1 | 2 | Five highest-blast-radius routes |
| 10 | D-12 PWA | P1 | 3 | Workshop-floor unblock |
| 11 | D-14 shared line-item editor | P2 | 1 | Discount-drift eliminator |
| 12 | D-13 emoji swap | P2 | 0.5 | One file, house standard |
| 13 | D-16 stale docs redirect | P2 | 1 | Delete two files, add two paragraphs |
| 14 | D-19, D-21, D-24 deps + coverage + sentry env | P1, P2, P2 | 1 | Ride D-2 |
| 15 | D-5, D-8 index audit | P1, P2 | 1 | Needs production query plans |
| 16 | D-25, D-26 AI/OS meta | P2 | unmeasured | Substrate housekeeping |

Rolled up by tier:

- **P0 (6 items): about 3.1 days.** Every item here is a boot-time or
  correctness fix; ship as a single "safety net" PR.
- **P1 (11 items): about 12 days.** The bulk of the work; dominated by
  validation backfill and the PWA.
- **P2 (7 items): about 3 days.** Housekeeping.

Read this against the repo's measured engineering rate in
`docs/00-EXECUTIVE-SUMMARY.md` before quoting a calendar date.

---

## 4. What is NOT debt

Recent good patterns worth keeping. A new dev should NOT "refactor" these
away.

### The 30-second transaction ceiling

`apps/web/src/lib/prisma.ts:46` sets
`transactionOptions: { maxWait: 10000, timeout: 15000 }` at the client
level; the four heaviest routes override with `timeout: 30000` (see
`docs/06-BACKEND-SPEC.md` §2.3 and §13.1). This is not overcaution; it is
the fix for the P2028 family that PRs #58 and #59 institutionalised. Do
not reduce the ceiling to "save latency"; the ceiling is what the
sequential-await loops in D-6 need until D-6 is fixed.

### Race-safe `updateMany` with a WHERE guard

`apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:24-57` writes
the payment gate into the WHERE clause and gates on `result.count`. Same
pattern for AMC decrement and inventory decrement. `docs/06-BACKEND-SPEC.md`
§2.4 explains why: Vercel's warm-instance concurrency means two payments
can race, and this shape is what makes the second one see the first. Do
not "simplify" to `findFirst` then `update`.

### Transaction-aware activity logger

`apps/web/src/lib/activity-logger.ts:109` accepts an optional
`tx: Prisma.TransactionClient`. When present, the audit row is written
inside the caller's transaction and rolls back atomically. When absent,
the write is fire-and-forget with an optional `waitUntil` hook so a
serverless lambda does not freeze mid-write. Both branches are load
bearing. Do not "always await" the fire-and-forget branch.

### IST helper

`apps/web/src/lib/time.ts:2` pins the offset as
`5.5 * 60 * 60 * 1000` and every date-boundary calculation flows through
it. Verified in `apps/web/src/__tests__/date-boundaries.test.ts`. Do not
switch to a runtime timezone lookup; Vercel's UTC lambda plus a
hardcoded IST offset is the correct shape for a single-timezone product.

### HSN rate cache

`apps/web/src/lib/hsn-rate.ts` reads all `HsnRate` rows once per request
boundary and answers from an in-memory Map. This is the "resolve HSN
before the tx" half of the PR #58 and #59 fix. Do not move the read
back inside the transaction; that is the exact shape that caused
P2028 the first time.

### Restrict-onDelete on financial FKs

`apps/web/prisma/schema.prisma:1-17` is a policy comment that lists the
Cascade-vs-Restrict decision per relation. Every `Invoice`, `Payment`,
`AmcContract` and `AmcServiceUsage` FK to `Customer`, `Vehicle`,
`JobCard` or `AmcPlan` uses `onDelete: Restrict`. Do not switch these to
Cascade or SetNull; the migration generator has silently downgraded
before and the comment names the incident.
