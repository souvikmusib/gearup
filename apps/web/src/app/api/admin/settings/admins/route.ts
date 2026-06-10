import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, AppError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

// Password policy: min 10 chars, at least one letter AND one digit.
const strongPassword = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), {
    message: 'Password must contain at least one letter and one digit',
  });

/**
 * Returns true if the given roleId carries the ADMIN_USERS_MANAGE permission.
 */
async function roleHasAdminManage(
  client: typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  roleId: string,
): Promise<boolean> {
  // Narrow to a usable client surface (tx or prisma) for role lookup.
  const c = client as typeof prisma;
  const role = await c.role.findUnique({
    where: { id: roleId },
    select: {
      permissions: { select: { permission: { select: { key: true } } } },
    },
  });
  if (!role) return false;
  return role.permissions.some((p) => p.permission.key === PERMISSIONS.ADMIN_USERS_MANAGE);
}

/**
 * Count ACTIVE admin users (excluding `excludeUserId`) that currently hold a
 * role granting ADMIN_USERS_MANAGE. Used to prevent locking the org out.
 */
async function countOtherActiveAdminManagers(
  client: typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  excludeUserId: string,
): Promise<number> {
  const c = client as typeof prisma;
  return c.adminUser.count({
    where: {
      id: { not: excludeUserId },
      status: 'ACTIVE',
      roles: {
        some: {
          role: {
            permissions: {
              some: { permission: { key: PERMISSIONS.ADMIN_USERS_MANAGE } },
            },
          },
        },
      },
    },
  });
}

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

export async function POST(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const body = z.object({
      adminUserId: z.string().min(3),
      fullName: z.string().min(1),
      password: strongPassword,
      email: z.string().optional(),
      phone: z.string().optional(),
      roleId: z.string(),
    }).parse(await req.json());

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);
    const user = await prisma.adminUser.create({
      data: {
        adminUserId: body.adminUserId,
        fullName: body.fullName,
        passwordHash,
        email: body.email || undefined,
        phone: body.phone || undefined,
        roles: { create: { roleId: body.roleId } },
      },
      select: { id: true, adminUserId: true, fullName: true },
    });

    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const body = z.object({
      id: z.string(),
      fullName: z.string().optional(),
      password: strongPassword.optional(),
      phone: z.string().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
      roleId: z.string().optional(),
    }).parse(await req.json());

    const { id, password, roleId, status, ...rest } = body;
    const isSelf = auth.sub === id;

    // Self-lockout guards: an admin must not be able to disable themselves
    // or swap their own role — both routes can lock the org out.
    if (isSelf && status === 'INACTIVE') {
      throw new AppError(403, 'You cannot deactivate your own account', 'FORBIDDEN');
    }
    if (isSelf && roleId) {
      throw new AppError(
        403,
        'You cannot change your own role; ask another admin to do it',
        'FORBIDDEN',
      );
    }

    const updateData: {
      fullName?: string;
      phone?: string;
      status?: 'ACTIVE' | 'INACTIVE';
      passwordHash?: string;
    } = { ...rest };
    if (status !== undefined) updateData.status = status;
    if (password) updateData.passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // Atomic update + role swap so we never leave the user role-less or with
    // partial state if any step fails. All last-admin guards run inside the
    // same transaction to avoid TOCTOU races.
    const user = await prisma.$transaction(async (tx) => {
      // Last-admin guard for status change to INACTIVE on someone who holds
      // ADMIN_USERS_MANAGE (self already blocked above, so this covers others).
      if (status === 'INACTIVE') {
        const target = await tx.adminUser.findUnique({
          where: { id },
          select: {
            status: true,
            roles: {
              select: {
                role: {
                  select: {
                    permissions: { select: { permission: { select: { key: true } } } },
                  },
                },
              },
            },
          },
        });
        if (!target) throw new AppError(404, 'Admin user not found', 'NOT_FOUND');
        const targetHasManage = target.roles.some((r) =>
          r.role.permissions.some((p) => p.permission.key === PERMISSIONS.ADMIN_USERS_MANAGE),
        );
        if (target.status === 'ACTIVE' && targetHasManage) {
          const others = await countOtherActiveAdminManagers(tx, id);
          if (others === 0) {
            throw new AppError(
              409,
              'Cannot deactivate the last admin with user-management permission',
              'CONFLICT',
            );
          }
        }
      }

      // Last-admin guard for role swap that would drop ADMIN_USERS_MANAGE.
      if (roleId) {
        const target = await tx.adminUser.findUnique({
          where: { id },
          select: {
            status: true,
            roles: {
              select: {
                role: {
                  select: {
                    permissions: { select: { permission: { select: { key: true } } } },
                  },
                },
              },
            },
          },
        });
        if (!target) throw new AppError(404, 'Admin user not found', 'NOT_FOUND');
        const targetHasManage = target.roles.some((r) =>
          r.role.permissions.some((p) => p.permission.key === PERMISSIONS.ADMIN_USERS_MANAGE),
        );
        const newRoleHasManage = await roleHasAdminManage(tx, roleId);
        if (target.status === 'ACTIVE' && targetHasManage && !newRoleHasManage) {
          const others = await countOtherActiveAdminManagers(tx, id);
          if (others === 0) {
            throw new AppError(
              409,
              'Cannot remove user-management permission from the last admin holding it',
              'CONFLICT',
            );
          }
        }
      }

      const updated = await tx.adminUser.update({
        where: { id },
        data: updateData,
        select: { id: true, adminUserId: true, fullName: true },
      });

      if (roleId) {
        await tx.adminUserRole.deleteMany({ where: { adminUserId: id } });
        await tx.adminUserRole.create({ data: { adminUserId: id, roleId } });
      }

      return updated;
    });

    return NextResponse.json({ success: true, data: user });
  } catch (e) {
    return handleApiError(e);
  }
}
