import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await prisma.adminUser.findFirst({ select: { id: true, adminUserId: true, fullName: true } });
    return NextResponse.json({ step: 'prisma_ok', user });
  } catch (e: any) {
    return NextResponse.json({ step: 'prisma_failed', error: e.message }, { status: 500 });
  }
}
