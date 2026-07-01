import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = 'INTERNAL_ERROR',
    public details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super(404, id ? `${entity} '${id}' not found` : `${entity} not found`, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, string[]>) {
    super(400, message, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

const UNIQUE_TARGET_LABELS: Record<string, string> = {
  email: 'email',
  phone: 'phone number',
  username: 'username',
  slug: 'slug',
  code: 'code',
  sku: 'SKU',
  registration: 'registration number',
  vehicle_number: 'vehicle number',
  vehicleNumber: 'vehicle number',
  invoice_number: 'invoice number',
  invoiceNumber: 'invoice number',
};

function humanizeUniqueTarget(targets: string[]): string | null {
  if (!targets.length) return null;
  const mapped = targets
    .map((t) => UNIQUE_TARGET_LABELS[t])
    .filter((v): v is string => Boolean(v));
  if (mapped.length === targets.length) return mapped.join(' and ');
  return null;
}

export function handleApiError(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    (error as { digest?: unknown }).digest === 'DYNAMIC_SERVER_USAGE'
  ) {
    throw error;
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message, details: error.details } },
      { status: error.statusCode },
    );
  }
  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_root';
      (details[key] ??= []).push(issue.message);
    }
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details } },
      { status: 400 },
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const rawTargets = Array.isArray(error.meta?.target) ? (error.meta!.target as string[]) : [];
        const label = humanizeUniqueTarget(rawTargets);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'CONFLICT',
              message: label
                ? `A record with this ${label} already exists`
                : 'A record with these values already exists',
            },
          },
          { status: 409 },
        );
      }
      case 'P2025': {
        // A JWT can outlive its AdminUser row (e.g. after a DB restore the
        // token's `sub` no longer exists). Writes that `connect` the session
        // admin then fail here — surface that as a session problem, not a 404.
        const cause = String(error.meta?.cause ?? error.message ?? '');
        if (/AdminUser/i.test(cause)) {
          return NextResponse.json(
            { success: false, error: { code: 'SESSION_STALE', message: 'Your session refers to an admin account that no longer exists. Please log out and log in again.' } },
            { status: 401 },
          );
        }
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } },
          { status: 404 },
        );
      }
      case 'P2003': {
        const field = (error.meta?.field_name as string) || 'unknown';
        console.error('[Prisma P2003] FK violation on field:', field);
        // Same stale-session shape via raw FK columns (actorId, createdByAdminId,
        // receivedByAdminId, performedByAdminId, confirmedByAdminId, ...).
        if (/admin|actor/i.test(field)) {
          return NextResponse.json(
            { success: false, error: { code: 'SESSION_STALE', message: 'Your session refers to an admin account that no longer exists. Please log out and log in again.' } },
            { status: 401 },
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid reference: related record does not exist',
            },
          },
          { status: 400 },
        );
      }
    }
  }
  console.error('Unhandled API error:', error);
  // Expose the underlying error message + stack when NEXT_PUBLIC_EXPOSE_ERRORS=1 (opt-in
  // diagnostic mode for triaging a live 500 without needing external log access). Never
  // exposes anything sensitive because our errors don't carry PII/secrets by convention.
  const exposeDetails = process.env.NEXT_PUBLIC_EXPOSE_ERRORS === '1' || process.env.NODE_ENV !== 'production';
  const err = error as { message?: unknown; code?: unknown; meta?: unknown; stack?: unknown; name?: unknown };
  const detail = exposeDetails
    ? {
        rawName: typeof err?.name === 'string' ? err.name : undefined,
        rawMessage: typeof err?.message === 'string' ? err.message : undefined,
        rawCode: typeof err?.code === 'string' || typeof err?.code === 'number' ? err.code : undefined,
        rawMeta: err?.meta && typeof err.meta === 'object' ? err.meta : undefined,
        rawStack: typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 5).join('\n') : undefined,
      }
    : undefined;
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', ...(detail ? { detail } : {}) } },
    { status: 500 },
  );
}
