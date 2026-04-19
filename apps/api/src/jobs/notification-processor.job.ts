import { prisma } from '@gearup/db';
import { logger } from '../common/logger';

export async function notificationProcessor() {
  const notifications = await prisma.notification.findMany({
    where: { sendStatus: 'QUEUED' },
    take: 50,
  });

  for (const notif of notifications) {
    try {
      const template = await prisma.notificationTemplate.findUnique({ where: { templateKey: notif.templateKey } });
      if (!template || !template.isActive) {
        await prisma.notification.update({ where: { id: notif.id }, data: { sendStatus: 'FAILED', errorMessage: 'Template not found or inactive' } });
        continue;
      }

      // Render template with {{var}} replacement
      const vars = (notif.payloadJson as Record<string, string>) ?? {};
      const rendered = template.messageBody.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
      const subject = template.subject?.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');

      // Dispatch to channel provider
      if (notif.channel === 'WHATSAPP') {
        // TODO: call WhatsApp provider
        logger.info({ notificationId: notif.id, to: notif.recipientPhone }, 'WhatsApp send stub');
      } else if (notif.channel === 'EMAIL') {
        // TODO: call email provider
        logger.info({ notificationId: notif.id, to: notif.recipientEmail, subject }, 'Email send stub');
      }

      await prisma.notification.update({ where: { id: notif.id }, data: { sendStatus: 'SENT', sentAt: new Date() } });
    } catch (err) {
      logger.error({ err, notificationId: notif.id }, 'Failed to process notification');
      await prisma.notification.update({ where: { id: notif.id }, data: { sendStatus: 'FAILED', errorMessage: String(err) } });
    }
  }
}
