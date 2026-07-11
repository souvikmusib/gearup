/**
 * Migration script: Create legacy StockBatch records for existing inventory items.
 *
 * Run AFTER `prisma db push` has applied the new StockBatch model.
 *
 * Usage:
 *   cd apps/web
 *   npx tsx prisma/migrate-stock-batches.ts
 *
 * What it does:
 *   - For every InventoryItem with quantityInStock > 0 or reservedQuantity > 0
 *   - Creates a single "LEGACY-001" batch with:
 *     - costPrice = item's current costPrice
 *     - initialQty = quantityInStock + reservedQuantity (total stock that existed)
 *     - remainingQty = quantityInStock (available, not reserved)
 *     - purchaseDate = item.createdAt
 *     - supplierId = item.supplierId
 *   - Skips items that already have batches (safe to re-run)
 *
 * This is idempotent — running it twice won't create duplicate batches.
 */

import { PrismaClient, Prisma } from '@prisma/client';

// Use DIRECT_URL if available (bypasses pgbouncer — avoids prepared statement errors)
const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  log: ['warn', 'error'],
  datasourceUrl: databaseUrl,
});

async function main() {
  console.log('🔍 Finding inventory items with stock that need legacy batches...\n');

  // Find items that have stock but NO batches yet
  const itemsWithStock = await prisma.inventoryItem.findMany({
    where: {
      OR: [
        { quantityInStock: { gt: 0 } },
        { reservedQuantity: { gt: 0 } },
      ],
      stockBatches: { none: {} }, // skip items that already have batches
    },
    select: {
      id: true,
      sku: true,
      itemName: true,
      costPrice: true,
      quantityInStock: true,
      reservedQuantity: true,
      supplierId: true,
      createdAt: true,
    },
  });

  if (itemsWithStock.length === 0) {
    console.log('✅ No items need migration — all items either have zero stock or already have batches.');
    return;
  }

  console.log(`📦 Found ${itemsWithStock.length} items to migrate:\n`);

  let created = 0;
  let skipped = 0;

  for (const item of itemsWithStock) {
    const totalStock = new Prisma.Decimal(item.quantityInStock).add(
      new Prisma.Decimal(item.reservedQuantity)
    );

    // Skip if total is zero somehow (shouldn't happen due to filter but safety check)
    if (totalStock.lte(0)) {
      skipped++;
      continue;
    }

    await prisma.stockBatch.create({
      data: {
        inventoryItemId: item.id,
        batchNumber: 'LEGACY-001',
        supplierId: item.supplierId,
        costPrice: item.costPrice,
        initialQty: totalStock,
        remainingQty: item.quantityInStock, // only the unreserved portion is "remaining"
        purchaseDate: item.createdAt,
        notes: 'Auto-created by batch tracking migration — represents pre-existing stock',
      },
    });

    console.log(
      `  ✓ ${item.sku} (${item.itemName}) — batch created: ` +
      `cost=₹${item.costPrice}, initial=${totalStock}, remaining=${item.quantityInStock}`
    );
    created++;
  }

  console.log(`\n✅ Migration complete: ${created} batches created, ${skipped} skipped.`);

  // Verification
  const totalBatches = await prisma.stockBatch.count();
  const totalItems = await prisma.inventoryItem.count({ where: { isActive: true } });
  const itemsWithBatches = await prisma.inventoryItem.count({
    where: { stockBatches: { some: {} } },
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Total active items: ${totalItems}`);
  console.log(`   Items with batches: ${itemsWithBatches}`);
  console.log(`   Total batch records: ${totalBatches}`);
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
