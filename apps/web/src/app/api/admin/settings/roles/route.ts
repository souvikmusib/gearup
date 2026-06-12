import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const [roles, allPerms] = await Promise.all([
      prisma.role.findMany({
        orderBy: { name: 'asc' },
        include: {
          permissions: { select: { permission: { select: { id: true, key: true, name: true, module: true, description: true } } } },
          _count: { select: { adminUsers: true } },
        },
      }),
      prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { key: 'asc' }] }),
    ]);

    const shaped = roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      adminCount: r._count.adminUsers,
      permissions: r.permissions.map((rp) => rp.permission),
    }));
    return NextResponse.json({ success: true, data: { roles: shaped, allPermissions: allPerms } });
  } catch (e) { return handleApiError(e); }
}

const createSchema = z.object({
  key: z.string().min(2).regex(/^[A-Z][A-Z0-9_]+$/, 'KEY must be UPPER_SNAKE_CASE'),
  name: z.string().min(1),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const body = createSchema.parse(await req.json());
    const created = await prisma.role.create({
      data: {
        key: body.key,
        name: body.name,
        description: body.description,
        permissions: { create: body.permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
    logActivity({ entityType: 'Role', entityId: created.id, action: 'role.created', newValue: created, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
