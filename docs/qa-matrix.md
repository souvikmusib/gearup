# GearUp Servicing — QA Acceptance Matrix

## P0 — Must Pass Before Go-Live

| # | Area | Scenario | Expected Result |
|---|------|----------|-----------------|
| 1 | Public Booking | Valid guest service request | Request created, reference ID returned, notification queued |
| 2 | Public Booking | Invalid phone number | Validation error, submission blocked |
| 3 | Public Tracking | Valid reference + phone | Public-safe status timeline returned |
| 4 | Public Tracking | Invalid combo | Generic error, no data leakage |
| 5 | Public Tracking | Enumeration attempt | Rate limiting / no information disclosure |
| 6 | Admin Auth | Valid login | JWT issued, redirect to dashboard |
| 7 | Admin Auth | Wrong password 5x | Account locked for 30 minutes |
| 8 | Admin Auth | Expired token | 401 returned, redirect to login |
| 9 | Service Requests | Admin updates status | Status saved, activity log created |
| 10 | Appointments | Confirm appointment | Status → CONFIRMED, notification queued |
| 11 | Appointments | Reschedule | Old slot released, new slot booked, history preserved |
| 12 | Appointments | Check-in | Status → CHECKED_IN |
| 13 | Job Cards | Create from appointment | Linked job card created, SR status → CONVERTED_TO_JOB |
| 14 | Job Cards | Assign worker | Assignment visible in worker view |
| 15 | Job Cards | Update status | Timeline and activity logs updated |
| 16 | Inventory | Reserve stock | Reserved qty updated, cannot exceed available stock |
| 17 | Inventory | Consume stock | Stock reduced, movement logged |
| 18 | Invoices | Create draft | Line items calculated, totals correct |
| 19 | Invoices | Finalize | Invoice locked, status → FINALIZED |
| 20 | Payments | Record partial payment | Amount due updates, status → PARTIALLY_PAID |
| 21 | Payments | Record full payment | Amount due = 0, status → PAID |
| 22 | Notifications | WhatsApp send success | Log status → SENT |
| 23 | Notifications | Send failure + retry | Retry pipeline works, dead-letter after 3 |
| 24 | Logs | Critical admin action | Activity log entry exists with actor + entity |
| 25 | Sentry | Backend exception | Captured in Sentry with context |
| 26 | Sentry | Frontend error | Captured in Sentry |
| 27 | Deployment | Vercel → Render | CORS works, auth works, data flows |
| 28 | RBAC | Worker accesses admin-only route | 403 Forbidden |

## P1 — Should Pass

| # | Area | Scenario | Expected Result |
|---|------|----------|-----------------|
| 29 | Public Booking | Slot unavailable | Alternate slots suggested |
| 30 | Appointments | Missed appointment | No-show follow-up triggered by cron |
| 31 | Inventory | Low stock threshold | Visible in dashboard and low-stock report |
| 32 | Reports | Revenue report | Correct aggregated values |
| 33 | Expenses | Create expense | Visible in expense report |
| 34 | Cron | Duplicate runner | Idempotent — no double sends |

## Edge Cases

| # | Scenario | Expected |
|---|----------|----------|
| 35 | Duplicate customer (same phone) | Upsert — no duplicate created |
| 36 | Same phone, multiple vehicles | All vehicles linked to same customer |
| 37 | Walk-in without appointment | Job card created directly |
| 38 | Worker leave conflict | Cannot assign worker on leave |
| 39 | Invoice overpayment | Amount due cannot go below 0 |
| 40 | Stale session | Logout on 401, redirect to login |
| 41 | Failed storage upload | Error captured in Sentry, user notified |
| 42 | Notification deduplication | Same event+entity not sent twice |
