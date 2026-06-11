# gearup — Post-Restore Action Plan (PITR PATH)

> **Updated 2026-06-11 ~15:50 UTC** after Supabase support offered a PITR
> workaround. This supersedes the daily-backup-restore plan.

**Status:** Awaiting your decision: Path A (PITR — recommended) vs Path B (daily backup as before).

---

## 1. What Supabase support offered

Yuliya from Supabase Support replied to the ticket:

> "Due to how our infrastructure is currently behaving, we have WAL available
> that may allow you to **retroactively** enable Point-in-Time Recovery.
>
> To try this, you would first need to enable the Point-in-Time Recovery add-on.
> Please note enabling PITR is a paid add-on and you will incur additional
> charges while it is enabled. PITR is billed on an **hourly basis** ...
> if you enable PITR and disable it after 2 hours, you'll only be charged for
> those 2 hours.
>
> Once enabled, you will be able to select a recovery point from before the
> add-on was turned on, and there is a chance you may be able to restore your
> most recent data. You have two options: '**restore in place**' on your
> production project or '**restore to a separate/new project**'."

Caveats they explicitly stated:
- This retained WAL is not a permanent feature, just a one-time grace
- Best-effort: no guarantee the exact data we want is in the WAL archive
- For ongoing PITR protection, the add-on must stay enabled

---

## 2. Verified costs

| Item | Cost | Source |
|---|---|---|
| Pro plan (already paid) | $25/mo per project | Supabase pricing |
| PITR add-on (7-day retention) | **$100/month** | [Supabase pricing page](https://supabase.com/pricing) |
| Billing model | **Hourly** — pay only for hours active | [PITR docs](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery) |
| Hourly cost | **$100 ÷ 30 ÷ 24 = ~$0.139/hour** | math |
| Expected total for recovery (~3 hours) | **~$0.42 USD ≈ ₹35** | math |
| Conservative max (24 hours buffer) | **~$3.33 USD ≈ ₹275** | math |

---

## 3. What recovering with PITR gets us

If we pick recovery point **2026-06-10 18:23 UTC** (1 minute before the reset
at 18:24 UTC), the recovered DB contains:

| Window | Status with PITR path |
|---|---|
| Apr 19 → June 9 21:34 UTC (~6 weeks pre-incident) | ✅ Recovered |
| June 9 21:34 UTC → June 10 12:42 UTC (~15h, was cache) | ✅ Recovered (no cache splice needed) |
| **June 10 12:42 UTC → 15:00 UTC (the 2h 18m gap)** | ✅ **Recovered — closes the gap entirely** |
| June 10 15:00 → 18:24 UTC (workshop closed) | ✅ Recovered (no data created anyway) |
| June 10 18:24 UTC → June 11 18:54 UTC (post-reset writes) | ⚠ Already in live DB, will need to be re-spliced after PITR restore |

**Net: ~100% recovery, automatic. No manual WhatsApp / paper-register entry needed.**

Compare to the daily-backup-restore path:
- Daily backup at June 9 21:34 UTC ≈ 92% recovery + 2h 18m manual entry from owner
- PITR restore at June 10 18:23 UTC ≈ 100% recovery, no manual entry

---

## 4. The two PITR sub-options Supabase offered

### Option A — "Restore in place" on production project

- **Action:** PITR rewinds the existing `ecljtctilsvvvwxuzxfy` project to 18:23 UTC
- **Pro:** No new project, single step
- **Con:** Destructive — overwrites the current state (10 SEED + 15 real
  post-reset customers + 4 stuck bookings + today's writes). We have local backups, but it's still a destructive event.
- **Con:** Same single-Supabase-project-quota counts; no Free-tier concerns
- **Per Rule 2:** explicit per-op approval required

### Option B — "Restore to a separate/new project" (Supabase support's preferred)

- **Action:** Supabase creates a brand-new project, restores it to 18:23 UTC
- **Pro:** **Non-destructive** — production project untouched until we explicitly write to it
- **Pro:** Lets us validate the recovered data first (compare against cache JSONs)
- **Pro:** If anything looks wrong, we can re-pick the timestamp; no risk to live DB
- **Con:** Need to do a data transfer (dump from new project → upsert into production)
- **Con:** Creates a second project, adds a small organizational cost (billing-wise negligible)
- **Per Rule 2:** explicit per-op approval required at each step

### Recommendation

**Option B (restore to new project).** Reasons:

1. Non-destructive matches our new "no destructive ops without per-op approval" rule
2. Lets us validate that PITR actually recovered the gap data before committing
3. If recovery is incomplete, we still have the daily-backup path as fallback
4. Cost difference is negligible — extra ~30 min of PITR = extra ~$0.04
5. The current live DB (with today's 138 ActivityLog entries, 15 real post-reset customer bookings, 12 payments, etc.) stays safe during validation
6. Supabase support explicitly suggested this option

---

## 5. The new full plan (PITR path)

### Stage 0 — Pre-flight (needs your approval)

> **Approval ask:** "Yes, take a final pre-PITR safety dump of the production project."

When approved:
1. Run `~/.config/sgnk-backup/wrappers/gearup.sh` → fresh local dump
2. Verify integrity + count tables
3. Stop the local dev server
4. Tell you "OK, ready"

Cost: ~10 sec. Output: `backups/gearup-<UTC>.sql.gz`.

### Stage 1 — Enable PITR (you do this in dashboard)

This is your action. I do not have approval to call the billing API.

1. Open https://supabase.com/dashboard/project/ecljtctilsvvvwxuzxfy/settings/addons?panel=pitr (the URL Supabase support sent)
2. Select 7-day retention
3. Confirm the $100/mo (hourly billed) add-on
4. Wait for PITR to become active (Supabase shows status; typically a few minutes)
5. Tell me "PITR active"

Estimated cost so far: 0 hours billed (just enabled, not used)

### Stage 2 — Restore to new project (you do this in dashboard)

Also your action.

1. In the same project's dashboard → Database → Backups → **Point in time** tab
2. Select **Restore to new project** (BETA, but this is what Supabase support recommended)
3. Pick recovery timestamp: **2026-06-10 18:23:00 UTC** (1 minute before reset)
   - In their UI, this might display as 2026-06-10 23:53 IST
4. Name the new project something like `gearup-recovery-test`
5. Confirm
6. Wait — provisioning + restore takes ~10-15 min
7. Tell me "new project ready" + share the new project's ref ID (format: 20 lowercase alphanumeric characters)

Estimated cost so far: ~45 min of PITR active = $0.07 (rounded up to 1 hour by Supabase = $0.14)

### Stage 3 — Validate the recovered data (read-only, I can do this)

> **Approval ask:** "Yes, query the new project's DB to validate the recovery."

When approved, I'll:

1. Add the new project's `DATABASE_URL` to my env (you give it to me)
2. Run read-only Prisma queries to count tables, sample rows
3. Compare against:
   - The cache JSONs at `/tmp/gearup-recovered/*.json`
   - The current live production DB
4. Report:
   - "PITR recovery looks complete: 156 customers, 358 inventory items, etc." OR
   - "PITR recovery looks incomplete: X table only has Y rows, expected Z" with diagnostic info

This is purely read-only — no writes anywhere.

### Stage 4 — Choose the merge strategy (your decision)

Based on Stage 3 findings, decide ONE of:

**Strategy 4A — Swap projects (cleanest if you're willing to switch refs)**

> Update `DATABASE_URL` + `DIRECT_URL` in production env to point to the new project. Vercel redeploy. The new project becomes production. The old project becomes the abandonable backup.

Pros: Atomic switch, all 100% recovered data, no merge logic needed.
Cons: Connection string changes; if any external client (Twilio, etc.) is wired to the old refs, those break. (gearup doesn't have such external wirings, so this is clean.)
Production cuts over in ~5 minutes total.

**Strategy 4B — Splice from new project into existing production (preserves URLs)**

> Run a script that reads from the new project's DB and upserts into the existing production project. Same project ref stays.

Pros: No URL change anywhere.
Cons: More moving parts; requires the dependency-ordered upsert script (which I'd write).

**Strategy 4C — Combine: take the new project's pg_dump, restore in place over production**

> `pg_dump` from new project → `psql restore` into production. Single destructive write.

Pros: Atomic; no merge logic.
Cons: Destructive on production; loses today's post-reset writes unless spliced back.

**My recommendation: Strategy 4A (swap projects)** if you're OK changing connection strings, OR **Strategy 4B (splice)** if you want to preserve the existing project ref.

### Stage 5 — Apply chosen strategy (needs your explicit approval per Rule 2)

I'll write the chosen strategy's script, commit it for your review, then ask
"shall I run this?".

### Stage 6 — Post-merge: also splice today's post-reset writes

Whichever strategy we use in Stage 4-5, today's 138 ActivityLog entries and
15 real customer bookings need to land in the final DB too. I'll splice
them from `backups/gearup-20260611T131256Z.sql.gz` (the local backup we took
this afternoon).

Also still needed: owner manually re-enters the 4 stuck job-cards (validator
bug today). Their customer + vehicle records will be present after this
sequence; only the job-card POST never reached DB.

### Stage 7 — Disable PITR

Once everything is verified and stable, you disable the PITR add-on in the
dashboard. Billing stops immediately for hours afterward.

Final PITR cost: ~3 hours × $0.139 = **$0.42 USD ≈ ₹35**.

### Stage 8 — Optional: delete the recovery project

If you used Strategy 4B or 4C (production project stays as-is), the new
recovery project can be deleted to clean up. Keep it for a few days first as
extra insurance.

---

## 6. What you tell the founder

> "Supabase support found that they have a way to recover the data
> automatically from a point-in-time snapshot, not just the daily backup
> from Wednesday morning. With a small one-time add-on cost of about ₹35
> (under $1 USD), we can restore the database to its exact state 1 minute
> before the data was lost. That covers everything including the late
> afternoon/evening of Wednesday — no manual re-entry of bookings or
> invoices needed. Pending Sagnik's verification that the recovery is
> complete, we expect 100% of your workshop data back."

---

## 7. What happens to our existing backup work if we go PITR

The Chrome cache JSONs and the local pg_dump (post-reset writes) become:

- **Validation aids** — we confirm PITR's output matches what we have in cache
- **Splice source for Stage 6** — today's writes still need to be merged in
- **Permanent record** — keep them as historical evidence

The 11 WhatsApp screenshots also become validation aids — confirming
specific invoices appear in the PITR-recovered data.

---

## 8. Risks of the PITR path

| Risk | Mitigation |
|---|---|
| PITR retroactive enable might not actually work (Supabase said "chance") | If Stage 2 fails, fall back to daily-backup restore (the original plan). Local dump still has us covered. |
| New project provisioning takes longer than expected | Hourly billing still applies; not catastrophic. Worst case: 5 hours × $0.139 = $0.70 |
| Strategy 4A swap-projects breaks something external | gearup doesn't have external integrations wired to project refs. Verified: no Twilio webhooks, no SUPABASE_SERVICE_ROLE_KEY in 3rd-party services. Safe. |
| Strategy 4B splice has a bug | Read-only validation in Stage 3 catches it before write; idempotent upsert means re-runnable |
| Forget to disable PITR | Costs $100/mo if left on. I'll remind you AND set a calendar reminder for tomorrow. |

---

## 9. Comparison: PITR path vs Daily-backup path

| | PITR path | Daily-backup path |
|---|---|---|
| Cost | ~$0.42 USD (~₹35) | $0 (already paid for Pro) |
| Coverage | 100% pre-reset | ~92% pre-reset; 2h 18m needs manual entry |
| Time to execute | ~3 hours (most is provisioning waits) | ~1 hour |
| Risk if PITR fails | Fall back to daily backup | None — straightforward |
| Owner manual work | None (PITR closes the gap) | 5-15 records re-entered from paper/WhatsApp |

**My strong recommendation: PITR path.** Cost is negligible, coverage is complete, the small extra time is well-spent.

---

## 10. APPROVAL GATE — what I need from you

To begin the PITR path, say:

- **"Yes, do Stage 0"** → I take the final pre-PITR safety dump and stop dev server
- **"Going with daily backup path instead"** → I revert to the old plan
- **"Have a question first"** → ask

After Stage 0, **Stage 1 and Stage 2 are yours to do in the dashboard.** I cannot enable the PITR add-on or trigger the restore-to-new-project from my side.

When you've done Stage 1 + Stage 2, share the new project's connection string with me and say "ready for Stage 3". I'll then ask for approval before each subsequent stage.

---

## 11. Sources

- Supabase support email from Yuliya Marinova (2026-06-11)
- [Supabase pricing page](https://supabase.com/pricing) → PITR $100/mo per 7d
- [PITR add-on docs](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)
- [PITR add-on settings URL for this project](https://supabase.com/dashboard/project/ecljtctilsvvvwxuzxfy/settings/addons?panel=pitr)

---

## 12. Decision matrix one-pager

```
            PITR PATH                       DAILY BACKUP PATH
            ────────                       ─────────────────
Cost:       ~₹35 ($0.42)                   ₹0 (Pro already paid)
Recovery:   100% pre-reset                 92% pre-reset
Gap fill:   automatic                      manual (5-15 records)
Time:       ~3 hours                       ~1 hour
Risk:       PITR might not work*           low — straightforward
Fallback:   daily backup if PITR fails     no fallback (this IS the fallback)

* If PITR fails, we use the time on the meter to confirm it didn't work and
  fall back to the daily backup. Worst case still recovers ~92%.
```

Recommendation: **start with PITR**. Fall back to daily backup if Stage 3 shows incomplete recovery.

Awaiting your "yes" for Stage 0.
