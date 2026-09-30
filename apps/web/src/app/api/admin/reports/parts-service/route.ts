import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { loadPartsServiceReport } from '@/lib/reports/parts-service-query';
import { PERMISSIONS } from '@gearup/types';

/**
 * Parts & Service report.
 *
 * `from`/`to` are IST calendar dates and are required — unlike the revenue
 * report, which tolerates an unbounded range. Overheads are pro-rated by the
 * number of days in the range, so an open-ended range has no meaningful
 * overhead figure and would silently produce a nonsense profit line.
 */
const querySchema = z
  .object({
    from: z.string().date(),
    to: z.string().date(),
  })
  .refine((v) => v.from <= v.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.REPORTS_VIEW);

    const sp = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
    });
    if (!parsed.success) {
      throw new AppError(
        400,
        parsed.error.issues[0]?.message ?? 'Both `from` and `to` are required (YYYY-MM-DD).',
        'VALIDATION_ERROR',
      );
    }

    const data = await loadPartsServiceReport(parsed.data.from, parsed.data.to);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return handleApiError(e);
  }
}
