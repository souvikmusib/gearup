---
mode: executive-brief
updated: 2026-09-20
verified_against: dfb9bec
audience: stakeholder deciding whether to fund the next phase
---

# gearup, in one page

> **This is the memo, not the record.** Everything below is derived from
> `docs/00-EXECUTIVE-SUMMARY.md`, `docs/01-PRODUCT-AND-DOMAIN.md`,
> `docs/05-FRONTEND-SPEC.md`, `docs/12-SECURITY-REVIEW.md` and
> `docs/13-TECH-DEBT.md`, each stamped against a commit in the last two
> weeks. Numbers here are the numbers those docs already carry;
> re-derive with the commands in their Method blocks before quoting
> anything downstream. HEAD at the time of writing is
> `dfb9bec098b598ecddefb1b3324ec18d882a1782`.

> **Method.** Read the five docs named above in full. Read
> `docs/CODEBASE_CONTEXT.md`, `AGENTS.md`, the `gearup-team`,
> `workspace-stakes` and `gearup-data-loss-incident-2026-06-10` memories
> for team shape and stakes. No shell command was run that touched the
> database, the deploy, or a paid platform. No file was written outside
> `docs/BRIEF.md` and `docs/PRODUCT.md`. Two writes total for this pass.

> **What this pass did NOT do.** It did not run `pnpm build`, `pnpm
> test`, or open a browser against production. It did not read PR bodies
> for #60 through #79, only merge-commit subjects. It did not audit
> Vercel project settings or Supabase RLS. It did not read the AMC
> outbound poster page, the marketing landing hero, or every one of the
> 63 admin pages. It did not verify any number against production; every
> number here is the number the source doc verified against a specific
> commit sha in the last two weeks.

---

## 1. What gearup is

gearup is a single-tenant vehicle-servicing operations SaaS for one
Indian garage business, running in production at `gearup.sgnk.ai`. It
covers the whole shop lifecycle end to end: a customer submits a
service request from the public site, the shop confirms an appointment,
opens a job card, reserves parts from inventory with FIFO batch
tracking, drafts a GST-compliant invoice, records payment, and marks
the vehicle delivered, with an activity log on every mutation and an
Annual Maintenance Contract product layered on top.

## 2. Current state

The application is live and healthy. `main` accepted the most recent
merge (`bb1ba1c`, PR #79, an invoice line-item pricing fix) on
2026-09-16 (`docs/00-EXECUTIVE-SUMMARY.md` §5). The stack is Next.js
14.2 App Router on Vercel (`hnd1` region, 30 s function timeout),
PostgreSQL on Supabase via Prisma 5.14, custom JWT plus five-role
RBAC, Sentry wired for errors, all in one pnpm workspace with six
packages. 216 TypeScript files, 25,619 lines of source, 83 API route
handlers, 42 Prisma models, 63 admin pages, 17 test files. The
workshop it was built for runs it as its operational system of record,
not as a supplement to one (`docs/00-EXECUTIVE-SUMMARY.md` §1).

Two developers author every commit: Arnab Sen and `souvikmusib` (same
person, split GitHub identity) account for 370 of 444 commits, Sagnik
Mitra for 72, per `docs/00-EXECUTIVE-SUMMARY.md` §8. The `gearup-team`
memory confirms both as authorized contributors.

## 3. What it does today

- **Public front door.** Booking form, appointment picker, tracking by
  reference id, estimate viewer by signed token, WhatsApp deep link.
  Five public routes, aggressive per-phone and per-IP rate limiting,
  no PII enumeration by design (`docs/12-SECURITY-REVIEW.md` §4).
- **Shop operations.** Customers, vehicles, service requests,
  appointments with a FullCalendar view, job cards with 13 lifecycle
  states, worker roster and leave, parts inventory with FIFO
  consumption from `StockBatch`, and per-batch selling price. This is
  the operational core (`docs/01-PRODUCT-AND-DOMAIN.md` §3, §4).
- **GST-aware billing.** Draft invoices grow inside a job card, HSN
  rates resolve outside the transaction, tax rates and totals compute
  as `Decimal(12, 2)`, finalize is a one-way door guarded by an
  atomic `updateMany`, payments use optimistic-lock concurrency
  guards (`docs/01-PRODUCT-AND-DOMAIN.md` §5).
- **AMC contracts.** Fixed number of services over a fixed number of
  months, per-service race-safe decrement, redemption inside the
  invoice-finalize transaction or fresh-contract creation inside the
  payment transaction.
- **Accounting adjacent.** Estimates that convert into job cards or
  invoices, expenses with categories, salary slips with PDF, HSN rate
  tables, activity logs on every mutation, seven report surfaces on
  `recharts`.

## 4. What it does not do yet

- **No PWA.** Zero of five (`docs/05-FRONTEND-SPEC.md` §7). No
  manifest, no service worker, no offline queue for job-card and
  inventory writes. The workshop-floor tablet cannot "add to home
  screen"; every screen requires network.
- **No CI.** No `.github/workflows/` directory in the tree; every
  gate (lint, typecheck, vitest, prisma migrate diff) reports green
  because nobody runs it on a PR (`docs/13-TECH-DEBT.md` D-2).
- **No migration history.** `apps/web/prisma/migrations/` does not
  exist; every schema change lands via `prisma db push`. No rollback
  target, no shadow-DB gate, no way to reproduce production schema on
  a fresh clone (`docs/13-TECH-DEBT.md` D-1). The 2026-06-10 data-loss
  incident is the closed version of what this can cost.
- **Thin test coverage.** 17 test files against 216 source files, zero
  unit tests for any of the 83 route handlers, E2E smoke only
  (`docs/13-TECH-DEBT.md` D-20).
- **Not multi-tenant.** No organisation, no workspace, no tenant
  column on any of the 42 models. Every deploy is one garage
  (`docs/01-PRODUCT-AND-DOMAIN.md` §1). A pivot to SaaS-for-many is a
  data-model change, not a feature.

## 5. The next six months, if funded

Ordered by "unblocks the next item" first, then by ratio of impact to
effort. The full register lives at `docs/13-TECH-DEBT.md` §3; this is
the executive shape.

**Month 1, safety net (about 3 engineering days).** All six P0
items land as one PR. `DATABASE_URL` boot-guard, GitHub Actions CI
that runs lint plus typecheck plus vitest plus `prisma migrate diff
--exit-code`, a baseline Prisma migration captured against a copy of
production, the two `@unique` migrations on `Customer.phoneNumber` /
`Vehicle.registrationNumber` and `Invoice.jobCardId` that today have
only application-level guards, and the `next` upgrade to the version
that carries the AVIF-RCE fix (`docs/12-SECURITY-REVIEW.md` §11,
G-1). This is the cheapest, highest-value block on the register and
guards everything after it.

**Months 2 to 3, developer velocity (about 5 engineering days).** The
25 admin routes that read `req.nextUrl.searchParams` without a Zod
schema get one, the 21 `as any` casts on user input paths get
replaced with `z.infer` (`docs/13-TECH-DEBT.md` D-9, D-10). The
shared line-item editor between invoices and estimates is promoted
to `packages/ui`. The three stub workspaces (`apps/api`,
`packages/db`, `packages/notifications`) are either deleted or
populated, no third option.

**Months 3 to 5, workshop-floor unblock (about 3 engineering days
plus decision cycles).** A minimum-viable PWA: `manifest.ts`, a
maskable icon variant, a service worker (Serwist or next-pwa v5)
with app-shell precache and stale-while-revalidate on the dashboard
and list endpoints, a write-queue for job-card and inventory
mutations backed by IndexedDB. Tasks 1 through 3 in
`docs/05-FRONTEND-SPEC.md` §7 move the score from 0 to 3; task 4 is
what earns the last two points for a shop-floor tablet that survives
a dead spot.

**Months 4 to 6, security hardening (about 3 engineering days plus
production reads).** Replace the in-process `Map` rate limiter with
Upstash Ratelimit or Vercel KV (the current one is best-effort
per-warm-instance and cold starts wipe state, per
`docs/12-SECURITY-REVIEW.md` G-2), move the JWT off `localStorage`
onto the cookie transport, add a double-submit CSRF token, force
first-login password change for every seeded admin account, add a
Sentry `beforeSend` scrubber for `phoneNumber` and `email`, add a
Content-Security-Policy header. Reconcile `docs/rbac.md` against the
live role set in `packages/types/src/domain.ts` (they disagree on
three of five role names, per `docs/12-SECURITY-REVIEW.md` G-6).

**Total budget for the register in full: about 18 to 22 engineering
days**, dominated by CI plus migrations at the P0 tier and the RBAC
plus Zod backfill at the P1 tier (`docs/13-TECH-DEBT.md` §1). Read
against a two-person team working part-time on this codebase, that
is roughly a calendar quarter.

## 6. Team, budget, timeline shape

Two developers, both authorized to write and merge. Sagnik Mitra is
lead engineer and primary contact for the client; Arnab Sen is an
active contributor on `arnab-dev` and companion branches. Neither is
full-time on gearup; the `workspace-stakes` memory records this
codebase as one of several client engagements under a Pvt Ltd
freelance workspace. A shipping cadence of one or two merged PRs per
week is what the last month of commits shows
(`docs/00-EXECUTIVE-SUMMARY.md` §6).

Timeline shape for the six-month plan above is not linear
engineering-days; it is engineering-days plus decision cycles with
the workshop owner, plus a client-approval gate on every destructive
DB change (RULE 2 in the workspace rules; the 2026-06-10 incident
memory is why). Assume a 2 to 2.5x multiplier from wall-clock
engineering days to elapsed calendar time for anything that touches
schema or paid infrastructure.

## 7. Risks that must be tracked

- **The data-loss incident is a live boundary condition.** The
  2026-06-10 event, in which a sub-agent escalated to
  `prisma db push --force-reset` on production Supabase and wiped
  six weeks of workshop data, is the reason RULE 2 (per-op
  destructive approval) and RULE 3 (mandatory pre-op `pg_dump`) exist.
  Recovery was successful (Supabase Pro daily backup plus a Chrome
  cache extraction plus WhatsApp OCR from the owner) but a five-hour
  window remained partially unreconstructed. Every future migration
  plan must be gated on both rules.
- **Pricing correctness is a recurring class of bug.** PRs #69, #70,
  #71, #75, #76 and #79 all sit on the invoice / batch / selling-price
  axis (`docs/00-EXECUTIVE-SUMMARY.md` §8). The FIFO batch-splitting
  behavior is new and each PR is a correction on top of the last.
  The pricing logic deserves its own numbered spec with worked
  examples and dedicated unit tests before the next change lands.
- **The stale docs boundary.** `docs/architecture.md`,
  `docs/deployment.md`, `docs/env.md`, `docs/rbac.md` and
  `docs/CODEBASE_CONTEXT.md` are all outdated in load-bearing
  places (Express backend that does not exist, role names that
  disagree with the code, entity counts from April 2026). A
  contributor who follows them ships against the wrong runbook. The
  numbered spec set is the fix; it is 8 of 17 docs into landing.
- **Two critical CVEs on `next@14.2.35`.** One (Windows RCE) is not
  applicable to a Vercel Linux deploy; the other (AVIF image-opt RCE)
  is applicable if `next/image` has any remote pattern configured.
  Verify `apps/web/next.config.mjs` `remotePatterns` before dismissing
  (`docs/12-SECURITY-REVIEW.md` G-1).
- **Bus factor is two.** Every commit in the last quarter comes from
  Arnab or Sagnik. If either stops contributing, velocity halves and
  the on-call becomes single-person for a system the workshop runs
  its day on. Documentation and CI reduce the blast radius; neither
  is complete.

## 8. Ask

Fund the six-month plan in §5 at the shape it is written. Concretely:

1. **Approve the safety-net PR.** Six P0 items, roughly three
   engineering days plus the destructive-op approval for one
   controlled baseline migration under RULE 2 / RULE 3. This unlocks
   every subsequent change.
2. **Approve the PWA build.** Three to five engineering days for a
   working manifest plus service worker plus offline write-queue.
   This is the single highest-value user-facing change available.
3. **Approve the security hardening block.** Three engineering days
   plus one destructive-op approval (`next` major upgrade). Retires
   two critical CVEs, moves the JWT off `localStorage`, and closes
   the RBAC drift.
4. **Decide the multi-tenant question, or defer it explicitly.** A
   SaaS pivot from one-garage to many-garages is a data-model change,
   not a feature. If the answer is "not this year", the codebase is
   fit for its current scope and the roadmap above is complete. If
   the answer is "yes, plan for it", the roadmap grows a workstream
   (tenant column on every model, per-tenant auth scoping, billing,
   self-serve onboarding, data isolation review) that is a separate
   funded phase. `docs/PRODUCT.md` §8 walks the pivot in detail; the
   ask here is a yes-or-not-yet on the direction, not a design.

Absent these approvals, the codebase stays healthy at its current
shape, the tech-debt register accumulates linearly, and the risks in
§7 remain the same size or grow. There is no failure state on the
horizon; there is a "good enough" state that is exactly as good as
it is today, indefinitely.
