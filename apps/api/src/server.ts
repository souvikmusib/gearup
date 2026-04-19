import { initSentry } from './config/sentry';
initSentry();

import app from './app';
import { env } from './config/env';
import { logger } from './common/logger';
import { startCronJobs } from './jobs';

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 GearUp API running on port ${env.PORT} [${env.NODE_ENV}]`);
  if (env.CRON_ENABLED) startCronJobs();
});

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
