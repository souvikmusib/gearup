# GearUp Servicing — Notifications

## Channels

- **WHATSAPP** — Primary customer communication
- **EMAIL** — Invoices, summaries, fallback

## Event Types

| Event | Channel | Template Key | Variables |
|-------|---------|-------------|-----------|
| SERVICE_REQUEST_CREATED | WHATSAPP | service_request_created | customerName, referenceId, trackUrl |
| SERVICE_REQUEST_UNDER_REVIEW | WHATSAPP | service_request_under_review | customerName, referenceId |
| APPOINTMENT_REQUEST_RECEIVED | WHATSAPP | appointment_request_received | customerName, referenceId |
| APPOINTMENT_CONFIRMED | WHATSAPP | appointment_confirmed | customerName, appointmentDate, appointmentTime, garageName |
| APPOINTMENT_RESCHEDULED | WHATSAPP | appointment_rescheduled | customerName, appointmentDate, appointmentTime |
| APPOINTMENT_CANCELLED | WHATSAPP | appointment_cancelled | customerName, referenceId |
| APPOINTMENT_REMINDER_T_MINUS_24H | WHATSAPP | appointment_reminder_24h | customerName, appointmentDate, appointmentTime |
| APPOINTMENT_REMINDER_T_MINUS_2H | WHATSAPP | appointment_reminder_2h | customerName, appointmentTime |
| APPOINTMENT_NO_SHOW_FOLLOWUP | WHATSAPP | appointment_no_show_followup | customerName, supportPhone |
| JOB_CARD_CREATED | WHATSAPP | job_card_created | customerName, jobCardNumber |
| ESTIMATE_PREPARED | WHATSAPP | estimate_prepared | customerName, jobCardNumber, estimatedTotal |
| ESTIMATE_APPROVAL_REQUESTED | WHATSAPP, EMAIL | estimate_approval_requested | customerName, jobCardNumber, approvalUrl |
| ESTIMATE_APPROVED | WHATSAPP | estimate_approved | customerName, jobCardNumber |
| ESTIMATE_REJECTED | WHATSAPP | estimate_rejected | customerName, jobCardNumber |
| PARTS_DELAYED | WHATSAPP | parts_delayed | customerName, jobCardNumber |
| WORK_STARTED | WHATSAPP | work_started | customerName, jobCardNumber |
| WORK_IN_PROGRESS_UPDATE | WHATSAPP | work_in_progress_update | customerName, jobCardNumber |
| READY_FOR_PICKUP | WHATSAPP | ready_for_pickup | customerName, jobCardNumber, garageName |
| INVOICE_GENERATED | EMAIL | invoice_generated | customerName, invoiceNumber, grandTotal |
| PARTIAL_PAYMENT_RECEIVED | WHATSAPP | partial_payment_received | customerName, amountPaid, amountDue |
| FULL_PAYMENT_RECEIVED | WHATSAPP | full_payment_received | customerName, invoiceNumber |
| UNPAID_INVOICE_REMINDER | EMAIL | unpaid_invoice_reminder | customerName, invoiceNumber, amountDue |
| POST_SERVICE_FEEDBACK_REQUEST | WHATSAPP | post_service_feedback | customerName, garageName |

## Template Format

Templates use `{{variableName}}` interpolation:

```
Hi {{customerName}}, your service request {{referenceId}} has been received.
Track your request at {{trackUrl}}.
```

## Delivery Pipeline

1. Event triggers → Notification record created with status `QUEUED`
2. Cron job picks up `QUEUED` notifications
3. Renders template with variables
4. Sends via provider (WhatsApp API / Email API)
5. Updates status to `SENT` or `FAILED`
6. Failed notifications retried with exponential backoff
7. After 3 retries → `DEAD_LETTER`

## Deduplication

Each notification uses a dedupe key combining event type + entity ID to prevent duplicate sends.
