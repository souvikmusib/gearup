import { prisma } from '@gearup/db';

const MAX_REMINDERS = 3;

export async function readyForPickupReminder() {
  const jobs = await prisma.jobCard.findMany({
    where: { status: 'READY_FOR_DELIVERY' },
    include: { customer: true },
  });

  for (const jc of jobs) {
    const sentCount = await prisma.notification.count({
      where: { eventType: { startsWith: 'READY_FOR_PICKUP' }, relatedEntityId: jc.id },
    });
    if (sentCount >= MAX_REMINDERS) continue;

    const lastSent = await prisma.notification.findFirst({
      where: { eventType: { startsWith: 'READY_FOR_PICKUP' }, relatedEntityId: jc.id },
      orderBy: { createdAt: 'desc' },
    });
    if (lastSent && Date.now() - lastSent.createdAt.getTime() < 24 * 60 * 60_000) continue;

    await prisma.notification.create({
      data: {
        channel: 'WHATSAPP', eventType: `READY_FOR_PICKUP:${jc.id}:${sentCount + 1}`, templateKey: 'ready_for_pickup',
        recipientPhone: jc.customer.phoneNumber, payloadJson: { customerName: jc.customer.fullName, jobCardNumber: jc.jobCardNumber },
        relatedEntityType: 'JobCard', relatedEntityId: jc.id,
      },
    });
  }
}
