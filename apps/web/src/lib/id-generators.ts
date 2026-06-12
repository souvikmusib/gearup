import { customAlphabet } from 'nanoid';
import { prisma } from './prisma';
import { REFERENCE_ID_PREFIX } from './constants';

const alphanumeric = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 12);

// Legacy generators kept for non-sequential IDs
export const generateReferenceId = () => `${REFERENCE_ID_PREFIX}-${alphanumeric()}`;
export const generateAppointmentRef = () => `APT-${alphanumeric()}`;
export const generateAmcContractNumber = () => `AMC-${alphanumeric()}`;

/**
 * Get today's IST date as DDMMYYYY string.
 */
function getISTDateStr(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const d = ist.getUTCDate().toString().padStart(2, '0');
  const m = (ist.getUTCMonth() + 1).toString().padStart(2, '0');
  const y = ist.getUTCFullYear().toString();
  return `${d}${m}${y}`;
}

/**
 * Get today's IST date as YYYY-MM-DD for DB key.
 */
function getISTBusinessDate(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

/**
 * Atomically increment and return the next sequence number for a given
 * document kind on the current IST business day.
 */
async function nextSequence(kind: string, tx?: any): Promise<number> {
  const db = tx || prisma;
  const businessDate = getISTBusinessDate();

  // Upsert with increment — atomic via unique constraint
  const result = await db.documentSequence.upsert({
    where: { kind_businessDate: { kind, businessDate } },
    create: { kind, businessDate, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });

  return result.lastSeq;
}

/**
 * Generate invoice number: INVGDDMMYYYYNNNN
 * Example: INVG1306202600001
 */
export async function generateInvoiceNumber(tx?: any): Promise<string> {
  const seq = await nextSequence('INVOICE', tx);
  const dateStr = getISTDateStr();
  return `INVG${dateStr}${seq.toString().padStart(4, '0')}`;
}

/**
 * Generate job card number: JOBGDDMMYYYYNNNN
 * Example: JOBG1306202600001
 */
export async function generateJobCardNumber(tx?: any): Promise<string> {
  const seq = await nextSequence('JOB_CARD', tx);
  const dateStr = getISTDateStr();
  return `JOBG${dateStr}${seq.toString().padStart(4, '0')}`;
}

/**
 * Generate worker code: WRK-DDMMYYYY-NNNN
 * Example: WRK-13062026-0001
 */
export async function generateWorkerCode(tx?: any): Promise<string> {
  const seq = await nextSequence('WORKER', tx);
  const dateStr = getISTDateStr();
  return `WRK-${dateStr}-${seq.toString().padStart(4, '0')}`;
}

/**
 * Check if a document number uses the legacy random format.
 */
export function isLegacyNumber(num: string): boolean {
  if (!num) return false;
  // New format: INVGDDMMYYYYNNNN or JOBGDDMMYYYYNNNN
  if (/^INVG\d{12,}$/.test(num)) return false;
  if (/^JOBG\d{12,}$/.test(num)) return false;
  if (/^WRK-\d{8}-\d{4}$/.test(num)) return false;
  return true;
}

/**
 * Retry helper for create operations that may collide on a unique generated ID.
 */
export async function withIdCollisionRetry<T>(
  generateId: (() => string) | (() => Promise<string>),
  fn: (id: string) => Promise<T>,
  uniqueTarget: string,
  attempts = 3
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const id = await generateId();
      return await fn(id);
    } catch (err: unknown) {
      const e = err as { code?: string; meta?: { target?: string | string[] } };
      const target = e?.meta?.target;
      const isCollision =
        e?.code === 'P2002' &&
        (Array.isArray(target) ? target.includes(uniqueTarget) : target === uniqueTarget);
      if (!isCollision) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
