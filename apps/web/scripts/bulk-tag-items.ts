// apps/web/scripts/bulk-tag-items.ts
// Links existing inventory items to ALL models of their brand.
// This is a starting point — staff should refine by removing incorrect model links.
// Run: npx tsx scripts/bulk-tag-items.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Map InventoryItem.brand (text) → VehicleBrand.name
const brandMap: Record<string, string> = {
  Hero: 'Hero',
  'Royal Enfield': 'Royal Enfield',
  Motul: 'Motul',
  Bajaj: 'Bajaj',
  Honda: 'Honda',
  Tvs: 'TVS',
  Castrol: 'Castrol',
  Yamaha: 'Yamaha',
  Minda: 'Hero',       // Minda makes parts for Hero bikes
  Rolon: 'Hero',       // Rolon chain kits, mostly Hero
  'All Models': '',    // Skip — universal parts
};

async function main() {
  console.log('Bulk-tagging inventory items to brand models...');
  const items = await prisma.inventoryItem.findMany({ where: { brand: { not: null } }, select: { id: true, brand: true } });
  const brands = await prisma.vehicleBrand.findMany({ include: { models: { select: { id: true } } } });
  const existingLinks = await prisma.inventoryItemModel.findMany({ select: { inventoryItemId: true } });
  const linkedItemIds = new Set(existingLinks.map(l => l.inventoryItemId));

  const rows: { inventoryItemId: string; vehicleModelId: string }[] = [];

  for (const item of items) {
    if (linkedItemIds.has(item.id)) continue;
    const mappedBrand = brandMap[item.brand || ''] ?? item.brand;
    if (!mappedBrand) continue;
    const brand = brands.find(b => b.name.toLowerCase() === mappedBrand.toLowerCase());
    if (!brand || brand.models.length === 0) continue;
    if (['Motul', 'Castrol'].includes(brand.name)) continue;
    for (const m of brand.models) {
      rows.push({ inventoryItemId: item.id, vehicleModelId: m.id });
    }
  }

  if (rows.length) {
    await prisma.inventoryItemModel.createMany({ data: rows, skipDuplicates: true });
  }
  const itemsLinked = new Set(rows.map(r => r.inventoryItemId)).size;
  console.log(`Done: ${itemsLinked} items linked (${rows.length} join rows created)`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
