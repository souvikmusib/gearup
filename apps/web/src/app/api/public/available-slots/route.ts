import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, ValidationError, NotFoundError } from '@/lib/errors';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date');
    if (!date) throw new ValidationError('date query parameter required');
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();
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
        const sH = Math.floor(m / 60), sM = m % 60, eM = m + rule.slotDurationMinutes, eH = Math.floor(eM / 60), eMn = eM % 60;
        const fmt = (h: number, mn: number) => `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
        const start = new Date(targetDate); start.setHours(sH, sM, 0, 0);
        const end = new Date(targetDate); end.setHours(eH, eMn, 0, 0);
        const isBlocked = blocked.some((b: any) => start >= b.blockStartTime && end <= b.blockEndTime);
        result.push({ label: `${fmt(sH, sM)} - ${fmt(eH, eMn)}`, start: start.toISOString(), end: end.toISOString(), available: !isBlocked && existingAppts < rule.maxCapacity });
      }
      return result;
    });
    return NextResponse.json({ success: true, data: { date, slots } });
  } catch (e) { return handleApiError(e); }
}
