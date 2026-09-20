---
mode: decision-log
updated: 2026-09-20
verified_against: dfb9bec
tier: 0
status: proposals - not decisions made
---

# DECIDE - the open questions the roadmap depends on

> **This is a proposal log, not a decisions ledger.** Each item below is a decision that needs to be made before the corresponding piece of the roadmap in `docs/THESIS.md` §5 can fire. Every option is written to be argued with. Every recommendation is one paragraph, not a policy. Sign-off is named per item; nothing is decided until the named owner says so in writing.

> **Method.** I drew the decision set from `docs/13-TECH-DEBT.md` (which enumerates the tech-debt items ranked P0 to P2), `docs/12-SECURITY-REVIEW.md` (recommendations §16), `docs/05-FRONTEND-SPEC.md` (design-system gaps and the PWA verdict in §7), and `docs/07-INTEGRATIONS.md` (the notifications-and-WhatsApp gap in §4). Ten decisions cover the load-bearing choices; a longer list would repeat what the tech-debt register already sequences. Each decision cites the file and section that produced the question.

> **What this document did NOT do.** It did not adjudicate any of the decisions. It did not check with the client. It did not size the customer-facing impact of any option beyond what the spec set already recorded. It did not price the vendor options against a real quote; every price cited is the vendor's public list, not a negotiated number.

---

## How to read a decision

For each of the ten decisions:

- **Title.** One line, in the imperative.
- **Context.** Why the decision exists, cited to the section that produced it.
- **Options.** Two to four concrete alternatives. Each option names its own tradeoff.
- **Recommendation.** One paragraph, one option picked, one reason.
- **Blast radius.** What breaks or gets more expensive if the wrong option is chosen.
- **Owner.** Sagnik, Arnab, or external. Approval means an explicit written yes in a commit message, a PR body, or a chat message that names the decision.

---

## Decision 1 - Next major upgrade path

**Context.** `docs/12-SECURITY-REVIEW.md` §11 records `next@14.2.35` on the current deploy with two critical CVEs: `GHSA-p293-qw3h-jr36` (Windows-server RCE, N/A on Vercel Linux) and `GHSA-2xp9-vwfh-vxw4` (AVIF image-optimization RCE, applicable if `next/image` is configured with remote patterns). The AVIF patch landed in Next 14.2.36 and later; the same block is closed by Next 15.5.24 and later. Beyond the immediate CVE, Next 15 changes several defaults (React Server Components caching, dynamic-IO, `after()`) and closes most of the 26 high-severity transitive advisories that ride on 14.x.

**Options.**

- **1A. Patch to Next 14.2.36 (or latest 14.x).** Smallest possible change. Closes the AVIF CVE. Leaves the codebase on 14 for another 6-12 months.
- **1B. Jump to Next 15.x now.** Closes the CVE, the transitive-advisory tail, and puts the codebase on the current major. Requires an audit of `next.config.mjs`, the `withSentryConfig` wrapper, and every dynamic route for the caching-default change.
- **1C. Skip the patch and disable `next/image` remote patterns until 15.x lands as part of a scheduled upgrade.** Rejects the risk by removing the surface. Only viable if the app does not need remote image optimization today; `apps/web/next.config.mjs` should be read before choosing this.

**Recommendation.** **Option 1A now, Option 1B in months 4-6.** The AVIF CVE is a real production risk today and 14.2.36 closes it in a version bump that carries zero API changes. A 15.x jump requires an afternoon of audit and a full regression pass through the admin surface; that work belongs alongside the multi-tenant refactor in months 4-6 of the roadmap (`docs/THESIS.md` §5.2), not in the current sprint. Doing both at once risks conflating a security patch with a behaviour change.

**Blast radius.** Wrong choice A costs a delayed 15.x migration; nothing breaks. Wrong choice B (jumping to 15 now without an audit) risks introducing subtle caching regressions on the dashboard SWR path (`docs/05-FRONTEND-SPEC.md` §6). Wrong choice C leaves a critical CVE open in the meantime.

**Owner.** Sagnik.

---

## Decision 2 - Migrate to Prisma migrations

**Context.** `docs/13-TECH-DEBT.md` §D-1 records that there is no `prisma/migrations/` directory. Every schema change is applied through `prisma db push`, which writes DDL without recording it. `docs/THESIS.md` §3.2 explains why (velocity over history during a bespoke build). The June 2026 data-loss incident recorded in `docs/12-SECURITY-REVIEW.md` §15 is the closed version of what "no migration history" can cost, though the proximate cause of that incident was a destructive DB op run without the RULE 2 confirmation gate, not `db push` itself.

**Options.**

- **2A. Adopt migrations now.** Run `prisma migrate dev --name baseline` against a copy of production, commit the baseline SQL, switch `db:push` out of the shipping path, gate future schema changes on `prisma migrate deploy` in CI once the CI workflow lands (Decision 8 below).
- **2B. Adopt after the second customer signs.** Keep `db push` velocity during the last months of single-tenant iteration; switch to migrations as part of the multi-tenant refactor.
- **2C. Keep `db push` indefinitely, add a "manual dump before every schema change" gate.** Codifies the current discipline; does not solve reproducibility on a fresh clone.

**Recommendation.** **Option 2A now.** The switch to migrations is a one-day task (`docs/13-TECH-DEBT.md` §D-1) and unblocks reproducible schema state on a fresh clone, which is the single most valuable property to have before a second customer's data enters the picture. Baseline against a fresh `pg_dump` (per RULE 3 in `~/.claude/CLAUDE.md`); do the switch in one PR with a rollback plan. The velocity cost is minimal because at this point the schema changes weekly, not daily.

**Blast radius.** Wrong choice A costs one day of setup plus a small ongoing tax on schema changes. Wrong choice B compounds the current risk for another quarter; the next incident becomes correspondingly harder to recover from. Wrong choice C institutionalises a workaround where a fix exists.

**Owner.** Sagnik.

---

## Decision 3 - Rate limiter substrate

**Context.** `docs/12-SECURITY-REVIEW.md` finding G-2 records that the current rate limiter is an in-process `Map` in `apps/web/src/middleware.ts:19-31`. Vercel's serverless model means each warm instance carries its own Map; cold starts wipe state; the effective limit is `N-instances × the-configured-number`. `apps/web/src/middleware.ts` already carries a `TODO(prod-blocker)` for a durable replacement.

**Options.**

- **3A. Upstash Ratelimit.** Serverless-native, Redis-backed, free tier covers 10K commands/day. Purpose-built for Vercel and Cloudflare edge. Adds one vendor to the trust surface; adds ~15ms of latency per gated request.
- **3B. Vercel KV (Redis-compatible).** Already a Vercel-first-party product, integrates with the same dashboard, billed against the same account. Hobby tier is free (30K commands/day, 256MB); Pro adds usage-based pricing. Adds no new vendor.
- **3C. Stay in-memory, harden the route-level guards instead.** Rely on the per-phone 60s cooldown, the SHA256 fingerprint window, and the DB duplicate check for the abuse-sensitive endpoints (already documented in `docs/12-SECURITY-REVIEW.md` §9). Cheapest option; leaves the login-attempt limiter as best-effort.

**Recommendation.** **Option 3B, Vercel KV.** The product is already all-in on Vercel; adding a KV instance keeps the trust surface flat and the billing under one dashboard. Upstash is technically better as a rate-limiter primitive (its `@upstash/ratelimit` client is purpose-built), but the marginal engineering saving does not earn a second vendor at this scale. The upgrade to Upstash is a swap of one adapter behind the same interface; defer it until KV shows a real bottleneck.

**Blast radius.** Wrong choice A adds a vendor. Wrong choice B locks in a Vercel primitive; if the app ever moves off Vercel the limiter has to be reimplemented. Wrong choice C leaves the login lockout best-effort against distributed IPs, which is a real risk in a small workspace with high-value credentials.

**Owner.** Sagnik.

---

## Decision 4 - JWT storage strategy

**Context.** `docs/12-SECURITY-REVIEW.md` findings G-4 and G-5 and `docs/05-FRONTEND-SPEC.md` §8 record that the JWT is currently stored twice: as an httpOnly cookie `gearup_token` and in `localStorage.gearup_token`. The `localStorage` copy powers the `Authorization: Bearer` header on client-side `fetch`. The doc block at `apps/web/src/lib/auth.ts:7-30` records the decision and the fallback plan: any XSS in a client route can exfiltrate the localStorage token.

**Options.**

- **4A. Cookie only.** Drop the `Authorization: Bearer` header path, read the cookie server-side, add a double-submit CSRF token for state-changing endpoints. This is the plan recorded in `apps/web/src/lib/auth.ts:11-30`.
- **4B. localStorage only.** Simplifies the client, breaks the server-side layout guard, requires re-authing on every fresh browser tab, keeps the XSS risk. Worst of both worlds; kept here to be explicit that it is rejected.
- **4C. Both, indefinitely.** Current state. Doubles the surface; means an XSS-safe fix has to change both paths.

**Recommendation.** **Option 4A.** Cookie-only is the correct shape for a server-rendered admin app; the `Authorization: Bearer` path is a legacy of an earlier client-heavy architecture that the current App Router deployment no longer needs. The CSRF token is a small addition. This is a one-to-two day PR that closes G-4 and the doc-block plan in one motion. Do it after Decision 3 lands so the login flow's rate limiting is durable during the transition.

**Blast radius.** Wrong choice A costs one to two days plus a client-side refactor of `apps/web/src/lib/api/client.ts`. Wrong choice C leaves the XSS surface open for another quarter; a single vulnerable admin page becomes a full credential compromise.

**Owner.** Sagnik.

---

## Decision 5 - PWA scope

**Context.** `docs/05-FRONTEND-SPEC.md` §7 gives the PWA verdict `0/5` and enumerates the missing pieces: no manifest, no service worker, no maskable icon, no offline shell, no install prompt. §7 also describes which parts of the app suffer most on flaky connections (job cards under work, inventory movement recording, live appointment status changes). The workshop-floor tablet is the primary target for a PWA build.

**Options.**

- **5A. Full PWA with offline write queue.** Manifest, service worker (via Serwist or next-pwa v5), app-shell precache, SWR for the dashboard reads, IndexedDB write-queue with Background Sync fallback for job-card and inventory-movement mutations, install prompt in the admin sidebar. `docs/05-FRONTEND-SPEC.md` §7 sizes this at ~1-2 days for the write queue on top of ~4-6 hours for the SW and ~1.5 hours for the manifest and icon.
- **5B. Manifest + SW + read cache only.** Install prompt, offline app shell, cached dashboard reads. No offline writes; a dropped POST still loses the edit. ~6-8 hours total.
- **5C. Skip.** Rely on the shop's WiFi being reliable. Zero engineering cost, real cost when the connection drops mid-save.

**Recommendation.** **Option 5B first, Option 5A after months 4-6.** The manifest and read-cache path buys most of the perceived value (instant app open, dashboard renders on the way in, install prompt on the tablet) at a fraction of the cost. The offline write queue is a real feature but it needs a full loop of testing on real hardware; that belongs after the P0 tier of the tech-debt register clears. Do 5B in the current sprint alongside the security backlog; schedule 5A as a named feature for months 4-6.

**Blast radius.** Wrong choice A costs the extra day and a half. Wrong choice B leaves offline writes on the roadmap for another quarter, which is acceptable if the shop's WiFi is documented as reliable enough. Wrong choice C means every future connection blip is a support ticket.

**Owner.** Sagnik.

---

## Decision 6 - Multi-tenancy timing

**Context.** `docs/01-PRODUCT-AND-DOMAIN.md` §1 records that the product is single-tenant: no `tenantId` column, no workspace, no organisation. `docs/THESIS.md` §3.3 explains why (single-tenant now, refactor when the second customer is close). §4.3 of the same doc names the falsifier (if the refactor turns out to be more expensive than a rewrite, the bet fails). The 42-model schema (`docs/03-DATA-MODEL.md`) is a large surface to change.

**Options.**

- **6A. Refactor now, before the second customer signs.** Add `tenantId` to every table, backfill the current customer's rows, update every query, land the changes in a series of small PRs. Buys optionality but has no forcing function; the shape of the tenant column is a guess without a second customer's data to shape it.
- **6B. Refactor after the second customer is signed but before their data enters production.** Use the sales process as the trigger; scope the refactor as a two-week block once the contract is in. Ships the current customer on a proven single-tenant deployment throughout.
- **6C. Never refactor.** Run each customer on their own database and application instance, manage a small fleet through Vercel projects and Supabase branches. Real option at low scale; falls over past ~20 tenants.

**Recommendation.** **Option 6B.** The refactor before the second customer signs is speculative; the refactor after they sign but before their data lands is grounded in a real requirement. Use the two-week runway between contract and data-migration as the tenant-refactor window. Before signing, spend one day scoping the refactor as a normal PR (per `docs/THESIS.md` §4.3); if the estimate is over one engineer-month, escalate to Option 6C for that specific customer as a fallback and reassess.

**Blast radius.** Wrong choice A costs two weeks of engineering against a customer that may never sign. Wrong choice B has no downside if the scoping day is done in advance. Wrong choice C institutionalises a per-tenant infrastructure cost that eats the margin past a small handful of customers.

**Owner.** Sagnik and Arnab jointly; the tenant column shape needs both engineers' review.

---

## Decision 7 - Testing floor

**Context.** `docs/13-TECH-DEBT.md` §D-20 records 17 test files against 216 source files in `apps/web/src/`. Zero unit tests for route handlers; the E2E suite covers admin, features, and roles at the smoke level. `docs/13-TECH-DEBT.md` §D-21 flags that there is no coverage threshold gate. The recurring pricing bugs on the invoice / batch / selling-price axis (PRs #69, #70, #71, #75, #76, #79 per `docs/00-EXECUTIVE-SUMMARY.md` §8) are the specific concern; each of them was a correction on top of the last, and unit tests would have caught most of them.

**Options.**

- **7A. Coverage floor at 40% lines, gate in CI.** Modest target; achievable in ~2 days of writing tests for the five highest-blast-radius route handlers (invoice create, invoice finalize, payment record, AMC decrement, job-card cancel). Ratchet up over time.
- **7B. Coverage floor at 60% lines, gate in CI.** More ambitious; requires backfilling tests for most of the admin surface. ~1 week of dedicated work.
- **7C. No coverage floor; require a test with every PR that touches a route handler.** Process gate, not a number gate. Cheaper to institute; relies on reviewer discipline.

**Recommendation.** **Option 7A.** A 40% floor is high enough to force the highest-blast-radius routes to have tests and low enough that it can land in one PR without a week of test-writing. Ratchet by 5 points per quarter; land the ratchet as a scheduled config change, not a manual decision each time. Pair the floor with a rule that any PR that lowers coverage below the floor requires a written justification in the PR body.

**Blast radius.** Wrong choice A costs two days of test-writing plus a small ongoing tax. Wrong choice B risks a testing-theatre outcome where tests are written to hit the number, not to catch bugs. Wrong choice C relies on discipline that has already failed six times on the pricing axis.

**Owner.** Sagnik.

---

## Decision 8 - Retire or update `docs/architecture.md` and `docs/deployment.md`

**Context.** `docs/00-EXECUTIVE-SUMMARY.md` §8 and `docs/13-TECH-DEBT.md` §D-16 both record that `docs/architecture.md` and `docs/deployment.md` describe a two-app monorepo with a sibling `apps/api` Express service on Render, with cron jobs in the backend process. The running application is Next.js Route Handlers only; `apps/api` is not the deployed backend. `docs/env.md` carries related stale references (`NODE_ENV` / `PORT` / `CORS_ALLOWED_ORIGINS`). The numbered spec set (`docs/00-` through `docs/17-`) is the intended replacement.

**Options.**

- **8A. Delete both files, add a one-paragraph stub pointing at the numbered spec set.** Cleanest option; loses the historical view.
- **8B. Rewrite both files against the current tree.** Preserves the docs as first-class references but duplicates content that the numbered spec set already carries.
- **8C. Leave both files in place with a stale-warning header, delete them once the numbered spec set is complete (`docs/00-` through `docs/17-`).** Interim option; preserves history for the current transition.

**Recommendation.** **Option 8A.** The numbered spec set is the source of truth for what the code does; keeping a second set of files that describe an earlier architecture creates two sources of truth, which the projection law in this workspace forbids. Replace `docs/architecture.md` and `docs/deployment.md` with one-paragraph redirects to `docs/00-EXECUTIVE-SUMMARY.md` and `docs/11-DEPLOYMENT.md`. Do the same for `docs/env.md` once `docs/09-ENVIRONMENT.md` is complete. Preserve the deleted content in git history; that is what git is for.

**Blast radius.** Wrong choice A costs zero; anyone who wants the old view can `git log`. Wrong choice B keeps two documents in sync forever, which will fail. Wrong choice C is fine as an interim but requires a real follow-up to actually delete the files.

**Owner.** Sagnik.

---

## Decision 9 - Rotate seed admin passwords, and how to gate first-login change

**Context.** `docs/12-SECURITY-REVIEW.md` findings G-3 and G-9 record that `apps/web/prisma/seed.ts:7,19-23` hashes the plaintext `admin123` and upserts five accounts (`admin`, `arnab`, `priya`, `receptionist`, `mechanic`) all sharing that hash. There is no first-login password-change enforcement. The current production posture is that these accounts must be rotated manually after first boot; there is no gate that stops a lazy or forgetful operator from leaving them at the default.

**Options.**

- **9A. Add a `mustChangePassword` boolean on `AdminUser`, default true for seeded accounts, refuse non-change requests until it clears.** Enforces rotation in code. Requires a small schema change (Decision 2 becomes a precondition) and a route change.
- **9B. Rotate manually now, document the process, do not change the code.** Ships a fix today at the cost of a recurring manual step. Fine for a one-garage deployment; fails for a self-serve tenant model.
- **9C. Remove the seed entirely; require an explicit admin bootstrap script for every fresh deployment.** Removes the class of risk. Costs onboarding friction.

**Recommendation.** **Option 9A.** The `mustChangePassword` gate is a load-bearing feature the moment there is a second customer (nobody's admin should have their default password from a shared seed), and it is cheaper to build now than to retrofit later. Land it in the same PR as the seed-password rotation (Recommendation 2 in `docs/12-SECURITY-REVIEW.md` §16). Manually rotate all five current production passwords in the same window; verify by checking that no two `passwordHash` values in the DB are equal to the seed hash.

**Blast radius.** Wrong choice A costs half a day of schema and route work. Wrong choice B leaves a manual step in the onboarding checklist that will be forgotten. Wrong choice C makes onboarding heavier for the eventual self-serve flow.

**Owner.** Sagnik; the schema change also needs Arnab's review because it touches `AdminUser`.

---

## Decision 10 - Adopt sgnk-shadow-promote for CLAUDE.md changes in this repo

**Context.** Learned Rule #38 in `~/.claude/CLAUDE.md` requires that no routing, skill, or CLAUDE.md change goes dev-to-live; every change flows through an offline eval → shadow run → auto-promote pipeline via the `sgnk-shadow-promote` skill. The current gearup repo has no CLAUDE.md file at the project root (only `AGENTS.md`, which is a 13-line claude-mem stub); Sagnik's global CLAUDE.md governs. As gearup grows and the spec set stabilises, it becomes valuable to add a project-scoped CLAUDE.md that carries the load-bearing operating rules (RULE 2 pre-op backup, RULE 3 pre-op `pg_dump`, the destructive-op gate, the IST helper convention, the "resolve HSN outside the tx" pattern). Changes to that file should follow the shadow-promote discipline.

**Options.**

- **10A. Adopt now.** Author a project CLAUDE.md that carries the load-bearing operating rules, promote all future changes through `sgnk-shadow-promote`. Consistent with the workspace-wide standard.
- **10B. Defer until the second customer signs.** Wait until there is a real risk of a second maintainer having context loss; adopt the shadow-promote pipeline then.
- **10C. Do not adopt; keep the global CLAUDE.md as the only source of truth.** Simplest option; loses the project-scoped clarity.

**Recommendation.** **Option 10A.** A project CLAUDE.md is a two-hour authoring task and it gives every future session (Claude, Codex, or a human) a single load-bearing rule set that names the destructive-op gate, the pre-op backup requirement, the IST helper convention, and the pooler-safe transaction pattern. Adopting shadow-promote for its updates is free once the rule set exists; the discipline is a two-line addition to the doc's own frontmatter. Land the initial CLAUDE.md in one PR marked as "shadow-run for 10 tasks before promoting" per Learned Rule #38.

**Blast radius.** Wrong choice A costs two hours of authoring plus a small ongoing tax on rule updates. Wrong choice B leaves the current session-continuity risk (a fresh Claude session may miss the pooler pattern and re-introduce the P2028 class of bug) unaddressed for another quarter. Wrong choice C makes it harder for the eventual self-serve tenant flow to inherit the safety discipline that this workspace requires.

**Owner.** Sagnik.

---

## Summary

Ten decisions. Six of them (Decisions 1, 2, 3, 4, 5, 8) are actionable in the current sprint against the P0 and P1 tiers of `docs/13-TECH-DEBT.md`. Two of them (Decisions 6 and 9) block the second-customer trial in months 4-6 of the roadmap. Two of them (Decisions 7 and 10) are process changes that pay back over months, not weeks.

The three that need Sagnik's explicit yes first, because they set the shape of everything after them:

1. **Decision 2** (adopt Prisma migrations now) - blocks Decision 9 and the second-customer trial.
2. **Decision 6** (multi-tenant refactor timing) - blocks the entire SaaS roadmap in `docs/THESIS.md` §5.3.
3. **Decision 1** (Next 14.2.36 patch now, 15.x jump later) - blocks nothing directly but the CVE is real production risk today.

Every other decision can wait a week or two; these three set the direction.

The next document to open is `docs/13-TECH-DEBT.md` for the sequencing view of the technical work, or `docs/THESIS.md` for the argument that this decision log is grounded in. When a decision here lands, note it in a commit message that names the decision by number and cite the outcome; that is how the log stays truthful.

Verified against `dfb9bec` on 2026-09-20.
