import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import type { ActorType } from '@gearup/types';

interface LogActivityParams {
  entityType: string;
  entityId?: string;
  action: string;
  previousValue?: unknown;
  newValue?: unknown;
  actorType: ActorType;
  actorId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  /**
   * Optional Prisma transaction client. When provided, the log row is written
   * inside the caller's transaction so it rolls back atomically with the
   * primary mutation. When omitted, the root `prisma` client is used and the
   * write is fire-and-forget.
   */
  tx?: Prisma.TransactionClient;
}

/**
 * Safely serialize an arbitrary value to a Prisma-Json-compatible object.
 * Handles Decimal, BigInt, and Date which JSON.stringify cannot natively
 * encode (Decimal/BigInt throw, Date becomes a string).
 */
function safeJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, v) => {
        if (typeof v === 'bigint') return v.toString();
        // Prisma Decimal exposes toString(); duck-type to avoid importing it.
        if (
          v &&
          typeof v === 'object' &&
          typeof (v as { toFixed?: unknown }).toFixed === 'function' &&
          typeof (v as { toString: () => string }).toString === 'function' &&
          // Decimal.js / Prisma Decimal has a `d` array internal; cheap check.
          'd' in (v as object)
        ) {
          return (v as { toString: () => string }).toString();
        }
        return v;
      }),
    ) as Prisma.InputJsonValue;
  } catch (err) {
    console.error('[activity-logger] failed to serialize value:', err);
    return undefined;
  }
}

/**
 * Activity logger.
 *
 * - When `params.tx` is provided, the write is awaited inside the caller's
 *   transaction so it commits/rolls back atomically.
 * - When `params.tx` is omitted, the write is fire-and-forget on the root
 *   prisma client. Errors are caught and logged so a logging failure never
 *   crashes a route handler. On serverless (Vercel) the lambda may freeze
 *   before the promise resolves; callers that need durability should pass
 *   `tx` or await the returned promise.
 *
 * Returns the underlying promise so callers can await if they want
 * delivery guarantees.
 */
export function logActivity(params: LogActivityParams): Promise<unknown> {
  let data: Prisma.ActivityLogUncheckedCreateInput;
  try {
    data = {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      previousValueJson: safeJson(params.previousValue),
      newValueJson: safeJson(params.newValue),
      actorType: params.actorType,
      actorId: params.actorId,
      requestId: params.requestId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    };
  } catch (err) {
    console.error('[activity-logger] failed to build payload:', err);
    return Promise.resolve();
  }

  const client = params.tx ?? prisma;
  const promise = client.activityLog.create({ data });

  if (params.tx) {
    // Inside a transaction the caller is awaiting; surface any error so the
    // tx can roll back instead of silently dropping the audit entry.
    return promise;
  }

  // Fire-and-forget: never crash the route on a logging failure.
  return promise.catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[activity-logger] activity log failed:', msg);
  });
}
