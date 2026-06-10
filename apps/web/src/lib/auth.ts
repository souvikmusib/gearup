import jwt from 'jsonwebtoken';
import { headers, cookies } from 'next/headers';
import type { AuthTokenPayload, PermissionKey } from '@gearup/types';
import { UnauthorizedError, ForbiddenError } from './errors';
import { getJwtSecret } from './jwt-secret';

/**
 * Auth transport model (decision recorded here as the source of truth):
 *
 * - Primary: `Authorization: Bearer <jwt>` header set by the SPA client from
 *   the token returned by /api/admin/auth/login. The token is held in
 *   memory + localStorage on the client.
 * - Fallback: an httpOnly + Secure + SameSite=Lax cookie named
 *   `AUTH_COOKIE_NAME`. The login route MAY set this cookie so that server
 *   components, document navigations, and same-origin fetches that don't
 *   attach the bearer header can still authenticate.
 *
 * CSRF posture:
 * - Bearer mode is not auto-attached by browsers, so cross-site form POSTs
 *   have no auth → not CSRF-exploitable.
 * - Cookie mode relies on SameSite=Lax (set at issuance) to block cross-site
 *   POSTs. State-changing requests must additionally come from an allowlisted
 *   Origin — see `apps/web/src/middleware.ts` `applyCorsHeaders`. Deployments
 *   MUST set `CORS_ALLOWED_ORIGINS` (no wildcard) so credentialed requests
 *   are only honored from trusted origins.
 *
 * If we ever drop the bearer flow and rely on cookies alone, add a
 * double-submit CSRF token check here before declaring the request
 * authenticated.
 */
export const AUTH_COOKIE_NAME = 'gearup_token';

export function getAuthToken(): string {
  const h = headers();
  const auth = h.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);

  // Fallback: cookie-based session. The login route is responsible for
  // setting this with httpOnly + Secure + SameSite=Lax; this helper just
  // reads it. We do not check a CSRF token here because the SameSite=Lax
  // + strict CORS allowlist combination is sufficient for the current
  // threat model (see the doc block above).
  const cookieToken = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;

  throw new UnauthorizedError('Missing token');
}

export function verifyAuth(): AuthTokenPayload {
  const token = getAuthToken();
  try {
    return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/** Requires ALL listed permissions (AND) */
export function requirePermission(...required: PermissionKey[]): AuthTokenPayload {
  const user = verifyAuth();
  const has = new Set(user.permissions);
  const missing = required.filter((p) => !has.has(p));
  if (missing.length) throw new ForbiddenError(`Missing permissions: ${missing.join(', ')}`);
  return user;
}

/** Requires ANY of the listed permissions (OR) */
export function requireAnyPermission(...required: PermissionKey[]): AuthTokenPayload {
  const user = verifyAuth();
  const has = new Set(user.permissions);
  if (!required.some((p) => has.has(p))) throw new ForbiddenError(`Requires one of: ${required.join(', ')}`);
  return user;
}
