import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { ZodError, z } from 'zod';
import {
  handleApiError,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../../lib/errors';

async function unwrap(res: ReturnType<typeof handleApiError>) {
  return { status: res.status, body: await res.json() };
}

function prismaErr(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: 'test',
    meta,
  });
}

describe('handleApiError — AppError subclasses', () => {
  it('passes through AppError code + status', async () => {
    const { status, body } = await unwrap(handleApiError(new AppError(418, 'teapot', 'TEAPOT')));
    expect(status).toBe(418);
    expect(body.error.code).toBe('TEAPOT');
    expect(body.success).toBe(false);
  });

  it('ValidationError → 400', async () => {
    const { status, body } = await unwrap(handleApiError(new ValidationError('bad')));
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('NotFoundError → 404', async () => {
    const { status } = await unwrap(handleApiError(new NotFoundError('Customer', 'x')));
    expect(status).toBe(404);
  });

  it('UnauthorizedError → 401', async () => {
    const { status } = await unwrap(handleApiError(new UnauthorizedError()));
    expect(status).toBe(401);
  });

  it('ForbiddenError → 403', async () => {
    const { status } = await unwrap(handleApiError(new ForbiddenError()));
    expect(status).toBe(403);
  });
});

describe('handleApiError — ZodError', () => {
  it('maps zod issues to 400 VALIDATION_ERROR with details', async () => {
    let err: ZodError;
    try {
      z.object({ name: z.string() }).parse({ name: 123 });
      throw new Error('should have thrown');
    } catch (e) {
      err = e as ZodError;
    }
    const { status, body } = await unwrap(handleApiError(err!));
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeTruthy();
  });
});

describe('handleApiError — Prisma P2002 (unique)', () => {
  it('humanizes a known target', async () => {
    const { status, body } = await unwrap(handleApiError(prismaErr('P2002', { target: ['invoiceNumber'] })));
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toMatch(/invoice number/i);
  });

  it('falls back to generic message for unknown target', async () => {
    const { status, body } = await unwrap(handleApiError(prismaErr('P2002', { target: ['weird_col'] })));
    expect(status).toBe(409);
    expect(body.error.message).toMatch(/already exists/i);
  });
});

describe('handleApiError — SESSION_STALE regression (post-restore dead admin)', () => {
  it('P2025 referencing AdminUser → 401 SESSION_STALE', async () => {
    const { status, body } = await unwrap(
      handleApiError(prismaErr('P2025', { cause: 'No "AdminUser" record found for connect.' })),
    );
    expect(status).toBe(401);
    expect(body.error.code).toBe('SESSION_STALE');
  });

  it('P2025 unrelated → 404 NOT_FOUND', async () => {
    const { status, body } = await unwrap(handleApiError(prismaErr('P2025', { cause: 'No Customer record.' })));
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('P2003 on an admin FK field → 401 SESSION_STALE', async () => {
    const { status, body } = await unwrap(
      handleApiError(prismaErr('P2003', { field_name: 'Invoice_createdByAdminId_fkey (index)' })),
    );
    expect(status).toBe(401);
    expect(body.error.code).toBe('SESSION_STALE');
  });

  it('P2003 on a non-admin FK → 400 VALIDATION_ERROR', async () => {
    const { status, body } = await unwrap(
      handleApiError(prismaErr('P2003', { field_name: 'JobCard_customerId_fkey' })),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('handleApiError — unknown', () => {
  it('falls through to 500 INTERNAL_ERROR', async () => {
    const { status, body } = await unwrap(handleApiError(new Error('surprise')));
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
