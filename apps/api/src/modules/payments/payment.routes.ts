import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';

const router: Router = Router();

router.get('/', requirePermission(PERMISSIONS.PAYMENTS_RECORD), asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const [data, total] = await Promise.all([
    prisma.payment.findMany({ ...p, orderBy: { paymentDate: 'desc' }, include: { invoice: { select: { invoiceNumber: true, customer: { select: { fullName: true } } } } } }),
    prisma.payment.count(),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

export default router;
