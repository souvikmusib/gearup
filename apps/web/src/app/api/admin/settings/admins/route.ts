import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

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
      password: z.string().min(6),
      email: z.string().optional(),
      phone: z.string().optional(),
      roleId: z.string(),
    }).parse(await req.json());

    const passwordHash = await bcrypt.hash(body.password, 10);
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
    requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const body = z.object({
      id: z.string(),
      fullName: z.string().optional(),
      password: z.string().min(6).optional(),
      phone: z.string().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
      roleId: z.string().optional(),
    }).parse(await req.json());

    const { id, password, roleId, ...data } = body;
    const updateData: any = { ...data };
    if (password) updateData.passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.adminUser.update({ where: { id }, data: updateData, select: { id: true, adminUserId: true, fullName: true } });

    if (roleId) {
      await prisma.adminUserRole.deleteMany({ where: { adminUserId: id } });
      await prisma.adminUserRole.create({ data: { adminUserId: id, roleId } });
    }

    return NextResponse.json({ success: true, data: user });
  } catch (e) {
    return handleApiError(e);
  }
}
