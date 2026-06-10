import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, ValidationError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.SETTINGS_VIEW);
    const rules = await prisma.appointmentSlotRule.findMany({
      where: { isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
    });
    return NextResponse.json({ success: true, data: { rules } });
  } catch (e) {
    return handleApiError(e);
  }
}

// HH:MM (00:00 - 23:59)
const timeStringRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const slotRuleSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    openTime: z.string().regex(timeStringRegex, 'openTime must be HH:MM (00:00-23:59)'),
    closeTime: z.string().regex(timeStringRegex, 'closeTime must be HH:MM (00:00-23:59)'),
    slotDurationMinutes: z.number().int().min(5).max(240),
    maxCapacity: z.number().int().min(1).max(50),
    isActive: z.boolean().optional(),
  })
  .refine(
    (r) => {
      const [oh, om] = r.openTime.split(':').map(Number);
      const [ch, cm] = r.closeTime.split(':').map(Number);
      return ch * 60 + cm > oh * 60 + om;
    },
    { message: 'closeTime must be after openTime', path: ['closeTime'] },
  );

const putBodySchema = z.object({
  rules: z.array(slotRuleSchema).max(100),
});

export async function PUT(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const json = (await req.json()) as unknown;
    const parsed = putBodySchema.safeParse(json);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_root';
        (fieldErrors[key] ||= []).push(issue.message);
      }
      throw new ValidationError('Invalid business-hours payload.', fieldErrors);
    }

    const { rules } = parsed.data;

    // Detect duplicate / overlapping rules on the same day. Overlap if intervals
    // [openTime, closeTime) intersect for the same dayOfWeek.
    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const byDay = new Map<number, Array<{ start: number; end: number; idx: number }>>();
    rules.forEach((r, idx) => {
      const arr = byDay.get(r.dayOfWeek) ?? [];
      arr.push({ start: toMinutes(r.openTime), end: toMinutes(r.closeTime), idx });
      byDay.set(r.dayOfWeek, arr);
    });
    for (const [day, arr] of byDay) {
      arr.sort((a, b) => a.start - b.start);
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].start < arr[i - 1].end) {
          throw new ValidationError(
            `Overlapping rules for dayOfWeek=${day} at indices ${arr[i - 1].idx} and ${arr[i].idx}.`,
          );
        }
      }
    }

    const previous = await prisma.appointmentSlotRule.findMany({
      orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
    });

    const created = await prisma.$transaction(async (tx) => {
      await tx.appointmentSlotRule.deleteMany({});
      if (rules.length > 0) {
        await tx.appointmentSlotRule.createMany({
          data: rules.map((r) => ({
            dayOfWeek: r.dayOfWeek,
            openTime: r.openTime,
            closeTime: r.closeTime,
            slotDurationMinutes: r.slotDurationMinutes,
            maxCapacity: r.maxCapacity,
            isActive: r.isActive ?? true,
          })),
        });
      }
      const after = await tx.appointmentSlotRule.findMany({
        orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
      });
      await logActivity({
        entityType: 'AppointmentSlotRule',
        action: 'business-hours.replaced',
        previousValue: { rules: previous },
        newValue: { rules: after },
        actorType: 'ADMIN',
        actorId: user.sub,
        tx,
      });
      return after;
    });

    return NextResponse.json({ success: true, data: { rules: created } });
  } catch (e) {
    return handleApiError(e);
  }
}
