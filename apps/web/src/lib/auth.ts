import jwt from 'jsonwebtoken';
import { headers } from 'next/headers';
import type { AuthTokenPayload, PermissionKey } from '@gearup/types';
import { UnauthorizedError, ForbiddenError } from './errors';
import { getJwtSecret } from './jwt-secret';

export function getAuthToken(): string {
  const h = headers();
  const auth = h.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token');
  return auth.slice(7);
}

export function verifyAuth(): AuthTokenPayload {
  const token = getAuthToken();
  try {
    return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function requirePermission(...required: PermissionKey[]): AuthTokenPayload {
  const user = verifyAuth();
  const has = new Set(user.permissions);
  const missing = required.filter((p) => !has.has(p));
  if (missing.length) throw new ForbiddenError(`Missing permissions: ${missing.join(', ')}`);
  return user;
}
