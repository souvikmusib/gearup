import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.INVENTORY_VIEW);
    const sp = req.nextUrl.searchParams;
    const level = sp.get('level') || 'brands';
    const brandId = sp.get('brandId') || '';
    const modelId = sp.get('modelId') || '';

    if (level === 'brands') {
      const brands = await prisma.vehicleBrand.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { models: true } } } });
      // Get item counts per brand via join table
      const counts = await prisma.inventoryItemModel.groupBy({
        by: ['vehicleModelId'],
        _count: true,
      });
      const modelToBrand = await prisma.vehicleModel.findMany({ select: { id: true, brandId: true } });
      const brandItemCount: Record<string, number> = {};
      for (const c of counts) {
        const m = modelToBrand.find(m => m.id === c.vehicleModelId);
        if (m) brandItemCount[m.brandId] = (brandItemCount[m.brandId] || 0) + c._count;
      }
      const data = brands.map(b => ({ id: b.id, name: b.name, logoUrl: b.logoUrl, modelCount: b._count.models, itemCount: brandItemCount[b.id] || 0 }));
      return NextResponse.json({ success: true, data });
    }

    if (level === 'models' && brandId) {
      const models = await prisma.vehicleModel.findMany({
        where: { brandId },
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { parts: true } } },
      });
      const data = models.map(m => ({ id: m.id, name: m.name, engineCC: m.engineCC, itemCount: m._count.parts }));
      return NextResponse.json({ success: true, data });
    }

    if (level === 'categories' && modelId) {
      // Get category IDs that have items linked to this model
      const items = await prisma.inventoryItemModel.findMany({
        where: { vehicleModelId: modelId },
        select: { inventoryItem: { select: { categoryId: true } } },
      });
      const catCounts: Record<string, number> = {};
      for (const i of items) {
        catCounts[i.inventoryItem.categoryId] = (catCounts[i.inventoryItem.categoryId] || 0) + 1;
      }
      const categoryIds = Object.keys(catCounts);
      if (categoryIds.length === 0) return NextResponse.json({ success: true, data: [] });
      const categories = await prisma.inventoryCategory.findMany({ where: { id: { in: categoryIds } }, orderBy: { categoryName: 'asc' } });
      const data = categories.map(c => ({ id: c.id, categoryName: c.categoryName, itemCount: catCounts[c.id] || 0 }));
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ success: true, data: [] });
  } catch (e) { return handleApiError(e); }
}
