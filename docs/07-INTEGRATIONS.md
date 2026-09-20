---
mode: reference
updated: 2026-09-20
verified_against: b5a0da6
---

# Third-party integrations

> **This describes the code, not the plan.** Verified on 2026-09-20 against
> `b5a0da6`. Where `docs/notifications.md` or `docs/deployment.md` describe a
> WhatsApp sender, an Email provider, or a Render backend, that is the plan.
> Where this file describes them, that is what runs.

> **Method.** I read `apps/web/package.json`, `apps/web/vercel.json`,
> `apps/web/next.config.mjs`, `apps/web/instrumentation.ts`,
> `apps/web/sentry.client.config.ts`, `apps/web/sentry.server.config.ts`,
> `apps/web/sentry.edge.config.ts`, `apps/web/src/lib/prisma.ts`,
> `apps/web/prisma/schema.prisma` (datasource block),
> `apps/web/src/app/layout.tsx`, `apps/web/src/app/location/page.tsx`,
> `apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts`,
> `apps/web/src/app/api/admin/salary-slips/[id]/pdf/route.ts`,
> `apps/web/src/lib/invoice-templates/*`,
> `apps/web/src/lib/salary-slip-template.ts`,
> `apps/web/src/components/shared/whatsapp-button.tsx`,
> `apps/web/src/app/admin/settings/integrations/page.tsx`,
> `apps/web/src/app/api/admin/settings/route.ts`,
> `apps/web/src/app/api/admin/notifications/route.ts`,
> `.github/workflows/ci.yml`, `.github/workflows/db-backup.yml`,
> `scripts/db-backup.sh`, `scripts/db-backup-launchd.sh`,
> `docs/RESTORE.md`, `docs/notifications.md`, `docs/deployment.md`,
> `docs/env.md`. I ran greps for `fetch(`, `api.github.com`, `puppeteer`,
> `playwright`, `nodemailer`, `resend`, `sendgrid`, `postmark`, `whatsapp`,
> `wa.me`, `graph.facebook.com`, `twilio`, `aisensy`, `cloudflare`,
> `pooler.supabase`, `firebase-admin` across `apps/web/src/`.
>
> **What this pass did NOT do.** It did not run the app, did not open Vercel,
> Sentry, Supabase or GitHub dashboards, and did not verify what a token or
> DSN in the deployed environment actually points at. It did not read
> `.env.local` or any secret file. It did not audit `node_modules` for
> transitive network calls. It did not measure Sentry event volume or Supabase
> pool saturation. It did not verify DNS at `gearup.sgnk.ai` or any custom
> apex.

---

## 1. The shape of it

gearup is a **single Next.js 14 App Router application** deployed on Vercel,
backed by a single Postgres database on Supabase reached through Prisma. There
is no separate backend service. Notifications are a table (`Notification`) with
`QUEUED` / `SENT` / `FAILED` states in the schema, but **no worker actually
delivers them**. Customer-facing WhatsApp is exclusively `wa.me` deep links
opened by the operator's browser. PDFs are server-rendered HTML that the
browser prints. Error reporting is `@sentry/nextjs` with a DSN gate: no DSN,
no init. There is no Firebase, no Cloudflare code, no Render service.

Outbound external calls made by application code are narrow. A grep for
`fetch(` across `apps/web/src/` returns zero calls to external hosts from
server routes. Every `fetch(` is either the browser client hitting the app's
own `/api/*` at `apps/web/src/lib/api/client.ts`, or absent. The Sentry SDK
and Vercel Analytics client make their own network calls out of the browser;
those go through the SDK, not through hand-written `fetch`.

Counts, from commands run at `b5a0da6`:

| Thing | Count | Command |
|---|---|---|
| API route handlers | 55 | `find apps/web/src/app/api -name 'route.ts' \| wc -l` |
| External SDKs in dependencies | 3 | `@sentry/nextjs`, `@vercel/analytics`, `@vercel/speed-insights` (see §14) |
| CI workflows | 2 | `ls .github/workflows/*.yml` |

---

## 2. Supabase Postgres (the one that cannot be removed)

- **Where.** `apps/web/src/lib/prisma.ts` (singleton client with pool tuning),
  `apps/web/prisma/schema.prisma` datasource block. Prisma version
  `^5.14.0` per `apps/web/package.json`; `@prisma/client` matched.
- **Datasource block.**

  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DIRECT_URL")
  }
  ```

  `DATABASE_URL` is the pooled connection used by the app at runtime.
  `DIRECT_URL` bypasses the pooler and is what `prisma migrate` and the
  backup script use.
- **Project reference id.** Not present in code. The runtime picks up whatever
  the deployment's `DATABASE_URL` points at. `scripts/db-backup.sh` and
  `.github/workflows/db-backup.yml` both operate on `DIRECT_URL` (or
  `DATABASE_URL` as fallback) as an opaque string; the project ref is
  encoded in that URL. **unverified from this pass**: which Supabase project
  the production `DATABASE_URL` targets today.
- **Pool tuning.** `withServerlessPoolLimits` at `apps/web/src/lib/prisma.ts:5`
  detects a Supabase pooler host (`hostname.includes('pooler.supabase.com')`)
  and, if seen, appends `pgbouncer=true`, `connection_limit=3` in production
  (`5` in dev), and `pool_timeout=20` to the URL. The tuning is skipped
  entirely on a non-pooler host unless `PRISMA_FORCE_POOL_TUNING=1` is set,
  and can be disabled with `PRISMA_DISABLE_URL_TUNING=1`.
- **Transaction defaults.** `new PrismaClient({ transactionOptions: { maxWait:
  10000, timeout: 15000 } })` at `apps/web/src/lib/prisma.ts:44-47`. Interactive
  transactions time out at 15s.
- **Session mode vs transaction mode.** The Supabase pooler runs statement
  pooling in transaction mode on port 6543 and session pooling on port 5432;
  the app's `DATABASE_URL` chooses which. Prisma's `pgbouncer=true` flag is
  only safe on **transaction-mode** pooling. If `DATABASE_URL` points at
  session mode and something sets `pgbouncer=true` anyway, prepared-statement
  clashes will surface as `prepared statement "s0" already exists` errors.
  The tuner unconditionally appends `pgbouncer=true` when it detects a pooler
  host, which is correct only if the URL is already the transaction-mode port.
  **unverified**: which port the live URL uses.
- **Logging.** `log: ['warn', 'error']` in development, `['error']` in
  production.

**Failure mode if Supabase is unavailable.** Every route that touches the DB
returns a 500 from `handleApiError` at `apps/web/src/lib/errors.ts`. There is
no cache, no fallback store and no queue. Reads and writes both fail. The
`/api/health` route is a plain 200 that does not touch the DB (see
`apps/web/src/app/api/health`), so an uptime probe against it will report
healthy while the app is unusable.

---

## 3. Vercel

- **`apps/web/vercel.json`** sets `regions: ["hnd1"]` (Tokyo) and a global
  `functions."app/api/**/*.ts".maxDuration: 30`. There is no `framework`
  field (Vercel autodetects Next 14 from `apps/web/package.json`), no
  `crons`, no per-route memory override.
- **Deploy root.** `apps/web/`. `apps/web/package.json`'s `build` script is
  `node ./scripts/with-root-env.mjs "prisma generate && next build"`, which
  loads a shared root `.env` (documented in `docs/env.md`) before `next
  build` runs. `postinstall` also runs `prisma generate`, so a cold install
  in Vercel builds the client without needing an explicit step.
- **Analytics + speed insights.** `apps/web/src/app/layout.tsx:2-3` imports
  and renders `<Analytics />` from `@vercel/analytics/next` and
  `<SpeedInsights />` from `@vercel/speed-insights/next`. Both are opt-in per
  project inside the Vercel dashboard; on projects where the feature is off
  the component is a no-op.
- **Sourcemap upload to Sentry** runs at build time via `withSentryConfig`
  in `apps/web/next.config.mjs:60-66`. `org` and `project` come from
  `SENTRY_ORG` and `SENTRY_PROJECT`; if unset, upload is silently skipped.
- **Environments.** Not encoded in the repo. Standard Vercel Preview /
  Production applies. `docs/deployment.md` §5 states the intended import
  settings (root directory `apps/web`, `NEXT_PUBLIC_API_BASE_URL`,
  `NEXT_PUBLIC_SENTRY_DSN`); those steps are prescriptive, not verified
  against the live account.
- **Custom domain.** Not encoded in the repo. `docs/deployment.md` §7 lists
  the manual steps. **unverified**: the current public hostname.

**Failure mode if Vercel is unavailable.** The hosted product is down; the
repo provides no alternative host. `next build` produces a Next 14 server
bundle that assumes a Node runtime, not a static export.

---

## 4. WhatsApp

**No server-side WhatsApp sender exists.** WhatsApp is a **`wa.me` deep-link
UX only**, initiated by an operator click in the admin app.

- **Where.**
  - `apps/web/src/components/shared/whatsapp-button.tsx:1-14` renders a green
    button that opens `https://wa.me/{91-normalised-number}?text=…`. The
    country-code prefix is hard-coded India (`cleaned.startsWith('91') ?
    cleaned : '91' + cleaned`).
  - `apps/web/src/app/admin/estimates/[id]/page.tsx:166-181` composes an
    estimate-summary message and opens the same `wa.me` URL.
  - `apps/web/src/app/admin/appointments/[id]/page.tsx` and
    `apps/web/src/app/admin/invoices/[id]/page.tsx` import the same button
    component.
- **Provider.** None. The browser hands off to `wa.me`, which is WhatsApp's
  own click-to-chat surface. No API key, no template registration, no
  webhook, no phone-number-id, no delivery receipt. A grep for
  `graph.facebook.com` (Meta Cloud API), `api.twilio.com` (Twilio), and
  `aisensy` across `apps/web/src` returns zero hits.
- **The settings UI describes a provider that is not wired.**
  `apps/web/src/app/api/admin/settings/route.ts:53-55` accepts the setting
  keys `integration.whatsappApiUrl`, `integration.whatsappApiKey`, and
  `notification.whatsappEnabled`. `apps/web/src/app/admin/settings/integrations/page.tsx`
  renders three placeholder cards ("WhatsApp Provider", "Email Provider",
  "Sentry") whose only content is the string *"Configure via environment
  variables"*. The settings persist. Nothing reads them at send time,
  because there is no send path.
- **The Notification table exists and is queryable but has no writer.**
  `apps/web/src/app/api/admin/notifications/route.ts` implements a paginated
  read of the `Notification` table with filters (`channel`, `eventType`,
  `sendStatus`, `q`). The **template CRUD** at
  `apps/web/src/app/api/admin/notifications/templates` allows an admin to
  author templates. **No cron, no queue worker, and no route inserts an
  outbound `Notification` and marks it `SENT`.** The status enum values
  `QUEUED` / `SENT` / `FAILED` in `@prisma/client` are defined; nothing
  advances them. `docs/notifications.md` describes the delivery pipeline
  step-by-step and it is a plan, not a shipped implementation.

**Failure mode if `wa.me` is unavailable.** The operator's browser fails to
open the WhatsApp app or web client; no server state changes.

---

## 5. Email

**No email is sent from the app.** A grep across `apps/web/package.json` for
`nodemailer`, `resend`, `sendgrid`, `postmark`, `mailgun`, `@react-email`,
`sendinblue`, `mailjet` returns zero matches. A grep across `apps/web/src`
for `nodemailer`, `resend`, `sendMail`, `sendEmail` returns zero matches.

The setting keys `integration.emailProvider`, `integration.emailApiKey`, and
`notification.emailEnabled` are validated in
`apps/web/src/app/api/admin/settings/route.ts` and are exported by
`apps/web/src/app/api/admin/settings/export/route.ts`, but no code reads them
at send time. `docs/env.md` lists `EMAIL_PROVIDER`, `EMAIL_API_KEY`, and
`EMAIL_FROM_ADDRESS` as backend variables; those refer to the
`apps/api/` service that `docs/deployment.md` §4 describes on Render.
**`apps/api/` is not present in this repo at `b5a0da6`.**

**Failure mode if email is required.** Every event the notifications plan
routes to `EMAIL` (`INVOICE_GENERATED`, `UNPAID_INVOICE_REMINDER`,
`ESTIMATE_APPROVAL_REQUESTED`) is not delivered by the app today. The
operator relies on the invoice/estimate PDF-print flow (§8) and on manual
follow-up.

---

## 6. Sentry

- **Where.** `apps/web/instrumentation.ts` (Next 14 App Router bootstrap),
  `apps/web/sentry.client.config.ts`, `apps/web/sentry.server.config.ts`,
  `apps/web/sentry.edge.config.ts`, `apps/web/next.config.mjs` (`withSentryConfig`).
- **SDK.** `@sentry/nextjs@^8.0.0` in `apps/web/package.json`.
- **DSN convention.** All three configs read from a single env
  `NEXT_PUBLIC_SENTRY_DSN`. **`Sentry.init` is only called when
  `NEXT_PUBLIC_SENTRY_DSN` is set**, so an unconfigured deployment silently
  ships zero events, no throw. This matches the file comments in
  `apps/web/next.config.mjs:56-57` that call `withSentryConfig` "a no-op
  when Sentry envs are not set".
- **Sample rates.**
  - Client (`sentry.client.config.ts`): `tracesSampleRate: 0.2`,
    `replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0`.
  - Server (`sentry.server.config.ts`): `tracesSampleRate: 0.2`.
  - Edge (`sentry.edge.config.ts`): `tracesSampleRate: 0.2`.
- **Instrumentation hook.** `apps/web/instrumentation.ts:9-16` dispatches on
  `process.env.NEXT_RUNTIME` and imports `sentry.server.config` for
  `nodejs`, `sentry.edge.config` for `edge`. Client init is auto-loaded by
  `@sentry/nextjs` from `sentry.client.config.ts` at the root of `apps/web`.
- **Sourcemap upload.** `apps/web/next.config.mjs:60-66` wraps the Next
  config with `withSentryConfig({ silent: true, org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT })`. When `SENTRY_ORG` or
  `SENTRY_PROJECT` is absent, upload is skipped and the build still
  succeeds.
- **CSP.** `apps/web/next.config.mjs:20-24` allowlists Sentry hosts in the
  Content-Security-Policy: `script-src` allows `https://*.sentry.io`;
  `connect-src` allows `https://*.sentry.io https://*.ingest.sentry.io`.
- **Breadcrumbs.** SDK defaults (no custom `beforeBreadcrumb` in the three
  configs). Custom Sentry helpers are reserved under `apps/web/src/lib/sentry/`
  but that directory contains only `.gitkeep` today.

**Failure mode if the Sentry DSN is unset or the ingest is unreachable.** No
init runs (DSN gate), so events are never enqueued. When the DSN is set but
ingest is unreachable, the SDK's own network calls fail silently in the
browser and produce a warn line in the server console. No app-visible error.

---

## 7. Vercel Analytics + Speed Insights

Layered on top of §3 but worth calling out because they are the only two SDKs
in the app that talk to a third party during normal page loads.

- **`@vercel/analytics@^2.0.1`** and **`@vercel/speed-insights@^2.0.0`** are
  runtime dependencies. Both components are mounted once in
  `apps/web/src/app/layout.tsx:2-3, 27-28`. The CSP in `next.config.mjs`
  allowlists `https://*.vercel-analytics.com` in `script-src` and
  `connect-src`.
- **Enablement is per-project in the Vercel dashboard.** When either
  feature is off in the dashboard, the component is a no-op. **unverified**:
  which of the two is currently enabled on the production project.

---

## 8. PDF generation

**No headless browser is used.** A grep across `apps/web/package.json` for
`puppeteer`, `playwright`, `jspdf`, `pdfkit`, `pdfmake`, `@react-pdf/renderer`,
`browserless` returns zero matches. (Playwright is present as
`@playwright/test` for E2E, not for rendering.)

The three "PDF" endpoints all return **HTML with a `@media print` stylesheet**
that the browser prints or exports to PDF using its native print dialog.

- **Invoice PDF.** `apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts`.
  Selects a template based on the `type` query param (`invoice`,
  `customer-draft`, `mechanic-copy`, `amc-invoice`, `combined`) and returns
  the rendered HTML from `apps/web/src/lib/invoice-templates/*` with
  `Content-Type: text/html; charset=utf-8` and
  `Content-Disposition: inline`.
- **Salary slip PDF.** `apps/web/src/app/api/admin/salary-slips/[id]/pdf/route.ts`.
  Same shape: HTML from `apps/web/src/lib/salary-slip-template.ts`.
- **Estimate print.** `apps/web/src/app/admin/estimates/[id]/print` is a
  page, not an API route, opened by the client in a new tab via
  `window.open(…, '_blank')` at `apps/web/src/app/admin/estimates/[id]/page.tsx:164`.
- **Print rules.** Every template ends with a `@media print { … @page {
  margin: 6mm-8mm; size: A4 } }` block (grep hits at
  `apps/web/src/lib/invoice-templates/combined.ts:22`,
  `.../tax-invoice.ts:161`, `.../amc-invoice.ts:149`,
  `.../salary-slip-template.ts:71`).
- **Job-card print.** Not a separate route; the admin job-card page relies
  on the same HTML-plus-`@media print` pattern.

**Failure mode.** The browser's print dialog is the only path to a real PDF
file; a headless client (a curl caller, a CI job that wants a stored PDF)
gets HTML, not PDF. There is no fallback and no server-side PDF binary today.

---

## 9. Google Maps redirect (`/location`)

- **Where.** `apps/web/src/app/location/page.tsx`. Server component. Its
  entire body is `redirect('https://maps.app.goo.gl/ng4K4ktWzDpZoTg4A')`.
- **What.** A permanent-looking (Next's default `redirect()` is a temporary
  307) redirect to a hard-coded Google Maps short-link for the garage's
  physical location. No API call, no key, no rate limit exposure.
- **Failure mode if Google's shortlink resolver is down.** The user sees a
  Google error page. The app is otherwise unaffected.

---

## 10. GitHub API usage from the app

**None.** A grep across `apps/web/src` for `api.github.com`,
`githubusercontent`, `@octokit`, and `github.com/` (as a base URL) returns
zero matches. The application does not call GitHub's REST or Git Data API
from any route. GitHub only enters the picture through CI (§11) and the
`db-backup` orphan-branch push (§13).

---

## 11. CI providers

**GitHub Actions**, two workflows under `.github/workflows/`.

- **`.github/workflows/ci.yml`.**
  - Trigger: `push` on `main`, and all `pull_request` events.
  - Concurrency group `ci-${{ github.ref }}` with `cancel-in-progress: true`.
  - **Job `check`.** Ubuntu, Postgres 17 service container. Env:
    `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` all pointing at
    `localhost:5432/gearup_test`; `JWT_SECRET=ci-placeholder-secret`. Steps:
    checkout, pnpm setup, Node 20, `pnpm install --frozen-lockfile`,
    `bash scripts/check-tz.sh` (timezone lint), `prisma generate`, `tsc
    --noEmit`, `pnpm lint`, `pnpm --filter @gearup/web test`, `prisma db
    push --skip-generate`, `pnpm --filter @gearup/web test:int`, `pnpm
    build`.
  - **Job `e2e`.** Runs after `check`. Another Postgres 17 service on
    `gearup_e2e`. Installs Playwright Chromium (with a cache keyed on
    `pnpm-lock.yaml`), pushes the schema, runs `playwright test`. On
    failure, uploads the Playwright report artifact for 7 days.
  - Secrets required: **none for CI** (the DB is ephemeral, secrets are
    hardcoded placeholders). The `db-backup` workflow's secrets are
    separate (see below).
- **`.github/workflows/db-backup.yml`.**
  - Trigger: `schedule: cron '0 2 * * *'` (02:00 UTC daily = 07:30 IST) plus
    `workflow_dispatch`.
  - Concurrency: group `db-backup`, `cancel-in-progress: false`.
  - Permissions: `contents: write` (needed to push to `db-backups` branch).
  - Steps: detect Postgres major (default 17, overridable via
    `vars.PG_MAJOR`), install matching `postgresql-client`, run `pg_dump
    --clean --if-exists --no-owner --no-acl --no-comments --schema=public`
    piped through `gzip -9`, guard against `< 1024 byte` output, upload as
    Actions artifact for 90 days, then commit to the orphan branch
    `db-backups` under `backups/gearup-<UTC>.sql.gz`, keeping the newest 90.
  - **Secrets required.** `DATABASE_URL` or `DIRECT_URL` (repo Secret).
    `GITHUB_TOKEN` (auto-provided) for the push.

**Failure mode if GitHub Actions is unavailable.** No PR gate runs, and the
daily backup does not fire. The two local tiers (§13) still work.

---

## 12. Cron and scheduled tasks

**No Vercel Crons.** `apps/web/vercel.json` has no `crons` array. A grep
across `apps/web/src/app/api` for `/api/cron` returns no such route.
`docs/MAP.md:250` records the same finding: *"No cron jobs in the app itself
… `CRON_ENABLED` env is defined in `env.md` but no `vercel.json crons`, no
`apps/web/src/app/api/cron/*`."*

**The only scheduler in the repo** is the GitHub Actions `db-backup` cron
(§11) and the optional macOS launchd job (§13). The AMC contract expiry
transitions and worker leave transitions are done **inline on read** (see
inline comments at `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts:25`
and `apps/web/src/app/api/admin/workers/[id]/leave/route.ts:64` recording
that a separate cron would be needed later), not by a scheduled job.

**Failure mode if the AMC/leave inline transitions are contested.** A record
that was read yesterday but is due to flip today may briefly serve stale
status until the next read. No live cron would improve this today because no
route writes the flip.

---

## 13. Backups

Three tiers, listed in `docs/RESTORE.md` and both wired.

1. **GitHub Actions artifact.** 90-day retention. Uploaded by
   `.github/workflows/db-backup.yml` (§11) as
   `gearup-db-backup-${{ github.run_id }}`.
2. **`db-backups` orphan branch.** Same workflow commits
   `backups/gearup-<UTC>.sql.gz` and prunes to the newest 90. Push uses the
   default `GITHUB_TOKEN`.
3. **Local launchd job on the developer's Mac.**
   `scripts/db-backup-launchd.sh` installs a `LaunchAgent` (label
   `ai.sgnk.gearup.db-backup`) that runs at 03:00 local daily,
   deliberately offset from the 02:00 UTC GH Action.
   `scripts/db-backup-launchd-wrapper.sh` is autogenerated. Output lands in
   `backups/` with 60-day retention (`RETAIN_DAYS=60` in
   `scripts/db-backup.sh`).

- **Destination.** All three tiers are **repo-adjacent or repo-native**: an
  Actions artifact (GitHub-hosted), a branch on `origin`, or a `./backups/`
  directory on the developer's laptop. **No S3, no R2, no external object
  store.**
- **Format.** `pg_dump --clean --if-exists --no-owner --no-acl --no-comments
  --schema=public | gzip -9`, PG17 client required (Supabase runs PG17).
- **Restore.** `docs/RESTORE.md` documents both full-DB drop-and-recreate
  and single-table splice. A pre-restore safety dump is mandatory.
- **`docs/audit/<date>/db-backups/`.** Ad-hoc safety dumps are also
  committed under `docs/audit/` on `main` (see the `gearup-data-loss-incident`
  memory for the historical reason).

**Failure mode if the `db-backups` push fails.** The workflow keeps the
Actions artifact regardless (upload step precedes the commit step), so tier
1 always exists as long as the dump itself succeeded. The launchd job is
independent.

---

## 14. Cloudflare

**Cloudflare appears nowhere in the application code.** A case-insensitive
grep across `apps/web/src/`, `apps/web/next.config.mjs`, `apps/web/vercel.json`
and `scripts/` returns zero matches.

If the public hostname resolves through Cloudflare DNS, that is an
infrastructure choice made in an account this pass did not open. **unverified**:
whether `gearup.sgnk.ai` (or any custom domain) is proxied through Cloudflare
today. No code path is affected either way.

---

## 15. Runtime dependencies matrix

Derived from `apps/web/package.json` `dependencies` at `b5a0da6`.
"Blocking" means the app fails to serve without it; "degrades gracefully"
means one feature is affected; "optional" means feature is dark until env is
set.

| Dependency | Version | Purpose | Criticality |
|---|---|---|---|
| `next` | `^14.2.0` | Framework, App Router, server, edge, image | Blocking |
| `react` | `^18.3.0` | UI runtime | Blocking |
| `react-dom` | `^18.3.0` | UI runtime | Blocking |
| `@prisma/client` | `^5.14.0` | Postgres client, generated at build via `postinstall` | Blocking |
| `zod` | `^3.23.0` | Request-body + settings validation on every route | Blocking |
| `bcryptjs` | `^2.4.3` | Password hashing for admin login | Blocking (login) |
| `jsonwebtoken` | `^9.0.2` | Session JWT signing / verification | Blocking (auth) |
| `nanoid` | `^3.3.7` | Invoice/estimate id generation | Blocking (writes) |
| `@sentry/nextjs` | `^8.0.0` | Error reporting, sourcemap upload | Optional (DSN-gated) |
| `@vercel/analytics` | `^2.0.1` | Page view analytics | Optional (dashboard-gated) |
| `@vercel/speed-insights` | `^2.0.0` | Web-vitals reporting | Optional (dashboard-gated) |
| `@fullcalendar/core` + `daygrid`, `timegrid`, `interaction`, `react` | `6.1.15` | Appointment calendar UI | Blocking (calendar page) |
| `recharts` | `2.15.3` | Chart rendering on reports | Degrades gracefully (charts break) |
| `three` | `^0.184.0` | 3D landing-page visuals | Degrades gracefully |
| `gsap` | `^3.15.0` | Landing-page animations | Degrades gracefully |
| `lucide-react` | `^0.378.0` | Icon set | Degrades grecefully (missing icons) |
| `@gearup/types` | `workspace:*` | Shared types + `PERMISSIONS` | Blocking |
| `@gearup/ui` | `workspace:*` | Shared UI primitives (`PageHeader`, etc.) | Blocking |

`devDependencies` (Playwright, vitest, tsc, eslint, prisma CLI, tailwind,
postcss, `tsx`, `dotenv`) do not ship to Vercel and are not part of runtime
integrations.

---

## 16. Summary: what breaks without each

| Integration | Loss | Blast radius |
|---|---|---|
| Supabase Postgres | Total. No cache, no fallback | The product |
| Vercel | Hosted product down; no alternative host | The product |
| Sentry (DSN unset or ingest down) | Zero events; app unaffected | Observability |
| Vercel Analytics / Speed Insights | Zero metrics; app unaffected | Observability |
| `wa.me` | Operator's "share on WhatsApp" click fails | One UX affordance |
| GitHub Actions (CI) | No PR gate; humans must run tests locally | Release safety |
| GitHub Actions (db-backup) | Tier 1 + 2 stop; local launchd tier survives | Backup redundancy |
| Google Maps shortlink | `/location` errors in the visitor's browser | One redirect |

---

## 17. Defects and gaps found while writing this

1. **`docs/notifications.md` describes a delivery pipeline that does not
   run.** The `Notification` table's `QUEUED` / `SENT` / `FAILED` states have
   no writer and no cron worker. Every "WhatsApp" event in that document is
   today served by an operator manually clicking the `WhatsAppButton` (§4).
   The docs and the code disagree on whether notifications are sent
   automatically.
2. **`docs/deployment.md` describes a Render backend and an `apps/api/`
   service that are not in this repo.** The Render step (§4 of that doc),
   the `EMAIL_PROVIDER` / `WHATSAPP_PROVIDER` backend env vars in
   `docs/env.md`, and the `apps/api` root directory are all references to
   a split-service architecture that either predates or postdates the
   consolidated single-Next-app layout at `b5a0da6`.
3. **`apps/web/src/app/admin/settings/integrations/page.tsx` promises
   configuration.** Its own body says *"Configure via environment
   variables"* for WhatsApp, Email, and Sentry. Only Sentry is actually
   read from env at runtime.
4. **The Prisma pool tuner assumes transaction-mode when it detects a
   Supabase pooler host.** `apps/web/src/lib/prisma.ts:23` appends
   `pgbouncer=true` unconditionally on any `pooler.supabase.com` hostname.
   If the deployment's `DATABASE_URL` uses the session-mode pooler port,
   this will surface as prepared-statement clash errors. §2 marks the live
   port unverified.
5. **`/api/health` does not touch the DB.** An uptime probe against it
   reports green while Postgres is unreachable. Health probes that require
   DB liveness must hit a route that reads something.
6. **PDF endpoints return HTML.** A caller that expects a `.pdf` file from
   `/api/admin/invoices/[id]/pdf` receives HTML. There is no server-side
   PDF renderer; the browser print dialog is the only path to a stored PDF.
7. **`CRON_ENABLED` env is documented but reads nothing.** Cataloged in
   `docs/MAP.md:250`; no cron consumer exists.
