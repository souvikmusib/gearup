---
title: Architecture Decision Records
verified-against: dfb9bec098b598ecddefb1b3324ec18d882a1782
---

# Architecture Decision Records

## Purpose

Record accepted architectural decisions and their consequences so the reasoning behind the codebase can be recovered without archaeology. Each ADR is a self-contained note pinned to the commit that introduced or crystallised the decision.

## Numbering convention

ADRs are numbered sequentially with a four-digit zero-padded prefix: `ADR-XXXX`. Once an ADR is committed, its number is permanent. New decisions take the next unused number even if they extend or supersede an earlier ADR.

## Status vocabulary

- **Proposed**: under discussion, not yet in force.
- **Accepted**: in force. The system is expected to conform to it.
- **Superseded**: an accepted ADR that a later ADR has replaced. The superseding ADR is named in the header.
- **Deprecated**: no longer followed but not replaced by a specific ADR; kept for historical context.

An accepted ADR can be extended by later work without being superseded, as long as the core decision still holds. Extensions are recorded in the References section.

## Index

| ADR | Title | Status | Accepted |
|-----|-------|--------|----------|
| [ADR-0001](0001-hsn-and-gst-rate-system.md) | HSN and GST rate system | Accepted | 2026-06-26 |
| [ADR-0002](0002-amc-rework-race-safe-decrement.md) | AMC rework and race-safe decrement | Accepted | 2026-06-13 |
| [ADR-0003](0003-transaction-timeout-convention.md) | Transaction timeout convention (30s + 10s maxWait) | Accepted | 2026-07-01 |
