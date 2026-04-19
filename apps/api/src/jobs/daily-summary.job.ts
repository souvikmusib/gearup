import { prisma } from '@gearup/db';
import { logger } from '../common/logger';

export async function dailySummary() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  const [todayAppts, pendingApprovals, activeJobs, lowStock, unpaidInvoices, yesterdayRevenue] = await Promise.all([
    prisma.appointment.count({ where: { appointmentDate: { gte: today, lt: tomorrow }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } } }),
    prisma.jobCard.count({ where: { approvalStatus: 'PENDING' } }),
    prisma.jobCard.count({ where: { status: { notIn: ['DELIVERED', 'CANCELLED', 'CLOSED'] } } }),
    prisma.inventoryItem.count({ where: { isActive: true, reorderLevel: { not: null } } }).catch(() => 0),
    prisma.invoice.count({ where: { invoiceStatus: 'FINALIZED', paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } } }),
    prisma.payment.aggregate({ where: { paymentDate: { gte: yesterday, lt: today } }, _sum: { amount: true } }),
  ]);

  const summary = {
    todayAppointments: todayAppts,
    pendingApprovals,
    activeJobs,
    lowStockItems: lowStock,
    unpaidInvoices,
    yesterdayRevenue: Number(yesterdayRevenue._sum.amount ?? 0),
  };

  logger.info({ summary }, '[DAILY SUMMARY]');

  // Queue email notification to owner
  await prisma.notification.create({
    data: {
      channel: 'EMAIL', eventType: 'DAILY_SUMMARY', templateKey: 'daily_summary',
      recipientEmail: process.env.OWNER_SUMMARY_EMAIL ?? null,
      payloadJson: summary,
    },
  });
}
