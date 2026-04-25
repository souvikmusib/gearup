import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const phone = req.nextUrl.searchParams.get('phone') || '';
    if (phone.length < 7) return NextResponse.json({ success: true, data: { customer: null, vehicles: [] } });
    const customer = await prisma.customer.findFirst({ where: { phoneNumber: phone }, select: { fullName: true, email: true } });
    if (!customer) return NextResponse.json({ success: true, data: { customer: null, vehicles: [] } });
    const vehicles = await prisma.vehicle.findMany({
      where: { customer: { phoneNumber: phone } },
      select: { registrationNumber: true, brand: true, model: true, vehicleType: true },
      orderBy: { updatedAt: 'desc' }, take: 10,
    });
    return NextResponse.json({ success: true, data: { customer, vehicles } });
  } catch (e) { return handleApiError(e); }
}
