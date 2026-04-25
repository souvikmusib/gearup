import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const phone = (req.nextUrl.searchParams.get('phone') || '').replace(/\D/g, '');
    if (phone.length < 10) {
      return NextResponse.json({ success: true, data: { customer: null, vehicles: [] } });
    }

    const customer = await prisma.customer.findFirst({
      where: { phoneNumber: phone },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        vehicles: {
          orderBy: { updatedAt: 'desc' },
          select: { id: true, registrationNumber: true, vehicleType: true, brand: true, model: true, variant: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: { customer: customer ? { id: customer.id, fullName: customer.fullName, phoneNumber: customer.phoneNumber, email: customer.email } : null, vehicles: customer?.vehicles ?? [] } });
  } catch (e) { return handleApiError(e); }
}
