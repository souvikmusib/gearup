import { CronJob } from 'cron';
import { logger } from '../common/logger';
import { appointmentReminders } from './appointment-reminders.job';
import { missedAppointmentFollowup } from './missed-appointment-followup.job';
import { readyForPickupReminder } from './ready-for-pickup-reminder.job';
import { invoiceReminder } from './invoice-reminder.job';
import { notificationRetry } from './notification-retry.job';
import { dailySummary } from './daily-summary.job';
import { notificationProcessor } from './notification-processor.job';

function safeRun(name: string, fn: () => Promise<void>) {
  return async () => {
    try {
      logger.info(`[CRON] Running ${name}`);
      await fn();
      logger.info(`[CRON] Completed ${name}`);
    } catch (err) {
      logger.error({ err }, `[CRON] Failed ${name}`);
    }
  };
}

export function startCronJobs() {
  new CronJob('*/15 * * * *', safeRun('appointment-reminders', appointmentReminders), null, true);
  new CronJob('*/30 * * * *', safeRun('missed-appointment-followup', missedAppointmentFollowup), null, true);
  new CronJob('0 10 * * *', safeRun('ready-for-pickup-reminder', readyForPickupReminder), null, true);
  new CronJob('0 11 * * *', safeRun('invoice-reminder', invoiceReminder), null, true);
  new CronJob('*/10 * * * *', safeRun('notification-retry', notificationRetry), null, true);
  new CronJob('0 8 * * *', safeRun('daily-summary', dailySummary), null, true);
  new CronJob('*/2 * * * *', safeRun('notification-processor', notificationProcessor), null, true);
  logger.info('[CRON] All jobs scheduled');
}
