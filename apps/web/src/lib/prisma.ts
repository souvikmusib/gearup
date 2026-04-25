import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function withServerlessPoolLimits(databaseUrl?: string) {
  if (!databaseUrl || process.env.PRISMA_DISABLE_URL_TUNING === '1') return databaseUrl;

  try {
    const url = new URL(databaseUrl);
    const isSupabasePooler = url.hostname.includes('pooler.supabase.com');
    if (!isSupabasePooler) return databaseUrl;

    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '20');
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
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
