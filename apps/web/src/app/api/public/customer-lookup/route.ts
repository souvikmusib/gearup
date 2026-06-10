import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/errors';

// Public, unauthenticated endpoint. To prevent phone-number enumeration of PII
// + vehicle registrations, this endpoint deliberately returns ONLY a coarse
// boolean ("we have records for this phone — continue?"). Customer name, email
// and vehicle list are intentionally NOT returned here; the booking flow
// hydrates those server-side after the service request is created, where the
// caller has proven possession of the phone number via the booking payload.
//
// Defense-in-depth:
//   - Rate-limited aggressively (10/min/IP) in apps/web/src/middleware.ts.
//   - Identical response shape on hit, miss, and invalid input — never a
//     side-channel that leaks existence via shape, status code, or latency
//     shape differences beyond the unavoidable DB query.
export async function GET(req: NextRequest) {
  try {
    const phone = (req.nextUrl.searchParams.get('phone') || '').replace(/\D/g, '');
    if (phone.length < 10) {
      return NextResponse.json({ success: true, data: { customer: null } });
    }

    const hit = await prisma.customer.findFirst({
      where: { phoneNumber: phone },
      select: { id: true },
    });

    // Same envelope shape regardless of hit/miss. `customer` is either null or
    // an opaque presence marker — no PII, no vehicles, no id leaked.
    return NextResponse.json({
      success: true,
      data: { customer: hit ? { exists: true } : null },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
