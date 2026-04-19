import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { ROLE_PERMISSIONS, type RoleKey } from '@gearup/types';

export async function GET() {
  try {
    const auth = verifyAuth();
    const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: auth.sub }, include: { roles: { include: { role: true } } } });
    const roleKeys = user.roles.map((r: any) => r.role.key as RoleKey);
    const permissions = [...new Set(roleKeys.flatMap((k: RoleKey) => ROLE_PERMISSIONS[k] ?? []))];
    return NextResponse.json({ success: true, data: { id: user.id, adminUserId: user.adminUserId, fullName: user.fullName, email: user.email, roles: roleKeys, permissions } });
  } catch (e) { return handleApiError(e); }
}
