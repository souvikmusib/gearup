import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { handleApiError, ValidationError } from '@/lib/errors';

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

export async function GET(req: NextRequest) {
  try {
    const rawDate = req.nextUrl.searchParams.get('date');
    if (!rawDate) throw new ValidationError('date query parameter required');
    const parsed = querySchema.safeParse({ date: rawDate });
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'invalid date');
    const { date } = parsed.data;

    // Parse as UTC date to avoid timezone issues
    const [year, month, day] = date.split('-').map(Number);
    const targetDate = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(targetDate.getTime())) throw new ValidationError('invalid calendar date');
    // Verify the parsed components round-trip (rejects 2026-02-31 etc.)
    if (
      targetDate.getUTCFullYear() !== year ||
      targetDate.getUTCMonth() !== month - 1 ||
      targetDate.getUTCDate() !== day
    ) {
      throw new ValidationError('invalid calendar date');
    }
    // Bound to today..+90 days (UTC) to prevent abuse and stale lookups
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const maxUtc = new Date(todayUtc.getTime() + 90 * 24 * 60 * 60 * 1000);
    if (targetDate < todayUtc || targetDate > maxUtc) {
      throw new ValidationError('date must be within the next 90 days');
    }
    const dayOfWeek = targetDate.getUTCDay();

    const rules = await prisma.appointmentSlotRule.findMany({ where: { dayOfWeek, isActive: true } });
    const holidays = await prisma.holiday.findMany({ where: { holidayDate: targetDate, isFullDay: true } });
    if (holidays.length) return NextResponse.json({ success: true, data: { date, slots: [], message: 'Closed \u2013 ' + holidays[0].holidayName } });

    const blocked = await prisma.blockedSlot.findMany({ where: { blockDate: targetDate, appliesToAll: true } });
    // Per-slot capacity: group by slotStart, not by day.
    const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0));
    const dayEnd = new Date(Date.UTC(year, month - 1, day + 1, 0, 0));
    const apptRows = await prisma.appointment.groupBy({
      by: ['slotStart'],
      where: { slotStart: { gte: dayStart, lt: dayEnd }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
      _count: { _all: true },
    });
    const apptCountBySlot = new Map<number, number>();
    for (const row of apptRows as Array<{ slotStart: Date; _count: { _all: number } }>) {
      apptCountBySlot.set(new Date(row.slotStart).getTime(), row._count._all);
    }

    const slots = rules.flatMap((rule: any) => {
      const result: { label: string; start: string; end: string; available: boolean }[] = [];
      const [openH, openM] = rule.openTime.split(':').map(Number);
      const [closeH, closeM] = rule.closeTime.split(':').map(Number);
      for (let m = openH * 60 + openM; m + rule.slotDurationMinutes <= closeH * 60 + closeM; m += rule.slotDurationMinutes) {
        const sH = Math.floor(m / 60), sM = m % 60;
        const eM = m + rule.slotDurationMinutes, eH = Math.floor(eM / 60), eMn = eM % 60;
        const fmt = (h: number, mn: number) => `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
        const start = new Date(Date.UTC(year, month - 1, day, sH, sM));
        const end = new Date(Date.UTC(year, month - 1, day, eH, eMn));
        // Compare time-of-day only: blockStartTime/blockEndTime are stored as full DateTimes,
        // but the meaningful axis on a given blockDate is the wall-clock window. Normalize both
        // sides to UTC time-of-day on targetDate before comparing.
        const slotStartMin = sH * 60 + sM;
        const slotEndMin = eH * 60 + eMn;
        const isBlocked = blocked.some((b: any) => {
          const bs = new Date(b.blockStartTime);
          const be = new Date(b.blockEndTime);
          const bStartMin = bs.getUTCHours() * 60 + bs.getUTCMinutes();
          const bEndMin = be.getUTCHours() * 60 + be.getUTCMinutes();
          return slotStartMin >= bStartMin && slotEndMin <= bEndMin;
        });
        const slotCount = apptCountBySlot.get(start.getTime()) ?? 0;
        result.push({
          label: `${fmt(sH, sM)} - ${fmt(eH, eMn)}`,
          start: start.toISOString(),
          end: end.toISOString(),
          available: !isBlocked && slotCount < rule.maxCapacity,
        });
      }
      return result;
    });

    return NextResponse.json({ success: true, data: { date, slots } });
  } catch (e) { return handleApiError(e); }
}
