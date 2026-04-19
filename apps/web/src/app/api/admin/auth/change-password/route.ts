import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifyAuth } from '@/lib/auth';
import { handleApiError, UnauthorizedError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity-logger';
import { z } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const auth = verifyAuth();
    const { currentPassword, newPassword } = z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }).parse(await req.json());
    const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: auth.sub } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new UnauthorizedError('Current password incorrect');
    await prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    await logActivity({ entityType: 'AdminUser', entityId: user.id, action: 'auth.password-changed', actorType: 'ADMIN', actorId: user.id });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
