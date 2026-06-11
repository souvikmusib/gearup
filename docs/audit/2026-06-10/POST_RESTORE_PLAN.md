# gearup — Post-Restore Reconstruction Plan + Supabase Pro Downgrade Analysis

> **Companion document to** `RECONSTRUCTION_PLAN.md`. This one focuses on
> the SQL/code that runs AFTER you click Restore in the Supabase dashboard,
> plus the cost analysis for cancelling Pro afterwards.
>
> **Compliance with new rules**: Every destructive operation in this plan
> has an explicit confirmation gate. Pre-op backup is mandatory. Numbers
> shown with their sources. Dates verified via `date` tool.

---

## 0. Verified facts (all rechecked via tool before writing)

| Fact | Value | Verified by |
|---|---|---|
| Restore point | **2026-06-09 21:34:10 UTC** = 2026-06-10 03:04:10 IST (Wednesday) | `date -j -f` + Supabase backup listing |
| Day of restore-point | Tuesday (UTC) / Wednesday (IST) | `date -j -f "%Y-%m-%dT%H:%M:%SZ" "2026-06-09T21:34:10Z" "+%A"` |
| Today's date | Thursday 2026-06-11 | `date -u` |
| Gearup schema | 34 tables | `grep -cE "^model [A-Z]" prisma/schema.prisma` |
| Cache JSONs available | 25 endpoints, 1,308 rows | `ls /tmp/gearup-recovered/*.json` + tally |
| Latest local backup | `backups/gearup-20260611T131256Z.sql.gz` | `ls backups/` |
| Supabase plan | Pro ($25/mo per project) | Supabase Management API + WebSearch confirmed |
| Pro project pause behavior | Pro projects do NOT auto-pause | [Supabase docs](https://supabase.com/docs/guides/troubleshooting/pausing-pro-projects-vNL-2a) |

---

## 1. Pre-restore safety checklist — **MUST RUN BEFORE you click Restore**

This is **non-negotiable** per the new rule (`pre-op-backup-mandatory`). Even
though we've taken several backups today, take one fresh dump immediately
before you click. Cost: ~10 seconds. Benefit: covers any writes between now
and the restore click.

```bash
# Step 1.1 — Final pre-restore safety dump
~/.config/sgnk-backup/wrappers/gearup.sh

# Step 1.2 — Verify integrity
LATEST=$(ls -t /Users/sagnikmitra/Desktop/GitHub/gearup/backups/gearup-*.sql.gz | head -1)
gzip -t "$LATEST" && echo "OK: $LATEST"
gunzip -c "$LATEST" | grep -c "^CREATE TABLE"   # expect 34
gunzip -c "$LATEST" | grep -c "^COPY "          # expect 34

# Step 1.3 — Stop dev server (no more local writes)
for port in 3000 3001 4000; do
  pid=$(lsof -ti :$port 2>/dev/null); [ -n "$pid" ] && kill -9 $pid 2>/dev/null
done

# Step 1.4 — Tell the workshop owner: ~10 min downtime starting NOW
#           (so they don't try to enter data during the restore window)
```

I will run Steps 1.1–1.4 only on your explicit "yes, take the final dump and stop dev".

---

## 2. The restore action itself

**This is YOUR click, not mine.** I do not have approval to call Supabase's
restore API directly.

1. Open: **https://supabase.com/dashboard/project/ecljtctilsvvvwxuzxfy/database/backups/scheduled**
2. Find the row labeled **`09 Jun 2026 21:34:10 (+0000)`** (second from the top)
   - Backup ID: `858853101`
   - Dashboard may show in your local timezone as `10 Jun 2026, 03:04 AM IST`
3. **DO NOT click the top row** (`10 Jun 2026 21:34:39` — that's the empty post-reset snapshot)
4. Click **Restore** on the second row
5. Confirm in the modal
6. Wait — Supabase shows status `RESTORING` → `ACTIVE_HEALTHY` (~3–8 min)

After it completes, tell me "restore done" and I'll move to Section 3.

---

## 3. Immediate post-restore verification

```bash
# 3.1 — DB reachable
curl -s http://127.0.0.1:3000/api/health   # only after dev server restart below

# 3.2 — Confirm counts jumped to pre-incident scale
cd /Users/sagnikmitra/Desktop/GitHub/gearup/apps/web
node scripts/with-root-env.mjs "npx tsx -e \"
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async()=>{
  const r = {
    customers: await p.customer.count(),
    vehicles: await p.vehicle.count(),
    jobCards: await p.jobCard.count(),
    invoices: await p.invoice.count(),
    payments: await p.payment.count(),
    inventoryItems: await p.inventoryItem.count(),
  };
  console.log(r);
  await p.\\\$disconnect();
})()
\""

# Expected after restore (from cache evidence at June 10 12:42 UTC):
#   customers ≈ 150+    (much higher than current 25)
#   vehicles ≈ 150+
#   inventoryItems ≈ 358 or close to it
#   jobCards / invoices / payments — depends on workshop history
```

If counts look reasonable (3+ digits where appropriate), restore succeeded.
If counts come back at zero or wrong-looking, STOP and tell me.

---

## 4. Schema reconciliation — CRITICAL step before splicing

**The restored DB has the schema as of June 9 21:34 UTC.** Since then I've
deployed schema changes via the audit fix wave:

| Added during audit | Required for current app to work? |
|---|---|
| `JobCard.estimateToken`, `estimateTokenExpiresAt`, `estimateRevision` (3 nullable columns) | YES — public estimate route uses them |
| `@@unique([jobCardId, inventoryItemId])` on `JobCardPart` | YES — code relies on P2002 conflict for race safety |
| `@@unique([amcContractId, jobCardId])` on `AmcServiceUsage` | YES — ownership/race protection |
| `@@unique([jobCardId, workerId])` on `WorkerAssignment` | YES — duplicate-assignment prevention |
| New `@@index` decorations (composite indexes for query perf) | NO (perf only — safe to add later) |
| Sentry `instrumentation.ts` (file added) | NO (not a schema change) |

After the restore, the schema will REGRESS to pre-incident state. The
current app code expects these added columns / constraints. So we need to
**re-apply just the additive schema changes** without touching existing
data. `prisma db push` does this safely (it's idempotent and additive —
it only adds; it does NOT drop).

⚠ **The restored DB might also contain the WorkerAssignment duplicate rows
that originally triggered the `--force-reset` cascade.** If we re-run the
`@@unique([jobCardId, workerId])` migration over those duplicates, it'll
fail with P2002 again. We need to dedupe FIRST.

### 4.1 — Dedupe any pre-existing WorkerAssignment duplicates

```sql
-- Find duplicates (jobCardId + workerId pairs with > 1 row)
SELECT "jobCardId", "workerId", COUNT(*) AS n, MIN("assignedAt") AS earliest
FROM "WorkerAssignment"
GROUP BY "jobCardId", "workerId"
HAVING COUNT(*) > 1;

-- For each duplicate set: keep the row with the earliest assignedAt,
-- delete the rest. Run ONLY after reviewing the list above.
DELETE FROM "WorkerAssignment" w1
USING "WorkerAssignment" w2
WHERE w1."jobCardId" = w2."jobCardId"
  AND w1."workerId"  = w2."workerId"
  AND w1.id != w2.id
  AND w1."assignedAt" > w2."assignedAt";
```

I will not run this SQL directly. After the restore, I'll first show you the
duplicate list (read-only `SELECT`), then ask before running the `DELETE`.

### 4.2 — Apply additive schema changes

```bash
cd /Users/sagnikmitra/Desktop/GitHub/gearup/apps/web
node scripts/with-root-env.mjs "npx prisma db push --skip-generate"
# This is ADDITIVE — it adds the missing columns and unique indexes,
# does NOT drop or truncate anything.
# If duplicates remain, --skip-generate WILL fail loudly, NOT --force-reset.
# I will NOT pass --force-reset or --accept-data-loss.
```

⚠ I will ask before running `prisma db push` even though it's additive,
per Rule 2.

---

## 5. Per-table splice plan — the complete reconstruction

Restoring the June 9 backup gives you all data as-of 2026-06-09 21:34 UTC.
Everything since that moment needs to be layered on top.

Two splice sources:
- **Source A** = Chrome cache JSONs at `/tmp/gearup-recovered/*.json` (snapshot from 2026-06-10 12:42 UTC)
- **Source B** = Local backup `backups/gearup-20260611T131256Z.sql.gz` (snapshot from 2026-06-11 13:12 UTC, the current post-reset state)

### 5.1 — Per-table source mapping (all 34 tables)

| # | Table | Restored from backup? | Source A (Cache) | Source B (Post-reset local) | Splice strategy |
|---|---|---|---|---|---|
| 1 | `AdminUser` | ✅ Yes | 5 rows (settings/admins) | 5 rows | **NO splice** — restored copy authoritative (admin accounts pre-date June 9) |
| 2 | `Role` | ✅ Yes | not cached | 4 rows | **NO splice** — restored copy authoritative |
| 3 | `Permission` | ✅ Yes | not cached | 20 rows | **NO splice** — restored copy authoritative |
| 4 | `AdminUserRole` | ✅ Yes | not cached | 5 rows | **NO splice** — restored copy authoritative |
| 5 | `RolePermission` | ✅ Yes | not cached | 20 rows | **NO splice** — restored copy authoritative |
| 6 | `Customer` | ✅ Yes | 156 rows | 25 rows (10 SEED + 15 real) | **SPLICE both**: upsert cache rows (createdAt > 2026-06-09T21:34Z); then upsert local rows where source='PUBLIC_FORM' or createdAt > 2026-06-10T18:53Z |
| 7 | `Vehicle` | ✅ Yes | 20 (page 1 only) | 25 rows | **SPLICE both**: upsert cache (newer than restore point), then post-reset locals |
| 8 | `ServiceRequest` | ✅ Yes | 0 cached (genuinely empty at cache time) | 10 rows | **SPLICE locals only** (post-reset bookings via public form) |
| 9 | `Appointment` | ✅ Yes | 7 rows (FULL) | 8 rows | **SPLICE locals + cache delta**: cache has 7, local has 8 → 1 added since cache |
| 10 | `AppointmentSlotRule` | ✅ Yes | not cached | 6 rows | **NO splice** — config table, restored copy fine |
| 11 | `BlockedSlot` | ✅ Yes | not cached | 0 rows | **NO splice** |
| 12 | `Holiday` | ✅ Yes | 1 cached + might be more from backup | 10 rows | **VERIFY then splice locals**: restored may already have all 10, splice only missing |
| 13 | `Worker` | ✅ Yes | 5 rows (FULL) | 10 rows | **VERIFY**: cache had 5 workers, local has 10. Either cache was page-1-limited OR 5 workers added since cache. Splice missing 5. |
| 14 | `WorkerLeave` | ✅ Yes | not cached | 2 rows | **SPLICE locals** if newer than restore point |
| 15 | `JobCard` | ✅ Yes | 20 (page 1) | 16 rows | **SPLICE locals + cache delta**: critical table, full chain analysis needed |
| 16 | `WorkerAssignment` | ✅ Yes | not cached | 8 rows | **SPLICE locals** (only those post-restore-point) |
| 17 | `JobCardTask` | ✅ Yes | not cached | 60 rows | **SPLICE locals** if newer than restore point |
| 18 | `JobCardPart` | ✅ Yes | not cached | 10 rows | **SPLICE locals** if newer than restore point |
| 19 | `InventoryCategory` | ✅ Yes | 6 rows (FULL) | 10 rows | **SPLICE missing 4 from local** (categories added between June 9 21:34 and now) |
| 20 | `Supplier` | ✅ Yes | 4 rows (FULL) | 5 rows | **SPLICE missing 1 from local** |
| 21 | `InventoryItem` | ✅ Yes | **358 rows (FULL)** | 10 rows (SEED) | **CRITICAL SPLICE**: cache has the real 358 items, local has only 10 SEED. Cache is authoritative for inventory. |
| 22 | `StockMovement` | ✅ Yes | 50 cached + might be more | 6 rows | **SPLICE cache + verify locals** |
| 23 | `Invoice` | ✅ Yes | 20 (page 1) | 13 rows | **SPLICE both** — page 1 of cache (20 invoices) + local post-reset (13) |
| 24 | `InvoiceLineItem` | ✅ Yes | line items embedded in cache invoices | 32 rows | **SPLICE both** — extract line items from cache invoice JSONs |
| 25 | `Payment` | ✅ Yes | 20 (page 1) | 12 rows | **SPLICE both** |
| 26 | `ExpenseCategory` | ✅ Yes | 7 rows (FULL) | 5 rows | **VERIFY then splice**: cache has more than local — cache wins |
| 27 | `Expense` | ✅ Yes | 0 cached (was empty at cache time) | 10 rows | **SPLICE locals only** (post-reset writes) |
| 28 | `NotificationTemplate` | ✅ Yes | 0 cached | 4 rows | **SPLICE missing 4 from local** (templates created between June 9 21:34 and now) |
| 29 | `Notification` | ✅ Yes | 0 cached | 0 rows | **NO splice** — feature unused |
| 30 | `ActivityLog` | ✅ Yes | 50 (page 1) | 143 rows | **SPLICE both** — 50 from cache (pre-incident) + 143 from post-reset locals |
| 31 | `Setting` | ✅ Yes | 1 holiday + partial | 6 rows | **SPLICE missing from local** |
| 32 | `AmcPlan` | ✅ Yes | not cached | 1 row | **VERIFY**: restored backup should have AMC plans, local has only 1 row (created post-reset?) |
| 33 | `AmcContract` | ✅ Yes | not cached | 2 rows | **SPLICE locals** if newer than restore point |
| 34 | `AmcServiceUsage` | ✅ Yes | not cached | 1 row | **SPLICE locals** if newer than restore point |

### 5.2 — Splice script (TypeScript, Prisma)

I'll author `scripts/post-restore-splice.ts` after the restore. Skeleton:

```typescript
// scripts/post-restore-splice.ts
// Reads cache JSONs + local backup, upserts everything newer than
// 2026-06-09T21:34:10Z into the restored DB.
//
// Idempotent — safe to re-run.
// Uses upsert (not create) so existing-after-restore rows are NOT duplicated.

import { PrismaClient, Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const RESTORE_POINT_ISO = '2026-06-09T21:34:10.000Z';
const RESTORE_POINT = new Date(RESTORE_POINT_ISO);
const CACHE_DIR = '/tmp/gearup-recovered';
const LOCAL_DUMP = '/Users/sagnikmitra/Desktop/GitHub/gearup/backups/gearup-20260611T131256Z.sql.gz';

const prisma = new PrismaClient();

async function spliceCustomers() {
  const cache = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'customers.json'), 'utf8'));
  let added = 0, skipped = 0;
  for (const c of cache.data || []) {
    const createdAt = new Date(c.createdAt);
    if (createdAt < RESTORE_POINT) { skipped++; continue; }
    await prisma.customer.upsert({
      where: { id: c.id },
      create: { id: c.id, fullName: c.fullName, phoneNumber: c.phoneNumber,
                alternatePhone: c.alternatePhone, email: c.email,
                addressLine1: c.addressLine1, addressLine2: c.addressLine2,
                city: c.city, state: c.state, postalCode: c.postalCode,
                notes: c.notes, source: c.source ?? 'CACHE_SPLICE',
                createdAt, updatedAt: new Date(c.updatedAt ?? c.createdAt) },
      update: {}, // no-op if already exists
    });
    added++;
  }
  console.log(`Customer cache splice: +${added}, skipped ${skipped} (already in restored backup)`);
}

async function spliceVehicles() { /* ... same pattern ... */ }
async function spliceInventoryItems() { /* ... cache 358 rows ... */ }
async function spliceInventoryMovements() { /* ... */ }
async function spliceWorkers() { /* ... */ }
async function spliceAppointments() { /* ... */ }
async function spliceJobCards() { /* ... */ }
async function spliceInvoices() { /* ... cache + line items ... */ }
async function splicePayments() { /* ... */ }
async function spliceActivityLog() { /* ... */ }
// ... 34 tables total in dependency order

// Phase 2: extract post-reset writes from local dump
async function applyLocalPostResetWrites() {
  // Decompress + load into temporary sqlite-like in-memory, OR
  // restore the dump into a scratch local Postgres and SELECT
  // rows with createdAt >= 2026-06-10T18:53:29Z, then upsert into Supabase.
  // Detailed implementation TBD post-restore based on what's actually
  // missing from the cache layer.
}

(async () => {
  console.log(`Splicing data newer than ${RESTORE_POINT_ISO}`);
  // Order matters — dependency-first:
  await spliceInventoryCategories();
  await spliceSuppliers();
  await spliceInventoryItems();        // depends on Category + Supplier
  await spliceInventoryMovements();    // depends on InventoryItem
  await spliceWorkers();
  await spliceCustomers();
  await spliceVehicles();              // depends on Customer
  await spliceAppointments();          // depends on Customer + Vehicle
  await spliceJobCards();              // depends on Customer + Vehicle + Appointment + ServiceRequest
  await spliceWorkerAssignments();     // depends on JobCard + Worker
  await spliceJobCardTasks();          // depends on JobCard
  await spliceJobCardParts();          // depends on JobCard + InventoryItem
  await spliceInvoices();              // depends on JobCard + Customer + Vehicle
  await spliceInvoiceLineItems();      // depends on Invoice
  await splicePayments();              // depends on Invoice + AdminUser
  await spliceAmcContracts();          // depends on Customer + Vehicle + AmcPlan
  await spliceAmcServiceUsages();      // depends on AmcContract + JobCard
  await spliceExpenseCategories();
  await spliceExpenses();              // depends on ExpenseCategory + AdminUser
  await spliceActivityLog();           // depends on AdminUser
  await spliceSettings();
  await spliceHolidays();
  await spliceWorkerLeaves();          // depends on Worker
  await spliceNotificationTemplates();
  await applyLocalPostResetWrites();
  console.log('All splices complete.');
  await prisma.$disconnect();
})();
```

I'll write the full version once you confirm the restore happened cleanly.
Will commit the script to `scripts/post-restore-splice.ts` so it's
reviewable BEFORE I ask permission to run it.

### 5.3 — Final-state verification (after splice)

```sql
-- Run these in Supabase SQL editor or via Prisma to verify
SELECT 'Customer'      AS t, COUNT(*) FROM "Customer"
UNION ALL SELECT 'Vehicle',       COUNT(*) FROM "Vehicle"
UNION ALL SELECT 'JobCard',       COUNT(*) FROM "JobCard"
UNION ALL SELECT 'Invoice',       COUNT(*) FROM "Invoice"
UNION ALL SELECT 'InvoiceLineItem',COUNT(*) FROM "InvoiceLineItem"
UNION ALL SELECT 'Payment',       COUNT(*) FROM "Payment"
UNION ALL SELECT 'InventoryItem', COUNT(*) FROM "InventoryItem"
UNION ALL SELECT 'StockMovement', COUNT(*) FROM "StockMovement"
UNION ALL SELECT 'Worker',        COUNT(*) FROM "Worker"
UNION ALL SELECT 'WorkerAssignment',COUNT(*) FROM "WorkerAssignment"
UNION ALL SELECT 'Appointment',   COUNT(*) FROM "Appointment"
UNION ALL SELECT 'AmcContract',   COUNT(*) FROM "AmcContract"
UNION ALL SELECT 'ActivityLog',   COUNT(*) FROM "ActivityLog";

-- FK integrity check — every JobCard's customerId must exist in Customer
SELECT COUNT(*) AS orphan_jobcards
FROM "JobCard" jc
LEFT JOIN "Customer" c ON jc."customerId" = c.id
WHERE c.id IS NULL;
-- Expect 0

-- Same for Invoice → Customer
SELECT COUNT(*) AS orphan_invoices
FROM "Invoice" i
LEFT JOIN "Customer" c ON i."customerId" = c.id
WHERE c.id IS NULL;

-- Same for Payment → Invoice
SELECT COUNT(*) AS orphan_payments
FROM "Payment" p
LEFT JOIN "Invoice" i ON p."invoiceId" = i.id
WHERE i.id IS NULL;
```

If any orphan count is non-zero, we have a referential integrity issue
to fix before the workshop continues using the app.

---

## 6. Mandatory post-splice safety dump

Per the rules, after any large state mutation, take a fresh dump.

```bash
~/.config/sgnk-backup/wrappers/gearup.sh
# Result: backups/gearup-<UTC>.sql.gz containing the merged final state
```

This becomes the new "known good" baseline. If anything goes wrong in the
days ahead, this is the rollback target.

---

## 7. The 4 stuck job-cards from today — owner action

After the restore + splice completes, the owner needs to:

1. Open https://gearup.sgnk.ai/admin/customers
2. For each of these 4 customers, click into their profile and create the missing job-card:
   - ABIR DASMODAK (9832201386) — vehicle WB-68-W-9225
   - GOURAV BHATTACHARYAA (7550883795) — vehicle WB-68-AN-1061
   - TAMA ROY (8538015165) — vehicle WB-68-V-9084
   - KUSH SHARMA (8350959585) — vehicle WB-68-X-0607
3. Form values (issue summary, fuel, odometer, complaints) need to come from
   the workshop's paper register or the owner's memory — those typed-in
   values were not saved anywhere we can recover.

The form will work now because the validator bug was deployed at 14:17 UTC.

---

## 8. The 5h 42m gap (June 10 12:42–18:24 UTC = 18:12–23:54 IST Wednesday)

Still no digital recovery source. The WhatsApp images received cover only
the morning shift (latest WA = 12:14 UTC). Asks for the owner remain:

1. WhatsApp invoice PDFs forwarded **between 18:12 IST and 23:54 IST on
   Wednesday June 10**
2. WhatsApp booking confirmations during that window
3. Bank/UPI receipts received between 18:12 IST and 23:54 IST
4. Photo of paper register / day-book for that window
5. Any timestamped workshop photos from that window

If any arrive, I'll OCR + match + splice them in.

---

## 9. Audit follow-ups (owner-reported issues from today)

You mentioned the owner reported "a lot of issues" today. After restore +
splice + stability confirmation, the next phase is:

1. **Get the owner's full bug list** — preferably in writing, ideally with
   screenshots of each issue
2. For each issue, reproduce locally
3. Root-cause analysis (likely some are introduced by my audit fix wave,
   like the priority-enum bug we already found)
4. Patch + deploy each — same destructive-op gate applies even for code
   pushes that go to production
5. Capture each as a regression test so the same pattern doesn't reappear

I'll await the bug list before starting this phase.

---

## 10. Supabase Pro downgrade — cost analysis

### 10.1 — Verified facts (from Supabase docs + search results — sources at the end)

| Question | Verified answer |
|---|---|
| Pro plan cost | $25 USD per project per month + usage above included quota |
| Pro plan includes | $10 USD compute credits + standard usage allowances |
| Pro plan compute | Project doesn't get auto-paused (good for active workshop use) |
| Free tier project pause | After 1 week of inactivity, Supabase pauses the project |
| Free tier database limit | 500 MB (gearup is ~30 MB → way under) |
| Free tier backups | NONE accessible via dashboard (the 7 daily backups disappear from your view the moment you downgrade) |
| Refund / pro-rated credit | Supabase credits the unused portion as account credit — NOT a refund to your card (per their FAQ) |
| Data retained on downgrade | YES — data stays in the DB; downgrade only changes plan limits + features |

### 10.2 — Your specific cost situation

You paid **₹2,400** for one month. That includes Indian GST (18%):

```
₹2,400 paid  →  ÷ 1.18 (remove GST)  =  ₹2,033 base
₹2,033 base / typical INR-USD rate ~₹81.5  ≈  $25 USD  ✓  matches Pro pricing
```

If you cancel **after the restore completes** (let's say tomorrow):

- Used: ~1 day out of 30 → ~₹80 of value consumed
- Unused: ~29 days → Supabase will credit ~₹2,320 to your account (NOT card)
- That credit sits in your Supabase org and can be applied to FUTURE Supabase usage on any project in that org — useful if you keep gearup or any other project on Pro later
- **No card refund.** The credit stays inside the Supabase wallet.

### 10.3 — What happens to data + backups after downgrade

| Asset | Status after downgrade |
|---|---|
| Your row data (Customer, Vehicle, etc.) | ✅ Stays — downgrade does not touch data |
| Schema, indexes, constraints | ✅ Stays |
| Connection strings, anon key, service role key | ✅ Stays |
| The 7 daily backups (visible on Pro dashboard) | ❌ **Disappear from your dashboard the moment you downgrade.** Supabase keeps them server-side for a grace period but they're paywalled again. |
| Ability to restore a backup | ❌ Lost — no UI access on Free |
| Auth users, Storage, Realtime | ✅ Stays — gearup doesn't use these anyway |
| Project pause risk | ⚠ Free projects pause after 7 days of inactivity. Workshop's daily admin activity keeps it active, but if the workshop closes for a week → project pauses → app goes down |

### 10.4 — Decision matrix

| Scenario | Best plan choice |
|---|---|
| Cancel right after restore, save the money | Free — but lose dashboard backup access, project may pause if workshop closes >7 days |
| Cancel after 1 week of confirmed stability | Free — same as above. By then any restore-related risks have been observed |
| Stay on Pro for ongoing safety net | Pro — 7 daily backups always available, no pause risk, $25/mo recurring |
| Pro + PITR add-on | Pro + $100/mo PITR — overkill for gearup's 30MB DB. We have 3-tier external backups instead. |

### 10.5 — My recommendation

**Stay on Pro until at least 2026-06-25 (~2 weeks).** Reasoning:

- Reconstruction work hasn't finished — owner is still sending data, we're
  still splicing, audit follow-ups are pending
- The 7 daily Supabase backups during this period are real insurance — if
  the splice goes sideways, you can re-restore from a fresh backup
- After 2 weeks of stability, our 3-tier external backup pipeline (local
  launchd + GH Actions + db-backups branch) becomes the durable safety net,
  and you can downgrade

Estimated cost of staying ~2 weeks: roughly ₹2400 × (14/30) ≈ ₹1,120 — but
you've already paid for the full month, so the marginal cost is ZERO for
the first 30 days. After that:

- **June 11 → July 11**: already paid (₹2,400)
- **July 11**: Supabase auto-renews → another ₹2,400 hits unless you cancel before
- **Cancel by July 8 or so**: get the credit for unused future days; data + connectivity unaffected

### 10.6 — Downgrade procedure (when you're ready)

I'm NOT going to do this for you (it's a paid-plan change → Rule 2). When
you decide, the steps are:

1. Sign into the dashboard with the souvikmusib account
2. Open: https://supabase.com/dashboard/org/kupygdpqhaejkypxnwvz/billing
3. Click "Cancel subscription" or "Change plan" → Free
4. Confirm the consequences they show you
5. The downgrade happens at the next billing-cycle boundary, OR immediately
   depending on what you select. Be careful — pick the option that gives you
   the most retained backup window.

After the downgrade, our 3-tier external backups continue working
unchanged. You're not unprotected.

---

## 11. Summary — what I need from you next

| Order | Action | Who |
|---|---|---|
| 1 | Approve me to run the **pre-restore final safety dump** + stop dev server (Section 1) | You say "yes, take the final dump" |
| 2 | Click Restore on the **June 9 21:34 UTC backup** in the Supabase dashboard (Section 2) | You (Sagnik) |
| 3 | Tell me "restore done" once it shows ACTIVE_HEALTHY | You |
| 4 | I run read-only post-restore verification (Section 3) | Me (auto-allowed; read-only) |
| 5 | I show you the duplicate-WorkerAssignment list (Section 4.1, read-only `SELECT`) | Me (auto-allowed; read-only) |
| 6 | Approve me to run the dedupe `DELETE` (Section 4.1) | You confirm |
| 7 | Approve me to run `prisma db push` to apply additive schema (Section 4.2) | You confirm |
| 8 | Approve me to run the splice script (Section 5) — I'll show you the script BEFORE running | You confirm |
| 9 | I take the post-splice safety dump (Section 6) | Me (just running our own backup script — auto-allowed since it's read-only on Supabase) |
| 10 | You verify counts + tell the owner the app is back up | You |
| 11 | Owner re-enters the 4 stuck job-cards (Section 7) | Workshop owner |
| 12 | More WhatsApp screenshots for the 5h 42m gap, if owner has them | Workshop owner |
| 13 | Audit follow-ups based on owner's bug list (Section 9) | Me + you |
| 14 | Supabase Pro keep/cancel decision (Section 10) | You, when ready |

---

## 12. Sources

- [Supabase Database Backups documentation](https://supabase.com/docs/guides/platform/backups)
- [Supabase Pricing & Fees](https://supabase.com/pricing)
- [Supabase Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)
- [Supabase: Pausing Pro Projects troubleshooting](https://supabase.com/docs/guides/troubleshooting/pausing-pro-projects-vNL-2a)
- [Supabase GitHub Discussion #26908 — Switch from pro plan to free plan](https://github.com/orgs/supabase/discussions/26908)
- [Supabase GitHub Discussion #27399 — Pausing Pro Projects](https://github.com/orgs/supabase/discussions/27399)
- [JustCancel guide — Cancel Supabase Pro 2026](https://www.justcancel.io/blog/cancel-supabase-2026)
- gearup own incident audit: `docs/audit/2026-06-10/RECOVERY_REPORT.md`
- gearup reconstruction plan: `docs/audit/2026-06-10/RECONSTRUCTION_PLAN.md`

---

## 13. APPROVAL GATE

Per Rule 2 (`destructive-op-confirmation-gate`), I will execute NO state-
mutating action without your explicit "yes" for THAT specific operation.

Saying "go ahead with restore" in chat covers only Section 1 + Section 4
preparatory ops. The actual data splice (Section 5), schema push (4.2), and
dedupe DELETE (4.1) each need their own confirmation when we get to them.

Awaiting your sign-off.
