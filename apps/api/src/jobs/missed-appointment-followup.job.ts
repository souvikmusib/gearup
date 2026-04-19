import { prisma } from '@gearup/db';

const GRACE_PERIOD_MINUTES = 30;

export async function missedAppointmentFollowup() {
  const cutoff = new Date(Date.now() - GRACE_PERIOD_MINUTES * 60_000);

  const missed = await prisma.appointment.findMany({
    where: { status: 'CONFIRMED', slotEnd: { lt: cutoff } },
    include: { customer: true },
  });

  for (const appt of missed) {
    const dedupeKey = `APPOINTMENT_NO_SHOW_FOLLOWUP:${appt.id}`;
    const exists = await prisma.notification.findFirst({ where: { eventType: dedupeKey } });
    if (exists) continue;

    await prisma.appointment.update({ where: { id: appt.id }, data: { status: 'NO_SHOW' } });
    await prisma.notification.create({
      data: {
        channel: 'WHATSAPP', eventType: dedupeKey, templateKey: 'appointment_no_show_followup',
        recipientPhone: appt.customer.phoneNumber, payloadJson: { customerName: appt.customer.fullName },
        relatedEntityType: 'Appointment', relatedEntityId: appt.id,
      },
    });
  }
}
