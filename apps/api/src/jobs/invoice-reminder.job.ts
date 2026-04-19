import { prisma } from '@gearup/db';

export async function invoiceReminder() {
  const invoices = await prisma.invoice.findMany({
    where: { invoiceStatus: 'FINALIZED', paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } },
    include: { customer: true },
  });

  for (const inv of invoices) {
    const dedupeKey = `UNPAID_INVOICE_REMINDER:${inv.id}:${new Date().toISOString().slice(0, 10)}`;
    const exists = await prisma.notification.findFirst({ where: { eventType: dedupeKey } });
    if (exists) continue;

    await prisma.notification.create({
      data: {
        channel: 'EMAIL', eventType: dedupeKey, templateKey: 'unpaid_invoice_reminder',
        recipientEmail: inv.customer.email, recipientPhone: inv.customer.phoneNumber,
        payloadJson: { customerName: inv.customer.fullName, invoiceNumber: inv.invoiceNumber, amountDue: String(inv.amountDue) },
        relatedEntityType: 'Invoice', relatedEntityId: inv.id,
      },
    });
  }
}
