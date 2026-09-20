---
mode: reference
updated: 2026-09-20
verified_against: b5a0da6
---

# Environment variables

> **This describes the code, not the plan.** Re-verified on 2026-09-20 against
> `b5a0da6`. Scope of this pass is `apps/web/`. `apps/api/` is present on disk as
> `dist/` + `node_modules/` only and has zero tracked source files under `git ls-files
> apps/api/`; every variable claimed by `docs/env.md` under the "Backend (`apps/api`)"
> heading (`PORT`, `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_*`,
> `EMAIL_*`, `CRON_ENABLED`, `OWNER_SUMMARY_EMAIL`, `APP_BASE_URL`,
> `PUBLIC_TRACK_URL_BASE`) is therefore stale; no source reads any of them.

> **Method.** I ran
> `grep -rE 'process\.env\.[A-Z_]+' apps/web/src/`
> and separately widened it to `apps/web/` including `instrumentation.ts`,
> `next.config.mjs`, `sentry.*.config.ts`, `playwright.config.ts`, `scripts/`,
> `prisma/`, `e2e/` and `test/`. I compiled the distinct names with `sort -u`. I
> read `apps/web/src/lib/prisma.ts`, `apps/web/src/lib/jwt-secret.ts`,
> `apps/web/src/lib/errors.ts`, `apps/web/src/middleware.ts`,
> `apps/web/instrumentation.ts`, `apps/web/next.config.mjs`,
> `apps/web/vercel.json`, `apps/web/sentry.server.config.ts` (and the client/edge
> variants), and `docs/env.md`. `.env.example` values were NOT read; I read only
> the variable NAMES via `git show HEAD:.env.example | grep -E '^[A-Z]' | sed
> 's/=.*//'`. No value of any variable appears in this document. Names only.
>
> **What this pass did NOT do.** It did not open the Vercel project's env
> settings, so nothing here confirms which variables are actually set in
> production, preview or development. It did not run the app, so every "throws
> at boot" claim is read off the source, not observed. It did not read
> `.env.local` (would be blocked, and would leak secrets anyway). It did not
> grep outside `apps/web/`. It did not audit `apps/api/dist/`; that build
> artifact is stale and shipped from a source tree that no longer exists in
> `git ls-files`.

---

## 1. How env is meant to work here

**There is no central env schema.** `apps/web/src/config/` does not exist, and a
grep for `z.object(` returns hits only in `apps/web/src/lib/validators/`
(input validation, not env). `process.env` is read directly in
infrastructure-adjacent files (`lib/prisma.ts`, `lib/jwt-secret.ts`,
`lib/errors.ts`, `middleware.ts`, the three `sentry.*.config.ts` files,
`instrumentation.ts`, `next.config.mjs`), and each file makes its own
required-vs-optional decision.

Only two files gate on presence at module load:

- `apps/web/src/lib/jwt-secret.ts:37` calls `resolveSecret()` at import time.
  In any deployed environment (`VERCEL_ENV` set, or `NODE_ENV === 'production'`)
  a missing or under-16-char `JWT_SECRET` throws
  `[jwt-secret] JWT_SECRET is required in all deployed environments and must
  be at least 16 characters long.`. Local dev falls back to a hard-coded
  insecure string with a `console.warn`.
- `apps/web/src/lib/prisma.ts:40` mutates `process.env.DATABASE_URL` in place
  to append `pgbouncer` / `connection_limit` / `pool_timeout` when the URL
  points at a Supabase pooler. A missing `DATABASE_URL` does not throw here;
  Prisma throws later on the first query.

Everything else (`CORS_ALLOWED_ORIGINS`, `NEXT_PUBLIC_SENTRY_DSN`,
`NEXT_PUBLIC_EXPOSE_ERRORS`, `SENTRY_ORG`, `SENTRY_PROJECT`, the three
`PRISMA_*` tuning flags) fails soft: absent means "feature off" or "use
default", never a boot error.

---

## 2. Every variable, by name

Ten distinct names are read in `apps/web/src/`. A further six are read in
adjacent apps/web files (`instrumentation.ts`, `next.config.mjs`, the sentry
configs) or in build/test scaffolding (`playwright.config.ts`, `e2e/`,
`prisma/`, `scripts/`, `test/integration/`).

### 2a. Database

| Name | Kind | Scope | Required? | Purpose | Read at |
|---|---|---|---|---|---|
| `DATABASE_URL` | secret | server-only | Yes (runtime; no boot check) | Prisma connection string; mutated in place with pooler params | `apps/web/src/lib/prisma.ts:40`; also `prisma/migrate-*.ts`, `test/integration/setup.ts`, `e2e/global-setup.ts` |
| `DIRECT_URL` | secret | server-only | No | Non-pooled URL for migrations and one-off scripts that fail on prepared statements over pgbouncer | `apps/web/prisma/migrate-batch-selling-price.ts:22`, `apps/web/prisma/migrate-stock-batches.ts:26`, `apps/web/playwright.config.ts:41`, test/e2e setup |
| `PRISMA_DISABLE_URL_TUNING` | feature-flag | server-only | No | `=1` disables the pool-tuning URL rewrite | `apps/web/src/lib/prisma.ts:6` |
| `PRISMA_FORCE_POOL_TUNING` | feature-flag | server-only | No | `=1` forces the rewrite even when the host is not a Supabase pooler | `apps/web/src/lib/prisma.ts:12` |
| `PRISMA_CONNECTION_LIMIT` | config | server-only | No | Overrides the default `connection_limit` (`3` in prod, `5` elsewhere) | `apps/web/src/lib/prisma.ts:21` |
| `TEST_DATABASE_URL`, `E2E_DATABASE_URL` | secret | server-only (tests) | No | Alternate URLs for the vitest integration harness and Playwright respectively | `apps/web/test/integration/*.ts`, `apps/web/e2e/global-setup.ts` |

### 2b. Auth

| Name | Kind | Scope | Required? | Purpose | Read at |
|---|---|---|---|---|---|
| `JWT_SECRET` | secret | server-only | Yes in any deployed env; ≥16 chars | Signs admin session JWTs; validated at module load | `apps/web/src/lib/jwt-secret.ts:19` |
| `VERCEL_ENV` | config (Vercel-injected) | server-only | Injected by Vercel | Used only to detect "deployed" so a missing `JWT_SECRET` becomes a hard error | `apps/web/src/lib/jwt-secret.ts:15,32` |

The session cookie is set in `apps/web/src/app/api/admin/auth/login/route.ts`
and mirrored in `logout/route.ts`; both derive `secure: process.env.NODE_ENV
=== 'production'` and hard-code the rest (name, `httpOnly`, `sameSite`, path)
in code, not via env. There is no `JWT_EXPIRY`, `SESSION_SECRET`, or cookie
config env variable in the current source.

### 2c. Public app

| Name | Kind | Scope | Required? | Purpose | Read at |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_EXPOSE_ERRORS` | feature-flag | client-exposed | No | `=1` includes the underlying error message and stack in API 500 responses; also on by default when `NODE_ENV !== 'production'` | `apps/web/src/lib/errors.ts:153` |

Notably absent: `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_APP_NAME` are in
`.env.example` but no `apps/web/` source file reads them. See §4.

### 2d. Sentry

| Name | Kind | Scope | Required? | Purpose | Read at |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | config (public by design) | client-exposed | No | Gates and configures Sentry init in all three runtimes; absent means Sentry is off | `apps/web/sentry.client.config.ts:3-5`, `apps/web/sentry.edge.config.ts:3-5`, `apps/web/sentry.server.config.ts:3-5` |
| `SENTRY_ORG` | config | server-only (build time) | No | Passed to `withSentryConfig` for sourcemap upload | `apps/web/next.config.mjs:62` |
| `SENTRY_PROJECT` | config | server-only (build time) | No | Same, project slug for sourcemap upload | `apps/web/next.config.mjs:63` |
| `NEXT_RUNTIME` | config (Next-injected) | server-only | Set by Next | Selects `sentry.server.config` vs `sentry.edge.config` at register | `apps/web/instrumentation.ts:9,12` |

`SENTRY_AUTH_TOKEN` is not read in tree; `@sentry/nextjs`'s build plugin picks
it up from the environment on its own when uploading sourcemaps. `SENTRY_DSN`
(non-`NEXT_PUBLIC_`) appears in `.env.example` but no source file reads it -
all three sentry configs read `NEXT_PUBLIC_SENTRY_DSN`.

### 2e. CORS

| Name | Kind | Scope | Required? | Purpose | Read at |
|---|---|---|---|---|---|
| `CORS_ALLOWED_ORIGINS` | config | server-only | No, but see below | Comma-separated allowlist for `Access-Control-Allow-Origin` on `/api/*`; unset falls back to `*` with a code comment saying "deployed environments MUST set this" | `apps/web/src/middleware.ts:77` |

The middleware calls this out explicitly at line 76: unset means wildcard,
which the same comment says is unsafe for deployed environments. There is no
runtime gate that enforces it.

### 2f. Runtime (injected)

| Name | Kind | Scope | Purpose |
|---|---|---|---|
| `NODE_ENV` | config | both | Guards prod-only branches: cookie `secure`, prisma log level, dev fallback for JWT, dev-mode error exposure |
| `VERCEL_ENV` | config | server-only | See auth |
| `NEXT_RUNTIME` | config | server-only | See sentry |
| `VERCEL`, `CI` | config | server-only | Referenced only in `apps/web/e2e/` scaffolding to switch Playwright behavior; no product code depends on them |

### 2g. Not referenced by any code in `apps/web/`

The following names appear in `apps/web/.env.example` but a grep across
`apps/web/` returns zero reads:

- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PROJECT_ID`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SENTRY_DSN` (the non-`NEXT_PUBLIC_` twin)

The Supabase JS client is not imported anywhere in `apps/web/src/` (all
database access is Prisma-over-Postgres); the three `NEXT_PUBLIC_SUPABASE_*`
entries are dead as far as the current build is concerned. They may be
placeholders for a future direct-from-browser Supabase integration.

---

## 3. How to discover a variable

New dev, looking for where a variable is read:

```
grep -rn 'process\.env\.<NAME>' apps/web/ \
  --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.js' \
  | grep -v node_modules
```

To enumerate every distinct name read anywhere in `apps/web/`:

```
grep -rE 'process\.env\.[A-Z_]+' apps/web/ \
  --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.js' \
  | grep -v node_modules \
  | grep -oE 'process\.env\.[A-Z_][A-Z0-9_]*' | sort -u
```

Restrict to product source only (skip tests, e2e, scripts, prisma migration
files):

```
grep -rE 'process\.env\.[A-Z_]+' apps/web/src/ \
  | grep -oE 'process\.env\.[A-Z_][A-Z0-9_]*' | sort -u
```

---

## 4. `.env.example` truthfulness check

**Verdict: `.env.example` is stale in both directions.** Diff below is names
only. Values were not read.

| `.env.example` name | Read in code? |
|---|---|
| `DATABASE_URL` | Yes |
| `DIRECT_URL` | Yes (scripts / tests / migrations) |
| `JWT_SECRET` | Yes |
| `NODE_ENV` | Yes |
| `NEXT_PUBLIC_SENTRY_DSN` | Yes |
| `NEXT_PUBLIC_APP_NAME` | **No**; grep returns zero hits in `apps/web/` |
| `NEXT_PUBLIC_APP_URL` | **No**; zero hits |
| `NEXT_PUBLIC_SUPABASE_URL` | **No**; no Supabase JS client imported |
| `NEXT_PUBLIC_SUPABASE_PROJECT_ID` | **No** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **No** |
| `SENTRY_DSN` | **No**; all three sentry configs read `NEXT_PUBLIC_SENTRY_DSN` |

Missing from `.env.example` but read by code:

- `CORS_ALLOWED_ORIGINS`; required to lock CORS off wildcard in deployed envs
- `NEXT_PUBLIC_EXPOSE_ERRORS`; feature flag for verbose 500 bodies
- `PRISMA_CONNECTION_LIMIT`, `PRISMA_DISABLE_URL_TUNING`, `PRISMA_FORCE_POOL_TUNING`; pooler-tuning knobs
- `SENTRY_ORG`, `SENTRY_PROJECT`; needed to enable sourcemap upload during `next build`
- `TEST_DATABASE_URL`, `E2E_DATABASE_URL`; test harness

`VERCEL_ENV`, `NEXT_RUNTIME`, `VERCEL`, `CI` are runtime-injected and belong
in Vercel/Playwright config, not `.env.example`.

**`docs/env.md` is significantly staler** than `.env.example`: its "Backend
(`apps/api`)" section documents 15 variables (`PORT`, `SESSION_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET_*`, `WHATSAPP_PROVIDER`,
`WHATSAPP_API_KEY`, `WHATSAPP_API_URL`, `EMAIL_PROVIDER`, `EMAIL_API_KEY`,
`EMAIL_FROM_ADDRESS`, `CRON_ENABLED`, `OWNER_SUMMARY_EMAIL`, `APP_BASE_URL`,
`PUBLIC_TRACK_URL_BASE`) against an `apps/api/` service that no longer has
tracked source in the tree. `docs/env.md` should be either deleted or reduced
to a pointer to this document.

---

## 5. Token file conventions

Sagnik's machine-global token file lives at
`/Users/sagnikmitra/.config/codex-env/tokens.zsh` (per the global CLAUDE.md).
It exports cloud-service PATs so any `bash` invocation can source them
without printing values:

```
source /Users/sagnikmitra/.config/codex-env/tokens.zsh && <command>
```

After sourcing, `$VERCEL_TOKEN` is the general-purpose Vercel PAT used for any
Vercel CLI or REST call this machine makes. There is **no
`$GEARUP_VERCEL_TOKEN`** in the tokens file: the CLAUDE.md rule states that
env vars prefixed `INW_` are project-specific and must not be used for
general GitHub/Vercel/Cloudflare account bootstrap unless the user asks. The
same principle would apply to any hypothetical `$GEARUP_VERCEL_TOKEN`; until
one is added to `tokens.zsh`, gearup deploys should use `$VERCEL_TOKEN`. The
tokens file itself is sandbox-denied to this session (`.config/codex-env` is
on the deny list), which is the intended posture: read via `source`, never
via `cat`.

For git operations against the gearup repo the tokens file exports
`$GH_TOKEN` / `$GITHUB_TOKEN`; run `gh auth setup-git` before pushing.

---

## 6. Environments

| Env | Where set | Notable differences |
|---|---|---|
| Local dev | `apps/web/.env.local` (git-ignored) | `NODE_ENV=development` implicit; `JWT_SECRET` may be absent (falls back with a warn); `CORS_ALLOWED_ORIGINS` unset → wildcard CORS; Prisma logs `warn`+`error`; Sentry off unless `NEXT_PUBLIC_SENTRY_DSN` set |
| Preview (per-branch) | Vercel project env → "Preview" scope | `VERCEL_ENV=preview` (Vercel-set); `JWT_SECRET` REQUIRED or boot throws; `CORS_ALLOWED_ORIGINS` should be set; DB usually points at a preview branch or the shared dev DB |
| Production | Vercel project env → "Production" scope | `VERCEL_ENV=production`, `NODE_ENV=production`; `JWT_SECRET` REQUIRED; Prisma prod-mode logs `error` only; connection-limit defaults to `3` (vs `5` elsewhere); cookies `secure: true`; deployment region `hnd1` per `apps/web/vercel.json` |

`vercel.json` sets only `regions` and per-route `maxDuration`; it does not
declare env variables. All env for preview + production must be entered in
the Vercel dashboard (or via `vercel env add`).

---

## 7. Rotation and secrets hygiene

- **`JWT_SECRET`**; rotating invalidates every live admin session (all
  cookies signed with the old secret fail verification). Rotate by adding
  the new value in Vercel → Production, redeploying; admins re-login. No
  code-side dual-secret window exists, so it is effectively a forced
  logout, not zero-downtime. Rotate on any suspected compromise, on any
  offboarding of a person who had shell access, and on a fixed cadence
  (quarterly is reasonable given the blast radius).
- **`DATABASE_URL` / `DIRECT_URL`**; rotate the Postgres password in
  Supabase, then update both env values in Vercel, then redeploy. Existing
  serverless function instances continue using the old URL until they cold-
  start, so a small burst of connection errors is expected during
  rollover. `DIRECT_URL` is used only by migration scripts and tests;
  updating it independently of `DATABASE_URL` is fine.
- **`NEXT_PUBLIC_SENTRY_DSN`**; public by design (ships in the client
  bundle). Rotate only if abuse is happening; a bad DSN just drops events,
  no downtime.
- **`SENTRY_AUTH_TOKEN`** (build-only, not read in source but consumed by
  `@sentry/nextjs` build plugin); rotating breaks sourcemap upload on the
  next build; roll before the next deploy, not during one.
- **`CORS_ALLOWED_ORIGINS`**; not a secret. Change requires redeploy for
  the module-scope constant to re-evaluate.

`apps/web/.env.local` on a developer's machine typically holds a copy of
production secrets pulled via `vercel env pull`; treat that file as
sensitive and never commit it (a `.gitignore` entry covers it).

---

## 8. Runtime validation

**Only two variables are checked at boot.**

| Variable | Boot behavior |
|---|---|
| `JWT_SECRET` | `apps/web/src/lib/jwt-secret.ts:37` throws if unset or <16 chars in any deployed env. Local dev warns and continues with the hard-coded fallback. |
| `DATABASE_URL` | Not checked at boot. `lib/prisma.ts` guards the tuning branch on presence but Prisma itself throws on the first query, not on module load. |

Everything else is either optional (Sentry off if no DSN, CORS falls back to
wildcard if unset, Prisma tuning off if flag unset) or read lazily inside a
handler.

**Gaps.** A missing `CORS_ALLOWED_ORIGINS` in production quietly serves
`Access-Control-Allow-Origin: *` on every `/api/*` response; the comment at
`middleware.ts:76` acknowledges this and calls it a "MUST set" for deployed
envs, but nothing enforces it. There is no Zod (or other) central schema; if
one is desired, the natural home is a new `apps/web/src/lib/env.ts` that
imports at the top of `instrumentation.ts` so validation happens once, at
Next's earliest server hook, before the request pipeline exists.
