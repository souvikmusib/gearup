"""
Generate the FINAL post-restore splice SQL for the Supabase SQL editor.

v2 — schema-authoritative rewrite:
  * Column lists are taken from the local pg_dump COPY headers (= live schema),
    NOT hand-guessed. v1 had fatal mismatches (Worker.workerId vs workerCode etc).
  * Prologue adds the 3 JobCard estimate columns the June-9 restored DB lacks.
  * COPY escape sequences (\\n, \\t, \\\\) are decoded before re-emitting.
  * Rows missing a required (non-null, no-default) column are skipped + logged.

Layers:
  Phase A — Chrome-cache JSONs: rows created AFTER restore point
            2026-06-09T21:34:10.736Z (these are NOT in the restored backup).
  Phase B — local pg_dump (current post-reset DB): RBAC/config/parent tables
            unfiltered (ON CONFLICT dedupes), domain rows createdAt >= first
            post-reset write 2026-06-10T18:24:00Z.

Idempotent: every statement is INSERT ... ON CONFLICT (id) DO NOTHING
(junction tables without a plain id PK use their real PK columns).
"""
import json, os, re, glob
from datetime import datetime, timezone

RESTORE_ISO   = "2026-06-09T21:34:10.736Z"
RESTORE_DT    = datetime(2026, 6, 9, 21, 34, 10, 736000, tzinfo=timezone.utc)
RESET_DT      = datetime(2026, 6, 10, 18, 24, 0, tzinfo=timezone.utc)
CACHE_DIR     = '/tmp/gearup-recovered'
LOCAL_DUMP    = '/tmp/gearup-current.sql'
OUT_SQL       = '/Users/sagnikmitra/Desktop/GitHub/gearup/scripts/splice-after-restore.sql'
SCHEMA_PRISMA = '/Users/sagnikmitra/Desktop/GitHub/gearup/apps/web/prisma/schema.prisma'

# ---------------------------------------------------------------- helpers

def parse_iso(s):
    if not s: return None
    return datetime.fromisoformat(str(s).replace('Z', '+00:00'))

def sql_lit(v):
    """Python value -> SQL literal."""
    if v is None: return 'NULL'
    if isinstance(v, bool): return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, separators=(',', ':')).replace("'", "''") + "'"
    return "'" + str(v).replace("'", "''") + "'"

def copy_unescape(v):
    """Decode pg_dump COPY text-format escapes."""
    if v == '\\N': return None
    out, i = [], 0
    while i < len(v):
        c = v[i]
        if c == '\\' and i + 1 < len(v):
            n = v[i+1]
            out.append({'n': '\n', 't': '\t', 'r': '\r', '\\': '\\', 'b': '\b', 'f': '\f', 'v': '\v'}.get(n, n))
            i += 2
        else:
            out.append(c); i += 1
    return ''.join(out)

# --------------------------------------------- canonical columns from dump

def parse_dump(dump_path):
    headers, blocks = {}, {}
    lines = open(dump_path).read().splitlines()
    i = 0
    while i < len(lines):
        m = re.match(r'COPY public\."(\w+)" \((.*?)\) FROM stdin;', lines[i])
        if m:
            table = m.group(1)
            cols = [c.strip().strip('"') for c in m.group(2).split(',')]
            headers[table] = cols
            rows, j = [], i + 1
            while j < len(lines) and lines[j].strip() != '\\.':
                vals = [copy_unescape(x) for x in lines[j].split('\t')]
                if len(vals) == len(cols):
                    rows.append(dict(zip(cols, vals)))
                j += 1
            blocks[table] = rows
            i = j + 1
        else:
            i += 1
    return headers, blocks

HEADERS, DUMP_ROWS = parse_dump(LOCAL_DUMP)

# ---------------------------------- required fields from schema.prisma

def parse_required(schema_path):
    """table -> set of scalar fields that are non-nullable with no default."""
    req = {}
    model = None
    for line in open(schema_path):
        m = re.match(r'\s*model\s+(\w+)\s*\{', line)
        if m: model = m.group(1); req[model] = set(); continue
        if model is None: continue
        if re.match(r'\s*\}', line): model = None; continue
        f = re.match(r'\s+(\w+)\s+(\w+)(\??)\s*(.*)$', line)
        if not f: continue
        name, ftype, opt, rest = f.groups()
        if ftype[0].isupper() and ftype not in (
            'String','Int','Float','Decimal','Boolean','DateTime','Json','BigInt','Bytes'):
            continue  # relation field
        if opt == '?': continue
        if '@default' in rest or '@updatedAt' in rest: continue
        req[model].add(name)
    return req

REQUIRED = parse_required(SCHEMA_PRISMA)

# seed-admin id (post-reset dump)  ->  restored pre-incident id (from cache settings_admins.json)
ADMIN_REMAP = {
    'cmq8eh4ei0006tk9wa9s35hy4': 'cmofh1jig0004106yjgbfqrdx',  # admin / Souvik Musib
    'cmq8eh3dm0005tk9wa7k0g30s': 'cmofh1jig0005106ytec44li9',  # arnab
    'cmq8eh2dh0004tk9wdqt3azhy': 'cmofh1jig0003106y69y8ubty',  # priya
    'cmq8eh5fj0007tk9wkld88rma': 'cmpmbfvbp0008cbnvcer736k9',  # receptionist
    'cmq8eh6fv0008tk9w1mzbe6c8': 'cmpmbfur10006cbnvgk9zs1nw',  # mechanic
}
ADMIN_FK_COLS = {'actorId', 'createdByAdminId', 'receivedByAdminId', 'performedByAdminId',
                 'confirmedByAdminId', 'assignedServiceManagerId', 'approvedByAdminId'}

def remap_admin(table, col, val):
    if val in ADMIN_REMAP and (col in ADMIN_FK_COLS or
        (table == 'ActivityLog' and col == 'entityId')):
        return ADMIN_REMAP[val]
    return val


# ------------------------------------------------------------- emitter

out, stats, skipped = [], {}, []

def conflict_clause(table):
    cols = HEADERS[table]
    return '(id)' if 'id' in cols else '(' + ', '.join(f'"{c}"' for c in cols) + ')'

def emit_row(table, getval, src):
    """getval(col) -> python value or None. Emits one INSERT or records a skip."""
    cols = HEADERS[table]
    missing = [c for c in REQUIRED.get(table, set()) if getval(c) is None and c in cols]
    if missing:
        skipped.append((table, src, missing))
        return False
    collist = ', '.join(f'"{c}"' for c in cols)
    vallist = ', '.join(sql_lit(getval(c)) for c in cols)
    out.append(f'INSERT INTO public."{table}" ({collist}) VALUES ({vallist}) ON CONFLICT DO NOTHING;')
    return True

def emit_cache(table, cache_file, time_filter=True, time_cap=None):
    path = os.path.join(CACHE_DIR, cache_file)
    if not os.path.exists(path):
        out.append(f'-- {table}: cache file {cache_file} missing, skipped'); return
    data = json.load(open(path)).get('data') or []
    n = 0
    out.append(f'-- Phase A · {table} from {cache_file} ({len(data)} cached rows)')
    for r in data:
        if not isinstance(r, dict) or 'id' not in r: continue
        cd = parse_iso(r.get('createdAt'))
        if time_filter and cd and cd <= RESTORE_DT: continue
        if time_cap and cd and cd >= time_cap: continue
        if emit_row(table, lambda c: r.get(c), f'cache:{cache_file}'):
            n += 1
    stats[f'A {table}'] = n
    out.append('')

def emit_dump(table, time_filter=True):
    rows = DUMP_ROWS.get(table, [])
    n = 0
    out.append(f'-- Phase B · {table} from local dump ({len(rows)} rows)')
    for r in rows:
        if time_filter:
            cd = parse_iso((r.get('createdAt') or '').replace(' ', 'T')) if r.get('createdAt') else None
            if cd and cd.replace(tzinfo=timezone.utc) < RESET_DT.replace(tzinfo=None).replace(tzinfo=timezone.utc):
                # dump timestamps look like '2026-06-10 18:27:36.943+00'
                pass
        if time_filter and r.get('createdAt'):
            raw = r['createdAt'].replace(' ', 'T')
            raw = re.sub(r'\+00$', '+00:00', raw)
            try:
                cd = datetime.fromisoformat(raw)
                if cd.tzinfo is None: cd = cd.replace(tzinfo=timezone.utc)
                if cd < RESET_DT: continue
            except ValueError:
                pass
        if emit_row(table, lambda c: remap_admin(table, c, r.get(c)), 'dump'):
            n += 1
    stats[f'B {table}'] = n
    out.append('')

# ------------------------------------------------------------- build

now = datetime.now(timezone.utc).isoformat()
out += [
    '-- ============================================================',
    '-- gearup FINAL post-restore splice SQL  (generator v2)',
    f'-- Generated: {now}',
    f'-- Restore point: {RESTORE_ISO}  (Supabase backup id 858853101)',
    '-- Columns sourced from live-schema pg_dump COPY headers.',
    '-- Idempotent: INSERT ... ON CONFLICT DO NOTHING. Re-runnable.',
    '-- ============================================================',
    '',
    '-- ---- Prologue: columns added by the audit AFTER the restore point.',
    '-- The restored June-9 DB lacks these; Phase B JobCard inserts need them.',
    'ALTER TABLE public."JobCard" ADD COLUMN IF NOT EXISTS "estimateToken" TEXT;',
    'ALTER TABLE public."JobCard" ADD COLUMN IF NOT EXISTS "estimateTokenExpiresAt" TIMESTAMPTZ;',
    'ALTER TABLE public."JobCard" ADD COLUMN IF NOT EXISTS "estimateRevision" TEXT;',
    'CREATE UNIQUE INDEX IF NOT EXISTS "JobCard_estimateToken_key" ON public."JobCard" ("estimateToken");',
    '',
    '-- ---- AMC tables: the AMC feature deployed 2026-06-09 21:39 UTC — 5 minutes AFTER',
    '-- the 21:34 backup. If the restored DB lacks them, create minimally (PK only;',
    '-- FK constraints arrive later via prisma db push).',
    """DO $$ BEGIN CREATE TYPE public."AmcContractStatus" AS ENUM ('ACTIVE','EXPIRED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;""",
    'CREATE TABLE IF NOT EXISTS public."AmcPlan" (id text PRIMARY KEY, "planName" text NOT NULL, description text, "vehicleType" public."VehicleType" NOT NULL, "ccRange" text, "durationMonths" integer NOT NULL, "totalServicesIncluded" integer NOT NULL, price numeric(12,2) NOT NULL, "coveredItems" jsonb, exclusions text, "isActive" boolean DEFAULT true NOT NULL, "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL, "updatedAt" timestamp(3) NOT NULL);',
    """CREATE TABLE IF NOT EXISTS public."AmcContract" (id text PRIMARY KEY, "contractNumber" text NOT NULL, "customerId" text NOT NULL, "vehicleId" text NOT NULL, "amcPlanId" text NOT NULL, "startDate" timestamp(3) NOT NULL, "endDate" timestamp(3) NOT NULL, "totalServices" integer NOT NULL, "servicesUsed" integer DEFAULT 0 NOT NULL, "servicesRemaining" integer NOT NULL, "amountPaid" numeric(12,2) NOT NULL, "paymentMode" public."PaymentMode", "paymentDate" timestamp(3), status public."AmcContractStatus" DEFAULT 'ACTIVE' NOT NULL, notes text, "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL, "updatedAt" timestamp(3) NOT NULL);""",
    'CREATE TABLE IF NOT EXISTS public."AmcServiceUsage" (id text PRIMARY KEY, "amcContractId" text NOT NULL, "jobCardId" text NOT NULL, "serviceNumber" integer NOT NULL, "serviceDate" timestamp(3) NOT NULL, notes text, "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL);',
    '',
    'BEGIN;',
    'SET session_replication_role = replica;  -- relax FK ordering + triggers during load',
    '',
    '-- ================= Phase A: Chrome cache (rows newer than restore point) =================',
    '',
]

# Phase A — order: parents first. ExpenseCategory/InventoryCategory/Supplier/Worker FULL lists:
# rows older than restore point exist in restored backup; ON CONFLICT dedupes, so no filter
# (catches any row whose createdAt is missing from the API payload).
emit_cache('Worker',            'workers.json',             time_filter=False)
emit_cache('InventoryCategory', 'inventory_categories.json', time_filter=False)
emit_cache('Supplier',          'inventory_suppliers.json',  time_filter=False)
emit_cache('ExpenseCategory',   'expenses_categories.json',  time_filter=False)
emit_cache('Customer',          'customers.json')
emit_cache('Vehicle',           'vehicles.json')
emit_cache('InventoryItem',     'inventory_items.json')
emit_cache('Appointment',       'appointments.json')
emit_cache('JobCard',           'job-cards.json')
emit_cache('Invoice',           'invoices.json')
emit_cache('Payment',           'payments.json')
emit_cache('StockMovement',     'inventory_movements.json')
emit_cache('ActivityLog',       'logs.json', time_cap=RESET_DT)   # avoid dup with Phase B

out += ['', '-- ================= Phase B: post-reset writes from local pg_dump =================', '']

# Dropped from Phase B (restored June-9 rows are authoritative; seed copies would
# collide on business-key uniques like Role.key / AdminUser.adminUserId / Setting.key,
# and admin FKs are remapped to restored ids instead):
#   Role, Permission, RolePermission, AdminUser, AdminUserRole,
#   Setting, NotificationTemplate, AppointmentSlotRule, Holiday
NO_FILTER_B = ['AmcPlan',
               'Worker','InventoryCategory','Supplier','InventoryItem','ExpenseCategory',
               'ServiceRequest']
FILTER_B    = ['Customer','Vehicle','Appointment',
               'JobCard','WorkerAssignment','JobCardTask','JobCardPart',
               'Invoice','InvoiceLineItem','Payment',
               'AmcContract','AmcServiceUsage','Expense','StockMovement',
               'ActivityLog','WorkerLeave','BlockedSlot']

for t in NO_FILTER_B: emit_dump(t, time_filter=False)
for t in FILTER_B:    emit_dump(t, time_filter=True)

out += [
    '',
    'SET session_replication_role = DEFAULT;',
    'COMMIT;',
    '',
    '-- ============================================================',
    '-- VERIFICATION — run as a separate query after COMMIT',
    '-- ============================================================',
    '/*',
    'SELECT t, n FROM (',
]
vt = ['Customer','Vehicle','ServiceRequest','Appointment','JobCard','WorkerAssignment',
      'JobCardTask','JobCardPart','Invoice','InvoiceLineItem','Payment','InventoryItem',
      'InventoryCategory','Supplier','StockMovement','Worker','WorkerLeave','Expense',
      'ExpenseCategory','AmcPlan','AmcContract','AmcServiceUsage','AdminUser','Role',
      'Permission','ActivityLog','Setting','Holiday','NotificationTemplate','Notification',
      'AppointmentSlotRule','BlockedSlot']
sel = [f'  SELECT \'{t}\' AS t, COUNT(*) AS n FROM public."{t}"' for t in vt]
out.append('\n  UNION ALL\n'.join(sel))
out += [
    ') x ORDER BY t;',
    '',
    '-- FK integrity (all must be 0):',
    'SELECT \'orphan_jobcards\' issue, COUNT(*) FROM public."JobCard" jc LEFT JOIN public."Customer" c ON jc."customerId"=c.id WHERE c.id IS NULL',
    'UNION ALL SELECT \'orphan_vehicles\', COUNT(*) FROM public."Vehicle" v LEFT JOIN public."Customer" c ON v."customerId"=c.id WHERE c.id IS NULL',
    'UNION ALL SELECT \'orphan_invoices\', COUNT(*) FROM public."Invoice" i LEFT JOIN public."Customer" c ON i."customerId"=c.id WHERE c.id IS NULL',
    'UNION ALL SELECT \'orphan_payments\', COUNT(*) FROM public."Payment" p LEFT JOIN public."Invoice" i ON p."invoiceId"=i.id WHERE i.id IS NULL',
    'UNION ALL SELECT \'orphan_lineitems\', COUNT(*) FROM public."InvoiceLineItem" li LEFT JOIN public."Invoice" i ON li."invoiceId"=i.id WHERE i.id IS NULL',
    'UNION ALL SELECT \'orphan_stockmoves\', COUNT(*) FROM public."StockMovement" sm LEFT JOIN public."InventoryItem" ii ON sm."inventoryItemId"=ii.id WHERE ii.id IS NULL',
    'UNION ALL SELECT \'orphan_assignments\', COUNT(*) FROM public."WorkerAssignment" wa LEFT JOIN public."JobCard" jc ON wa."jobCardId"=jc.id WHERE jc.id IS NULL;',
    '*/',
]

with open(OUT_SQL, 'w') as f:
    f.write('\n'.join(out) + '\n')

total = sum(v for v in stats.values())
print(f'Wrote {OUT_SQL}  ({len(out)} lines)')
print(f'\nINSERT counts ({total} total):')
for k, v in stats.items():
    if v: print(f'  {k:<28s} {v:>5}')
print(f'\nSkipped rows (missing required cols): {len(skipped)}')
for t, src, miss in skipped[:15]:
    print(f'  {t} [{src}] missing {miss}')
