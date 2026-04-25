import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const [admins, roles] = await Promise.all([
      prisma.adminUser.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          adminUserId: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          roles: { select: { role: { select: { id: true, key: true, name: true } } } },
        },
      }),
      prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, key: true, name: true, description: true } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        admins: admins.map((admin) => ({ ...admin, roles: admin.roles.map((entry) => entry.role) })),
        roles,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
