---
mode: reference
updated: 2026-09-20
verified_against: 81a04bb
---

# RUNBOOK, on-call symptom to cause

> **Method.** Every procedure below is anchored to a file, a script, or a shell
> command I opened or ran on this machine at commit `81a04bb` on 2026-09-20. The
> incidents come from `apps/web/src/lib/errors.ts`, `apps/web/src/middleware.ts`,
> `apps/web/vercel.json`, `apps/web/src/app/api/admin/invoices/**`, the CI and
> backup workflows under `.github/workflows/`, `scripts/db-backup.sh`, and
> `docs/RESTORE.md`. Where I quote a line number I opened that file. Where I
> quote a command I ran it read-only.
>
> **What this pass did NOT do.** I never ran `pg_dump` against the live DB,
> never invoked `vercel rollback`, never touched Supabase, never sent a
> WhatsApp message, never modified a Vercel env var, never redeployed. I did
> not run `npm test` or `pnpm build`. Every destructive step is documented as
> a procedure the operator runs under RULE 2 (per-op user approval), never as
> something this document performs. I did not check the Sentry dashboard,
> Vercel dashboard, or Supabase dashboard; the pointers below are correct by
> construction (from `apps/web/sentry.*.config.ts` and
> `docs/CODEBASE_CONTEXT.md`), not from a UI screenshot.

---

## 1. On-call posture

**Team.** Two developers: **Sagnik** (`souvikmusib`) and **Arnab**. Both are
authorized contributors on the production DB and the Vercel project
(`docs/CODEBASE_CONTEXT.md`, `MEMORY.md` gearup-team). There is no formal
rotation; whoever is awake and reads the alert first takes it.

**Escalation.**

1. Whoever noticed the incident acknowledges in the shared chat within
   ten minutes and starts a timeline entry (§10).
2. If the incident touches money (invoices, payments, AMC decrement) or
   customer PII, page the other developer immediately, regardless of the
   hour. Do not batch-diagnose alone.
3. If the incident touches production data integrity (a bad write, a wrong
   restore, a schema mismatch), stop writes first, then diagnose. `deploy
   pause` (§6) is the first action, not the last.
4. External support (Supabase, Vercel, WhatsApp provider) is a last resort;
   §12 explains where their contact information lives.

**Two standing rules before anything else.**

- **Verify every claim, every number, every date with a tool.** RULE 1 of the
  workspace applies inside every step below. Run `date -u +%Y-%m-%dT%H:%M:%SZ`
  for a timestamp; do not read it off a stale terminal.
- **Every destructive op needs an explicit user "yes".** RULE 2. The
  procedures below tell the operator what to type; the operator then asks
  their pair partner before pressing enter. "Continue" and thumbs-up do not
  count.

---

## 2. Health checks after a deploy

**URLs to hit.** Production is `https://gearup.sgnk.ai`
(`docs/CODEBASE_CONTEXT.md`). After every deploy, hit these in order:

```bash
# 1. DB round trip. Source: apps/web/src/app/api/health/route.ts.
curl -sSI https://gearup.sgnk.ai/api/health | head -1
# expect: HTTP/2 200

# 2. DB body says connected.
curl -sS https://gearup.sgnk.ai/api/health
# expect: {"status":"ok","db":"connected","timestamp":"..."}

# 3. Login page renders (not a redirect).
curl -sSI https://gearup.sgnk.ai/admin/login | head -1
# expect: HTTP/2 200

# 4. Public book-service page renders.
curl -sSI https://gearup.sgnk.ai/book-service | head -1
# expect: HTTP/2 200
```

**What "healthy" looks like.** `/api/health` returns `db: connected` in under
one second on the warm path. First hit after a deploy can be 2 to 4 seconds
due to Vercel Fluid Compute cold start. Anything above five seconds twice in
a row means the pooler is saturated or the DB is under load.

**Rule from LR#78 and the frontmatter runbook §7.** Assert on the first
status line with `-sSI`, never `curl -sL`. `-L` follows a 307 to `/login` and
reports 200, turning every auth-redirect failure into a green check. If you
must follow redirects, print `%{url_effective}` and assert on that.

**Status pages.** When our checks fail and the code did not change:

- **Vercel:** `https://www.vercel-status.com`
- **Supabase:** `https://status.supabase.com`

Open both before you start hunting a bug that is not ours.

---

## 3. Common incidents and fixes

### 3.1 500 on invoice line-item POST

**Symptom.** A user reports "adding a line item fails with an error". The
response body has `code: "INTERNAL_ERROR"`. The Vercel function log shows a
Prisma `P2028` transaction timeout.

**Cause.** This regressed once already, fixed in PRs #58 and #59. The invoice
line-item write runs inside a Prisma transaction that touches inventory
movements and can take several seconds under load. If the transaction
`timeout` is not set (Prisma's default is 5 seconds) the write throws P2028.

**Diagnostic.**

1. Turn on the exposed-error flag in the Vercel dashboard:
   `NEXT_PUBLIC_EXPOSE_ERRORS=1` (Preview and Production). The next request
   will return `error.detail.rawMessage` and the top five lines of the stack
   (`apps/web/src/lib/errors.ts:150`). This exposes the Prisma error to the
   browser, so **turn it off again once you have the trace**.
2. Read the Vercel function log for the POST route
   (`/api/admin/invoices/[id]/line-items`).

**Fix.** Verify the transaction timeout is 30s in both invoice write paths:

```bash
grep -n "timeout: 30000" apps/web/src/app/api/admin/invoices/route.ts \
                        apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts
```

Both files must include `{ timeout: 30000, maxWait: 10000 }` on the
`prisma.$transaction(...)` call. At `81a04bb` line 118 of the first and line
270 of the second carry that guard. If either has drifted back to the
Prisma default, restore it in the same PR and add a regression test.

**Rollback.** If the fix is regression from a recent PR and cannot be
patch-forwarded within thirty minutes, roll back the deploy per §5.

### 3.2 Login throttle firing wrongly

**Symptom.** A real admin cannot log in and the response is
`{ code: "RATE_LIMITED", message: "Too many login attempts for this account.
Try again later." }` with status 429.

**Cause.** `apps/web/src/middleware.ts` has two in-memory limiters on
`/api/admin/auth/login`: per-IP (10 requests per minute) and per-account (8
attempts per five minutes, keyed on `adminUserId | email | username | phone`,
lowercased and trimmed, at line 172). The per-account map lives in process
memory only, so **the fastest fix is to redeploy** the app: every warm
instance restarts and the counter is zero.

**Per-account unblock without a redeploy.** There is no admin endpoint to
reset the counter. Options in order of preference:

1. **Wait five minutes.** The window is `LOGIN_ACCOUNT_WINDOW = 5 * 60_000`
   (line 11 of `middleware.ts`). If the user can wait, that is the safest
   fix.
2. **Redeploy** to wipe the maps. Push an empty commit or trigger a Vercel
   redeploy from the dashboard. Blast radius: brief cold start, no data
   change.
3. **Ask the user to log in from a different account identifier**, if the
   admin has both an email and a username, since the key is the exact
   trimmed lowercased string they typed. Not always available.

**"Whitelist" an account.** There is no whitelist in the code. If an
account is being brute-forced from many IPs, the per-account gate is doing
its job. Escalate under §1 rule 3 (touches auth) rather than removing the
gate.

**Standing improvement, tracked in the middleware TODO at line 15.** Move
the map to a shared store (Upstash `@upstash/ratelimit` or Vercel KV) so a
reset can be issued out-of-band. Not on-call work; open an issue.

### 3.3 Prisma client stale after a pull

**Symptom.** After `git pull` on `main`, `pnpm dev` or `pnpm test` throws
TypeScript errors on Prisma model properties, or the running dev server
returns "Unknown column" at runtime.

**Cause.** `prisma/schema.prisma` changed and the generated client under
`node_modules/.pnpm/@prisma+client/...` still reflects the old schema.

**Fix.**

```bash
pnpm --filter @gearup/web exec prisma generate
```

This regenerates the client for the schema at HEAD. It is a read-only
generation (no DB write). Safe to run any time.

### 3.4 Pre-commit hook fails with type errors

**Symptom.** `git commit` prints `error TS2339: Property '...' does not
exist on type '...'` from tsc or the pre-commit hook, on a codebase that
compiled cleanly this morning.

**Root cause, in this repo, is almost always §3.3.** The other developer
pushed a schema change and the local Prisma client is stale. Fix:

```bash
pnpm --filter @gearup/web exec prisma generate
git commit ...   # retry
```

If regeneration does not clear it, the type error is a real one; read it.

### 3.5 Vercel preview build fails

**Symptom.** A PR opens a Vercel preview and the build fails.

**Common cause 1: missing env var.** The build reads a required env var and
crashes at boot or at first request. Preview and Production have separate
env-var sets in the Vercel dashboard; a variable added to Production is not
automatically in Preview.

**Fix.**

1. Read the failing build log. The variable name is in the error.
2. Vercel dashboard, project `gearup`, Settings, Environment Variables. Add
   the variable to **Preview** with the same value as Production.
3. Trigger a redeploy from the dashboard (the "Redeploy" button on the
   failed deployment).

**Common cause 2: Prisma client not generated.** The build step runs
`prisma generate` as part of `pnpm build`; if the `postinstall` step is
skipped (Vercel's build cache does that sometimes), types desync. Fix:
redeploy without cache from the dashboard.

**Common cause 3: TypeScript strictness gap.** LR-adjacent, from
`frontmatter/29-RUNBOOK.md` §13. Local `pnpm --filter @gearup/web exec tsc
--noEmit` is not always the same config as the production build. Reproduce
by running the full `pnpm build` locally before pushing anything that
touches types.

### 3.6 WhatsApp not delivering

**Symptom.** A booking confirmation, appointment reminder, or invoice
receipt was queued but the customer did not receive the WhatsApp message.

**Where to check, in order.**

1. **Notification log in the admin app.** `/admin/notifications` records
   the queue and the delivery attempt.
2. **Settings, integrations tab.** `/admin/settings` under keys
   `integration.whatsappApiUrl` and `integration.whatsappApiKey`
   (`apps/web/src/app/api/admin/settings/route.ts:54-55`). A rotated key
   makes every send fail.
3. **The `notification.whatsappEnabled` flag** in the same settings
   record. If someone flipped it off during a triage, every send is a
   no-op.
4. **The WhatsApp provider dashboard.** External. §12.

**Fix.** Re-enter the API key in the settings page under the correct name
and toggle `whatsappEnabled` back on. Do not commit the key to git.

### 3.7 AMC service decrement mismatch

**Symptom.** An AMC contract shows a services-remaining count that does not
match the number of usages recorded against it.

**Cause and existing guard.** Decrements go through a race-safe
`updateMany` with a WHERE guard: only decrement if
`servicesRemaining > 0`. Three call sites do this correctly at `81a04bb`:

- `apps/web/src/app/api/admin/invoices/[id]/finalize/route.ts:32`
- `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts:169`
- `apps/web/src/app/api/admin/amc/contracts/[id]/usages/[usageId]/route.ts:22`

If a mismatch appears, either a fourth call site was added without the
guard, or the usages table has an orphan row that no decrement corresponds
to.

**Reconcile.** Read-only first:

```sql
-- Run in the Supabase SQL editor, or psql (see §8.1).
SELECT c.id, c."servicesRemaining", c."servicesTotal",
       COUNT(u.id) AS usage_count,
       c."servicesTotal" - COUNT(u.id) AS expected_remaining
  FROM "AmcContract" c
  LEFT JOIN "AmcUsage" u ON u."contractId" = c.id
 GROUP BY c.id
HAVING c."servicesRemaining" <> c."servicesTotal" - COUNT(u.id);
```

For each mismatched row, decide which side is truth (usually the usages
table, since it is append-only). Do not run the correcting UPDATE from
this document; take it to §8.2 and get a per-op yes.

### 3.8 Backup missing or stale

**Symptom.** `docs/RESTORE.md` says the most recent backup should be less
than 24 hours old and it is not.

**Where backups live** (three tiers, from `docs/RESTORE.md`):

| Tier | Where | Retention |
|---|---|---|
| 1 | GitHub Actions artifacts, `Actions` tab, `db-backup` run | 90 days |
| 2 | `db-backups` branch, `backups/gearup-<UTC>.sql.gz` | last 90 dailies |
| 3 | Local `backups/` on Sagnik's Mac (launchd) | 60 days |

**Diagnose the miss.**

1. GitHub, Actions tab, `db-backup` workflow, last run. If the schedule did
   not fire, `.github/workflows/db-backup.yml` uses cron `0 2 * * *` (02:00
   UTC daily); GitHub sometimes drops scheduled runs when a repo is quiet.
2. If the run failed, read its log. The most common failure is a missing
   `DATABASE_URL` (or `DIRECT_URL`) repo secret; `docs/RESTORE.md` "If
   GitHub Actions backup hasn't run yet" walks through setting it.

**Trigger a manual backup.** No `pg_dump` from this document; the operator
runs it:

- **Cloud:** GitHub, Actions tab, `db-backup`, "Run workflow" button on the
  `main` branch. Under one minute.
- **Local (Sagnik's Mac only):** the launchd job. See RESTORE.md for the
  launcher path and §4 below for the ad-hoc `pg_dump` command.

---

## 4. Backup and restore

### 4.1 Take an ad-hoc backup

Before any risky migration, restore, or DDL, take a fresh dump. This is the
RULE 3 pre-op backup for the operations in §4.2 and §8.

**Prerequisite.**

```bash
brew install postgresql@17    # client must match the Supabase server (PG17)
```

**Ad-hoc dump.** Read the direct URL from `.env`, dump to a timestamped
path under the audit tree:

```bash
cd /Users/sagnikmitra/Desktop/GitHub/gearup

DIRECT_URL=$(grep ^DIRECT_URL .env | cut -d= -f2- | tr -d '"')
SAFE="docs/audit/$(date -u +%Y-%m-%d)/db-backups/pre-op-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
mkdir -p "$(dirname "$SAFE")"

/opt/homebrew/opt/postgresql@17/bin/pg_dump "$DIRECT_URL" \
  --clean --if-exists --no-owner --no-acl --no-comments --schema=public \
  | gzip -9 > "$SAFE"

ls -la "$SAFE"
```

Or via the wrapper script, which does the same thing with pruning and
size-sanity checks:

```bash
DIRECT_URL="..." ./scripts/db-backup.sh
```

`scripts/db-backup.sh` exits non-zero on empty or under-1KB output. Verify
gzip integrity before trusting the dump:

```bash
gzip -t "$SAFE" && echo "gzip ok" || echo "gzip corrupt"
```

Report the path and size back to your pair partner before proceeding to
any destructive step. The path IS the safety net.

### 4.2 Restore, full DB replacement (RULE 2, RULE 3)

**Blast radius.** DROPs every table in the public schema and recreates
them from the dump. Every write since the backup is lost. Supabase Free
tier has no PITR, so this cannot be un-done.

**Do not run any of the commands below yourself.** They are the operator's
runbook. The operator:

1. Takes an ad-hoc dump per §4.1 and reports the path and size to their
   pair.
2. Names the operation in plain language: "I want to restore the gearup
   Supabase database from `<path>`, which drops and recreates every table
   in the public schema."
3. States what was checked: `gzip -t` passed, safety dump is at
   `<path>`, is `<N> bytes`, `curl` on `/api/health` currently returns
   `db: connected`.
4. Waits for an explicit `yes` from the pair.
5. Runs, from `docs/RESTORE.md`:

```bash
# BACKUP = the path to restore FROM.
BACKUP=docs/audit/2026-06-10/db-backups/current-state-20260611T080315Z.sql.gz
# or from the db-backups branch:
#   git fetch origin db-backups
#   git checkout origin/db-backups -- backups/
#   BACKUP=backups/gearup-20260615T020012Z.sql.gz

gunzip -c "$BACKUP" | /opt/homebrew/opt/postgresql@17/bin/psql "$DIRECT_URL"

cd apps/web && pnpm exec prisma generate
```

6. Verifies post-state with the sanity check block in `docs/RESTORE.md`
   ("Sanity check after restore") and reports the row counts to their
   pair.

**Single-table restore.** For "recover just the `Customer` rows the merge
lost", follow `docs/RESTORE.md` "Restore, single table only". Same RULE 2
gate, smaller blast radius.

### 4.3 Test-restore procedure (scratch DB)

Before you trust a backup file, restore it to a scratch DB and check the
counts. This is the honest "yes, this backup would actually restore" step;
without it, backups drift.

```bash
# 1. Local Postgres 17.
brew services start postgresql@17
createdb gearup_scratch

# 2. Restore the backup into the scratch DB.
BACKUP=backups/gearup-YYYYMMDDTHHMMSSZ.sql.gz
gunzip -c "$BACKUP" | psql "postgresql://localhost/gearup_scratch"

# 3. Count rows in a few load-bearing tables.
psql "postgresql://localhost/gearup_scratch" -c '
  SELECT
    (SELECT COUNT(*) FROM "AdminUser")  AS admins,
    (SELECT COUNT(*) FROM "Customer")   AS customers,
    (SELECT COUNT(*) FROM "Vehicle")    AS vehicles,
    (SELECT COUNT(*) FROM "JobCard")    AS job_cards,
    (SELECT COUNT(*) FROM "Invoice")    AS invoices,
    (SELECT COUNT(*) FROM "Payment")    AS payments;
'

# 4. Compare against the GitHub Actions run summary for that backup.

# 5. Drop the scratch DB when done.
dropdb gearup_scratch
```

Run this at least once a quarter, on the most recent daily. LR#68: a test
whose subject is a rare fault proves nothing until it reproduces the
fault. Same shape here: a backup you never restored is a schema-migration
away from being useless.

---

## 5. Rollback

### 5.1 Vercel dashboard, one click

**When.** Production is broken by the most recent deploy, the fix is not
obvious in five minutes, and the previous deploy was green.

**How.** Vercel dashboard, project `gearup`, Deployments tab, find the
previous Ready production deployment, three-dot menu, "Promote to
Production". Blast radius: the domain `gearup.sgnk.ai` is repointed at the
older deployment within seconds. No code change on `main`. The DB is
untouched, so **rollback does not restore schema changes**, only code.

### 5.2 CLI rollback

Same effect, from a shell:

```bash
source /Users/sagnikmitra/.config/codex-env/tokens.zsh

# List recent production deployments to pick the target URL.
vercel ls gearup --scope sagnik --token "$VERCEL_TOKEN" --prod | head -10

# Roll back to the chosen deployment. Ask a pair partner first (RULE 2).
vercel rollback <deployment-url> --scope sagnik --token "$VERCEL_TOKEN"
```

RULE 2 gate: name the deployment SHA, state the blast radius (which
commits are being reverted), get a yes, then run.

### 5.3 Schema rollback is much harder

**Flag this.** There is no Prisma migration history in this repo; schema
changes have historically gone through `prisma db push`, not `migrate
dev`. That means a schema rollback is not a `migrate reset` away.

**The only reliable schema rollback is a restore from backup** per §4.2,
against the last dump taken before the schema change. This is why the
pre-op backup in §4.1 is mandatory. If the schema change was destructive
(dropped a column, renamed a table) and no pre-op backup was taken, data
loss is possible.

---

## 6. Deploy pause, freeze for a critical fix

Vercel does not have a "pause" toggle for git-triggered deploys, but there
are two clean options:

**Option A. Disable the git integration on `main`.**

Vercel dashboard, project `gearup`, Settings, Git, "Ignored Build Step" or
"Production Branch" section. Change the production branch to something
that no one is pushing to (e.g. `main-freeze`). Every push to `main` is
still received but no production build fires.

**Option B. Delete or rotate the deploy hook.**

Vercel dashboard, Settings, Git, Deploy Hooks. Delete the hook, or rotate
its secret so scheduled callers stop firing.

**How to lock down for a critical fix.**

1. Announce in team chat: "freezing prod deploys, do not push to main".
2. Apply Option A.
3. Land the fix on a branch, open a PR, verify on the preview URL.
4. Merge to `main`; the merged commit sits on `main` without deploying.
5. Once the team is ready to ship, revert Option A. The next push to
   `main` deploys.

Do not skip step 1. Silent freezes lead to a pair partner pushing a
"fix" that never reaches production and hunting a phantom bug.

---

## 7. Feature flags

**`NEXT_PUBLIC_EXPOSE_ERRORS`.** From
`apps/web/src/lib/errors.ts:153`. When set to `'1'`, every unhandled 500
response includes `error.detail` with `rawName`, `rawMessage`, `rawCode`,
`rawMeta`, and the top five lines of `rawStack`. The comment at line 150
records the intent: "opt-in diagnostic mode for triaging a live 500
without needing external log access". `NODE_ENV !== 'production'` also
enables it, so preview and local builds already expose details.

**When to turn on.** Only during an active production incident, only long
enough to capture the trace of the failing request, and only when Vercel
function logs are not enough. Turn it off in the same session; leaving it
on turns every future 500 into a stack-trace leak to the browser.

**Where.** Vercel dashboard, project `gearup`, Settings, Environment
Variables, add or update `NEXT_PUBLIC_EXPOSE_ERRORS` in Production, set to
`1`, then trigger a redeploy so the client bundle picks it up (this is a
`NEXT_PUBLIC_*` var, which is inlined at build time, so an env-var change
alone does not affect running clients).

**Other flags.** A grep for `process.env.NEXT_PUBLIC_` and
`process.env.[A-Z_]*` at `81a04bb` turns up standard config: `DATABASE_URL`,
`DIRECT_URL`, `JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PROJECT_ID`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
and `CORS_ALLOWED_ORIGINS` (`apps/web/src/middleware.ts:77`). None of
these are on-off feature toggles; they are integration settings. `SENTRY_*`
vars gate Sentry SDK behavior via `apps/web/sentry.*.config.ts`. If a new
flag is added, add a row here in the same PR.

---

## 8. Database ops (RULE 2 gated)

### 8.1 Read-only query against prod

Two paths. Both are read-only and safe to run without a per-op yes, but
tell your pair partner what you are looking at.

**Supabase SQL editor.** Fastest. Dashboard, project, SQL editor. Write
the `SELECT`, press Run. Do not paste an `UPDATE`, `DELETE`, or `DROP`
here; the editor does not gate you.

**`psql` from your terminal.**

```bash
DIRECT_URL=$(grep ^DIRECT_URL .env | cut -d= -f2- | tr -d '"')
/opt/homebrew/opt/postgresql@17/bin/psql "$DIRECT_URL" -c 'SELECT ...'
```

Prefer this for anything you want to save to a file. Prefer `SELECT` with
an explicit `LIMIT` when scanning; the DB is small but the tenant
expectation is fast.

### 8.2 Write, DDL or DML

**There is no Prisma migration wired up.** Schema changes today go via
`prisma db push`, which mutates the target DB in place with no history.
Every write against production is therefore a RULE 2 destructive op:

1. Take a pre-op backup per §4.1 and report the path.
2. Name the operation, state the blast radius (rows or tables affected),
   state what was checked, ask "yes/no".
3. Wait for the explicit yes.
4. Run the write. Prefer, in order:
   - `pnpm --filter @gearup/web exec prisma db push` for a schema change
     that matches `schema.prisma` on disk. Confirm the `git diff` of the
     schema first.
   - Hand-written SQL via `psql` for a data fix. Wrap it in `BEGIN;` and
     inspect the effect with `SELECT` before `COMMIT;`.
5. Verify post-state with a targeted `SELECT` and report row counts back
   to your pair.

Never accept a subagent's "I ran the write" (RULE 4). The coordinator
runs writes, not sub-agents.

---

## 9. Monitoring

**Sentry.** Two projects, `gearup-web` (Next.js client + server) and
`gearup-api` (`docs/deployment.md`). SDK is wired in
`apps/web/sentry.client.config.ts`, `sentry.server.config.ts`, and
`sentry.edge.config.ts`; DSNs are in Vercel env vars. Dashboard is
`https://sentry.io`, org owned by Sagnik. To triage:

1. Open the project, Issues tab, sort by "Last seen".
2. Click into the top issue, read the stack trace and the tags (URL,
   user, release).
3. Note the "First seen" against the last deploy time. If they line up,
   the last deploy caused it and §5 is on the table.

**Vercel logs.** Dashboard, project `gearup`, Logs tab. Filter by function
path (e.g. `/api/admin/invoices/[id]/line-items`) and status code
(`>=500`). Retention on the Vercel Hobby plan is one hour of runtime
logs; the Pro plan retains 24 hours. Verify the current plan in the
dashboard before assuming you can pull last night's logs. If your window
has already rolled off, Sentry is the fallback.

**Supabase logs.** Dashboard, project, Logs section. Retention on the
Supabase Free plan is 1 day of Postgres logs and edge logs; Pro extends
that. Verify the current tier before you promise anyone "the log will
still be there tomorrow". Available views: Postgres logs, API edge logs,
auth logs. The Postgres log is where a P2002 unique-constraint violation
or a P2003 FK violation surfaces at the DB layer, before Prisma dresses it
up. Cross-reference with `apps/web/src/lib/errors.ts:91` for how the app
maps Prisma codes to HTTP.

---

## 10. Incident post-mortem template

One page per incident, written within 48 hours, saved under
`docs/audit/<date>/postmortem-<slug>.md`. The template:

```markdown
# Postmortem: <one-line symptom>

**Detected:** <UTC timestamp>       verify with `date -u +%Y-%m-%dT%H:%M:%SZ`
**Resolved:** <UTC timestamp>
**Duration:** <hh:mm>
**On-call:** <Sagnik | Arnab>
**Severity:** <sev-1 money or data | sev-2 major feature | sev-3 minor>

## Timeline (UTC, chronological)

- HH:MM  <event, one line, verbatim signal or action>
- HH:MM  <next event>
- ...

## Root cause

<Two to five sentences. What was the code, config, or process that failed.
Do not stop at "a bug in X"; name the mechanism. Show any calculation
with inputs and outputs, per workspace RULE 6.>

## Blast radius

- Users affected: <count or "all admins", verified via query, not intuition>
- Data affected: <tables, row counts, verified via query>
- Money affected: <amount, verified from Invoice table>
- Duration of user-visible impact: <hh:mm>

## Remediation applied

<What was done, in order. Include the PR number, the commit SHA, and
whether it was rolled forward or rolled back.>

## Follow-up items

- [ ] <the fix that closes the class, not just this instance>
- [ ] <the guard that would catch it next time>
- [ ] <the runbook entry that should be added to this file>

## What we did NOT do

<Anything considered and rejected, with the reason. Keeps future readers
from re-treading the ground.>
```

The `What we did NOT do` block is mandatory and matches the discipline of
this document's own Method preface. It is the entry future on-call will
read first.

---

## 11. On-call handoff

At the end of a shift, or when handing an in-flight incident to the
other developer, leave behind:

1. **The one-line status.** "Green" or "yellow: `<what to watch>`" or
   "red: `<what is broken and where the debug is at>`".
2. **The open incident's timeline** in the post-mortem draft, updated to
   the current UTC timestamp.
3. **Every terminal you have open on production.** Screenshot the SQL you
   ran, or paste it into the timeline. Do not close the tab without
   preserving what was on the screen.
4. **The exact next action** the incoming person should take. Not "look
   into the invoice bug"; "read the Vercel log for
   `/api/admin/invoices/<id>/line-items` around `2026-09-20T14:32Z`, the
   P2028 trace should be there".
5. **Any env-var change** you made in the Vercel dashboard, with the
   variable name and the old value. Env-var changes are invisible in git.
6. **Any DB write** you made under §8.2, with the SQL and the row count
   before and after.

If you turned on `NEXT_PUBLIC_EXPOSE_ERRORS`, say so, and note whether it
is still on. That flag leaks stack traces; it should never survive a
handoff silently.

---

## 12. Escalation contacts

**Internal, two developers.**

- **Sagnik** (`souvikmusib` on GitHub). Contact details in the team's
  shared 1Password vault under `gearup / team`.
- **Arnab**. Same vault, same section.

Do not put phone numbers or personal email in this document. It is
checked into a private repo but "private" is a per-account setting and
this file is the wrong place to keep contact of record.

**External support.**

- **Supabase support.** Dashboard, project `gearup`, "Support" in the
  sidebar. Free-tier response is best-effort; a paid plan gives a
  business-hours SLA. Ticket link goes to your dashboard, not to a
  public URL.
- **Vercel support.** Dashboard, team, Support. Hobby is community
  support (Discord); Pro adds email support with a next-business-day
  target.
- **WhatsApp provider.** Whichever provider is configured under
  `integration.whatsappApiUrl` in the admin settings. The dashboard URL
  and contact are stored in the same shared vault as the API key.

**Rule.** External support is a last resort. Before opening a ticket:
have the incident timeline, the request ID (Vercel prints it, Supabase
prints it), the exact error message, the reproduction steps, and the
current status page reading. Filing a vague ticket at 2am does not
speed up resolution; it slows it down for whoever picks it up next.

---

## 13. Where to look when nothing here fits

- `docs/CODEBASE_CONTEXT.md` for the stack, the routes, and the env
  vars.
- `docs/deployment.md` for the initial deploy setup and the post-deploy
  verification checklist.
- `docs/RESTORE.md` for the full backup and restore doctrine, including
  the single-table restore path.
- `docs/11-DEPLOYMENT.md` for the current deployment layout.
- `apps/web/src/lib/errors.ts` for exactly which Prisma error maps to
  which HTTP shape, and the `NEXT_PUBLIC_EXPOSE_ERRORS` flag.
- `apps/web/src/middleware.ts` for the rate-limit shapes, the CORS
  allowlist, and the login throttle.
- `.github/workflows/db-backup.yml` and `scripts/db-backup.sh` for how
  the daily backup actually runs.
- `MEMORY.md` under `~/.claude/projects/-Users-sagnikmitra-Desktop-GitHub-gearup/`
  for prior incidents (the 2026-06-10 data-loss event, PITR-restore
  declined, and the workspace rules that gate every destructive step in
  this document).

**Rule from the workspace.** Every destructive command in this file is
gated on a per-op yes (RULE 2). If a procedure here fits your situation
but the "yes" is not available, do not proceed; escalate under §1.
