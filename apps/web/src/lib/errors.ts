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
        const fields = (error.meta?.target as string[])?.join(', ') || 'field';
        return NextResponse.json(
          { success: false, error: { code: 'CONFLICT', message: `A record with this ${fields} already exists` } },
          { status: 409 },
        );
      }
      case 'P2025':
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } },
          { status: 404 },
        );
      case 'P2003': {
        const field = (error.meta?.field_name as string) || 'reference';
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: `Invalid ${field}: referenced record does not exist` } },
          { status: 400 },
        );
      }
    }
  }
  console.error('Unhandled API error:', error);
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    { status: 500 },
  );
}
