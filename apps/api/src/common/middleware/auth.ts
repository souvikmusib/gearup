import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError, ForbiddenError } from '../errors';
import type { AuthTokenPayload, PermissionKey } from '@gearup/types';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: AuthTokenPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new UnauthorizedError('Missing token'));

  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as AuthTokenPayload;
    req.user = payload;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function requirePermission(...required: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    const has = new Set(req.user.permissions);
    const missing = required.filter((p) => !has.has(p));
    if (missing.length) return next(new ForbiddenError(`Missing permissions: ${missing.join(', ')}`));
    next();
  };
}
