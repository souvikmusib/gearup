import { customAlphabet } from 'nanoid';
import { REFERENCE_ID_PREFIX, JOB_CARD_PREFIX, INVOICE_PREFIX } from './constants';

const alphanumeric = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 12);

export const generateReferenceId = () => `${REFERENCE_ID_PREFIX}-${alphanumeric()}`;
export const generateJobCardNumber = () => `${JOB_CARD_PREFIX}-${alphanumeric()}`;
export const generateInvoiceNumber = () => `${INVOICE_PREFIX}-${alphanumeric()}`;
export const generateAppointmentRef = () => `APT-${alphanumeric()}`;
export const generateWorkerCode = () => `WRK-${customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6)()}`;
export const generateAmcContractNumber = () => `AMC-${alphanumeric()}`;

/**
 * Retry helper for create operations that may collide on a unique generated ID.
 * Re-runs `fn(generateId())` up to `attempts` times when the Prisma error indicates
 * a unique-constraint violation (P2002) on `uniqueTarget`.
 *
 * Usage:
 *   await withIdCollisionRetry(generateInvoiceNumber, (n) =>
 *     prisma.invoice.create({ data: { ...rest, invoiceNumber: n } }),
 *     'invoiceNumber'
 *   );
 */
export async function withIdCollisionRetry<T>(
  generateId: () => string,
  fn: (id: string) => Promise<T>,
  uniqueTarget: string,
  attempts = 3
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(generateId());
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
