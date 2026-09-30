import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { loadPartsServiceReport } from '@/lib/reports/parts-service-query';
import { generatePartsServiceReportHTML } from '@/lib/reports/parts-service-print';
import { PERMISSIONS } from '@gearup/types';

/**
 * Printable Parts & Service report.
 *
 * Returns an A4-styled HTML document that self-triggers `window.print()`, the
 * same mechanism the invoice PDF route uses. No headless browser or PDF library
 * is involved; the user's own print dialog produces the file.
 *
 * Renders from `loadPartsServiceReport`, so the PDF and the on-screen report can
 * never show different numbers for the same range.
 */
const querySchema = z
  .object({ from: z.string().date(), to: z.string().date() })
  .refine((v) => v.from <= v.to, { message: '`from` must be on or before `to`', path: ['from'] });

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
    const { from, to } = parsed.data;

    const [report, settingRows] = await Promise.all([
      loadPartsServiceReport(from, to),
      prisma.setting.findMany(),
    ]);
    const settings = Object.fromEntries(settingRows.map((s) => [s.key, s.value as unknown]));

    const html = generatePartsServiceReportHTML(report, settings);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="parts-service-report_${from}_to_${to}.html"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
