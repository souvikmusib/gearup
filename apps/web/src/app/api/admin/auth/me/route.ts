import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { handleApiError, UnauthorizedError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { ROLE_PERMISSIONS, type RoleKey } from '@gearup/types';

export async function GET() {
  try {
    const auth = verifyAuth();
    // Use findUnique (not findUniqueOrThrow) so a deleted user surfaces as 401,
    // not 404 — the client AuthProvider then knows to clear the stale token
    // rather than treat it as a transient server error. We also reject any
    // non-ACTIVE status (INACTIVE / LOCKED) for the same reason: an existing
    // JWT should not be honored once the underlying account is disabled.
    const user = await prisma.adminUser.findUnique({ where: { id: auth.sub }, include: { roles: { include: { role: true } } } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError('Session no longer valid');
    const roleKeys = user.roles.map((r: (typeof user)['roles'][number]) => r.role.key as RoleKey);
    const permissions = [...new Set(roleKeys.flatMap((k: RoleKey) => ROLE_PERMISSIONS[k] ?? []))];
    return NextResponse.json({ success: true, data: { id: user.id, adminUserId: user.adminUserId, fullName: user.fullName, email: user.email, roles: roleKeys, permissions } });
  } catch (e) { return handleApiError(e); }
}
