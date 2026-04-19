export const TEMPLATES = [
  {
    templateKey: "service_request_created",
    channel: "email",
    eventType: "service_request_created",
    subject: "Service Request Created",
    messageBody: "Your service request {{requestId}} has been created.",
  },
  {
    templateKey: "appointment_confirmed",
    channel: "email",
    eventType: "appointment_confirmed",
    subject: "Appointment Confirmed",
    messageBody: "Your appointment on {{date}} at {{time}} is confirmed.",
  },
  {
    templateKey: "appointment_reminder_24h",
    channel: "email",
    eventType: "appointment_reminder_24h",
    subject: "Appointment Reminder",
    messageBody: "Reminder: your appointment is tomorrow at {{time}}.",
  },
  {
    templateKey: "ready_for_pickup",
    channel: "sms",
    eventType: "ready_for_pickup",
    subject: "Ready for Pickup",
    messageBody: "Your vehicle is ready for pickup.",
  },
  {
    templateKey: "invoice_generated",
    channel: "email",
    eventType: "invoice_generated",
    subject: "Invoice Generated",
    messageBody: "Invoice {{invoiceId}} for {{amount}} has been generated.",
  },
  {
    templateKey: "unpaid_invoice_reminder",
    channel: "email",
    eventType: "unpaid_invoice_reminder",
    subject: "Payment Reminder",
    messageBody: "Invoice {{invoiceId}} is unpaid. Please remit payment.",
  },
];
