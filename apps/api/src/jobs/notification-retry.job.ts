import { prisma } from '@gearup/db';
import { MAX_NOTIFICATION_RETRIES, NOTIFICATION_RETRY_BACKOFF_BASE_MS } from '../config/constants';
import { logger } from '../common/logger';

export async function notificationRetry() {
  const failed = await prisma.notification.findMany({
    where: { sendStatus: 'FAILED', retryCount: { lt: MAX_NOTIFICATION_RETRIES } },
    take: 50,
  });

  for (const notif of failed) {
    const backoff = NOTIFICATION_RETRY_BACKOFF_BASE_MS * Math.pow(2, notif.retryCount);
    const nextRetry = new Date(notif.createdAt.getTime() + backoff);
    if (new Date() < nextRetry) continue;

    try {
      // Re-queue for processing
      await prisma.notification.update({
        where: { id: notif.id },
        data: { sendStatus: 'QUEUED', retryCount: { increment: 1 } },
      });
    } catch (err) {
      logger.error({ err, notificationId: notif.id }, 'Failed to re-queue notification');
    }
  }

  // Dead-letter notifications that exceeded max retries
  await prisma.notification.updateMany({
    where: { sendStatus: 'FAILED', retryCount: { gte: MAX_NOTIFICATION_RETRIES } },
    data: { sendStatus: 'DEAD_LETTER' },
  });
}
