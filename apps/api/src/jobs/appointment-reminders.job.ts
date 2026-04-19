import { prisma } from '@gearup/db';
import { NOTIFICATION_EVENTS } from '@gearup/notifications';

export async function appointmentReminders() {
  const now = new Date();

  // 24h window: 23h45m to 24h15m from now
  const win24Start = new Date(now.getTime() + 23 * 60 * 60_000 + 45 * 60_000);
  const win24End = new Date(now.getTime() + 24 * 60 * 60_000 + 15 * 60_000);

  // 2h window: 1h45m to 2h15m from now
  const win2Start = new Date(now.getTime() + 1 * 60 * 60_000 + 45 * 60_000);
  const win2End = new Date(now.getTime() + 2 * 60 * 60_000 + 15 * 60_000);

  const appointments24 = await prisma.appointment.findMany({
    where: { status: 'CONFIRMED', slotStart: { gte: win24Start, lte: win24End } },
    include: { customer: true },
  });

  for (const appt of appointments24) {
    const dedupeKey = `${NOTIFICATION_EVENTS.APPOINTMENT_REMINDER_T_MINUS_24H}:${appt.id}`;
    const exists = await prisma.notification.findFirst({ where: { eventType: dedupeKey } });
    if (exists) continue;
    await prisma.notification.create({
      data: {
        channel: 'WHATSAPP', eventType: dedupeKey, templateKey: 'appointment_reminder_24h',
        recipientPhone: appt.customer.phoneNumber, payloadJson: { customerName: appt.customer.fullName, appointmentDate: appt.appointmentDate.toISOString() },
        relatedEntityType: 'Appointment', relatedEntityId: appt.id,
      },
    });
  }

  const appointments2 = await prisma.appointment.findMany({
    where: { status: 'CONFIRMED', slotStart: { gte: win2Start, lte: win2End } },
    include: { customer: true },
  });

  for (const appt of appointments2) {
    const dedupeKey = `${NOTIFICATION_EVENTS.APPOINTMENT_REMINDER_T_MINUS_2H}:${appt.id}`;
    const exists = await prisma.notification.findFirst({ where: { eventType: dedupeKey } });
    if (exists) continue;
    await prisma.notification.create({
      data: {
        channel: 'WHATSAPP', eventType: dedupeKey, templateKey: 'appointment_reminder_2h',
        recipientPhone: appt.customer.phoneNumber, payloadJson: { customerName: appt.customer.fullName, appointmentDate: appt.appointmentDate.toISOString() },
        relatedEntityType: 'Appointment', relatedEntityId: appt.id,
      },
    });
  }
}
