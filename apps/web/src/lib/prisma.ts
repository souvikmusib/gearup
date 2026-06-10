import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function withServerlessPoolLimits(databaseUrl?: string) {
  if (!databaseUrl || process.env.PRISMA_DISABLE_URL_TUNING === '1') return databaseUrl;

  try {
    const url = new URL(databaseUrl);
    const isSupabasePooler = url.hostname.includes('pooler.supabase.com');
    const hasPgbouncerFlag = url.searchParams.get('pgbouncer') === 'true';
    const forceTuning = process.env.PRISMA_FORCE_POOL_TUNING === '1';
    const shouldTune = isSupabasePooler || hasPgbouncerFlag || forceTuning;
    if (!shouldTune) {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[prisma] serverless pool tuning: OFF (host=%s)', url.hostname);
      }
      return databaseUrl;
    }

    if (!url.searchParams.has('pgbouncer')) url.searchParams.set('pgbouncer', 'true');
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '20');
    if (process.env.NODE_ENV !== 'production') {
      const reason = isSupabasePooler
        ? 'supabase-pooler'
        : hasPgbouncerFlag
          ? 'pgbouncer-flag'
          : 'force-env';
      console.info('[prisma] serverless pool tuning: ON (host=%s, reason=%s)', url.hostname, reason);
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

process.env.DATABASE_URL = withServerlessPoolLimits(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    transactionOptions: { maxWait: 10000, timeout: 15000 },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
