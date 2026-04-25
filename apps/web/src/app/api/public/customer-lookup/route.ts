import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const phone = req.nextUrl.searchParams.get('phone') || '';
    if (phone.replace(/\D/g, '').length < 10) {
      return NextResponse.json({ success: true, data: { customer: null, vehicles: [] } });
    }

    return NextResponse.json({ success: true, data: { customer: null, vehicles: [] } });
  } catch (e) { return handleApiError(e); }
}
