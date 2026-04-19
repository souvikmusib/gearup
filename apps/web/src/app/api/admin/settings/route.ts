import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, ValidationError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';

const ALLOWED_PREFIXES = ['business.', 'invoice.', 'notification.', 'integration.'];

export async function GET() {
  try {
    requirePermission(PERMISSIONS.SETTINGS_VIEW);
    const settings = await prisma.setting.findMany();
    return NextResponse.json({ success: true, data: Object.fromEntries(settings.map((s: any) => [s.key, s.value])) });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const body = await req.json() as Record<string, unknown>;
    const entries = Object.entries(body);
    const invalid = entries.filter(([key]) => !ALLOWED_PREFIXES.some((p) => key.startsWith(p)));
    if (invalid.length) throw new ValidationError(`Invalid setting keys: ${invalid.map(([k]) => k).join(', ')}. Allowed prefixes: ${ALLOWED_PREFIXES.join(', ')}`);
    await Promise.all(entries.map(([key, value]) => prisma.setting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } })));
    logActivity({ entityType: 'Setting', action: 'settings.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
