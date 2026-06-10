import { createHash, randomBytes } from 'crypto';

/**
 * Minimum length for a public estimate token. We generate 32 random bytes encoded
 * as base64url (43 chars), so any token shorter than this is obviously malformed
 * and should be rejected with a uniform 404 (do not leak which class of failure).
 */
export const MIN_TOKEN_LENGTH = 32;

/**
 * Default lifetime for a freshly minted public estimate link.
 */
export const ESTIMATE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate a fresh URL-safe bearer token for a public estimate link.
 * The token IS the secret — never expose it through admin list endpoints.
 */
export function generateEstimateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Default expiry timestamp for a newly minted estimate token (now + 7 days).
 */
export function defaultEstimateTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + ESTIMATE_TOKEN_TTL_MS);
}

/**
 * Deterministic hash of the customer-visible estimate fields.
 *
 * Recompute and persist on every estimate price/notes mutation; the public
 * approval endpoint pins the revision the customer saw so a concurrent admin
 * price edit cannot be silently approved.
 */
export function computeEstimateRevision(jc: {
  estimatedPartsCost: unknown;
  estimatedLaborCost: unknown;
  estimatedOtherCost?: unknown;
  estimatedTotal: unknown;
  customerVisibleNotes: string | null;
  estimateNotes: string | null;
}): string {
  const payload = JSON.stringify({
    p: Number(jc.estimatedPartsCost),
    l: Number(jc.estimatedLaborCost),
    o: Number(jc.estimatedOtherCost ?? 0),
    t: Number(jc.estimatedTotal),
    cn: jc.customerVisibleNotes ?? '',
    en: jc.estimateNotes ?? '',
  });
  return createHash('sha256').update(payload).digest('base64url').slice(0, 32);
}
