---
adr-number: 0001
title: HSN and GST rate system
status: Accepted
decision-date: 2026-06-26
deciders: Sagnik Mitra, Arnab
verified-against: dfb9bec098b598ecddefb1b3324ec18d882a1782
---

# ADR-0001: HSN and GST rate system

- **Status:** Accepted
- **Date:** 2026-06-26
- **Deciders:** Sagnik Mitra, Arnab
- **Verified against:** `dfb9bec098b598ecddefb1b3324ec18d882a1782`

## Context

GST invoicing in India requires a Harmonized System of Nomenclature (HSN) code, or an SAC code for services, on every invoice line item. Rates vary by HSN and fall into the standard bands of 0, 5, 12, 18 and 28 percent. The shop floor cuts dozens of invoices a day and typing an HSN and matching rate per line by hand is both error-prone and slow. Wrong rates on filed invoices are a compliance risk, not a cosmetic one.

Before this decision the invoice form asked the operator to enter a tax rate as a free number. Two operators would enter two different rates for the same part. There was no single place to update a rate when the government changed it. There was also no way to bill a non-GST customer cleanly, because rate zero was indistinguishable from a mistake.

## Decision

Introduce a first-class HSN and rate system with three moving parts.

1. **`HsnRate` table** keyed by `hsnCode`, holding the current GST rate. Admin surface at `/admin/hsn-rates` lets a superadmin add or update a row. This table is the single source of truth for the number that appears on the invoice.

2. **Resolver in `apps/web/src/lib/hsn-rate.ts`** exposing `resolveHsnCode`, `getGstRate` and the combined `resolveHsnAndRate`. All rates are loaded once and cached in-process for 60 seconds. The cache can be invalidated explicitly via `invalidateHsnRateCache` after an admin write.

3. **`showGst` toggle per invoice**. Non-GST invoices set `showGst=false` and every line resolves to `taxRate=0` regardless of HSN, so a non-GST bill is unambiguous.

Resolution rules for the HSN code itself:

- **`LABOR`** and other service lines default to SAC `998714` (motor vehicle repair services).
- **`CUSTOM_CHARGE`** defaults to `87141090` (motor vehicle parts, generic).
- **`PART`** reads `InventoryItem.hsnCode` when present; if the linked item has none, falls back to the generic parts HSN.
- **`DISCOUNT_ADJUSTMENT`** carries no HSN and no tax.
- The operator can override the resolved HSN on any line.

Rate lookup after the HSN is fixed:

- No HSN means 0 percent tax. This is the deliberate non-GST path.
- HSN present but absent from the `HsnRate` table falls back to 18 percent. This is a safe compliance default, chosen over throwing, so the invoice can still be cut and the missing rate row can be added later.
- HSN present in the table uses the stored rate.

## Consequences

**Positive.**

- One place to maintain rates. A rate change is a single admin update, not a codebase edit.
- Operators do not touch tax numbers on the happy path. The line item form pre-fills the resolved rate.
- Non-GST invoices are a first-class state, not a workaround.
- The default HSN per line type keeps counter-sale flow fast, because most parts do not have a per-item HSN yet.

**Negative.**

- The 60-second cache means a rate change takes up to 60 seconds to be seen by every serverless instance. Acceptable for statutory rates that change on the order of quarters.
- The 18 percent unknown-HSN fallback can silently over-collect tax if a real HSN is missing from the table. The mitigation is to surface unknown HSNs in the admin dashboard so they get added.
- `resolveHsnAndRate` performs a database read when the line is a `PART` and the HSN is not explicitly provided. Calling this inside a Prisma `$transaction` on Vercel serverless is what pushed transactions past the default 5-second timeout and triggered the P2028 family. That fallout is recorded in ADR-0003.

## References

- `apps/web/src/lib/hsn-rate.ts`, resolver, cache, defaults.
- `apps/web/prisma/schema.prisma`, `HsnRate` model.
- Commit `0768396` (2026-06-26), feat: add HSN code to inventory + per-invoice GST toggle.
- PR #53, feature/hsn-gst-invoice.
- PR #56 (commit `2d59b6b`), invoice PDF label pass.
- PR #57 (commit `1f0e636`), HSN/GST rates surface, dropdown, unknown-HSN default to 18 percent, admin page.
- ADR-0003, transaction timeout convention (downstream fallout from calling the resolver inside a transaction).
