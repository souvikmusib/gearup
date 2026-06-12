import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, ValidationError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  /** When present, replaces the role's permission set wholesale. */
  permissionIds: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const body = patchSchema.parse(await req.json());

    const updated = await prisma.$transaction(async (tx) => {
      const role = await tx.role.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
        },
      });
      if (body.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: params.id } });
        if (body.permissionIds.length) {
          await tx.rolePermission.createMany({
            data: body.permissionIds.map((permissionId) => ({ roleId: params.id, permissionId })),
            skipDuplicates: true,
          });
        }
      }
      return role;
    });

    logActivity({ entityType: 'Role', entityId: updated.id, action: 'role.updated', newValue: updated, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const usage = await prisma.adminUserRole.count({ where: { roleId: params.id } });
    if (usage > 0) {
      throw new ValidationError(`Role is assigned to ${usage} admin user${usage === 1 ? '' : 's'}; reassign them before deleting.`);
    }
    await prisma.role.delete({ where: { id: params.id } });
    logActivity({ entityType: 'Role', entityId: params.id, action: 'role.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
