---
mode: reference
updated: 2026-09-20
verified_against: b5a0da6
---

# LOCAL SETUP

> **This describes the code, not the plan.** Verified on 2026-09-20 against `b5a0da6`. Environment names come from `docs/env.md` and code (`apps/web/scripts/with-root-env.mjs`, `apps/web/prisma/schema.prisma`); the master reference for env variables is `docs/env.md`.

> **Method.** I read `README.md`, root `package.json`, `apps/web/package.json`, `pnpm-workspace.yaml`, `apps/web/prisma/schema.prisma` (datasource block), `apps/web/prisma/seed.ts`, `apps/web/scripts/with-root-env.mjs`, `apps/web/vitest.config.ts`, `apps/web/vitest.integration.config.ts`, `apps/web/playwright.config.ts`, `apps/web/e2e/global-setup.ts`, `apps/web/test/integration/global-setup.ts`, `.husky/pre-commit`, `.husky/pre-push`, `scripts/check-tz.sh`, `docs/env.md`, `docs/deployment.md`, and `docs/CODEBASE_CONTEXT.md`. I did not execute `pnpm install`, `pnpm dev`, `pnpm test`, or any Prisma command in this pass; commands below are printed as instructions for the reader to run.

> **What this pass did NOT do.** I did not read `.env.example`. Both `apps/web/.env.example` (absent from the file listing) and the root `.env.example` are blocked by the Claude Code sandbox's `denyOnly` policy on `**/.env` / `**/.env.*`, so **the authoritative list of variables is `docs/env.md`, not this doc**. I did not stand up a local Postgres, did not run seed, did not run tests, and did not verify the exact bootstrap timing of the ephemeral integration or E2E Postgres. `.nvmrc` is absent from the repo root; the Node floor comes from `package.json` `engines.node` only.

## 1. Prerequisites

Exact versions this repo requires. Read them from the pinning files, not memory.

| Thing | Required | Source | Homebrew |
|---|---|---|---|
| Node | `>=20.0.0` | root `package.json` `engines.node` (no `.nvmrc` in the repo) | `brew install node@20` |
| pnpm | `9.6.0` (exact) | root `package.json` `packageManager: "pnpm@9.6.0"` | `brew install pnpm` then `corepack use pnpm@9.6.0` |
| Postgres | `17` (Supabase parity) | `apps/web/e2e/global-setup.ts` and `apps/web/test/integration/global-setup.ts` both look for `postgresql@17` first | `brew install postgresql@17` |
| Git | any recent | required for husky hooks | preinstalled on macOS |

Optional:

| Thing | Purpose | Homebrew |
|---|---|---|
| Docker Desktop | run local Postgres in a container instead of Homebrew | `brew install --cask docker` |
| Prisma Studio | GUI on top of the local DB | ships with Prisma; `pnpm --filter @gearup/web exec prisma studio` |
| VS Code | recommended IDE | `brew install --cask visual-studio-code` |
| VS Code Prisma extension | schema syntax + format | `code --install-extension Prisma.prisma` |

Verify:

```bash
node -v          # expect v20.x or higher
pnpm -v          # expect 9.6.0
psql --version   # expect psql (PostgreSQL) 17.x
git --version
```

If `pnpm` prints a version other than `9.6.0`, run `corepack enable && corepack use pnpm@9.6.0` from the repo root. The `packageManager` field is enforced by Corepack; a mismatched pnpm will produce a lockfile that other developers cannot reproduce.

## 2. Clone and install

```bash
cd ~/Desktop/GitHub                           # or wherever you keep repos
git clone git@github.com:souvikmusib/gearup.git
cd gearup
pnpm install                                  # workspace install; runs `prisma generate` via postinstall
```

`pnpm install` at the root installs every workspace: `apps/web` and the `packages/*` (`@gearup/types`, `@gearup/ui`, `@gearup/tsconfig`). The `postinstall` in `apps/web/package.json` runs `prisma generate`, which needs a `DATABASE_URL`; if it is missing at install time, `prisma generate` still generates the client from the schema (it does not connect), but a broken `.env` will make a later `db:push` fail loudly.

## 3. Environment variables

The full reference is `docs/env.md`. Read it once end-to-end. This section covers only the minimum to boot `pnpm dev` against a local Postgres.

Env loading is centralised: `apps/web/scripts/with-root-env.mjs` reads a single **root** `.env` file (`../../.env` from `apps/web/`) and passes it to every `next` and `prisma` command. Do not put a per-app `apps/web/.env.local`; the wrapper does not read it.

Minimum root `.env` for local dev against a local Postgres:

```bash
# Database — Path B in §4 uses this exact URL/DB
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/gearup_dev?schema=public"
DIRECT_URL="postgresql://postgres@127.0.0.1:5432/gearup_dev?schema=public"

# Auth (JWT signer; min 16 chars). Local dev value only. Never reuse in prod.
JWT_SECRET="local-dev-jwt-secret-min-16-chars-please"

# Public app config (safe to bake into the client bundle)
NEXT_PUBLIC_APP_NAME="GearUp Servicing (local)"
```

Notes:

- `DATABASE_URL` is the pooled URL in production (Supabase Session Pooler on 5432); `DIRECT_URL` is the direct connection used by `prisma migrate`. Locally they are the same string.
- `JWT_SECRET` must be at least 16 characters; the seed uses `bcrypt` with cost 12 and every admin login checks against a JWT signed with this secret.
- Sentry, Supabase Storage, WhatsApp, and email variables from `docs/env.md` are all optional for boot; leave them empty locally.
- Do **not** commit `.env`. `.gitignore` excludes it.

## 4. Database

Two paths. Pick one.

### Path A: point at prod Supabase (read-only work)

Use only when you need to reproduce a live-data bug. **Never run `prisma db push`, `prisma migrate`, `db:seed`, or any raw `UPDATE`/`DELETE` against the prod URL without an explicit per-op user "yes" and a `pg_dump` backup first (workspace RULE 2/3).**

Pull the pooler URL from Supabase Dashboard, Settings, Database, Connection string, Session pooler (port 5432). Put it in `.env` as `DATABASE_URL`, and the direct connection (port 5432 direct, not the pooler) as `DIRECT_URL`. Then:

```bash
pnpm --filter @gearup/web exec prisma generate     # regenerate client only
pnpm dev                                           # start the app; do not run db:push
```

Any DDL/DML against prod is a RULE 2 destructive op. Stop and ask.

### Path B: bootstrap a local Postgres (recommended)

Homebrew Postgres 17, matching production parity:

```bash
brew install postgresql@17
brew services start postgresql@17
# Ensure psql on PATH for this shell
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

# Create the dev database. The default macOS role is $USER; the seed connects
# as `postgres`, so create that role too and grant it superuser locally.
createuser -s postgres 2>/dev/null || true
createdb -O postgres gearup_dev
```

Confirm the URL in `.env` matches:

```
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/gearup_dev?schema=public"
DIRECT_URL="postgresql://postgres@127.0.0.1:5432/gearup_dev?schema=public"
```

Push the schema and seed the admin users:

```bash
pnpm --filter @gearup/web db:push        # runs `prisma db push` against DATABASE_URL
pnpm --filter @gearup/web db:seed        # runs `tsx prisma/seed.ts`
```

`db:push` creates every table from `apps/web/prisma/schema.prisma`; it is safe against an empty local DB. `db:seed` (from `apps/web/prisma/seed.ts`) creates four roles (`SUPER_ADMIN`, `MANAGER`, `RECEPTIONIST`, `MECHANIC`) and five admin users all with password `admin123`:

| adminUserId | Role | Purpose |
|---|---|---|
| `admin` | SUPER_ADMIN | primary owner (Souvik) |
| `arnab` | SUPER_ADMIN | Arnab |
| `priya` | SUPER_ADMIN | Priya |
| `receptionist` | RECEPTIONIST | front desk |
| `mechanic` | MECHANIC | workshop |

Verify with Prisma Studio:

```bash
pnpm --filter @gearup/web exec prisma studio
```

It opens `http://localhost:5555`. Confirm `AdminUser` has five rows.

Docker alternative (skip Homebrew):

```bash
docker run --name gearup-pg17 -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:17
# Then set DATABASE_URL to postgresql://postgres:postgres@127.0.0.1:5432/gearup_dev
docker exec -it gearup-pg17 createdb -U postgres gearup_dev
```

## 5. First run

```bash
pnpm dev
```

Under the hood `turbo dev` runs `apps/web/scripts/with-root-env.mjs "next dev"`. Expected first-boot output:

```
[with-root-env] loaded ../../.env
▲ Next.js 14.2.x
- Local:        http://localhost:3000
- ready in 2.4s
```

Open `http://localhost:3000`. Public homepage renders. Then `http://localhost:3000/admin/login`; sign in with:

- User ID: `admin`
- Password: `admin123`

You should land on `/admin/dashboard`. If you see a 401 loop, `JWT_SECRET` is not set or is under 16 characters.

## 6. Test suites

Three suites, three commands. All are scoped to `@gearup/web`.

| Command | What it is | DB needed | How the DB is bootstrapped |
|---|---|---|---|
| `pnpm --filter @gearup/web test` | Vitest unit tests. Config `apps/web/vitest.config.ts`. Includes `src/**/*.test.ts(x)`. | No | Prisma is mocked or unused. |
| `pnpm --filter @gearup/web test:int` | Vitest route-integration. Config `apps/web/vitest.integration.config.ts`. Real Postgres. | Yes, ephemeral | `test/integration/global-setup.ts` uses `TEST_DATABASE_URL` if set, else spins an ephemeral Homebrew pg17 on `127.0.0.1:54330` in a `mktemp` data dir, and runs `prisma db push --accept-data-loss` against that brand-new DB. |
| `pnpm --filter @gearup/web test:e2e` | Playwright. Config `apps/web/playwright.config.ts`. Runs the browser UI smoke. | Yes, ephemeral | `e2e/global-setup.ts` uses `E2E_DATABASE_URL` if set, else spins a second ephemeral pg17 on `127.0.0.1:54331`, DB `gearup_e2e`. Playwright's `webServer` starts `next dev -p 3100` against that DB. |

The integration and E2E databases are separate ports (54330 and 54331) so the two suites can run in parallel and neither collides with your local dev DB on 5432. Both throw with a clear message if no Postgres is reachable, so add `postgresql@17` to your PATH before running them.

## 7. Prisma workflows

After **any** change to `apps/web/prisma/schema.prisma`, and after **every `git pull`** that touched the schema:

```bash
pnpm --filter @gearup/web exec prisma generate
```

This regenerates `@prisma/client` into `node_modules/.prisma/client`. A stale client is a common cause of TypeScript errors like `Property 'stockBatch' does not exist on type 'PrismaClient'` after pulling a branch. Regenerate before you assume the code is wrong.

Push a schema change to the local DB (destructive on non-empty DBs, safe on the local dev DB):

```bash
pnpm --filter @gearup/web db:push
```

Never run `db:push` against production. Production schema moves through Supabase Dashboard SQL editor or a reviewed migration only, under RULE 2 approval.

Formal migrations (dev DB only, generates SQL in `apps/web/prisma/migrations/`):

```bash
pnpm --filter @gearup/web db:migrate
```

## 8. Playwright

Playwright's config lives at `apps/web/playwright.config.ts`. First-time setup on this machine:

```bash
pnpm --filter @gearup/web exec playwright install chromium
```

Then, from the repo root:

```bash
pnpm --filter @gearup/web test:e2e                       # headless, gate mode
pnpm --filter @gearup/web exec playwright test --headed  # watch the browser
pnpm --filter @gearup/web exec playwright test --ui      # interactive runner
```

Target environment overrides:

- `E2E_BASE_URL` overrides the URL Playwright hits (default `http://localhost:3100`).
- `E2E_DATABASE_URL` overrides the ephemeral DB (CI sets this to a postgres service).
- `JWT_SECRET` is defaulted to `e2e-test-secret-0123456789` for the test webServer only.

Only `ui-smoke.spec.ts` is in `testMatch` today; the older `admin-e2e` / `features-e2e` specs are kept in `e2e/` but excluded from the gate until refreshed (comment in `playwright.config.ts`).

## 9. Common gotchas

1. **Claude Code sandbox denies `.env*` reads.** The sandbox's `denyOnly` policy blocks `**/.env`, `**/.env.*`, and other secret patterns. That is why this doc could not read `.env.example` and points you at `docs/env.md` instead. It does not affect running the app; it only affects an agent trying to read your local file.
2. **Timezone: workstation TZ does not matter.** Every render that shows a date to a user goes through `formatIST` / `formatTimeIST` in `apps/web/src/lib/time.ts`, and `scripts/check-tz.sh` is a pre-push gate that greps for raw `toLocaleDateString/toLocaleTimeString/toLocaleString` without `Asia/Kolkata`. Do not `new Date().toLocaleString()` in a page or component; use the helpers.
3. **HSN rate cache TTL is 60 seconds.** If you change a GST rate in the admin UI and the next invoice still uses the old rate, wait 60 seconds or restart the dev server.
4. **Stale Prisma client after pull.** New models on a branch pulled from `main` (for example `stockBatch` in September) fail typecheck until you run `pnpm --filter @gearup/web exec prisma generate`. This is item 11 in the Troubleshooting table below.
5. **Pre-commit hook fires typecheck.** `.husky/pre-commit` runs `pnpm --filter @gearup/web exec tsc --noEmit` and blocks the commit if it fails. Do not bypass with `--no-verify`; fix the root cause. If the error is a Prisma type, regenerate the client (§7) and re-stage.
6. **Pre-push runs the full local gate.** `.husky/pre-push`: tz-lint, unit, integration, typecheck, lint, e2e (Playwright). It takes a few minutes; it protects `main`. Do not skip.
7. **`with-root-env.mjs` only reads `../../.env`.** If you put env in `apps/web/.env.local` the wrapper ignores it. Use the root `.env` at the repo root.
8. **Vercel preview URL needs GitHub authentication.** A preview built from a branch commit requires the reader to be logged in with a GitHub identity that has access to the `souvikmusib/gearup` repo. Anonymous browsers see the Vercel deployment protection screen. Send the branch owner the URL, not a random reviewer.
9. **`postinstall` runs `prisma generate` in `apps/web`.** If it fails during `pnpm install`, the schema itself failed to parse; look at the error, do not ignore it.
10. **macOS quarantine on new Playwright browsers.** The first `playwright install chromium` may prompt in System Settings, Privacy & Security, to allow the binary. Allow it once.

## 10. IDE

VS Code recommended extensions:

| Extension | Purpose |
|---|---|
| Prisma (`Prisma.prisma`) | schema syntax + auto-format on save |
| ESLint (`dbaeumer.vscode-eslint`) | live lint feedback |
| Prettier (`esbenp.prettier-vscode`) | format on save |
| Tailwind CSS IntelliSense (`bradlc.vscode-tailwindcss`) | class autocomplete |
| Playwright Test (`ms-playwright.playwright`) | run and debug e2e specs from the sidebar |

Workspace settings (create `.vscode/settings.json` if you want them, do not commit personal preferences):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
  "[prisma]": { "editor.defaultFormatter": "Prisma.prisma" },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

Prettier config lives at the root; the root `package.json` `format` script is `prettier --write "**/*.{ts,tsx,js,jsx,json,md}"`. ESLint config is `apps/web` local, `eslint-config-next` extends the Next.js recommended rules. Do not add repo-wide ESLint overrides without a shared decision.

## 11. Troubleshooting

Common errors, ordered by frequency in the last month.

| Error | Fix |
|---|---|
| Pre-commit blocked with `Property 'stockBatch' does not exist on type 'PrismaClient'` (or any other missing model). Sep 20 2026. | `pnpm --filter @gearup/web exec prisma generate`, then `git commit` again. Stale Prisma client after pulling a branch that added the model. |
| `pnpm install` fails at `postinstall`, `prisma generate` error `Environment variable not found: DATABASE_URL`. | Put a valid `DATABASE_URL` in the root `.env` (see §3), or set it in your shell before `pnpm install`. `prisma generate` reads the datasource. |
| `pnpm dev` starts, `/admin/login` returns 401 with valid credentials. | `JWT_SECRET` missing or under 16 characters. Set it in root `.env` and restart `pnpm dev`. |
| `pnpm --filter @gearup/web test:int` fails with `[integration] No TEST_DATABASE_URL and no local Postgres found`. | Install Homebrew `postgresql@17` and add its `bin` to PATH, or set `TEST_DATABASE_URL` to a reachable throwaway DB. |
| `pnpm --filter @gearup/web test:e2e` hangs at `webServer` boot. | `next dev` on port 3100 is failing. Free the port (`lsof -i :3100`), check `E2E_DATABASE_URL` is reachable, re-run. |
| Push blocked with `timezone lint failed`. | You wrote a raw `toLocaleDateString/toLocaleTimeString/toLocaleString` without `timeZone: 'Asia/Kolkata'`. Use `formatIST` / `formatTimeIST` from `apps/web/src/lib/time.ts`. |
| `pnpm --filter @gearup/web db:push` errors `P1001 Can't reach database server`. | Postgres is not running. `brew services start postgresql@17`, or start the Docker container. |
| Prisma Studio shows an empty DB. | You pointed `DATABASE_URL` at a different DB than you seeded, or you ran `db:seed` before `db:push`. Run `db:push` then `db:seed`, then reopen Studio. |
| Vercel preview URL shows the Vercel authentication screen. | Expected. Log in with a GitHub account that has access to the `souvikmusib/gearup` repo. |
| `pnpm dev` prints `[with-root-env] No root .env at ...`. | You have no root `.env`. Create one per §3. Not fatal if every needed variable is already in your shell env. |

For anything not covered here, `docs/CODEBASE_CONTEXT.md` has the ultra-detailed map, `docs/env.md` has every env variable, and `docs/deployment.md` covers the production path.
