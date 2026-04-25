import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function buildUrl() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const isSupabasePooler = parsed.hostname.includes('pooler.supabase.com');
    if (isSupabasePooler) {
      if (!parsed.searchParams.has('pgbouncer')) parsed.searchParams.set('pgbouncer', 'true');
      if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', '3');
      if (!parsed.searchParams.has('pool_timeout')) parsed.searchParams.set('pool_timeout', '10');
    }
    return parsed.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return url + sep + 'pgbouncer=true&connection_limit=3&pool_timeout=10';
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasourceUrl: buildUrl(),
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
