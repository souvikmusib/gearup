# Requirements — Voice notes 2026-06-16 (19.53 → 19.59 IST)

> Six WhatsApp voice notes from Sagnik (founder, Bengali, code-switching with English business terms). Transcribed locally via `whisper.cpp` `ggml-medium.bin` with `-l bn -tr` (Bengali source → English translation). The Bengali pass produced mostly hallucinations; the English translation pass produced legible output, captured verbatim below. Each item lists current code paths, the proposed delta, and acceptance criteria so another Claude session can pick this up cold.

---

## How to use this doc (read me first)

This document is the working brief for the next implementation session. It is **NOT** authorisation to ship — every destructive op (Prisma migration, prod DB write, etc.) still needs per-op user "yes" per `~/.claude/CLAUDE.md` zero-tolerance rules.

**Required reading before you touch code (~10 min):**

1. **`/Users/sagnikmitra/Desktop/GitHub/gearup/AGENTS.md`** — stack overview, conventions, dev loop.
2. **`apps/web/prisma/schema.prisma`** — 34 models. Pay attention to `JobCard`, `WorkerAssignment`, `AmcContract`, `InventoryItem`, `InvoiceLineItem`.
3. **`~/.claude/CLAUDE.md`** — Sagnik's global rules (zero tolerance for fabricated facts, every destructive op needs confirmation, etc.).
4. **`graphify-out/GRAPH_REPORT.md`** — fresh code graph; `graphify query "<thing>"` for fast lookups.

**Project shape (one-liner):** Next 14 App Router monorepo (`pnpm` + `turbo`), Postgres via Prisma 5.22 + Supabase (prod project `ecljtctilsvvvwxuzxfy` — OFF LIMITS for destructive ops), Vitest + Playwright, deployed to Vercel. Single tenant per shop. IST-only business hours (`apps/web/src/lib/time.ts`).

**Pre-push gate** (`./.husky/pre-push`): tz-lint → unit → integration → typecheck → lint → e2e. All must pass before push lands.

**Don't push to `main` directly.** Branch from `main`, open a PR, let CI run, merge. Recently shipped PRs (#33–#44) for shape reference.

---

## Voice-note inventory

| # | Filename | Duration | Topic |
|---|---|---|---|
| 1 | `WhatsApp Audio 2026-06-16 at 19.53.59.opus` | ~6s | Job card → show time alongside date |
| 2 | `WhatsApp Audio 2026-06-16 at 19.54.54.opus` | ~22s | AMC discount % field on inventory items (max 90%, must be ≥ normal discount) |
| 3 | `WhatsApp Audio 2026-06-16 at 19.56.58.opus` | ~14s | Per-worker revenue view in Workers section |
| 4 | `WhatsApp Audio 2026-06-16 at 19.57.41.opus` | ~26s | Split labor charges across multiple assigned workers (wash boy + mechanic) |
| 5 | `WhatsApp Audio 2026-06-16 at 19.58.01.opus` | ~15s | Cashier/sales commission on AMC sale |
| 6 | `WhatsApp Audio 2026-06-16 at 19.59.11.opus` | ~18s | Job card → auto-fetch existing customer + vehicle when reg number is entered |

---

## Requirement 1 — Job card: show TIME with DATE

### Voice note 1 — English translation (verbatim)

> "I'm telling you to mention the time with the date on the job card."

### Current state

- `apps/web/src/app/admin/job-cards/page.tsx:115` — the job-cards list column renders only the date:
  ```ts
  formatIST(r.createdAt, { day: '2-digit', month: 'short', year: 'numeric' })
  ```
- `apps/web/src/lib/time.ts` exports `formatIST(date, options)` and `formatTimeIST(date)`. Both already respect `Asia/Kolkata`.
- Detail page (`apps/web/src/app/admin/job-cards/[id]/page.tsx`) — audit whether the intake/delivery timestamps render time. If not, add it.
- Combined PDF (`apps/web/src/app/api/admin/invoices/[id]/pdf/route.ts`, the `type=combined` branch) — verify mechanic copy shows time too.

### Proposed change

1. In the job-cards list, change `formatIST(r.createdAt, …)` to include `hour: '2-digit', minute: '2-digit'` (or call `formatTimeIST` alongside).
2. On the detail page, surface the intake **timestamp** (date + time) and `estimatedDeliveryAt` (date + time) where they appear.
3. In the combined PDF header block, show "Intake: 13 Jun 2026 · 14:32 IST" instead of just date.

No schema change. No API change.

### Acceptance criteria

- [ ] List view shows `13 Jun 2026 · 14:32` (or similar) under each job-card number.
- [ ] Detail page shows the same on the header + delivery ETA.
- [ ] Combined PDF includes time.
- [ ] `bash scripts/check-tz.sh` still passes — no raw `toLocaleString` without `timeZone`.

---

## Requirement 2 — Inventory item: AMC discount % field (verify + tighten)

### Voice note 2 — English translation (verbatim)

> "When you create an item, you have to keep an AMC discount on it. You have to keep the AMC discount 3% before the house. So that it doesn't go to everyone. But the maximum is 90%, which is 3% higher than the normal discount. So this is the normal discount, and the other one is the AMC discount."

### Interpretation

- Inventory items should have a **separate AMC discount %** distinct from the regular discount %.
- Default value: **3%** (founder's standard AMC perk).
- Max: **90%** (already enforced upstream).
- Constraint: **AMC discount must be ≥ normal discount** (otherwise an AMC member would get worse pricing than a walk-in — clearly wrong).
- The AMC discount applies **only to AMC members**, not to all customers.

### Current state (mostly already shipped in PR #44 `bb83c4b`)

- `apps/web/prisma/schema.prisma:597` — `amcDiscountPercent Decimal? @db.Decimal(5, 2)` already exists on `InventoryItem`.
- `apps/web/src/app/api/admin/inventory/items/route.ts:41,65` — POST validates `amcDiscountPercent: z.number().min(0).max(100).optional()` and persists it.
- `apps/web/src/app/admin/inventory/items/page.tsx:26,102,302–303` — create form has the field + a live "AMC Price" readout.
- **PATCH route** (`apps/web/src/app/api/admin/inventory/items/[id]/route.ts`) — verify it also accepts `amcDiscountPercent` on edit. Currently the edit modal may not surface this — check `apps/web/src/components/inventory/edit-modal.tsx`.

### Proposed change (delta on top of what's already there)

1. **Tighten validation** to enforce `amcDiscountPercent ≥ discountPercent` AND `amcDiscountPercent ≤ 90`. Server-side in both POST and PATCH zod schemas; surface inline error on the form.
2. **Default to 3%** when creating a new item — pre-fill the create form field with `'3'` so the founder doesn't have to type it every time. (Make it overridable.)
3. **Edit modal parity** — ensure `InventoryEditModal` exposes the field so it can be edited post-creation.
4. **Apply on invoice** — when an invoice line item is `lineType=PART` and the customer's vehicle has an `ACTIVE` `AmcContract`, the line should default to using `inventoryItem.amcDiscountPercent` instead of `discountPercent`. Verify this branch exists in `apps/web/src/app/api/admin/invoices/[id]/line-items/route.ts` and `apps/web/src/lib/invoice-calc.ts`.
5. **Display on item card** — the inventory items list should show both percentages with clear labels (already partially done; verify).

### Acceptance criteria

- [ ] Cannot save an item with AMC discount lower than its normal discount (validation error inline).
- [ ] Cannot save AMC discount > 90% (validation error).
- [ ] Create form defaults the field to `3`.
- [ ] Edit modal exposes + saves the field.
- [ ] When an AMC-member's invoice has a PART line for this item, the AMC discount is applied automatically, not the normal one. Add an integration test that proves this.

---

## Requirement 3 — Per-worker revenue view in Workers section

### Voice note 3 — English translation (verbatim)

> "If you want to give a job to a worker, it is a little difficult. Normally, you have to look at the total revenue in your dashboard. So, it is convenient to go to the workers and see."

### Interpretation

The founder needs to figure out **per-worker payout/commission** at the end of a period. Today the only revenue surface is the global Total Revenue chart on the dashboard — there's no per-worker breakdown. He wants to open `Workers` or `Reports → Workers` and see "Worker X earned ₹Y across N job cards this month" so he can compute payout/commission.

### Current state

- `apps/web/src/app/admin/reports/workers/page.tsx` — only renders `fullName` + `activeAssignments` count. **No revenue.**
- `apps/web/src/app/api/admin/reports/workers/route.ts` (verify exists) — likely returns assignment counts only.
- Revenue lives on `Invoice.grandTotal` (or per-line via `InvoiceLineItem.lineTotal`). Workers connect via `JobCard → WorkerAssignment → Worker`. A single job card may have many assignments and many invoice line items.

### Proposed change

1. **Backend report endpoint**: `/api/admin/reports/workers` should return per worker:
   - `id`, `fullName`, `designation`
   - `assignmentsTotal` (lifetime)
   - `assignmentsInPeriod` (date-filtered)
   - `revenueAttributed` (date-filtered) — the worker's share of invoice line totals; see Requirement 4 for the share calculation. If R4 isn't built yet, fall back to **equal split** across all assigned workers per job card and label that explicitly in the UI ("equal-split estimate").
   - `lastAssignedAt`
2. Support `?from=&to=` query params (IST-aware, same shape as `/api/admin/payments` etc.).
3. **UI**: extend the Workers Report page with a date-range filter + columns `Assignments` and `Revenue Attributed`. Sortable.
4. **Drill-down**: clicking a worker row opens a list of their assignments in the period with per-row revenue.

### Acceptance criteria

- [ ] `/admin/reports/workers?from=2026-06-01&to=2026-06-30` returns per-worker revenue.
- [ ] UI shows date filter + sortable revenue column.
- [ ] If R4 isn't done yet, the column label is clearly "equal-split estimate" with tooltip.
- [ ] Integration test covers the IST date-range math.

---

## Requirement 4 — Split labor charges across multiple workers

### Voice note 4 — English translation (verbatim)

> "When the worker is assigned, the person who is washing is also assigned. And then the mechanic is also assigned. Because the milk and the mechanic are with the car. So the money for the two people goes separately. The money for washing goes to the washing boy. And the money goes to the mechanic."

### Interpretation

Two transcription artefacts to ignore: "milk" is mishearing of either *wash-boy* (ধোয়ালা / "dhowala") or *meal/labour boy* (the Whisper output is unreliable on Bengali nouns). The semantic point is clear:

A single job card often has **multiple workers** with **different roles**: e.g. a wash-boy + a mechanic. Today they get put into one `WorkerAssignment` row each with an `assignmentRole` string and there's **no way to record what share of the labor each one earns**. The founder wants:

- A wash-boy is paid (or gets commission) for the **car wash** portion.
- The mechanic is paid for the **repair/service** portion.
- These two should not collapse into one "labor" pool that's just split equally.

### Current state

- `apps/web/prisma/schema.prisma:506–521` — `WorkerAssignment { id, jobCardId, workerId, assignmentRole?, assignedAt, unassignedAt?, notes? }`. **No share / amount / commission column.**
- `InvoiceLineItem.lineType` enum has `LABOR` and `SERVICE_CHARGE` but they're not tied to a specific worker. No FK from line item to worker.
- Per-worker revenue (Requirement 3) currently has no choice but equal-split.

### Proposed change (this is a schema migration — needs Sagnik's go-ahead)

**Option A — recommended: line-item-level worker linkage.**

1. Add nullable column to `InvoiceLineItem`:
   ```prisma
   workerId String?
   worker   Worker?  @relation(fields: [workerId], references: [id])
   @@index([workerId])
   ```
2. When a `LABOR` or `SERVICE_CHARGE` line item is added in the invoice editor, surface a "Assign to worker" dropdown next to it. Multiple line items can have different workers.
3. Per-worker revenue (R3) = `SUM(lineTotal) WHERE workerId = X AND invoice in period`.

**Option B — assignment-level share splits.**

1. Add to `WorkerAssignment`:
   ```prisma
   sharePercent Decimal? @db.Decimal(5, 2)  // 0–100; null = equal split
   ```
2. When attributing revenue, the per-worker share = `sharePercent / 100` of the job card's labor revenue. Defaults to equal-split when null.
3. Simpler migration, but coarser data — can't say "wash-boy earned ₹100 from the wash, mechanic earned ₹500 from the repair," only "wash-boy got 20% of total labor."

**Recommendation: Option A**, because the founder explicitly wants the wash earnings to go to the wash-boy specifically — that's line-level attribution, not a percentage split.

### Acceptance criteria

- [ ] Schema migration drafted as `prisma migrate dev` with a clear `WorkerAssignment` / `InvoiceLineItem` delta. **Do NOT apply to prod without Sagnik's per-op approval.**
- [ ] Invoice editor lets a user assign each LABOR / SERVICE_CHARGE line to a specific worker.
- [ ] Per-worker revenue (R3) uses this new linkage when present, falls back to equal-split when null.
- [ ] Integration test: job card with 2 workers + 2 labor lines (one per worker) → each worker's revenue matches their line's `lineTotal`.

---

## Requirement 5 — Cashier / sales commission on AMC sale

### Voice note 5 — English translation (verbatim)

> "There is another commission in the case of the MC. If you go to the MC, you will see that the MC is assigned after the name is assigned."

### Interpretation

"MC" / "MSR" / "EMSR" — the transcription is mangled, but in business context this is almost certainly **AMC** (the recurring service contract product). The point: when an admin user (cashier / front-desk / sales staff) **sells an AMC contract**, they should earn a **commission** that is tracked separately from the worker labor commissions.

Two things needed:
1. Track **who sold** each AMC contract (currently `AmcContract` has no `soldByAdminId` field).
2. A commission report that summarises AMC sales per admin user over a date range.

### Current state

- `apps/web/prisma/schema.prisma:846–875` — `AmcContract { id, contractNumber, customerId, vehicleId, amcPlanId, startDate, endDate, totalServices, servicesUsed, servicesRemaining, amountPaid, paymentMode, paymentDate, status, notes, createdAt, updatedAt }`. **No `soldByAdminId` or `createdByAdminId`.**
- `apps/web/src/app/api/admin/amc/contracts/route.ts` POST handler creates the contract from the authenticated admin — `requirePermission(...)` returns `{ sub: adminId }`, but that ID is **not persisted on the row**.
- No commission rate is configured anywhere — would need a new `Setting` key (`amc.commission.percent`) or a per-plan field.

### Proposed change

1. **Schema**:
   ```prisma
   model AmcContract {
     // ... existing fields ...
     soldByAdminId String?
     soldBy        AdminUser? @relation("AmcContractSoldBy", fields: [soldByAdminId], references: [id])
     @@index([soldByAdminId])
   }
   ```
2. **POST `/api/admin/amc/contracts`** — set `soldByAdminId: user.sub` on create.
3. **Commission rate** — add `Setting` rows: `amc.commission.percent` (default `5`) and optionally per-plan override `AmcPlan.commissionPercent Decimal?`.
4. **Report endpoint** — `/api/admin/reports/amc-commissions?from=&to=`:
   - Returns per admin user: `adminUserId`, `fullName`, `amcSold` (count), `amcRevenue` (sum of `amountPaid`), `commission` (rate × revenue).
5. **UI** — new tab under `Reports`: "AMC Commissions". Date filter + sortable.

### Acceptance criteria

- [ ] Schema migration drafted; do NOT apply to prod without Sagnik's per-op approval.
- [ ] New AMC sale records `soldByAdminId`. Backfill existing rows is **out of scope** (leave null for historic data; explain in UI).
- [ ] Commission rate is configurable via settings.
- [ ] Report shows the four columns above, date-filtered.

---

## Requirement 6 — Job card: auto-fill from vehicle registration number

### Voice note 6 — English translation (verbatim)

> "I have made a job card for an old customer. When they give me the car number, I can see the details of the car. It is a good system."

### Interpretation

When creating a new job card for an **existing** customer, the founder wants to type the **vehicle registration number** and have the system auto-fetch:
- The vehicle's brand / model / type / odometer history
- The vehicle's customer (so the customer picker is auto-filled)

Today the job card create flow goes: pick customer first, then pick vehicle from that customer's list. The founder is asking for the reverse: enter reg number first, get everything else for free.

### Current state

- `apps/web/src/app/admin/job-cards/page.tsx:201` — the vehicle dropdown is a `SearchableSelect` of vehicles **scoped to the already-picked customer**. The customer must be picked first.
- `apps/web/src/components/shared/customer-picker.tsx` — the current entry point. Searches by name / phone, not reg number.
- `apps/web/src/app/api/admin/vehicles/route.ts:29` — GET supports `?search=<reg>` and returns matches.
- No existing UI that lets you type a reg number → resolve to `{customer, vehicle}` in one shot.

### Proposed change

1. **New component** `apps/web/src/components/shared/vehicle-reg-lookup.tsx`:
   - Single input. On debounced change (300ms), calls `/api/admin/vehicles?search=<reg>`.
   - Shows matching vehicles in a dropdown (reg # bold, then "Brand Model — Owner Name").
   - On select, calls `onResolved({ customer, vehicle })` and the parent fills both pickers.
2. **Wire into job-card create modal** — show this lookup *above* the customer picker as a fast path. If user finds a match, both customer and vehicle dropdowns fill automatically. If no match (e.g. brand-new vehicle/customer), they fall through to the existing flow.
3. **Fuzzy match on the backend** — the vehicles search already does case-insensitive `contains`; verify it also normalises hyphens/spaces (e.g. `WB26AB1234` should match `WB-26-AB-1234`). If not, normalise both sides via `formatRegNumber` in the query.
4. **Optional**: extend the same lookup to Appointments create + Invoices (counter-sale) create flows for consistency.

### Acceptance criteria

- [ ] Typing a known reg number in the job-card create modal pre-fills both customer and vehicle.
- [ ] Reg numbers match regardless of hyphen/space formatting.
- [ ] If the reg matches multiple vehicles (e.g. recycled plate after change of ownership), user picks from a short list.
- [ ] If no match, falls through to existing flow without UX disruption.

---

## Cross-cutting notes for the implementing session

- **Branch discipline:** branch from `main`, open a PR per requirement (or per small cluster). Don't bundle all six.
- **Schema migrations** (R4, R5):
  - Treat as destructive. Get Sagnik's explicit "yes" per migration. Reference `~/.claude/CLAUDE.md` zero-tolerance rules.
  - `DocumentSequence` table was already pushed previously — don't repeat that mistake. Take a `pg_dump` backup first.
- **IST timezone:** every new date filter must use `Asia/Kolkata` boundaries. The lint gate `scripts/check-tz.sh` will catch raw `toLocaleString` calls without `timeZone` — but it doesn't catch backend issues, so be explicit in zod schemas.
- **Tests:** the integration suite uses an ephemeral Postgres on port `54330`. Adding a worker-revenue endpoint? Write a `*.itest.ts` that seeds two workers, one job card, two invoices, and asserts attribution.
- **Don't push to `main` directly.** PR target = `main`. CI must be green pre-merge.
- **Vercel token:** use `$GEARUP_VERCEL_TOKEN`, not `$VERCEL_TOKEN`.

---

## Open questions / things to confirm with Sagnik before coding

1. **R2 (AMC discount):** "before the house" in the translation is suspicious — likely a transcription artefact. Confirm with Sagnik whether `3%` is the default *for the field* or the *minimum allowed*.
2. **R4 (worker split):** confirm Option A (line-level worker FK) vs Option B (assignment-level percentage). Option A is recommended but is a bigger UX change to the invoice editor.
3. **R5 (AMC commission rate):** confirm a flat 5% default. Or is it per-plan? Or tiered (higher for longer contracts)?
4. **R5 (commission report):** confirm scope — is this per-cashier-only, or should it also include the *worker* commissions from R4 in the same report?
5. **R6 (vehicle lookup):** confirm whether this replaces the customer-first flow or sits alongside it as a shortcut.

---

## Appendix A — Raw English translations (verbatim from `whisper-cli -tr`)

```
═══════ WhatsApp_Audio_2026-06-16_at_19.53.59.wav ═══════
 I'm telling you to mention the time with the date on the job card.

═══════ WhatsApp_Audio_2026-06-16_at_19.54.54.wav ═══════
 When you create an item, you have to keep an AMC discount on it. You have
 to keep the AMC discount 3% before the house. So that it doesn't go to
 everyone. But the maximum is 90%, which is 3% higher than the normal
 discount. So this is the normal discount, and the other one is the AMC
 discount. That's it.

═══════ WhatsApp_Audio_2026-06-16_at_19.56.58.wav ═══════
 If you want to give a job to a worker, it is a little difficult. Normally,
 you have to look at the total revenue in your dashboard. So, it is
 convenient to go to the workers and see.

═══════ WhatsApp_Audio_2026-06-16_at_19.57.41.wav ═══════
 When the worker is assigned, the person who is washing is also assigned.
 And then the mechanic is also assigned. Because the milk and the mechanic
 are with the car. So the money for the two people goes separately. The
 money for washing goes to the washing boy. And the money goes to the
 mechanic.

═══════ WhatsApp_Audio_2026-06-16_at_19.58.01.wav ═══════
 There is another commission in the case of the MC. If you go to the MC,
 you will see that the MC is assigned after the name is assigned.

═══════ WhatsApp_Audio_2026-06-16_at_19.59.11.wav ═══════
 I have made a job card for an old customer. When they give me the car
 number, I can see the details of the car. It is a good system.
```

## Appendix B — Transcription methodology

- Model: `ggml-medium.bin` (~1.5 GB), 24-layer multilingual Whisper, via `whisper.cpp` 1.8.6.
- Conversion: `ffmpeg -ar 16000 -ac 1 -c:a pcm_s16le` (16 kHz mono PCM).
- Flags: `-l bn -tr -t 8 -bs 5 -bo 5 --no-fallback` (Bengali source language, translate to English, 8 threads, beam search width 5, best-of 5, no temperature fallback).
- The Bengali-native transcription pass produced mostly hallucinations (the language is heavily code-switched with English business terms); the English translation pass was usable and is what's quoted above. If you need the original Bengali audio for clarification, the `.opus` files are still in `~/Downloads/`.
