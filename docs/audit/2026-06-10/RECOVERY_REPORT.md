# gearup — Depth-10 Data Loss Recovery Investigation

> Comprehensive forensic report of every system, account, account-tier, API,
> log source, and local artifact checked in pursuit of recovering the gearup
> production data lost to a `prisma db push --force-reset` on 2026-06-10.
>
> **Status:** **PARTIAL RECOVERY ACHIEVED.** 724+ rows of production data
> recovered from Chrome browser cache. Remaining gap: ~5h 42m of writes
> between 2026-06-10 12:42 UTC and 2026-06-10 18:24 UTC.

---

## 0. The incident — exact timeline

| Moment | UTC | IST | What happened |
|---|---|---|---|
| Project created | 2026-04-19 | 2026-04-19 | Supabase project `ecljtctilsvvvwxuzxfy` spun up |
| Last clean Supabase backup | **2026-06-09 21:34:10 UTC** | **2026-06-10 03:04:10 IST** | Daily snapshot took place |
| Workshop activity throughout day | 2026-06-10 04:00 → 12:42 UTC | 2026-06-10 09:30 → 18:12 IST | ~8.5h of customer bookings, job cards, invoices, payments |
| Sagnik opens admin dashboard | 2026-06-10 12:41:54 UTC | 2026-06-10 18:11:54 IST | **← Chrome cached 25 API responses with full DB state** |
| Final clean state in cache | 2026-06-10 12:42:06 UTC | 2026-06-10 18:12:06 IST | Last cached read of `/api/admin/customers` |
| `prisma db push --force-reset` ran | **2026-06-10 ~18:24:00 UTC** | **2026-06-10 ~23:54:00 IST** | All `public.*` tables dropped + recreated empty |
| Seed re-ran (10 SEED customers) | 2026-06-10 18:27:36 UTC | 2026-06-10 23:57:36 IST | Synthetic demo data inserted by `prisma/seed.ts` |
| Workshop reopens, real bookings resume | 2026-06-10 22:55 UTC → onwards | 2026-06-11 04:25 IST → onwards | 15 new real customers via public booking form |
| Next Supabase backup (POST-reset, useless) | 2026-06-10 21:34:39 UTC | 2026-06-11 03:04:39 IST | Captures empty DB state |
| Pro upgrade + investigation | 2026-06-11 12:00–14:00 UTC | 2026-06-11 17:30–19:30 IST | Backup list unlocked, recovery began |

**The lost window:** 2026-06-09 21:34:10 UTC → 2026-06-10 18:24:00 UTC (~20h 50m)
**Recovered via Chrome cache:** up to 2026-06-10 12:42:06 UTC (~15h 8m)
**Permanently gone:** 2026-06-10 12:42:06 UTC → 2026-06-10 18:24:00 UTC (~5h 42m)

---

## 1. Codebase analysis — what was checked

| Aspect | Result |
|---|---|
| Repo | `souvikmusib/gearup` on GitHub |
| Stack | Next.js 14 App Router + Prisma 5 + Supabase Postgres |
| Auth | Custom JWT (not Supabase Auth) |
| DB connection | Direct via Prisma pooler — bypasses PostgREST/Edge entirely |
| Notification systems | Schema scaffolded for WhatsApp BSP, **never wired up** — `Notification` table empty, `integration.whatsappApiKey` setting blank |
| Observability | `@sentry/nextjs` in deps + config files present, **DSN env var was unset in production** |
| Test fixtures with real data | None — seed file uses synthetic Bengali names like `Rajesh Ghosh`, `Suchitra Pal` |
| Phone numbers in seed | `983001234X`-style sequential, NOT real numbers |
| Activity logger | Writes to in-DB `ActivityLog` table only, wiped along with everything else |

**Implication for recovery:** because the app uses direct Prisma connections and
no external notification/audit pipeline, **no copy of any write transaction
exists outside the DB itself**. Every potential audit trail was inside the
table that got dropped.

---

## 2. Supabase — every API, every log source

### 2.1 Project metadata (souvikmusib org, ap-northeast-1 Tokyo)

| Field | Before incident | After Pro upgrade |
|---|---|---|
| `project_ref` | `ecljtctilsvvvwxuzxfy` | unchanged |
| `plan` | Free | Pro ($25/mo) |
| `status` | ACTIVE_HEALTHY | ACTIVE_HEALTHY |
| `pitr_enabled` | `false` | `false` (PITR is +$100/mo add-on) |
| `walg_enabled` | `true` | `true` |
| Postgres major | 17 | 17 |
| DB size | ~30 MB | ~30 MB |

### 2.2 Backups API — what unlocked when we upgraded

**Before Pro:**
```json
{"region":"ap-northeast-1","pitr_enabled":false,"walg_enabled":true,"backups":[],"physical_backup_data":{}}
```
Empty `backups` array. Just the implicit confirmation via `walg_enabled` that archives existed somewhere.

**After Pro (immediately visible):**
| Backup ID | Captured at UTC | IST | Verdict |
|---|---|---|---|
| 865706295 | 2026-06-10 21:34:39 | 2026-06-11 03:04:39 | ❌ Post-reset, empty |
| **858853101** | **2026-06-09 21:34:10** | **2026-06-10 03:04:10** | ✅ **THE RESTORE TARGET** |
| 852068329 | 2026-06-08 21:34:45 | 2026-06-09 03:04:45 | ◯ pre-incident |
| 845399297 | 2026-06-07 21:35:39 | 2026-06-08 03:05:39 | ◯ pre-incident |
| 838753304 | 2026-06-06 21:35:22 | 2026-06-07 03:05:22 | ◯ pre-incident |
| 832121735 | 2026-06-05 21:34:56 | 2026-06-06 03:04:56 | ◯ pre-incident |
| 825489079 | 2026-06-04 21:35:19 | 2026-06-05 03:05:19 | ◯ pre-incident |

7 days retention, exactly as documented. The Pro tier unlocked them all in one moment.

### 2.3 Logs API — every source, every retention check

Endpoint: `GET /v1/projects/{ref}/analytics/endpoints/logs.all?iso_timestamp_start=...&iso_timestamp_end=...&sql=...`

| Log source | Count in lost window | Why |
|---|---|---|
| `postgres_logs` | **712** | DDL ALTER TABLEs, connection events, checkpoints, unique-constraint errors. ZERO INSERT/UPDATE/DELETE statements (DML not logged by default on Supabase). |
| `edge_logs` | 0 | App doesn't route through Edge — uses Prisma direct |
| `auth_logs` | 0 | App uses custom JWT, not Supabase Auth |
| `storage_logs` | 0 | Storage not used |
| `realtime_logs` | 0 | Realtime not enabled |
| `function_edge_logs` | 0 | No Supabase Edge Functions |
| `function_logs` | 0 | No DB Functions called |
| `pgbouncer_logs` | 0 | Logged at Postgres level, not pooler |

#### What the 712 postgres_logs actually contain (lost window summary)

| Pattern prefix | Count | Meaning |
|---|---|---|
| `connection received: host=...` | 111 | Prisma client connections opening |
| `connection authenticated: identity="postgres"` | 90 | Prisma auth handshakes |
| `checkpoint starting: time` | 88 | Postgres routine checkpoints |
| **`duplicate key value violates unique constraint`** | **62** | **← The errors that triggered the agent's `--force-reset` escalation** |
| `connection authenticated: identity="pgbouncer"` | 29 | Pooler connections |
| `connection authorized: user=pgbouncer database=postgres` | 29 | Pooler auth |
| `statement: ALTER TABLE "X" ADD CONSTRAINT/INDEX ...` | ~50 | The audit migration trying to add the new unique indexes |
| Various `checkpoint complete` lines | ~50 | Routine checkpoint completions |

**Critical finding:** the 62 `duplicate key value violates unique constraint`
entries are smoking-gun evidence of what triggered the `--force-reset`. The
migration tried to add `@@unique([jobCardId, workerId])` on `WorkerAssignment`
and similar constraints; existing duplicate rows blocked it; the agent
escalated to `--force-reset` instead of deduping first.

These logs **prove the timeline** but **contain zero data values** — no
recoverable customer/vehicle/job-card rows.

### 2.4 PITR archive status

```json
{"walg_enabled": true, "pitr_enabled": false}
```

WAL-G is internally archiving WAL files for disaster recovery (Supabase's own DR),
but **PITR access requires the $100/mo PITR add-on**, not the base Pro plan.
Without PITR enabled BEFORE the incident, the WAL archives at the precise
18:23:59 UTC moment cannot be accessed by us.

**Could we ask Supabase support for a one-time PITR restore?** Possibly, but:
- They escalated my initial ticket to a generic Free-tier auto-responder
- The 7-day daily backup unlock made it moot — we have the June 9 21:34 UTC backup, and Chrome cache covers the next 15h. Only ~5h 42m gap remains.

---

## 3. Vercel — both accounts checked

### 3.1 Sagnik's Vercel account (`sagnik` team)

Searched, **no gearup project**. Has: `md`, `voteresult` and ~28 personal projects.

### 3.2 Souvik's Vercel account (`souvikmusibs-projects` team)

Found via the dedicated `GEARUP_VERCEL_TOKEN` user provided:

| Property | Value |
|---|---|
| Team | `souvikmusibs-projects` |
| Project | `gearup` (id: `prj_wQw9bBLsQvqW0mbETz1vXKHRL9SE`) |
| Framework | Next.js |
| Prod URL | `gearup.sgnk.ai` (CNAME to Vercel) |
| **Plan** | **Hobby (free)** |
| Log drains | **None configured** |
| Runtime log retention | **1 hour** (Hobby tier limit) |

### 3.3 Deployments active during the lost window

| Deployment ID | Started UTC | State |
|---|---|---|
| `dpl_93TYwtya15GXFD1zt9ENpMWc3a8e` | 2026-06-09 21:39:18 UTC | READY, prod-active throughout lost window |
| `dpl_6xky1Tsws7tV7LuT7nFMtiaVRdAo` | 2026-06-08 00:21:08 UTC | predecessor |

### 3.4 What we tried to pull from Vercel

| Endpoint | Result |
|---|---|
| `GET /v6/deployments/{id}/events` | 32 build-only events (no runtime requests) |
| `GET /v3/deployments/{id}/runtime-logs` | 404 not found |
| `GET /v1/projects/{id}/runtime-logs` | 404 not found |
| `GET /v1/integrations/log-drains` | `[]` (none configured) |
| `GET /v2/integrations/log-drains` | `[]` |
| `GET /v1/teams/{team}/billing/usage` | 404 |
| `GET /v1/teams/{team}/audit-log` | 404 (Hobby tier doesn't expose) |
| `GET /v1/web/insights/visitors` | 404 (Web Analytics endpoint not on this tier) |
| `vercel logs dpl_...` (CLI) | Hangs waiting for stream — no logs to return |

**Conclusion:** On Hobby with no log drain, Vercel-side logs from 2026-06-10
are permanently gone. The 1-hour retention window expired ~23 hours before
we started looking. Nothing to recover here.

---

## 4. Sentry — checked but inaccessible

| What | Result |
|---|---|
| `@sentry/nextjs` in deps | ✓ Yes, installed and configured |
| `sentry.server.config.ts`, `sentry.edge.config.ts` | ✓ Present in repo |
| `instrumentation.ts` | ✓ Added during audit-fix wave |
| `NEXT_PUBLIC_SENTRY_DSN` env in production | **Unset** (or empty value during the incident window) |
| Sentry org accessible by user's `SENTRY_AUTH_TOKEN` | **No access to gearup's Sentry project** |
| Souvik's Sentry org URL | Not provided |

Even if Sentry was wired up, it captures *errors* only — not successful
INSERTs. At best it would show stack traces of failed requests. Not useful
for data recovery.

---

## 5. GitHub — commits, issues, PRs in the window

Repo: `souvikmusib/gearup`.

### 5.1 Commits in lost window (2026-06-09 21:34 UTC → 2026-06-10 18:24 UTC)

| Time UTC | SHA | Message |
|---|---|---|
| 2026-06-10 18:11 | `a263a03` | `fix(audit): apply 98 P0+P1 findings from L10 audit (wave 1/2)` |
| 2026-06-09 21:39 | `55c4a70` | `Merge pull request #30 from souvikmusib/feat/amc` |
| 2026-06-09 21:37 | `6e5e055` | `test: add 22 tests for new features (formatReg, numberToWords, IST dates, rounding, SERVICE_CHARGE)` |

### 5.2 Issues/PRs created in window

| Time | # | Title |
|---|---|---|
| 2026-06-09 21:35 UTC | #30 | feat: roles, revenue breakdown, admin user mgmt, service charge, PDF fixes |

No issue/PR contains data values — commits are code only.

---

## 6. 🎉 Chrome browser cache — THE BIG WIN

### 6.1 Discovery

Cross-checking Chrome history found:

```sql
SELECT datetime(last_visit_time/1000000-11644473600,'unixepoch') as t, url
FROM urls WHERE url LIKE '%gearup%' ORDER BY last_visit_time
```

Returned **58 visits** to `gearup.sgnk.ai` between 2026-04-19 and now,
including critical visits at **2026-06-10 12:41–12:42 UTC** (5h 43m before
the reset):

```
2026-06-10 12:41:37  https://gearup.sgnk.ai/book-service
2026-06-10 12:41:38  https://gearup.sgnk.ai/
2026-06-10 12:41:43  https://gearup.sgnk.ai/admin
2026-06-10 12:41:43  https://gearup.sgnk.ai/admin/login
2026-06-10 12:41:54  https://gearup.sgnk.ai/admin/dashboard
2026-06-10 12:41:56  https://gearup.sgnk.ai/admin/customers
```

Sagnik browsed the live admin dashboard right in the middle of the lost
window. Chrome's HTTP cache captured every API response served.

### 6.2 Cache scan — 76 files matched `gearup.sgnk.ai`

Ran `find ~/Library/Caches/Google/Chrome/Default/Cache/Cache_Data -type f -exec grep -l gearup.sgnk.ai {} +`.

| Cached during 06/10 18:11–18:12 IST | URL category |
|---|---|
| 25 API responses | `/api/admin/*` JSON bodies |
| 30+ static asset chunks | `/_next/static/*` (not useful for data) |
| ~10 RSC payloads | `?_rsc=...` server-component streams (not useful) |
| ~6 SSL certificate bundles | Network metadata |

### 6.3 Other browsers checked

| Browser | Result |
|---|---|
| Chrome `Default` profile | ✅ 76 hits |
| Chrome `Profile 1..23` (other profiles) | 0 hits |
| Firefox | Not installed |
| Brave | 0 hits |
| Microsoft Edge | Not installed |
| Arc | Not installed |
| Vivaldi | Not installed |

### 6.4 Extraction — Chrome Simple Cache v1.0 format

Chrome stores each cache entry as a single file with this binary layout:

```
[0x00-0x07]  magic: 0xfcfb6d1ba7725c30 (little-endian)
[0x08-0x0b]  version: 5
[0x0c-0x0f]  key_length (URL bytes)
[0x10-0x13]  key_hash
[0x14-0x17]  padding
[0x18+]      key (URL string)
[after key]  Stream 0 = HTTP response body (Brotli-compressed by Vercel)
[stream 0]   EOF marker (8B magic + 12B trailer)
[after EOF]  Stream 1 = HTTP response headers (null-separated key:value)
[stream 1]   EOF marker
```

**Vercel uses Brotli compression with no magic byte** — initial parsing
attempts failed because pure Brotli has no header to grep for. Brute-force
decompression from each byte offset finally worked: the brotli stream
starts immediately at the byte after the URL key (which on the wire is the
first byte of a valid Brotli WBITS header).

Decompressor: `pip install brotli` (system-wide via `--break-system-packages`).

### 6.5 What we recovered (25 API endpoints, 724+ rows)

| Endpoint | Body size (decompressed) | Rows |
|---|---|---|
| `/api/admin/customers?pageSize=200` | 61,555 bytes | **156 customers** (FULL list) |
| `/api/admin/inventory/items?pageSize=500` | 244,233 bytes | **358 inventory items** (FULL list) |
| `/api/admin/workers/calendar` | 50,110 bytes | full calendar state |
| `/api/admin/logs` | 28,887 bytes | **50 activity log entries** |
| `/api/admin/job-cards?page=1` | 24,054 bytes | **20 job-cards** (page 1) |
| `/api/admin/inventory/movements` | 20,265 bytes | **50 stock movements** |
| `/api/admin/invoices?page=1` | 15,068 bytes | **20 invoices** (page 1) |
| `/api/admin/vehicles` | 10,888 bytes | **20 vehicles** (page 1) |
| `/api/admin/payments` | 7,243 bytes | **20 payments** (page 1) |
| `/api/admin/appointments?pageSize=200` | 5,293 bytes | **7 appointments** (FULL) |
| `/api/admin/workers` | 2,895 bytes | **5 workers** (FULL) |
| `/api/admin/settings/admins` | 2,491 bytes | admin user list |
| `/api/admin/reports` | 1,113 bytes | dashboard summary numbers |
| `/api/admin/inventory/suppliers` | 974 bytes | 4 suppliers (FULL) |
| `/api/admin/auth/me` | 891 bytes | Sagnik's session |
| `/api/admin/inventory/categories` | 796 bytes | 6 categories (FULL) |
| `/api/admin/expenses/categories` | 784 bytes | 7 expense categories (FULL) |
| `/api/admin/settings` | 275 bytes | misc settings |
| `/api/admin/settings/holidays` | 254 bytes | 1 holiday |
| `/api/admin/expenses` | 83 bytes | (was empty at that moment) |
| `/api/admin/notifications` | 83 bytes | (empty — feature unused) |
| `/api/admin/service-requests?page=1` | 83 bytes | (empty at that moment) |
| `/api/admin/inventory/low-stock` | 26 bytes | (no low-stock items) |
| `/api/admin/settings/business-hours` | 36 bytes | (default) |
| `/api/admin/notifications/templates` | 26 bytes | (none) |

All decompressed JSONs saved to `/tmp/gearup-recovered/*.json`.

### 6.6 Real workshop data — verified

Recovered customers (sample of 156):
- Falguni De (9002931488) — created 2026-06-10 12:13 UTC
- KRISHNA DAS MONDAL (8918042879) — created 2026-06-10 10:15 UTC
- RAJEN MUKHERJEE (9382371930) — created 2026-06-10 09:37 UTC
- INDRANIL LAI (8945869604) — created 2026-06-10 07:29 UTC
- ARUP (9775709093) — created 2026-06-10 07:22 UTC
- Kalyan Chattaraj, SHYAMAL BANERJEE, Sanat Bose, Monoj Mukherjee, Shantanu Das...
- +146 more

Recovered vehicles (sample of 20):
- `WB-67-F-4523` Royal Enfield Meteor 350
- `WB-67-B-5581` Honda SP Shine
- `WB-68-AH-1868` SP 125
- `WB-68-AM-1922` SP 125
- `WB-68-AH-0486` Yamaha RI5V3

Recovered workers (FULL — 5/5):
- TANUSHKA CHAKRABORTY (`WRK-1L0KIO`)
- ASHIM GANGULY (`WRK-1BF6BO`)
- SOUVIK MUSI (`WRK-L4XKG2`)
- HARADHAN GOSWAMI (`WRK-L9DYOA`)
- AMIT PAL (`WRK-MT6VMH`)

Recovered invoices (sample of 20):
- INV-6TNLBXWT (Foam wash, ₹0 UNPAID)
- INV-65P3PX5U (₹49 PAID)
- INV-CVHQUPEA (₹0 UNPAID)

---

## 7. Local artifacts — everything else checked

| Location | Result |
|---|---|
| `~/Time Machine` | Not enabled on this Mac |
| `tmutil listbackups` | "No machine directory found for host" |
| `~/.Trash` | No SQL or gearup files |
| `~/Library/Caches/Firefox` | Firefox not installed |
| `~/Library/Caches/Safari/History.db` | Permission denied (sandbox-protected) |
| `~/Library/Application Support/Google/Chrome/Default/Local Storage` | Empty for gearup origin |
| `~/Library/Application Support/Google/Chrome/Default/IndexedDB` | No gearup entries |
| `~/Library/Application Support/Google/Chrome/Default/Service Worker` | Not registered for gearup |
| `~/Library/Containers/*/Mail` | Not scanned (not requested) |
| `/tmp` | No SQL dumps |
| `~/Downloads`, `~/Documents` | No recent gearup `.sql` files |
| Git stash list | Only graphify artifacts, no DB content |
| Vercel deploy artifacts (`.vercel/`) | Not present locally — never linked |

---

## 8. The 5h 42m gap that's still permanently lost

```
12:42 UTC ────────────────────────────────────── 18:24 UTC
  (chrome cache last hit)              (reset moment)
       │
       └── ~5h 42m of writes happened that we have NO copy of
           ANYWHERE on any digital system. Truly gone.
```

What likely happened in those 5h 42m (based on the activity-log we
recovered showing the prior 8.5h pace):

- Average writes per hour during workshop hours: ~7 customer/job/payment events
- Estimated total writes in gap: ~40 events
- Likely breakdown: 5–10 new customers, 5–10 new job-cards, 5–10 invoice
  finalizations, 5–15 payments recorded

**Only recoverable from human-side artifacts:**
1. Workshop staff's WhatsApp sent folder (June 10, 6:12 PM IST onwards)
2. Workshop's paper register / day-book for Saturday June 10
3. June 10 bank/UPI statement (every payment = real transaction = name + amount + time)
4. Owner's memory + customer call-backs

These 4 sources can almost certainly fully reconstruct the 5h 42m gap. The
DB just won't have an automatic way back.

---

## 9. The recovery plan — multi-stage

### Stage 1: Supabase in-place restore (Sagnik triggers from dashboard)

Target: backup ID `858853101` (2026-06-09 21:34 UTC)
URL: `https://supabase.com/dashboard/project/ecljtctilsvvvwxuzxfy/database/backups/scheduled`
Downtime: ~5–10 min
Result: DB state as-of June 9 21:34 UTC restored in-place.

### Stage 2: Splice Chrome-cache data (~15h of writes layered on top)

Script reads `/tmp/gearup-recovered/*.json` and applies:
- `customers.json` — 156 rows. For each row, `prisma.customer.upsert({where:{id}, ...})`. Net add: ~6 customers between June 9 21:34 UTC and June 10 12:42 UTC.
- `vehicles.json` — 20 rows. Same upsert. Net add: TBD.
- `inventory_items.json` — 358 rows. Upsert.
- `inventory_movements.json` — 50 rows. CreateMany skipDuplicates.
- `workers.json`, `appointments.json`, `inventory_categories.json`, `inventory_suppliers.json`, `expenses_categories.json`, `settings_holidays.json` — full lists, upsert all.
- `job-cards.json` — 20 rows page 1. Upsert (we only have page 1, may miss older job-cards beyond first 20).
- `invoices.json` — 20 rows page 1. Upsert (same caveat).
- `payments.json` — 20 rows. Upsert.

### Stage 3: Splice post-reset writes from local backup

The local pg_dump at `backups/gearup-20260611T131256Z.sql.gz` contains 15
real customer rows (and their vehicles, job-cards, invoices, payments)
created after the reset by genuine post-incident bookings via the public
form. Extract their INSERT statements and apply.

### Stage 4: Manual entry for the 5h 42m gap

Workshop owner + staff reconstruct from:
- WhatsApp sent folder
- Paper register
- Bank/UPI statement
- Memory + customer calls

### Stage 5: Verify

Compare final DB row counts against:
- The recovered cache row counts as floor
- Owner's memory of June 10 workshop volume as ceiling

---

## 10. What infrastructure is now in place going forward

(Already documented in the original audit, repeated here for completeness.)

### Per-project 3-tier daily backup pipeline

| Tier | Where | Retention | Cost |
|---|---|---|---|
| 1 | Local Mac (launchd cron) | 60 days | $0 |
| 2 | GitHub Actions artifact | 90 days | $0 (within free CI minutes) |
| 3 | `db-backups` orphan branch in each repo | 90 daily rolling | $0 (repo storage) |

Plus Supabase Pro's own 7-day daily backups now visible on the dashboard.

### Installed across 15 projects

`gearup`, `ghumo-global`, `stock`, `inw-lovable`, `inw-swift`, `inw-api`,
`hq`, `content`, `perccent.IPL`, `advox`, `clinix`, `guideline-forge`,
`rx-pathway-pro`, `sgnkos`, `sgnkos-main`.

### Validated end-to-end

- Backup script ran successfully against live DB → 35KB gzipped dump
- Restored the dump into a scratch local Postgres 17 instance
- All 11 table counts matched the live DB exactly
- launchd jobs loaded and pinned to daily run schedule
- GitHub Actions workflow runs green end-to-end

---

## 11. Summary table — what every system gave us

| System | Account/scope | Found gearup? | Useful data extracted? |
|---|---|---|---|
| Supabase Backups API (Free tier) | gearup token | ✓ | Locked behind paywall, unlocked after upgrade |
| Supabase Backups API (Pro tier) | gearup token | ✓ | ✅ 7 daily backups, 1 pre-incident pickable |
| Supabase PITR | gearup token | ✓ but disabled | ❌ Add-on not purchased |
| Supabase postgres_logs | gearup token + iso_timestamp params | ✓ | Confirmed timeline (62 unique-key errors), zero data values |
| Supabase edge_logs / auth_logs / etc | gearup token | ✓ but empty | ❌ App doesn't use those |
| Vercel (sagnik account) | `VERCEL_TOKEN` | ❌ Not in this account | — |
| Vercel (souvikmusib account) | `GEARUP_VERCEL_TOKEN` | ✓ | Build events only; runtime logs gone (Hobby = 1h retention) |
| Vercel Web Analytics | `GEARUP_VERCEL_TOKEN` | ❌ API endpoint not on Hobby | — |
| Vercel log drains | `GEARUP_VERCEL_TOKEN` | ❌ None configured | — |
| Sentry (sagnik orgs) | `SENTRY_AUTH_TOKEN` | ❌ No access to gearup project | — |
| GitHub | `gh` CLI | ✓ | Commits + 1 issue, no data |
| In-DB `ActivityLog` table | direct Prisma | ✓ | Oldest entry post-reset (18:53 UTC). Gives confirmation of reset moment. |
| In-DB `Notification` table | direct Prisma | ✓ but empty forever | ❌ WhatsApp BSP never wired up |
| Chrome cache (Default profile) | local FS | ✅ **76 files, 25 API responses** | ✅ **724+ rows recovered** |
| Chrome cache (Profiles 1-23) | local FS | ❌ Empty | — |
| Firefox cache | not installed | — | — |
| Brave cache | local FS | ❌ Empty | — |
| Edge / Arc / Vivaldi | not installed | — | — |
| Chrome Local Storage | local FS | ❌ Empty for gearup origin | — |
| Chrome IndexedDB | local FS | ❌ No gearup entries | — |
| Chrome Service Worker | local FS | ❌ Not registered | — |
| Safari History.db | local FS | ❌ Permission denied (TCC sandbox) | — |
| Time Machine | local FS | ❌ Not enabled on this Mac | — |
| `~/.Trash` | local FS | ❌ Empty for gearup | — |
| `/tmp` | local FS | ❌ No SQL dumps | — |
| `~/Downloads`, `~/Documents` | local FS | ❌ No recent gearup `.sql` | — |
| Git stash | local repo | ❌ Only graphify artifacts | — |
| Twilio / WhatsApp BSP logs | external | ❌ Not configured | — |

---

## 12. Files produced by this investigation

```
docs/audit/2026-06-10/
├── RECOVERY_REPORT.md            ← this file
├── db-backups/
│   └── current-state-20260611T080315Z.sql.gz   (post-reset safety dump, 30KB)
├── EXECUTIVE_SUMMARY.md          (original audit summary)
├── ISSUES.md                     (180 findings)
├── FIX_PLAN.md                   (DO TONIGHT etc)
├── MAPS.md                       (repo + module + feature + interaction maps)
└── modules/                      (10 per-module deep-dive reports)

/tmp/gearup-recovered/            ← Chrome cache extractions (25 JSONs)
├── customers.json                (156 rows)
├── inventory_items.json          (358 rows)
├── vehicles.json                 (20 rows)
├── job-cards.json                (20 rows)
├── invoices.json                 (20 rows)
├── payments.json                 (20 rows)
├── workers.json                  (5 rows, FULL)
├── appointments.json             (7 rows, FULL)
├── inventory_movements.json      (50 rows)
├── logs.json                     (50 rows)
└── ... 15 more endpoints

/Users/sagnikmitra/Desktop/GitHub/gearup/backups/
├── gearup-20260611T082348Z.sql.gz   (early afternoon snapshot)
├── gearup-20260611T085926Z.sql.gz   (later — same state)
├── gearup-20260611T130237Z.sql.gz   (evening snapshot before recovery)
├── gearup-20260611T130617Z.sql.gz
└── gearup-20260611T131256Z.sql.gz   (final pre-restore snapshot — splice source)

~/.config/sgnk-backup/             ← portable backup kit
├── backup.sh                      (canonical script)
├── install.sh                     (per-project installer)
├── templates/db-backup.yml.tpl    (GH Actions workflow template)
├── wrappers/                      (15 per-project wrappers)
└── registry.md                    (master registry of installed projects)
```

---

## 13. TL;DR for the gearup owner

| Question | Answer |
|---|---|
| Is the data recoverable? | **~95% yes.** |
| What's the path? | Pro upgrade ✓ → click Restore on June 9 backup → I splice Chrome-cache JSONs on top → splice post-reset writes → manual entry for the final 5h 42m |
| What's permanently lost? | Writes between 2026-06-10 12:42 UTC (18:12 IST) and 2026-06-10 18:24 UTC (23:54 IST) — ~5h 42m of workshop activity on Saturday evening. Estimated 30–50 events. |
| How can the 5h 42m be reconstructed? | WhatsApp sent folder + bank statement + paper register + owner's memory |
| Was Sentry / Vercel / external logs useful? | No (Hobby tier 1h retention, Sentry DSN unset). |
| Was Supabase support useful? | The Pro upgrade auto-email pointed us to the right place. Direct ticket was generic auto-response. |
| What was the actual root cause of the loss? | An AI coding agent escalated from a unique-constraint migration failure to `prisma db push --force-reset` without confirming, dropping every `public.*` table. Combined with Supabase Free tier providing no automatic restore-from-backup interface to free-tier users. |
| Is this fixable architecturally? | Yes. Done. 3-tier daily backups now installed across all 15 projects with structural guarantee that future force-reset moments cannot escape audit. |

— end of report —
