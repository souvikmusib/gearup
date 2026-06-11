# Restore the gearup database from a backup

> Use this when: prod DB is corrupted, schema migration went wrong, or someone
> ran `--force-reset` again. Sorry in advance.

## Where backups live

Every successful backup is stored in **three** places:

| Tier | Where | Retention |
|---|---|---|
| 1 | GitHub Actions artifacts (`Actions` tab → `db-backup` run → Artifacts) | 90 days |
| 2 | `db-backups` branch in this repo, under `backups/gearup-<UTC>.sql.gz` | 90 dailies |
| 3 | Local `backups/` on your Mac (if you set up `scripts/db-backup-launchd.sh`) | 60 days |

For ad-hoc safety dumps (e.g. before a risky migration), commit them under
`docs/audit/<date>/db-backups/*.sql.gz` on `main`.

## Prerequisites

```bash
brew install postgresql@17    # client must match Supabase server (PG17)
```

## Restore — full DB replacement

⚠️ **This DROPS every table in the public schema and recreates them from the
dump. Any data added since the backup will be lost.** Take a fresh safety
dump first (see below).

```bash
cd /Users/sagnikmitra/Desktop/GitHub/gearup

# 1. Safety: dump the *current* state first.
DIRECT_URL=$(grep ^DIRECT_URL .env | cut -d= -f2- | tr -d '"')
SAFE="docs/audit/$(date -u +%Y-%m-%d)/db-backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
mkdir -p "$(dirname "$SAFE")"
/opt/homebrew/opt/postgresql@17/bin/pg_dump "$DIRECT_URL" \
  --clean --if-exists --no-owner --no-acl --no-comments --schema=public \
  | gzip -9 > "$SAFE"
ls -la "$SAFE"

# 2. Pick a backup to restore. Examples:
BACKUP=docs/audit/2026-06-10/db-backups/current-state-20260611T080315Z.sql.gz
# OR pull from the db-backups branch:
#   git fetch origin db-backups
#   git checkout origin/db-backups -- backups/
#   BACKUP=backups/gearup-20260615T020012Z.sql.gz

# 3. Restore (DROP-and-recreate-by-design).
gunzip -c "$BACKUP" | /opt/homebrew/opt/postgresql@17/bin/psql "$DIRECT_URL"

# 4. Regenerate Prisma client (schema may have shifted vs the snapshot).
cd apps/web && npx prisma generate
```

## Restore — single table only

When you only need to recover, say, `Customer` rows that were lost but the
rest of the DB is fine:

```bash
# Dump just one table from the backup, into a temp scratch DB,
# then INSERT the missing rows back into prod.

# 1. Restore the backup into a local scratch Postgres.
createdb gearup_scratch
gunzip -c "$BACKUP" | psql "postgresql://localhost/gearup_scratch"

# 2. Dump just one table from scratch as INSERT statements.
pg_dump --data-only --inserts --table=public."Customer" \
  "postgresql://localhost/gearup_scratch" > /tmp/customers.sql

# 3. Diff & apply to prod (review first!).
less /tmp/customers.sql
psql "$DIRECT_URL" -f /tmp/customers.sql
```

## Sanity check after restore

```bash
cd apps/web
node scripts/with-root-env.mjs "npx tsx -e \"
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async()=>{
  console.log({
    admins: await p.adminUser.count(),
    customers: await p.customer.count(),
    vehicles: await p.vehicle.count(),
    jobCards: await p.jobCard.count(),
    invoices: await p.invoice.count(),
    payments: await p.payment.count(),
  });
  await p.\$disconnect();
})();
\""
```

Compare with the expected counts in the GitHub Actions run summary for the
backup you restored from.

## If GitHub Actions backup hasn't run yet

You need to add the secret first. In GitHub:

1. Repo → Settings → Secrets and variables → Actions
2. New repository secret → name `DATABASE_URL` → paste the Supabase DIRECT_URL
   (the one with port 5432, NOT the 6543 pooler)
3. Actions → `db-backup` → Run workflow → Run workflow

The first run takes ~1 minute. You'll see the artifact in the run summary and
a new commit on the `db-backups` branch.

## Why we have three storage tiers

- **Artifact (90d)**: easy UI download, but expires.
- **`db-backups` branch (~90d rolling)**: survives even if Actions retention
  changes; you can clone the repo and check it out anywhere.
- **Local `backups/` (60d)**: works when GitHub is down or you're offline.
  Set up via `scripts/db-backup-launchd.sh` (see "Local cron" section in
  the repo root README).

If all three are gone, the data is unrecoverable on Supabase Free tier.
That's why we don't rely on Supabase backups: **Free tier has none**.
