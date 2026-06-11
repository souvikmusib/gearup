#!/usr/bin/env bash
# Daily Postgres backup for the gearup Supabase project.
#
# Modes:
#   ./scripts/db-backup.sh                  → write to ./backups/<UTC-stamp>.sql.gz
#   BACKUP_OUT=path ./scripts/db-backup.sh  → write to specified path
#
# Required env:
#   DIRECT_URL (preferred — bypasses the pooler) OR DATABASE_URL
#
# Behavior:
#   - Uses pg_dump from postgresql@17 (server is PG17 on Supabase).
#   - --clean --if-exists so the dump is idempotent restorable.
#   - Public schema only (skip Supabase internal schemas).
#   - gzipped output.
#   - On CI: stdout is captured as artifact; on local: written to ./backups/.
#   - Prunes local backups older than RETAIN_DAYS (default 60) to keep
#     ./backups/ reasonable; CI uses GitHub artifact retention (90d) and
#     the db-backups branch for long-term.
#
# Exit codes:
#   0 = ok, 1 = missing env, 2 = pg_dump failed, 3 = empty output.

set -euo pipefail

RETAIN_DAYS="${RETAIN_DAYS:-60}"

# Locate a PG17 pg_dump. Server speaks 17; older clients refuse to dump.
PG_DUMP=""
for candidate in \
  /opt/homebrew/opt/postgresql@17/bin/pg_dump \
  /usr/local/opt/postgresql@17/bin/pg_dump \
  /usr/lib/postgresql/17/bin/pg_dump \
  "$(command -v pg_dump || true)"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    if "$candidate" --version 2>/dev/null | grep -qE '\b17\.'; then
      PG_DUMP="$candidate"
      break
    fi
  fi
done

if [ -z "$PG_DUMP" ]; then
  echo "ERROR: pg_dump 17.x not found. Install with: brew install postgresql@17" >&2
  exit 1
fi

DB_URL="${DIRECT_URL:-${DATABASE_URL:-}}"
if [ -z "$DB_URL" ]; then
  echo "ERROR: DIRECT_URL or DATABASE_URL must be set" >&2
  exit 1
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="${BACKUP_OUT:-backups/gearup-${STAMP}.sql.gz}"
mkdir -p "$(dirname "$OUT")"

echo "[db-backup] pg_dump → $OUT"
if ! "$PG_DUMP" "$DB_URL" \
  --clean --if-exists \
  --no-owner --no-acl --no-comments \
  --schema=public \
  | gzip -9 > "$OUT"; then
  echo "ERROR: pg_dump failed" >&2
  rm -f "$OUT"
  exit 2
fi

# Sanity: gzip should be > 1KB (empty schema is at least a few hundred bytes
# of CREATE TYPE statements). 1KB protects against silent connection drops.
SIZE=$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")
if [ "$SIZE" -lt 1024 ]; then
  echo "ERROR: backup file too small ($SIZE bytes) — likely empty dump" >&2
  exit 3
fi

echo "[db-backup] ok — ${SIZE} bytes"

# Prune old local backups (skip when run from CI)
if [ -z "${GITHUB_ACTIONS:-}" ] && [ -d backups ]; then
  find backups -name 'gearup-*.sql.gz' -mtime "+${RETAIN_DAYS}" -delete 2>/dev/null || true
fi

# Final stamp on stdout — useful for shell wrappers
echo "BACKUP_FILE=$OUT"
echo "BACKUP_SIZE=$SIZE"
echo "BACKUP_STAMP=$STAMP"
