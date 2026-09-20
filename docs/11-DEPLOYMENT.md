---
mode: reference
updated: 2026-09-20
verified_against: b5a0da6
---

# DEPLOYMENT

> **This describes the code and the pipeline as it is wired at `b5a0da6`, not what the pack calls for.** The specification of what the pipeline *should* become lives in the pre-development pack. This doc is the reverse: what a push to `main` actually does today, what the environment on Vercel looks like, and where the load-bearing assumptions are.

> **Method.** I read `apps/web/vercel.json`, `apps/web/next.config.mjs`, `apps/web/package.json`, root `package.json`, `turbo.json`, `.github/workflows/ci.yml`, `.github/workflows/db-backup.yml`, `apps/web/src/app/api/health/route.ts`, `apps/web/sentry.client.config.ts`, `apps/web/sentry.server.config.ts`, `apps/web/sentry.edge.config.ts`, `docs/deployment.md`, `docs/env.md`, `docs/CODEBASE_CONTEXT.md`, `docs/audit/2026-06-10/RECOVERY_REPORT.md` §3, and listed `apps/web/prisma/` and `apps/web/src/app/api/` to confirm what is present. I checked for `.vercel/project.json`, `apps/web/.vercel/`, `.vercelignore`, `apps/web/.vercelignore` and a `crons` array in `vercel.json`, and confirmed each is absent. The Vercel project identity (team `souvikmusibs-projects`, project id `prj_wQw9bBLsQvqW0mbETz1vXKHRL9SE`) is quoted from the 2026-06-10 recovery audit, not re-verified against the API in this pass. Every `curl`, `vercel`, `pg_dump`, `prisma db push` and `vercel rollback` command in this doc is written out but was not executed.
>
> **What this pass did NOT do.** I ran no deploy, no promote, no rollback, no `vercel ls`, no `vercel env`, no API call to Vercel, Cloudflare, Supabase or Sentry. I did not read any token file. I did not confirm the current state of the Cloudflare DNS record for `gearup.sgnk.ai`, only that `docs/CODEBASE_CONTEXT.md` and the recovery audit describe it as a CNAME to Vercel. I did not enumerate deploy history. I did not verify a `gearup-flame.vercel.app` default hostname (the session memory the task references it from is not corroborated by any file in the repo at `b5a0da6`, so it is listed below as unverified). One file was written by this pass: `docs/11-DEPLOYMENT.md`.

## 1. Deployment target

Single Vercel project. There is no second surface, no split preview app, no separate marketing site. The entire product (the Next.js frontend and the Route Handlers under `apps/web/src/app/api/**`) ships as one deployment.

| Property | Value | Source |
|---|---|---|
| Platform | Vercel | `apps/web/vercel.json` present; `@vercel/analytics`, `@vercel/speed-insights` in `apps/web/package.json` |
| Project name | `gearup` | `docs/audit/2026-06-10/RECOVERY_REPORT.md` §3.2 (audit, not re-verified 2026-09-20) |
| Project id | `prj_wQw9bBLsQvqW0mbETz1vXKHRL9SE` | same source |
| Team scope | `souvikmusibs-projects` | same source |
| Plan | Hobby (free) as of 2026-06-10 audit | same source; **may have changed since** |
| Framework | Next.js (auto-detected) | `apps/web/vercel.json` sets no `framework`; `apps/web/package.json` has `next: ^14.2.0` |
| Root directory | `apps/web` | `vercel.json` lives there; root `package.json` has no Next dep |
| Deploy token | `GEARUP_VERCEL_TOKEN` (not the bare `VERCEL_TOKEN`) | `docs/requirements/voice-notes-2026-06-16.md` and the recovery audit; do not print the value |

**A fresh clone will not be linked to the Vercel project.** No `.vercel/project.json` is committed. Run `vercel link --scope souvikmusibs-projects --project gearup` once per machine before any CLI operation, or every command will fail with an error that reads like an auth failure.

## 2. Environments

Vercel gives every project three targets. This project uses two of them.

### Production

- Triggered by: a push to `main` on `github.com/souvikmusib/gearup` (integration handled by Vercel, not by any workflow in `.github/workflows/`).
- Custom domain: `gearup.sgnk.ai`. CNAME record at Cloudflare points at Vercel, per `docs/CODEBASE_CONTEXT.md` §1 and the recovery audit; the exact target host is `cname.vercel-dns.com` for Vercel-hosted apex-alias records, **but this was not re-verified in this pass**.
- Default Vercel hostname: the task brief mentions `gearup-flame.vercel.app`. That string does not appear in any file in this repo at `b5a0da6`, so it is **unverified** here. Confirm with `vercel ls gearup --scope souvikmusibs-projects` before quoting it.
- Environment variables: read from Vercel's `Production` scope. Names are listed in §4; values live in the Vercel dashboard and in `.env` on developer machines and are not committed.
- Sentry: uploads sourcemaps only if `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` are all set for this scope; otherwise `withSentryConfig` runs and skips upload silently (`apps/web/next.config.mjs`, closing comment). Runtime error reporting is gated on `NEXT_PUBLIC_SENTRY_DSN` (`apps/web/sentry.client.config.ts`) and `SENTRY_DSN` (`sentry.server.config.ts`, `sentry.edge.config.ts`), each independently.

### Preview

- Triggered by: a push to any branch that is not `main`, and by opening a pull request. Vercel's git integration builds both cases and posts the URL back to GitHub.
- URL shape: `gearup-git-<branch-slug>-souvikmusibs-projects.vercel.app` and `gearup-<hash>-souvikmusibs-projects.vercel.app`. **Exact hostnames not re-verified in this pass.**
- Environment variables: read from Vercel's `Preview` scope. This scope should mirror `Production` for anything the app needs at boot (`DATABASE_URL`, `JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_*`) or the preview 500s on the first DB call. Whether it actually does mirror production for this project was not checked here; run `vercel env ls preview --scope souvikmusibs-projects` to confirm.
- Sentry: same gating as production. If `SENTRY_DSN` is set in `Preview`, preview errors land in the same Sentry project as production unless `SENTRY_PROJECT` differs, which is a footgun for alert routing.

### Development

- Not used as a deploy target. Vercel's `dev` env scope is present (see `vercel env pull --environment=development`), and `apps/web/scripts/with-root-env.mjs` reads from the root `.env` file rather than pulling from Vercel. The `Development` env in the Vercel dashboard is therefore unused by anything at HEAD; do not add new secrets there without wiring a puller in.

## 3. Build pipeline

Vercel receives a push, checks it out at the commit, reads `apps/web/vercel.json`, and runs the framework's default install and build unless overridden. `vercel.json` at `b5a0da6` overrides nothing about the pipeline itself:

```json
{
  "regions": ["hnd1"],
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

So the pipeline is Vercel's Next.js default, resolved against this repo's shape.

**Framework detection.** `apps/web/package.json` declares `"next": "^14.2.0"`. Vercel detects Next.js and applies its Next.js preset (Node.js runtime for the Route Handlers, `.next/` as the output, edge/serverless routing driven by the App Router).

**Node runtime.** Root `package.json` declares `"engines": { "node": ">=20.0.0" }`. Vercel honours this by picking its supported Node major that satisfies the constraint (20 or 22 as of the 2026-09 platform). The CI in `.github/workflows/ci.yml` pins Node 20 explicitly; there is no `.nvmrc` in the tree, so Vercel and CI can drift.

**Package manager.** Root `package.json` declares `"packageManager": "pnpm@9.6.0"`. Vercel detects this and runs pnpm install with the lockfile at `pnpm-lock.yaml` (root). Do not delete the lockfile.

**Install command.** Not overridden. Vercel runs `pnpm install --frozen-lockfile` for a pnpm workspace. This resolves and hoists every workspace package into `node_modules/`.

**Build command.** Not overridden. Vercel runs `pnpm build` at the root, which is `turbo build` (root `package.json`). `turbo build` resolves the `build` task for every workspace and runs `@gearup/web`'s `build` script, which is `node ./scripts/with-root-env.mjs "prisma generate && next build"` (`apps/web/package.json`). Two consequences:

1. `prisma generate` runs on every build. `postinstall` in `apps/web/package.json` also runs it. On Vercel the `postinstall` covers it; the explicit `prisma generate` in the build script is belt-and-suspenders.
2. `with-root-env.mjs` looks for a root `.env` file. On Vercel there is no root `.env` at build time (envs come from the dashboard, injected as process env). The wrapper should no-op in that case; if it errors on a missing file, the build fails at the wrapper, not at `next build`. Confirm on next deploy.

**Output directory.** Not overridden. Vercel uses `.next` under the detected Next.js root, which is `apps/web/.next`.

**Ignored build step.** Not configured. `vercel.json` has no `ignoreCommand`. **Every push to `main`, and every push to any branch, triggers a fresh build.** A commit that only touches `docs/`, `scripts/` outside `apps/web/`, or the top-level READMEs rebuilds and redeploys anyway. If build minutes become a constraint on Hobby, add an `ignoreCommand` that diffs `apps/web`, `package.json`, `pnpm-lock.yaml`, `turbo.json` and `vercel.json` against the previous SHA and exits 0 to skip.

**Turbo remote cache.** Not configured in `turbo.json`. Every build starts cold on Vercel's build machine. `turbo.json`'s `globalEnv` array declares which env vars invalidate the cache, but with no remote there is no cache to invalidate across builds. This is fine at current volume; revisit if build times cross a few minutes.

**Function region and limits.** `vercel.json` pins `regions: ["hnd1"]` (Tokyo) and raises `maxDuration` for every Route Handler under `app/api/**/*.ts` to 30 seconds. Hobby-tier default is 10s; 30s is Hobby's ceiling. No route bypasses the pattern, so every Route Handler at `b5a0da6` gets the 30s ceiling.

## 4. Environment variables (deployment scope)

Names only. Values live in Vercel's dashboard, per environment. This is the list the app expects at build or run time; the developer-facing list with meanings is in `docs/env.md` and (once written) `docs/09-ENVIRONMENT.md`.

Derived by cross-referencing `turbo.json` `globalEnv`, `apps/web/next.config.mjs`, the three `apps/web/sentry.*.config.ts` files, and `docs/CODEBASE_CONTEXT.md` §1.

| Name | Where it is read | Required in Production |
|---|---|---|
| `DATABASE_URL` | Prisma at runtime (Session Pooler) | Yes |
| `DIRECT_URL` | Prisma for migrations and introspection | Yes (used by `prisma generate`, migration tooling) |
| `JWT_SECRET` | `apps/web/src/lib/auth/*` (custom JWT + RBAC) | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Client Supabase SDK (if used at HEAD) | Conditional |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client Supabase SDK | Conditional |
| `SUPABASE_URL` | Server Supabase client | Conditional |
| `SUPABASE_SERVICE_ROLE_KEY` | Server Supabase client (privileged) | Conditional; do NOT expose to `Preview` unless intended |
| `SUPABASE_ANON_KEY` | Server Supabase client | Conditional |
| `NEXT_PUBLIC_APP_URL` | Client URL construction (share links, callbacks) | Yes |
| `NEXT_PUBLIC_SENTRY_DSN` | `sentry.client.config.ts` (browser errors) | Optional; absence disables client Sentry |
| `SENTRY_DSN` | `sentry.server.config.ts`, `sentry.edge.config.ts` | Optional; absence disables server/edge Sentry |
| `SENTRY_AUTH_TOKEN` | Sourcemap upload during `next build` | Optional; required for readable stack traces |
| `SENTRY_ORG` | Sourcemap upload | Required only if `SENTRY_AUTH_TOKEN` set |
| `SENTRY_PROJECT` | Sourcemap upload | Required only if `SENTRY_AUTH_TOKEN` set |
| `NODE_ENV` | Set by Vercel; do not override | Do not set manually |

Values are not listed here and never in git. Cross-reference for meanings: `docs/env.md`, `docs/09-ENVIRONMENT.md` (once written).

## 5. Custom domain and DNS

`gearup.sgnk.ai` is the production domain. The Vercel side of the record was configured under project `gearup`. The DNS record lives at Cloudflare on Sagnik's personal account (`sgnk.ai` zone), described in `docs/CODEBASE_CONTEXT.md` §1 as "Custom domain on Vercel" and in `docs/audit/2026-06-10/RECOVERY_REPORT.md` §3.2 as `gearup.sgnk.ai (CNAME to Vercel)`. The exact CNAME target host is `cname.vercel-dns.com` (Vercel's alias target for subdomains), **not re-verified in this pass**. Run `dig +short gearup.sgnk.ai CNAME` to confirm before touching it.

The Vercel default `*.vercel.app` hostname for the project was not read in this pass. The task brief names `gearup-flame.vercel.app`; that string does not appear anywhere in the repo at `b5a0da6`, so treat it as unverified until `vercel ls gearup --scope souvikmusibs-projects` confirms it.

No `www.gearup.sgnk.ai` alias was checked. If one exists it should 30x to the apex; if it does not exist, browsers typing `www.` will hit an NX response and the failure mode is not "redirect", it is "site not found".

## 6. Deploy triggers

Only Vercel's own git integration triggers deploys. There is no GitHub Action in `.github/workflows/` that calls Vercel: `ci.yml` runs typecheck, lint, unit, integration and e2e tests; `db-backup.yml` runs a nightly `pg_dump`. Neither deploys.

| Event | Result |
|---|---|
| `git push origin main` | Vercel builds and promotes to Production. The build runs regardless of what changed (no `ignoreCommand`). |
| `git push origin <any-other-branch>` | Vercel builds a Preview at `gearup-git-<slug>-souvikmusibs-projects.vercel.app`. |
| Opening a pull request | Vercel posts a Preview URL as a check on the PR. |
| Manual redeploy | `vercel redeploy <deployment-url-or-id>` with `--scope souvikmusibs-projects --token "$GEARUP_VERCEL_TOKEN"`, or the dashboard `...` menu on a deployment. |
| Manual promote | See §8. |

**CI is not a deploy gate.** `ci.yml` on `push: [main]` runs alongside Vercel's build, not before it. A red CI run does not stop the deploy. The correct enforcement is a required-status-check on the branch protection rule for `main` requiring the `ci / check` job to pass on the PR before merge; whether that rule is set on `souvikmusib/gearup` was not verified here.

## 7. Post-deploy verification

Vercel's own dashboard is the source of truth for READY state. From the CLI or API, in the same shell that sources the token file (never `echo` the value):

```bash
source /Users/sagnikmitra/.config/codex-env/tokens.zsh

# List recent deployments for the project.
curl -sS \
  -H "Authorization: Bearer $GEARUP_VERCEL_TOKEN" \
  "https://api.vercel.com/v6/deployments?app=gearup&teamId=team_$(...)" \
  | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")).deployments;
             d.slice(0,5).forEach(x=>console.log(x.uid, x.state, x.url, x.created));'
```

The `teamId` value for `souvikmusibs-projects` was not read in this pass; substitute `--scope souvikmusibs-projects` on the CLI form to sidestep it:

```bash
vercel ls gearup --scope souvikmusibs-projects --token "$GEARUP_VERCEL_TOKEN"
```

Then hit the surface. Use `-sSI` so a 3xx to `/login` does not read as green:

```bash
curl -sSI https://gearup.sgnk.ai/ | head -1
# Expect: HTTP/2 200

curl -sS https://gearup.sgnk.ai/api/health
# Expect: {"status":"ok","db":"connected","timestamp":"..."}
```

The health route lives at `apps/web/src/app/api/health/route.ts` and executes `SELECT 1` against the primary DB via Prisma. A 200 with `db:"connected"` proves the deployment is READY *and* has a live pool. A 503 with `db:"disconnected"` means the code is deployed but the pooler is unreachable or `DATABASE_URL` is wrong for this scope. `-sL` on this URL would follow a hypothetical redirect and lie; do not use it for verification.

## 8. Rollback

**This is a RULE 2 destructive operation.** Rollback re-points production at a previous deployment. It is visible to every user of `gearup.sgnk.ai` within seconds. It is reversible (promote the other way), but a wrong `<deployment-id>` promoted to production is an incident until it is undone. Do not run any of the commands below without stating the operation in chat, naming the target deployment id, listing the blast radius, and receiving an explicit "yes" per the workspace's RULE 2 protocol.

**Preferred path: promote a known-good deployment.** This changes the alias only. It does not rebuild, does not touch git, and does not run migrations.

```bash
source /Users/sagnikmitra/.config/codex-env/tokens.zsh

# 1. Find the id of the last known-good deployment.
vercel ls gearup --scope souvikmusibs-projects --token "$GEARUP_VERCEL_TOKEN"

# 2. Promote it. This changes production. Requires per-op approval.
vercel promote <deployment-url-or-id> \
  --scope souvikmusibs-projects \
  --token "$GEARUP_VERCEL_TOKEN"
```

`vercel rollback` (with no argument) targets the immediately-previous production deployment. Both `promote` and `rollback` are documented in Vercel's CLI docs; the exact flag set for the CLI version installed on the operator's machine should be checked with `vercel promote --help` before use.

Immediately after, verify with `-sSI` and hit `/api/health`:

```bash
curl -sSI https://gearup.sgnk.ai/ | head -1        # expect HTTP/2 200
curl -sS  https://gearup.sgnk.ai/api/health        # expect {"status":"ok",...}
```

**Do not roll back by reverting on `main` unless you also intend the code change.** A `git revert` is a new commit; it triggers a full Vercel build (no `ignoreCommand` to skip it) and takes as long as any deploy. Promotion is seconds and is undoable by promoting the other way.

**A rollback does not touch the database.** If the deployment being rolled back ran `prisma db push` (see §11), the schema does not roll back with the code. The old code will run against the new schema. Most schema changes at this project's stage (adding a nullable column, widening a type) are forward and backward compatible; a rename, a NOT NULL addition or a dropped column is not. Verify the last schema change was compatible before promoting an older deployment.

## 9. Health checks

Post-deploy, one URL and one Route Handler are worth hitting:

- `GET https://gearup.sgnk.ai/`, the public marketing page. HTTP/2 200 with a non-trivial body.
- `GET https://gearup.sgnk.ai/api/health`, backed by `apps/web/src/app/api/health/route.ts`. 200 with `{status:"ok", db:"connected", timestamp:"..."}` proves the pool is live. 503 with `{status:"error", db:"disconnected"}` proves the app is up but the DB link is broken; `console.error('health: db check failed', e)` will have surfaced the exception in Sentry (server DSN) and in Vercel's runtime logs (1-hour retention on Hobby per the 2026-06-10 audit; verify that limit still applies to the current plan).

There is no `/api/status`, `/api/version`, `/api/ready` or `/api/live` distinct from `/api/health`. If you need liveness vs readiness split, add both routes rather than overload `/api/health`.

## 10. Cron and scheduled tasks

**Vercel Cron is not configured.** `apps/web/vercel.json` has no `crons` array at `b5a0da6`. `apps/web/src/app/api/` has no `cron/` subdirectory. Nothing schedules server-side work on the platform.

The one scheduled job that touches this project runs outside Vercel: `.github/workflows/db-backup.yml` runs a nightly `pg_dump` at 02:00 UTC (07:30 IST) via GitHub Actions, storing to an artifact (90-day retention) and to a `db-backups` orphan branch (last 90 dailies). It reads `DATABASE_URL` (or `DIRECT_URL`) from the repo's Actions secrets.

If a periodic in-app task becomes necessary (session cleanup, notification retries, appointment reminders), add it to `apps/web/vercel.json`:

```json
{
  "regions": ["hnd1"],
  "functions": { "app/api/**/*.ts": { "maxDuration": 30 } },
  "crons": [
    { "path": "/api/cron/appointment-reminders", "schedule": "0 3 * * *" }
  ]
}
```

Vercel Cron on Hobby is limited (schedule frequency, concurrency); consult the current Vercel pricing page before designing a cadence.

## 11. Database migrations on deploy

**There is no migration step on deploy, and no migration history in the repo.** `apps/web/prisma/` contains `schema.prisma`, `seed.ts`, and two one-off `migrate-*.ts` scripts; there is no `apps/web/prisma/migrations/` directory. The `db:push` and `db:migrate` scripts exist in `apps/web/package.json` but neither runs on Vercel. Schema changes are applied by a developer running `pnpm --filter @gearup/web db:push` locally against the production `DATABASE_URL`.

This is a risk, and it is worth naming plainly:

1. **No history.** Nothing in the repo records which schema state matches which deployment. A production DB at `b5a0da6` is not reproducible from source; it is whatever the last `db push` left. `prisma migrate diff` can reconstruct a diff from the introspected DB against the file, but only after the fact and not per-deploy.
2. **No safety net.** `prisma db push` will accept a destructive change (drop column, rename) with `--accept-data-loss`. The flag is not defaulted in the script (`apps/web/package.json` script is bare `prisma db push`), so Prisma will refuse a destructive push and prompt. That prompt is a real safety net, but only if the operator sees it; a piped invocation swallows it. Never pipe `pnpm --filter @gearup/web db:push`.
3. **Rollback asymmetry.** A code rollback (§8) does not roll back the schema. See the note under §8.

The path to fix this is a `prisma migrate` history (`apps/web/prisma/migrations/`) generated by `prisma migrate dev` locally, committed, and applied on deploy by adding `prisma migrate deploy` to the build script. That is a change to make, not to document as if it were the current state. It is not the current state.

Every `db push`, `migrate deploy`, `migrate reset`, and raw SQL against the production DB is a RULE 2 destructive operation and must be preceded by a fresh `pg_dump` (`backups/`), a stated blast radius, and explicit approval. See `docs/RESTORE.md` for what "fresh backup" means for this project.

## 12. Monitoring

**Sentry.** `apps/web/instrumentation.ts` wires `@sentry/nextjs` v8 for server and edge init under Next 14 App Router. Client-side init is `apps/web/sentry.client.config.ts`, which gates on `NEXT_PUBLIC_SENTRY_DSN` (see §4) and defaults to `tracesSampleRate: 0.2`, `replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0`. Server and edge configs gate on `SENTRY_DSN` independently. If the client DSN is present but the server DSN is not, browser errors reach Sentry and 500s do not; the failure mode is a silent server. Sourcemap upload is controlled by `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` at build time (`apps/web/next.config.mjs`); absent envs skip upload and stack traces come in with minified frame names.

Alert routing is configured in Sentry itself, not in this repo. There is no `.sentryclirc` or `sentry.properties` file.

**Vercel Analytics + Speed Insights.** `apps/web/package.json` declares `@vercel/analytics` and `@vercel/speed-insights`. If the client bundle wires either provider component into the root layout at HEAD (not verified here), Vercel collects RUM into the project's Analytics tab.

**Runtime logs.** Vercel's per-invocation `console.log`, `console.error` and thrown errors surface under Deployments → Runtime Logs. Retention on the 2026-06-10 audit was 1 hour (Hobby tier). If the plan has since been upgraded, retention differs; check the current plan before assuming a log window is available for an incident window.

**No log drain.** As of the 2026-06-10 audit, no log drain is configured. Anything that scrolls off the 1-hour window is gone. This was the load-bearing finding in the June 2026 data-loss incident; see `docs/audit/2026-06-10/RECOVERY_REPORT.md`.

## 13. Incident response

Two documents already exist and this doc does not restate them:

- `docs/RESTORE.md` for a database restore procedure (pre-op backup, `pg_dump` verification, `psql` restore, post-op count check).
- `docs/audit/2026-06-10/` for the reference incident (data-loss postmortem, `RECOVERY_REPORT.md`, `RECONSTRUCTION_PLAN.md`, `POST_RESTORE_PLAN.md`). Read these before touching production in an incident, not during one.

Deploy-shaped incidents (bad code in production, missing env var, 500 on every request) resolve with the rollback in §8. DB-shaped incidents (data corruption, dropped table, broken schema) resolve with the restore in `docs/RESTORE.md`. The two paths intersect when the deploy contained a schema change; §11 covers the asymmetry.

## 14. Recent deploy history

Not enumerated here. Vercel's dashboard is the source of truth: Deployments tab on the `gearup` project under `souvikmusibs-projects`. Any listing in this doc would be stale within hours. Use `vercel ls gearup --scope souvikmusibs-projects` when you need it.

## 15. What this doc does not cover

- **Cloudflare zone administration.** DNS record management for `sgnk.ai` lives on Sagnik's personal Cloudflare account. This doc names the record for `gearup.sgnk.ai`; changes to it belong in a Cloudflare procedure, not here.
- **Supabase project administration.** Backup add-ons, PITR, connection-pooler config, project ref rotation. `docs/audit/2026-06-10/RECOVERY_REPORT.md` §2 records the state as of that audit; changes since have not been read.
- **Sentry org/project setup.** Creating the project, wiring alerts, configuring rate-limits. Handled in the Sentry dashboard; this doc names the envs that connect the app to it.
- **What the pipeline should be.** The pre-development pack is the place for that. This doc is what the pipeline is.

## Did NOT do

- No `vercel ...` command was run in this pass (no `ls`, no `link`, no `env pull`, no `promote`, no `rollback`, no `deploy`).
- No `curl` against Vercel, Cloudflare, Supabase or Sentry.
- No `pg_dump`, `psql`, `prisma db push`, `prisma migrate` or any other database-touching command.
- No token file was read; `GEARUP_VERCEL_TOKEN` was not resolved to a value.
- No em-dashes anywhere in this doc; period, comma, brackets only.
- No file besides `docs/11-DEPLOYMENT.md` was written.
- The Vercel project identity in §1 is quoted from the 2026-06-10 recovery audit and was not re-verified against the live API here; the plan tier ("Hobby") in particular may have changed and should be re-checked before quoting.
- The `gearup-flame.vercel.app` default hostname named in the task brief was not verified against the platform; no file at `b5a0da6` corroborates it, so it is flagged unverified rather than repeated as fact.
- Cloudflare DNS was not queried; the CNAME target `cname.vercel-dns.com` is Vercel's standard alias target but was not confirmed with `dig` for this record in this pass.
- No workflow YAML or `vercel.json` was edited. `docs/deployment.md` remains in place; it is stale (it names Render and `apps/api` as the backend, which do not describe HEAD at `b5a0da6` where `apps/api/` contains only `dist/` and `node_modules/` leftovers and every route lives under `apps/web/src/app/api/**`), and superseding it is a separate change.
