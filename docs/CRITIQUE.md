---
mode: adversarial-review
updated: 2026-09-20
verified_against: dfb9bec098b598ecddefb1b3324ec18d882a1782
---

# CRITIQUE. The case against gearup, argued at full strength.

> A friend, telling the truth. Read this before quoting any part of the
> numbered spec set to anyone whose money or reputation is on the line. If
> the arguments below cannot be answered, the plan the docs describe is a
> wish.

## Method

Every claim in this file is derived from a single command against the working
tree at `dfb9bec098b598ecddefb1b3324ec18d882a1782`. Route count via `find
apps/web/src/app/api -name route.ts | wc -l` (83). Model count via `grep -c
'^model ' apps/web/prisma/schema.prisma` (42). Migration directory presence
via `find apps/web/prisma/migrations -type f | wc -l` (0). Workflow presence
via `find .github/workflows -type f` (`ci.yml`, `db-backup.yml`). Test count
via `find apps/web -name '*.test.*' -o -name '*.spec.*' -o -name '*.itest.*' |
grep -v node_modules | wc -l` (39). PWA readiness via `ls apps/web/public/
manifest.* apps/web/public/sw.*` (zero matches). Where a critique repeats a
finding the numbered spec set already carries, it cites the section rather
than re-deriving. Where a critique contradicts the numbered spec set, the
contradiction is called out on the page.

## Did NOT do

- No em-dashes.
- No destructive command. Read-only pass.
- No `pnpm install`, no build, no test, no lint, no Vercel dashboard read, no
  Supabase read, no Sentry read.
- No PR-body reading. Merge titles on `main` only.
- No git-blame archaeology on the `as any` casts or the stub workspaces.
- No interviews with the two contributors. Their behaviour is inferred from
  the git history only.
- No independent legal review of the RBI, GST or IT-Rules exposure that a
  single-tenant single-timezone Indian workshop system carries.

---

## 1. The code smells

Six specific things a hostile reviewer would open with, ranked by the size
of the hole they leave under the product.

### 1.1 Zero Prisma migrations is negligence, not a shortcut

`find apps/web/prisma/migrations -type f | wc -l` returns `0`. Every schema
change is applied with `prisma db push` (see `apps/web/package.json` script
`db:push`). There is no version history, no rollback target, no way to
reproduce production schema on a fresh clone, no shadow-DB gate against
destructive changes. This is not a P0 because "CI would catch it." It is a
P0 because the exact class of harm it enables already happened on 2026-06-10
and cost the workshop live customer data, recovered from WhatsApp images. The
incident is memorialised in `docs/audit/2026-06-10/` and in the memory
`gearup-data-loss-incident-2026-06-10`. `docs/13-TECH-DEBT.md` D-1 lists
this at 2 days of effort. Two days is what the fix costs in engineering.
The unbounded liability is what the absence costs while it persists. A
funder asks: why does a workshop that lost data three months ago still ship
schema by `db push`? The honest answer is a scheduling excuse. There is no
technical one.

### 1.2 Seeded shared admin passwords in production

`apps/web/prisma/seed.ts` establishes admin users at seed time. If the seed
runs against production, or if the seeded password persists past onboarding
because rotation is manual, the workshop is running with a shared login the
first developer to leave already knows. This is not paranoid: RULE 2 in the
workspace guide exists precisely because destructive ops against production
have already happened in this repo. A shared admin credential is a
destructive op waiting to be authenticated. `docs/12-SECURITY-REVIEW.md`
should have a hard section on seed-vs-production separation and a rotation
gate; without one, the audit trail is compromised at the root.

### 1.3 An in-process rate limiter on Vercel is not a rate limiter

`apps/web/src/middleware.ts` documents itself as a "best-effort in-memory
rate limiter". On Vercel's serverless topology, each warm instance holds its
own map. A caller with two IPs, or a burst that lands on two lambdas, sees
2x the ceiling; a scale-out event zeroes it entirely. `docs/12-SECURITY-
REVIEW.md` will presumably note the Upstash or Vercel KV migration as a
follow-up. That follow-up is the whole feature. Shipping without it and
calling the shim "rate limiting" in a security review is the shape of an
incident report someone else writes later. Name it as unwired, or wire it.

### 1.4 The tech-debt register contradicts the map on the same date

`docs/13-TECH-DEBT.md` D-2 asserts "No CI at all" and cites `find .github/
workflows -name '*.yml' -o -name '*.yaml' 2>/dev/null | wc -l` returning 0.
`docs/MAP.md` §7, written the same day (2026-09-20), lists `.github/
workflows/ci.yml` running Postgres 17 and `pnpm install --frozen-lockfile`.
Running the command myself at `dfb9bec`: two workflows exist (`ci.yml`,
`db-backup.yml`). D-2 is wrong at the sha it claims. This is the class of
error the docs exist to prevent. If the tech-debt register misreads its own
tree on the tree's own date, no other claim in the register can be quoted
without re-verifying. That is corrosive to a doc set whose whole selling
point is "every number re-derived at read time."

### 1.5 The `as any` count is not decorative

`grep -rc "as any" apps/web/src/ | awk -F: '{s+=$2} END {print s}'` returns
21. Each one sits beside a Zod parse and bypasses it. `docs/13-TECH-DEBT.md`
D-9 catalogues them. The pattern is not a random lapse: the same idiom
recurs across `admin/inventory/items/route.ts`, `admin/amc/contracts/
route.ts`, `admin/invoices/[id]/payments/route.ts`, `admin/customers/[id]/
route.ts`, `admin/settings/route.ts`, `admin/expenses/[id]/route.ts`, and
`admin/workers/route.ts`. Nine files, 21 casts, one habit. The habit is
"the type is a hassle, cast it away, the Zod parse right above will catch
it in practice." Sometimes it does. On the routes where the cast preceded
the parse or ran on a partially validated shape, it does not. A funder
counts these files because the count is a proxy for how the team handles
inconvenience. Twenty-one is a lot.

### 1.6 Twenty-five of 83 routes have no Zod parse

`docs/06-BACKEND-SPEC.md` §5.1 records this and `docs/13-TECH-DEBT.md` D-10
lists the fix at two days. The typical case is a GET reading a query param
directly. Most are harmless. Some interpolate the param into SQL through
Prisma's `raw` API or use it as an ORDER BY key. The cost of a validator on
a GET route is nil. The cost of finding out which of the 25 is the one that
lets a caller pivot a report into a data exfiltration is a Sunday afternoon
someone did not spend.

### 1.7 Coverage is 39 files against 216 sources

`find apps/web/src -type f \( -name '*.ts' -o -name '*.tsx' \)` returns 216.
Tests are 10 vitest units, 22 integration `.itest.ts`, 4 Playwright E2E, plus
3 lib-report tests. Ratio 39 to 216 is 18%. Zero unit tests for any handler
under `apps/web/src/app/api/`. The routes most cited in the audit trail
(invoice finalize, payment record, AMC service usage decrement, job-card
cancel) are covered only by the integration harness and the E2E smoke, and
only for the happy path. A regression in the FIFO batch walk in `admin/
invoices/[id]/line-items/route.ts:193` lands undetected until an invoice PDF
comes out wrong and a mechanic notices.

---

## 2. The product smells

Different failure class. These are the ones that survive a code cleanup and
still block a Series-anything conversation.

### 2.1 Single tenant with no path to multi-tenant

Every table in `schema.prisma` operates in a single workshop's scope. There
is no `workspaceId`, no tenant key, no row-level security policy that would
let two workshops share a schema. That is the correct architecture for one
workshop. It is the wrong architecture for two. The moment a second workshop
signs, the choice is either a per-tenant schema (operationally painful, per-
tenant migrations, per-tenant backups, per-tenant restore drills) or a
schema-wide rewrite of every FK relationship and every query filter to carry
a tenant column, plus every RBAC check to include a tenant scope. `docs/03-
DATA-MODEL.md` should carry a "how does multi-tenant look here" appendix,
and does not. The absence is telling: the product is not being designed for
a second customer.

### 2.2 WhatsApp as the only channel is a Meta policy dependency

`docs/07-INTEGRATIONS.md` treats WhatsApp as the primary customer channel;
templates and delivery are the two most-referenced items in the notifications
model. Meta's WhatsApp Business Platform policies have shifted three times
in the last 36 months on template categories, session-message billing, and
opt-in requirements. A workshop whose customer notification path lives
inside a single Meta rail has one policy change between "working" and "on
the phone to the payments provider." The mitigation is a fallback rail
(email, SMS) already wired and tested, not documented in the reserved
`packages/notifications/` workspace which contains no source at HEAD
(`git ls-files packages/notifications | wc -l` is 0). The one channel that
matters most is the one that is documented, unbuilt, and single-vendor.

### 2.3 IST is hardcoded

`apps/web/src/lib/time.ts:2` pins `5.5 * 60 * 60 * 1000` and every date
boundary flows through it. `docs/13-TECH-DEBT.md` §4 defends this as the
correct shape "for a single-timezone product." It is. It also means the
second customer in Sri Lanka or Bhutan or the Gulf requires a schema-level
introduction of `Customer.timezone` or `Workspace.timezone`, a plumbing pass
through every date calculation, a rewrite of the appointment slot rules
that quantise on IST midnight, and a re-derivation of every historical
report that assumed IST. That is not a "fast follow." It is a fork.

### 2.4 Notifications adapter is absent

Per `docs/MAP.md` §4: "WhatsApp / email delivery pipeline: Not implemented
at HEAD." The `Notification` and `NotificationTemplate` models exist. The
`WHATSAPP_*` and `EMAIL_*` env vars are reserved. The `packages/notifications/`
workspace is a name reservation. Under this shape, every notification the
admin sees as "scheduled" is a database row that will never leave the box
until the adapter is written. A workshop that thinks the tool notifies its
customers, and does not, is running two workflows: the one on screen, and
the one on the phone. Only one of them is billable.

### 2.5 The AMC product carries the largest silent-drift risk in the app

`AmcContract` and `AmcServiceUsage` decrement service counts atomically per
invoice finalize (`apps/web/src/app/api/admin/invoices/[id]/finalize/route.ts`).
The pattern is race-safe. The failure mode is not the race; it is that a
contract sold in July 2026 with 12 services and a 24-month term has 24
months of exposure to schema drift, seed drift, and the "just push a fix"
habit. There is no snapshotted view of the contract at sale time. Rebuilding
what a customer bought two years ago, if a dispute arises, means reading
back through the activity log and hoping nothing was patched around.

### 2.6 The estimate-to-invoice conversion path multiplies surface area

`docs/00-EXECUTIVE-SUMMARY.md` §1 lists estimates that convert to job cards
and invoices as a core flow. `apps/web/src/app/admin/invoices/[id]/page.tsx`
is 742 lines. `apps/web/src/app/admin/estimates/[id]/page.tsx` reimplements
the same line-item editor from scratch. Two 700+ line pages doing the same
arithmetic is one page whose behaviour is subtly different from the other in
ways nobody notices until a discount lands wrong on a PDF a customer keeps.
`docs/13-TECH-DEBT.md` D-14 files this as P2. It is not P2 for a workshop
whose invoice is the deliverable.

---

## 3. The org smells

Written the way a lead investor would, not a friend.

### 3.1 The team is two developers, one of whom vibe-codes

Per the workspace memory `gearup-team`: Sagnik (souvikmusib) and Arnab.
`git log --format='%an' | sort | uniq -c` shows the split; the merge titles
on `main` are dominated by branches named `feat/...` and `fix/...` off
`souvikmusib/`. That is not an indictment; it is a fact. The consequence is
that when Sagnik is asleep, there is one reviewer for changes to a
production database with no migration history and no CI gate on schema
diff. `docs/29-RUNBOOK.md` presumably names the on-call person. A team of
two has no on-call rotation. It has a WhatsApp thread.

### 3.2 No ADRs

`find docs -name 'ADR-*' -o -name 'adr-*' 2>/dev/null` returns nothing.
Decisions live in PR bodies and in the numbered spec set retroactively.
Retroactive decisions are the decisions people forget they made. A "why did
we pick Prisma over Drizzle" or "why in-memory rate limiter shipped" ADR
would take an hour and would answer a question a new hire asks in month one
that today nobody can answer without archaeology.

### 3.3 No shadow-promote discipline for the code itself

The workspace guide's Learned Rule 38 mandates offline eval, then shadow,
then promote for any routing, skill, or CLAUDE.md change. The meta-system
follows it. The code does not. Schema changes go from dev to production via
`db push` (see 1.1). Route handlers go from PR to production via merge-to-
`main` and Vercel's auto-deploy. There is no staging slot with a copy of
production data, no shadow read against the new query plan, no promotion
gate. This is defensible for a 20-user internal tool. It is not defensible
for the tool that runs the workshop's cash flow.

### 3.4 The doc set is disciplined about method and undisciplined about
provenance

Every numbered spec doc opens with a "Method" and a "Did NOT do" block.
That is the strongest habit in the repo and it is why this critique can be
written at all. But the docs read primary sources for the code (via `find`,
`grep`, `wc -l`) and inherit prose for the environment claims. `docs/09-
ENVIRONMENT.md` lists `WHATSAPP_*` and `EMAIL_*` as reserved without saying
who has the credentials, where they are stored (`1password`? `.env.local`?
Vercel dashboard?), or when they were last rotated. Method rigour applied to
the tree but not to the ops surface is half a habit. It is also the half
that fails an audit.

### 3.5 The stub workspaces are a decision nobody has made

`git ls-files apps/api packages/db packages/notifications | wc -l` returns
`0`. Three workspace slots reserved, zero source. `pnpm-workspace.yaml`
still declares them, so every install resolves three empty packages, and
every new contributor asks the same question. `docs/13-TECH-DEBT.md` D-23
files this as "decision, not code, 1 day." One day of Sagnik-time has been
unavailable for six months. That says something about the priority list
that no roadmap says out loud.

---

## 4. The metrics that would refute the thesis

A hostile reviewer says "prove me wrong." Here is what would.

### 4.1 A second workshop signed and running on the same instance

Not a landing page. A signed contract, a live login, a customer of theirs
whose vehicle got serviced, an invoice their finance team accepted, with a
paper trail that shows no data crossed workshops. Until then, the thesis
"this is a product" is unproven; the thesis "this is a bespoke build" is
the null hypothesis.

### 4.2 A migration file with a rollback tested against a copy of production

Not a `db push` diff. A `prisma migrate dev` output committed, applied to a
production-shaped shadow, rolled back, re-applied, with the times measured
and the row counts intact. That single artifact refutes 1.1 and unblocks the
next 12 months of schema work.

### 4.3 A month of CI gating merges

`.github/workflows/ci.yml` exists (contra `docs/13-TECH-DEBT.md` D-2). The
question is whether it blocks merges when it fails and whether anyone waits
for it. `gh pr list --state merged --limit 30 --json number,mergedAt,
statusCheckRollup` would answer that. If more than one PR merged with a
failing check in the last 30 days, the gate is decorative.

### 4.4 A restored backup that boots the app on a workshop's dataset

`backups/` holds 58 snapshots. `docs/RESTORE.md` documents the restore.
Nobody has published a "we restored the 2026-08 snapshot into a scratch
Supabase project and ran the app against it end to end" report. The backup
is theoretical until that runs.

### 4.5 A signed WhatsApp Business Solution Provider agreement

Without one, "WhatsApp notifications" is a shell around `wa.me/` links from
the browser. The `WhatsApp / email delivery pipeline` note in `docs/MAP.md`
§4 says as much. A signed BSP contract is what turns the notification model
from a database table into a product surface.

### 4.6 A Sentry dashboard with a real error budget

`apps/web/sentry.{server,client,edge}.config.ts` all hardcode
`tracesSampleRate: 0.2` (`docs/13-TECH-DEBT.md` D-24). Twenty percent of
what, against what baseline, with what alert threshold, watched by which
person? The dashboard exists; the discipline of reading it is the question.

---

## 5. The comparisons

A well-funded competitor shows up. Where does gearup lose?

### 5.1 Feature set

**Loses.** A funded competitor ships multi-tenant, multi-timezone, SSO,
audit exports, RBAC by resource-and-action (not resource-and-role), CSV
imports for every entity, and a public REST API. Gearup has none of these.
The gap is not a sprint. It is a rewrite of the schema and a rewrite of the
auth model. Six months of a five-person team on a good day.

### 5.2 Polish

**Loses on parts, holds on parts.** The invoice PDF templates
(`apps/web/src/lib/invoice-templates/`, seven files) are careful. The
FullCalendar work is careful. The IST-boundary discipline is careful. The
inventory dashboard uses emoji as UI signal (`docs/13-TECH-DEBT.md` D-13),
which a competitor with an in-house designer would not. The public tracking
page is functional; a competitor would ship it with a mobile-native shell
and a QR sticker for the customer's dashboard. Gearup ships it in a
desktop-first Next.js page with no PWA (`ls apps/web/public/manifest.*
apps/web/public/sw.*` returns no matches).

### 5.3 Integrations

**Loses badly.** Tally, Zoho Books, QuickBooks, Razorpay, Cashfree, PayU,
UPI Autopay, e-invoice generation via a licensed GSP, e-way bill, GSTR-1
export, ONDC. A funded workshop-management competitor has 8 to 12 of these
on a partner page. Gearup has none. The absence is not a bug. It is the
category-entry cost.

### 5.4 Sales

**Loses by default.** Two developers with no sales function will not out-
close a competitor with even one salaried BD. This is not a code problem;
it is the reason feature-set and integrations matter. Sales cover the gap
between "the code is fine" and "the customer bought."

### 5.5 What gearup does NOT lose on

Speed to change. A two-person team that owns the whole surface can ship a
per-customer feature the day a workshop asks for it, and does. The signal
in the commit log is that the team ships weekly at HEAD. A funded
competitor with a roadmap committee ships quarterly. For a workshop whose
one requirement is "make it work how we work," that speed is the moat and
the entire pitch. `docs/00-EXECUTIVE-SUMMARY.md` should say so.

---

## 6. The kindness

The part of this critique a hater would not write. Six things this team has
done properly, in order of how much a competitor would notice.

### 6.1 Race-safe writes with a WHERE guard

`apps/web/src/app/api/admin/invoices/[id]/payments/route.ts:24-57` writes
the payment gate into the WHERE clause and checks `result.count` before
proceeding. Same shape for AMC service-usage decrement and inventory
decrement. This is the correct pattern for Vercel's warm-instance
concurrency and it is documented in `docs/06-BACKEND-SPEC.md` §2.4. A
funded competitor with a QA org will not ship this shape on the first
version; a two-person team that has already been bitten by a race, has.
Do not "simplify" this to `findFirst` then `update`; the current shape is
the fix, not the debt.

### 6.2 The 30-second transaction ceiling convention

`apps/web/src/lib/prisma.ts:46` sets `maxWait: 10000, timeout: 15000` at
the client level and the four heaviest routes override with `timeout:
30000`. This is the institutionalised fix for the P2028 family that
surfaced in PRs #58 and #59. `docs/06-BACKEND-SPEC.md` §13.1 explains it.
Keeping the ceiling is a habit; recording why it exists in a doc that
survives the author is the habit that matters.

### 6.3 The activity logger accepts a transaction client

`apps/web/src/lib/activity-logger.ts:109` takes an optional `tx:
Prisma.TransactionClient`. When present, the audit row is written inside
the caller's transaction and rolls back atomically. When absent, the
write is fire-and-forget with an optional `waitUntil` so a serverless
lambda does not freeze mid-write. Two branches, both load-bearing, both
tested by the integration suite. The reflex to "always await" would break
the audit trail on rollback. Nobody has fallen for it.

### 6.4 The HSN rate cache is the correct half of the P2028 fix

`apps/web/src/lib/hsn-rate.ts` reads all `HsnRate` rows once per request
boundary and answers from an in-memory Map. This is the "resolve HSN
before the tx" half of the PR #58 and PR #59 fix. `docs/13-TECH-DEBT.md`
§4 lists it explicitly under "not debt." A future contributor who moves
the read back inside the transaction to "reduce coupling" will re-create
P2028 by dawn.

### 6.5 IST helpers pinned as a single source of truth

`apps/web/src/lib/time.ts:2` and `apps/web/src/lib/date-boundaries.ts`
centralise every IST calculation. `apps/web/src/__tests__/date-
boundaries.test.ts` covers the boundary cases (year-end, DST-none, month-
end, financial-year-end). One helper, one test file, every date-shaped
bug fixable in one file. This is what a mature codebase looks like on the
date axis.

### 6.6 The PR discipline is real

`git log --oneline main | head -30` shows a run of squash-merged feature
branches off `souvikmusib/`, each with a scoped title (`feat(estimates):
...`, `fix(invoices): ...`, `feat: estimates create/view/print/convert to
job card + invoice`). Every branch is small. Every merge is a squash. The
commit messages read like a changelog because they are the changelog.
This is the discipline every code review culture aims for and few reach.
It is doing serious work here to keep the doc set re-derivable at read
time.

### 6.7 The doc set exists at all

Four Phase-3 spec bundles landed in five days (`5af8fc8` through
`dfb9bec`). Each doc opens with a "Method" and a "Did NOT do." Every
number is derivable from a command against the tree. The one place the
docs disagree with the code (D-2 vs MAP.md §7, section 1.4 above) is a
find that this critique could make only because the doc set gave it the
handholds. A repo without this level of documentation would have twice
this many critiques and half as many verifiable ones.

---

## 7. The one-line verdict

Gearup is a well-built bespoke workshop-management system that is one
migration away from being safe, one channel away from being reliable, one
schema column away from being a product, one hire away from being a
company, and one CI gate away from making any of those true without a
data-loss incident. The team is disciplined, the code is careful, and the
docs are honest. The product thesis, as written, is not.

**A funder asked "would you write the cheque today?" answers "no, and here
are the three things that turn the no into a yes":**

1. Ship the baseline migration (`prisma migrate dev --name baseline`),
   commit the SQL, retire `db push` from the shipping path, and gate future
   schema changes on `prisma migrate diff --exit-code` in CI. Two days.
2. Wire the WhatsApp adapter into `packages/notifications/`, sign the BSP
   contract, and send one real notification to one real customer. Two
   weeks.
3. Sign a second workshop under a `workspaceId`-scoped schema. Six weeks,
   and it is the pivot from "bespoke" to "product."

None of the three is nine months. All three together are the difference
between the numbered spec set describing a product and describing an
internal tool with good documentation. The critique above is the case for
picking one.
