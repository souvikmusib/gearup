import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';
import { logActivity } from '../../common/utils/activity-logger';

const router: Router = Router();

router.get('/', requirePermission(PERMISSIONS.SETTINGS_VIEW), asyncHandler(async (_req, res) => {
  const settings = await prisma.setting.findMany();
  const map = Object.fromEntries(settings.map((s: any) => [s.key, s.value]));
  res.json({ success: true, data: map });
}));

router.patch('/', requirePermission(PERMISSIONS.SETTINGS_MANAGE), asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body as Record<string, unknown>);
  await Promise.all(entries.map(([key, value]) =>
    prisma.setting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } }),
  ));
  await logActivity({ entityType: 'Setting', action: 'settings.updated', newValue: req.body, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true });
}));

router.get('/business-hours', requirePermission(PERMISSIONS.SETTINGS_VIEW), asyncHandler(async (_req, res) => {
  const rules = await prisma.appointmentSlotRule.findMany({ orderBy: { dayOfWeek: 'asc' } });
  const holidays = await prisma.holiday.findMany({ orderBy: { holidayDate: 'asc' } });
  res.json({ success: true, data: { rules, holidays } });
}));

router.patch('/business-hours', requirePermission(PERMISSIONS.SETTINGS_MANAGE), asyncHandler(async (req, res) => {
  const { rules } = req.body as { rules: Array<{ id?: string; dayOfWeek: number; openTime: string; closeTime: string; slotDurationMinutes: number; maxCapacity: number; isActive: boolean }> };
  for (const rule of rules) {
    if (rule.id) {
      await prisma.appointmentSlotRule.update({ where: { id: rule.id }, data: rule });
    } else {
      await prisma.appointmentSlotRule.create({ data: rule });
    }
  }
  res.json({ success: true });
}));

router.get('/integrations', requirePermission(PERMISSIONS.SETTINGS_VIEW), asyncHandler(async (_req, res) => {
  const settings = await prisma.setting.findMany({ where: { key: { startsWith: 'integration.' } } });
  res.json({ success: true, data: Object.fromEntries(settings.map((s: any) => [s.key, s.value])) });
}));

router.patch('/integrations', requirePermission(PERMISSIONS.SETTINGS_MANAGE), asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body as Record<string, unknown>);
  await Promise.all(entries.map(([key, value]) =>
    prisma.setting.upsert({ where: { key: `integration.${key}` }, create: { key: `integration.${key}`, value: value as any }, update: { value: value as any } }),
  ));
  res.json({ success: true });
}));

export default router;
