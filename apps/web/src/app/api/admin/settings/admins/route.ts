import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, AppError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { passwordPolicy } from '@/lib/validators/password';

const BCRYPT_COST = 12;

// E.164-ish phone: optional leading +, 10–15 digits. Whitespace stripped before validation.
const phoneRegex = /^\+?[0-9]{10,15}$/;
const normalizePhone = (raw: string) => raw.replace(/[\s-]/g, '');

// NOTE: Deletion policy — this endpoint exposes no DELETE handler by design.
// Admins are soft-deactivated via PATCH { status: 'INACTIVE' } so audit trails,
// activity logs, and historical FKs remain intact. Do not add a DELETE without
// first deciding what to do with referenced job cards / invoices / activity rows.
//
// Tenancy — this app is currently single-tenant per deployment (one garage per
// install). None of the queries below filter by a garageId/tenantId. If
// multi-tenancy is ever introduced, every query in this file MUST be scoped by
// the caller's tenant or admins from one garage will be able to read and
// modify admins from another.

// Password policy is centralized in @/lib/validators/password so the floor is
// identical across self-change and admin-create/update endpoints. Re-exported
// here under the existing local name to keep call sites unchanged.
const strongPassword = passwordPolicy;

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

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get('page')) || 1);
    const pageSize = Math.min(Math.max(1, Number(sp.get('pageSize')) || 20), 200);
    const search = sp.get('search')?.trim() || '';
    const where = search
      ? {
          OR: [
            { adminUserId: { contains: search, mode: 'insensitive' as const } },
            { fullName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [admins, total, roles] = await Promise.all([
      prisma.adminUser.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
      prisma.adminUser.count({ where }),
      prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, key: true, name: true, description: true } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        admins: admins.map((admin) => ({ ...admin, roles: admin.roles.map((entry) => entry.role) })),
        roles,
      },
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
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
      email: z.string().email('Invalid email address').optional(),
      phone: z
        .string()
        .transform(normalizePhone)
        .refine((v) => phoneRegex.test(v), 'Invalid phone number')
        .optional(),
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
      phone: z
        .string()
        .transform(normalizePhone)
        .refine((v) => phoneRegex.test(v), 'Invalid phone number')
        .optional(),
      status: z.preprocess(v => v === '' ? undefined : v, z.enum(['ACTIVE', 'INACTIVE']).optional()),
      roleId: z.string().optional(),
    }).parse(await req.json());

    const { id, password, roleId, status, fullName, phone } = body;
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

    // Build the update payload with explicit per-field assignments so that
    // adding a new field to the zod schema does NOT silently flow into
    // Prisma.update — every writable field has to be wired here intentionally.
    const updateData: Prisma.AdminUserUpdateInput = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (phone !== undefined) updateData.phone = phone;
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
