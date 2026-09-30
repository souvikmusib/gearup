---
mode: thesis
updated: 2026-09-20
verified_against: dfb9bec
tier: 0
---

# THESIS - why gearup exists and how it should evolve

> **This is the argument, not the spec.** The spec set (`docs/00-` through `docs/17-`) describes what the code does today. This document describes what the product is FOR, what bet it makes, and what would break the bet. Read `docs/DECIDE.md` alongside it for the open questions the roadmap depends on.

> **Method.** I read every file in the numbered spec set that has landed (`docs/00-EXECUTIVE-SUMMARY.md` through `docs/15-GLOSSARY.md` plus `docs/17-CODEMAP.md` and `docs/29-RUNBOOK.md`), `docs/CODEBASE_CONTEXT.md`, `docs/rbac.md`, `AGENTS.md`, and the two style reference docs at `/Users/sagnikmitra/Desktop/GitHub/frontmatter/docs/THESIS.md` and `.../DECIDE.md`. I read `~/.claude/CLAUDE.md` for the workspace rules that govern this repo. The HEAD sha at the time of writing was captured with `git rev-parse HEAD`. No number below is invented; every count and file path was cited earlier in the spec set and can be re-derived from the commands recorded in each of those docs' Method blocks.

> **What this document did NOT do.** It did not run the app, did not open a database, did not read the Vercel dashboard, did not contact the client, did not survey a second garage, did not price a competitor. Every claim about the market is a hypothesis stated as one, not a measurement. Every claim about the code cites the spec-set section that measured it.

---

## 1. The problem

The Indian small garage is a business that runs on paper and WhatsApp. A typical single-owner workshop in a Kolkata or Pune neighbourhood books work through a spiral notebook, dictates parts orders to a supplier over the phone, prints an invoice on a dot-matrix that has been on the same table for eleven years, and reconciles the day's cash on the ride home. The tools that exist for it either (a) come from a large ERP vendor and are priced at a per-seat number the owner will not pay, (b) come from a payment-gateway company that solves one screen and calls itself a garage app, or (c) come from a well-intentioned local developer whose second project it is and who disappears after six months.

The pain is not that the software is bad. The pain is that the software does not match the shape of the work. A garage owner does not think in "tickets" and "SLAs". He thinks in "which car is on which lift", "which mechanic is on leave", "did that Alto customer pay the balance", "is the AC filter for a Baleno in stock". A CRM built for a SaaS sales team cannot answer any of those questions without being bent into a shape it was not designed for.

The specific pains, drawn from the domain doc (`docs/01-PRODUCT-AND-DOMAIN.md`) and from the client's own voice-notes brief (`docs/requirements/voice-notes-2026-06-16.md`), all live in the same operational loop:

- **Job cards are paper.** A customer walks in with a car. The reception writes name, phone, registration, complaint, odometer reading, fuel level. The paper walks with the car to a bay. Parts are added by pencil marks. At delivery the paper walks back and the invoice is transcribed a second time by the person who owns the printer. Every rewrite is a transcription error waiting to be an argument about a bill.
- **Coordination is WhatsApp.** The mechanic photographs the underbody, sends it to reception, reception forwards it to the customer, the customer approves in a voice-note. Nothing lands in a system of record. When the customer disputes an item next month, there is no thread; there are three phones.
- **Cash is the default.** Cash reconciliation happens at end-of-day against the notebook. Bank transfers appear against later invoices by hand-matching a UPI reference. Card payments are a smaller channel because the terminal charges 2%.
- **GST is a compliance risk, not a feature.** A garage that hits the ₹20L turnover threshold owes GST on parts and labour at the correct HSN-coded rate. Most small shops either skip it, cross-subsidise it out of margin, or hire a part-time CA who arrives once a quarter with a shoebox of receipts.
- **AMC contracts are a napkin ledger.** The owner sells a "5 services in 12 months for ₹X" package, hand-writes the redemption on the back of the customer's copy, and hopes both parties count to five.
- **The bus-factor is one.** If the owner is out for a week, revenue drops because nobody else can price a job.

Sagnik's client is one shop of tens of thousands with the same profile. He is not an outlier in his problem; he is an outlier only in that he found a developer willing to build his software from scratch instead of buying a compromise.

## 2. The wedge

gearup starts as a bespoke build for one paying customer. That is the honest description of the current state (`docs/00-EXECUTIVE-SUMMARY.md` §1). The interesting question is not whether that is a business today. It is whether the shape of the work at one garage is close enough to the shape of the work at ten garages, and then a hundred, that the same schema, the same permissions, and the same invoicing engine keep working with only the trims changed.

The bet has three parts, and each part is a claim you can argue with.

**Bet 1. The mechanics of running one garage well are the same across many garages.** A booking becomes an appointment becomes a job card becomes a set of part reservations becomes an invoice becomes a payment becomes a delivered vehicle. That loop is what `docs/01-PRODUCT-AND-DOMAIN.md` §4 walks through in nine numbered steps against the current route handlers. If the same nine steps hold at a second garage with only string constants and rate tables changed, the schema is portable and the software cost per garage tends toward zero as the fixed cost is amortised.

**Bet 2. Most of the complexity is regulatory, not operational.** The parts of the code that are hardest to get right are the ones that answer to a law: GST at the correct HSN-coded rate (`apps/web/src/lib/hsn-rate.ts`, `docs/03-DATA-MODEL.md` under `HsnRate`), the invoice-number sequence per business day (`DocumentSequence`, `docs/01-PRODUCT-AND-DOMAIN.md` §5), the IST-normalised date boundary on every list filter (`apps/web/src/lib/date-boundaries.ts`), the audit trail (`ActivityLog`, `apps/web/src/lib/activity-logger.ts`). Those are hard once. They are the same for every Indian shop. If the software eats that complexity in one place, the marginal garage does not have to.

**Bet 3. The distribution problem is local, not national.** Selling software to 30,000 small garages through cold outbound would cost more than the software makes. The realistic distribution is (a) the current customer becomes a reference, (b) the same 200-shop cluster in East India adopts through word-of-mouth and a small local salesforce, (c) once the product is stable it is packaged for a franchise or a parts-distributor to sell as a bundled add-on to their own network. That is a two-year path, not a two-quarter one, and it is the reason the current shape is "harden the single deployment first, then productize" rather than "scale the tenant model first, then sell".

The wedge, put plainly: **be the operational system of record for one garage first, and stay narrow enough to become the same thing for many.** Every early-stage architectural decision in this repo is a bet on that sequence.

## 3. The design decisions that follow

If you accept the wedge, a specific set of engineering choices falls out. Each one is defensible on its own; taken together they describe the shape of gearup today.

### 3.1 Next.js + Postgres single monolith, not microservices

The application is one Next.js 14 App Router project deployed on Vercel with a Supabase Postgres behind it (`docs/00-EXECUTIVE-SUMMARY.md` §2, `docs/07-INTEGRATIONS.md` §1). There is no separate Express service, no message queue, no service-per-domain split. `docs/architecture.md` still describes a two-app monorepo that has not existed in the code for months (`docs/00-EXECUTIVE-SUMMARY.md` §8).

The reason is that a small shop's workload is not compute-heavy enough to earn a second process. 83 route handlers (`docs/00-EXECUTIVE-SUMMARY.md` §3) serving one garage's traffic with a 30-second Vercel function ceiling (`apps/web/vercel.json`) is a comfortable fit for a monolith. A microservice split would buy nothing but ops complexity and a bill for the second runtime.

The tradeoff, stated: a monolith is harder to scale to true multi-tenant later. The answer to that is Section 5 of this document; the tenant refactor is on the map, and the honest form is to do it once, when the second customer is close to signing, not to speculate at it now.

### 3.2 Prisma with `db push`, not `migrate`, for now

Every schema change is applied through `pnpm db:push` (`apps/web/package.json`), which writes DDL against the target database without recording a migration file. There is no `prisma/migrations/` directory (`docs/13-TECH-DEBT.md` §D-1).

The reason is velocity. During a bespoke build against one live customer, the schema changes weekly. `db push` gives you the fastest possible iteration loop, at the cost of a durable history. History matters when a schema is shared across environments and teams; it matters less when the schema is authored by two developers against one database.

The tradeoff is real and it has already cost this repo once. The June 2026 data-loss incident (recorded in `docs/audit/2026-06-10/`, referenced in `docs/12-SECURITY-REVIEW.md` §15) was a destructive DB op run without the confirmation gate that RULE 2 in `~/.claude/CLAUDE.md` now enforces. `db push` was not the proximate cause but the class of tool that makes such incidents cheaper to trigger. The disciplined form of "velocity first" is that as soon as the shape settles enough for a baseline migration to be worth writing (Section 8 of `docs/DECIDE.md`), the switch happens.

### 3.3 Single-tenant, not multi-tenant, until the second customer signs

Every table in `prisma/schema.prisma` belongs to one garage (`docs/01-PRODUCT-AND-DOMAIN.md` §1). There is no `Organisation`, no `Workspace`, no `tenantId` column, no row-level-security policy keyed on tenant.

The reason is that a speculative multi-tenant schema always gets the tenant boundary wrong. Building one before you have two customers means designing against an imagined second garage; and imagined customers do not push back on your assumptions. The correct time to introduce the tenant column is when the second real customer's data is about to enter the same database, because that customer's edge cases will tell you what the boundary actually needs to isolate.

The tradeoff is that the refactor gets more expensive as the schema grows. 42 models today (`docs/00-EXECUTIVE-SUMMARY.md` §3) is a lot of joins to add a `tenantId` to. Section 8 of `docs/DECIDE.md` sizes that work.

### 3.4 Custom JWT in a cookie, not OAuth

Auth is a hand-written JWT signed with `HS256`, delivered both as `Authorization: Bearer` and as an httpOnly cookie (`docs/12-SECURITY-REVIEW.md` §3). Five admin roles, thirty-nine permission keys, enforced by `requirePermission()` in every admin route (§4 of the same doc). No OAuth, no SSO, no third-party identity.

The reason is that there is no third-party identity to federate against. A garage owner does not have a Google Workspace, a Microsoft AD, or a corporate Okta. The people who log in are the owner, the receptionist, the mechanic, and one billing person. They have a username and a password and they always will. An OAuth integration would add three vendors to the trust surface without adding a user.

The tradeoff is that credential rotation is manual and the reset flow is by hand. That is acceptable at five users per deployment.

### 3.5 WhatsApp as the customer channel, not email

Every customer-facing message today is a `wa.me` deep link that the operator clicks to open a pre-composed message in their own WhatsApp (`docs/07-INTEGRATIONS.md` §4). There is no email provider wired up; the `Notification` table exists but nothing writes to it.

The reason is behavioural. Indian customers open WhatsApp. They do not open email at the rate that would make a transactional email worth building. A `wa.me` link with a pre-filled body is a one-click flow for the operator and a familiar surface for the customer, at zero API cost and zero deliverability worry.

The tradeoff is that there is no delivery receipt, no template-approval flow, no ability to send automatically at 3am. The moment the shop wants automated reminders, the WhatsApp Cloud API or an aggregator (AiSensy is the usual choice in this market) has to be wired in. That is a build, not a tweak, and it is deferred until there is a real reason.

### 3.6 IST-native, not UTC-with-local-render

All timestamps are stored in UTC (`docs/01-PRODUCT-AND-DOMAIN.md` §5), but every user-facing calculation runs through an IST helper that pins the offset at `5.5 * 60 * 60 * 1000` (`apps/web/src/lib/time.ts`). Date-range filters on list endpoints parse `from` and `to` as `new Date(from + 'T00:00:00+05:30')` and `new Date(to + 'T23:59:59+05:30')`. Report boundaries use the same helper.

The reason is that this product will never serve a second timezone in its current shape. India has one clock. A generalised timezone lookup, per-user timezone settings, or a `luxon` runtime would add complexity to a product that does not need it. The correct shape for a single-timezone product is a hard-coded offset with an audit-trail of every place it is applied. That is what the code does today.

The tradeoff is that the day gearup ships to a second timezone (a garage in a different country), the IST assumption becomes a search-and-replace exercise. That is a real cost, and it is the correct cost to pay in exchange for not carrying timezone abstraction for years first.

### 3.7 A small paid workspace, two developers, one live customer

The team is Sagnik and Arnab (`docs/00-EXECUTIVE-SUMMARY.md` §8 records 370 of 444 commits from Arnab under two identities, 72 from Sagnik). The client pays. This is a Pvt Ltd workspace registered under Sagnik's studio. Zephyrus, not a venture-funded startup.

The reason is that the funding shape has to match the ambition shape. A garage-ops SaaS in India is not a company that will absorb ₹4Cr in three years; it is a company that will pay a small team well from a growing base of small customers. Services funding gives the team the runway to build the product without owing anyone a growth curve that the market does not support. This mirrors the frontmatter thesis's Section 6 on money.

The tradeoff is that the timeline is longer and the runway is bought one client-hour at a time. That is a feature, not a bug, for this shape of business.

---

## 4. What could break the thesis

Every one of the bets in Section 2 has a way to be wrong. Naming them here so that a future decision can point back at whether the falsification actually happened.

### 4.1 The mechanics of one garage are not the same across all

This is the strongest single risk. If the second garage's workflow diverges from the first in ways that need parameterisation the schema does not yet have (a different intake process, a different invoice format required by their CA, a different labour-pricing convention), then the "one schema, many garages" bet fails and every new customer is a fork.

**How to test cheaply.** Before signing customer two, spend one afternoon walking through their current paper-and-WhatsApp workflow with them. Compare it against the nine-step lifecycle in `docs/01-PRODUCT-AND-DOMAIN.md` §4. If the two workflows are unrecognisable to each other, the bet is falsified and gearup should be positioned as a bespoke platform, priced accordingly, and not sold as a product.

### 4.2 Regulatory changes make the invoice engine expensive

Indian GST is not a stable law. Rate slabs change; HSN classifications change; e-invoicing thresholds move; the ITC (input tax credit) rules for automotive parts get revised. Every one of those changes lands as a code change in `apps/web/src/lib/hsn-rate.ts`, `apps/web/src/lib/invoice-calc.ts`, and the invoice templates. The cost of tracking that regulatory surface for many customers scales linearly with the number of edge cases each customer creates.

**How to test cheaply.** Track the number of hours per month spent on regulatory maintenance across the next six months. If it exceeds 10% of the total dev budget while the customer count is still one, it will not scale. Options at that point: buy a HSN/GST-as-a-service data feed, or accept the cost and price it into the plan.

### 4.3 Multi-tenant migration is more painful than a rewrite

The 42-model schema (`docs/03-DATA-MODEL.md`) does not carry a tenant column. When the second customer signs, the honest options are (a) add `tenantId` to every table, backfill the current customer's rows, and update every query, or (b) run each customer on their own database and application instance and manage a small fleet.

If option (a) is more work than a rewrite from a clean multi-tenant baseline, the bet on "single-tenant now, refactor later" fails. That is a rare outcome (most large monoliths accept a tenant refactor for less pain than a rewrite) but it is possible if enough of the current code implicitly relies on "there is only one customer".

**How to test cheaply.** Before the second customer signs, spend one day scoping the tenant refactor as if it were a normal PR. If the estimate is under two engineer-weeks, the bet holds. If it is over a month, the bet is starting to fail and the multi-tenant discussion becomes urgent.

### 4.4 A third-party prices out the target margin

The runtime depends on Vercel (host), Supabase (database), Sentry (errors), and eventually a WhatsApp aggregator. Each of those vendors can change pricing. Vercel Pro is $20/user/month with function-hour and bandwidth overages that can move sharply. Supabase Pro is $25/month with DB-size and MAU overages. A single WhatsApp template message through AiSensy is roughly ₹0.30 today; that can move.

If the total infrastructure cost per garage per month crosses roughly ₹1,500 (a rough two-digit fraction of what a small shop will pay for software), the unit economics stop working.

**How to test cheaply.** Instrument a monthly cost sum per deployment. Once there is a second customer, the ratio is measurable directly.

### 4.5 The client leaves

The current business is one paying customer. If that customer leaves, the product either becomes a portfolio piece or has to survive on a second customer that has not been signed. That is a single-point-of-failure risk that no engineering decision addresses.

**How to test cheaply.** The maintenance contract sets a notice period. The number to watch is not "will the customer leave" but "how quickly can a second one be signed if the first does". Section 5 sets a timeline for that.

---

## 5. What the next 24 months look like if the thesis holds

Stated as a path, not a promise. Each stage has an exit criterion that is observable, not felt.

### 5.1 Months 1-3: harden the single deployment

Ship the P0 tier of the tech-debt register (`docs/13-TECH-DEBT.md` §3): baseline Prisma migration, CI workflow, DATABASE_URL boot guard, next.js AVIF-RCE patch, seed-password rotation, PWA MVP. Land the P1 tier of the security recommendations (`docs/12-SECURITY-REVIEW.md` §16): move JWT off `localStorage`, replace the in-process rate limiter, reconcile `docs/rbac.md` with the code, add the Sentry scrubber and the first-login password change gate.

**Exit criterion.** All P0 items in `docs/13-TECH-DEBT.md` closed. CI green on every PR against `main`. Zero critical dependency advisories. The customer's owner can restore from a backup in under 30 minutes with the runbook (`docs/29-RUNBOOK.md`) and no engineer on call.

### 5.2 Months 4-6: second-customer trial and the multi-tenant refactor

Sign a second garage, ideally in the same city or district as the first so onboarding is in person. Run them on a fresh single-tenant database while the tenant refactor lands. Convert both to multi-tenant in one deploy once the refactor is proved on a test dataset.

**Exit criterion.** Two live customers on the same production deployment, isolated by tenant, with zero data-crossing incidents in the first 30 days. A tenant onboarding runbook that a non-engineer can follow.

### 5.3 Months 7-12: SaaS shape

Add self-serve onboarding (a signup that provisions a new tenant without engineer involvement), Stripe or Razorpay billing keyed on plan (free trial, starter, pro), and the first outbound sales motion (a two-person team, one for demos and one for onboarding). Publish public pricing.

**Exit criterion.** Ten paying tenants. A monthly recurring revenue number that covers the two-founder nut plus a small salesforce. A churn rate below 5% per month over the same window.

### 5.4 Months 13-24: scale features

At scale, the features that earn their place are the ones that only make sense with many customers. An inventory-network view where a shop can see whether a nearby shop has a needed part in stock. A parts-marketplace surface that lets a supplier ship to any tenant in the network. A service-history transferability feature that lets a customer whose favourite mechanic moved shops carry their vehicle's history with them.

**Exit criterion.** Fifty paying tenants. A distribution partner (a franchise, a distributor, or a parts network) driving a majority of new signups.

Every one of these numbers is a prediction. Nothing has been sold. Section 9 lists the falsifiers that would change the path.

---

## 6. What the next 6 months look like if the thesis is wrong

Stated so the exit is a plan, not a scramble.

If the tests in Section 4 falsify the wedge (the second garage's workflow is unrecognisable, or the regulatory maintenance eats the budget, or the tenant refactor is worse than a rewrite), the correct move is to stop building the product and switch to sunsetting it gracefully. That is not a failure; it is the discipline the thesis promised.

**Sunset gracefully.** Hand the current deployment back to the client with a paid maintenance contract that covers the next twelve months at a monthly retainer that keeps the lights on. The contract terms are simple: security patches, dependency upgrades, cloud-cost pass-through, one incident response per month included. Anything beyond that is billed hourly. The client keeps the software running for as long as they want to pay for it, and Sagnik keeps a running check on a business he built.

**Extract reusable pieces.** Three components of this codebase are more valuable than the product they are inside:

- The **invoice engine** (`apps/web/src/lib/invoice-calc.ts`, the HSN resolver, the 30-second transaction pattern documented in `docs/06-BACKEND-SPEC.md`) is a well-tested India-GST-aware invoicing kernel. It can ship as a standalone TypeScript library under Sagnik's studio and be sold or open-sourced.
- The **HSN cache** is a small, high-value data asset. The seed table plus the in-memory Map lookup is the shape any Indian invoicing product needs. Publish it as a library or a JSON dataset.
- The **AMC contract engine** (the `AmcContract`, `AmcPlan`, `AmcServiceUsage` triple and the race-safe decrement pattern) is generalisable to any prepaid-services product. Ship it as a Prisma-compatible module.

Doing this while the product is still fresh in the team's head, rather than after a year of decay, is the cheapest way to preserve the value that was created.

**Document the exit.** Write the sunset itself as a spec (a `docs/99-SUNSET.md` if it comes to that): what runs, what is deprecated, what the client's obligations are, what Sagnik's obligations are. Same discipline as every other doc in this repo. Do not let an exit be undocumented; that is how relationships end badly.

---

## 7. Closing

gearup exists because one garage owner in Kolkata wanted better software and one developer in the same city was willing to build it against a real, hard, unglamorous problem. That is a plausible starting point for a product; it is not yet a business. This document names the bet, the tests that would falsify it, and the paths in either direction.

The next document to read is `docs/DECIDE.md`, which turns the bets in this file into ten specific decisions that need to be made before the roadmap fires. Each of those is written as a proposal, not a decision made, because the point of writing them down is to make disagreement cheap and to make the eventual choice traceable.

The spec set (`docs/00-` through `docs/17-` and `docs/29-`) is the ground truth for what the code does. Trust it over this file when the two disagree, and update this file when the wedge itself changes.

Verified against `dfb9bec` on 2026-09-20.
