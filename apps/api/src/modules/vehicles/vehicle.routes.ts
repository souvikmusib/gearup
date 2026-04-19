import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';
import { logActivity } from '../../common/utils/activity-logger';
import type { Prisma } from '@prisma/client';

const router: Router = Router();

const vehicleSchema = z.object({
  customerId: z.string(),
  vehicleType: z.enum(['CAR', 'BIKE', 'OTHER']),
  registrationNumber: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  variant: z.string().optional(),
  yearOfManufacture: z.number().optional(),
  fuelType: z.string().optional(),
  transmission: z.string().optional(),
  color: z.string().optional(),
  vin: z.string().optional(),
  chassisNumber: z.string().optional(),
  engineNumber: z.string().optional(),
  odometerReading: z.number().optional(),
  notes: z.string().optional(),
});

router.get('/', requirePermission(PERMISSIONS.VEHICLES_VIEW), asyncHandler(async (req, res) => {
  const { page, pageSize, search } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const where = search ? {
    OR: [
      { registrationNumber: { contains: search, mode: 'insensitive' as const } },
      { brand: { contains: search, mode: 'insensitive' as const } },
      { model: { contains: search, mode: 'insensitive' as const } },
    ],
  } : {};
  const [data, total] = await Promise.all([
    prisma.vehicle.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { customer: { select: { id: true, fullName: true, phoneNumber: true } } } }),
    prisma.vehicle.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

router.post('/', requirePermission(PERMISSIONS.VEHICLES_EDIT), asyncHandler(async (req, res) => {
  const body = vehicleSchema.parse(req.body);
  const vehicle = await prisma.vehicle.create({ data: body as Prisma.VehicleUncheckedCreateInput });
  await logActivity({ entityType: 'Vehicle', entityId: vehicle.id, action: 'vehicle.created', newValue: vehicle, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: vehicle });
}));

router.get('/:id', requirePermission(PERMISSIONS.VEHICLES_VIEW), asyncHandler(async (req, res) => {
  const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: req.params.id }, include: { customer: true, serviceRequests: { orderBy: { createdAt: 'desc' }, take: 10 }, jobCards: { orderBy: { createdAt: 'desc' }, take: 10 } } });
  res.json({ success: true, data: vehicle });
}));

router.patch('/:id', requirePermission(PERMISSIONS.VEHICLES_EDIT), asyncHandler(async (req, res) => {
  const body = vehicleSchema.partial().parse(req.body);
  const vehicle = await prisma.vehicle.update({ where: { id: req.params.id }, data: body as Prisma.VehicleUncheckedUpdateInput });
  await logActivity({ entityType: 'Vehicle', entityId: vehicle.id, action: 'vehicle.updated', newValue: vehicle, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: vehicle });
}));

export default router;
