import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, ValidationError } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date');
    if (!date) throw new ValidationError('date query parameter required');

    // Parse as UTC date to avoid timezone issues
    const [year, month, day] = date.split('-').map(Number);
    const targetDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = targetDate.getUTCDay();

    const rules = await prisma.appointmentSlotRule.findMany({ where: { dayOfWeek, isActive: true } });
    const holidays = await prisma.holiday.findMany({ where: { holidayDate: targetDate, isFullDay: true } });
    if (holidays.length) return NextResponse.json({ success: true, data: { date, slots: [], message: 'Closed \u2013 ' + holidays[0].holidayName } });

    const blocked = await prisma.blockedSlot.findMany({ where: { blockDate: targetDate, appliesToAll: true } });
    const existingAppts = await prisma.appointment.count({ where: { appointmentDate: targetDate, status: { notIn: ['CANCELLED', 'NO_SHOW'] } } });

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
        const isBlocked = blocked.some((b: any) => start >= new Date(b.blockStartTime) && end <= new Date(b.blockEndTime));
        result.push({
          label: `${fmt(sH, sM)} - ${fmt(eH, eMn)}`,
          start: start.toISOString(),
          end: end.toISOString(),
          available: !isBlocked && existingAppts < rule.maxCapacity,
        });
      }
      return result;
    });

    return NextResponse.json({ success: true, data: { date, slots } });
  } catch (e) { return handleApiError(e); }
}
