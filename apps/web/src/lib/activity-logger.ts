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
  /**
   * Optional `waitUntil` (e.g. from `next/server`'s `after()` or a Vercel/edge
   * runtime `ctx.waitUntil`). When provided and `tx` is not, the fire-and-forget
   * write is registered with the runtime so the serverless lambda does not
   * freeze before the audit row is committed.
   */
  waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * Report an audit-log write failure. Tries Sentry first (if installed and
 * initialized) and always falls back to console.error so local dev still sees
 * the failure. Never throws — reporting must not crash the caller.
 */
function reportLogFailure(err: unknown, context: Record<string, unknown>): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[activity-logger] activity log failed:', msg, context);
  try {
    // Dynamic require so this module doesn't hard-depend on Sentry being
    // initialized; if @sentry/nextjs isn't wired up the catch swallows it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/nextjs') as {
      captureException?: (e: unknown, hint?: unknown) => void;
    };
    Sentry.captureException?.(err, {
      tags: { component: 'activity-logger' },
      extra: context,
    });
  } catch {
    // Sentry not available — console.error above is the only signal.
  }
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
 * Durability rules:
 * - **Strongest** — pass `params.tx`. The write runs inside the caller's
 *   transaction and rolls back atomically with the primary mutation. Errors
 *   propagate so the whole tx fails (and the business write is never
 *   committed without its audit row).
 * - **Strong** — `await logActivity(...)` without a tx. The route waits for
 *   the audit row before returning; failures are reported to Sentry but the
 *   route still responds 2xx (logging never crashes the handler).
 * - **Best-effort** — pass `params.waitUntil` (from `next/server`'s `after`
 *   or the runtime's `ctx.waitUntil`) without awaiting. The serverless
 *   runtime keeps the lambda alive until the write resolves; failures go to
 *   Sentry.
 * - **Weakest** — don't await and don't pass `waitUntil`. On serverless the
 *   lambda can freeze before the write commits and the audit row is lost.
 *   Only use for low-value entries; high-value mutations should use `tx`.
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
    reportLogFailure(err, {
      stage: 'serialize',
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
    });
    return Promise.resolve();
  }

  const client = params.tx ?? prisma;
  const promise = client.activityLog.create({ data });

  if (params.tx) {
    // Inside a transaction the caller is awaiting; surface any error so the
    // tx can roll back instead of silently dropping the audit entry.
    return promise;
  }

  // Outside a transaction: never crash the route on a logging failure.
  const safePromise = promise.catch((e: unknown) => {
    reportLogFailure(e, {
      stage: 'write',
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actorType: params.actorType,
    });
  });

  // If the caller passed a runtime waitUntil, register the promise so the
  // serverless lambda doesn't freeze before the row commits.
  if (params.waitUntil) {
    try {
      params.waitUntil(safePromise);
    } catch (err) {
      // waitUntil itself can throw if called outside a request scope.
      reportLogFailure(err, { stage: 'waitUntil' });
    }
  }

  return safePromise;
}
