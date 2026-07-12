/**
 * Migration: Seed sellingPrice and mrp on existing StockBatch records.
 *
 * Run AFTER `prisma db push` has added the new columns.
 *
 * Usage:
 *   cd apps/web
 *   npx tsx prisma/migrate-batch-selling-price.ts
 *
 * What it does:
 *   - For every StockBatch that has sellingPrice = 0 (or null after column add)
 *   - Sets sellingPrice = InventoryItem.sellingPrice
 *   - Sets mrp = InventoryItem.mrp
 *
 * Idempotent — safe to re-run (only updates batches with sellingPrice = 0).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

async function main() {
  console.log('🔍 Finding batches that need sellingPrice seeded...\n');

  // Use raw SQL for efficiency — single UPDATE with JOIN
  const result = await prisma.$executeRaw`
    UPDATE "StockBatch" sb
    SET "sellingPrice" = i."sellingPrice",
        "mrp" = i."mrp"
    FROM "InventoryItem" i
    WHERE sb."inventoryItemId" = i."id"
      AND (sb."sellingPrice" = 0 OR sb."sellingPrice" IS NULL)
  `;

  console.log(`✅ Updated ${result} batch records with sellingPrice/mrp from their inventory items.`);

  // Verification
  const batchesWithPrice = await prisma.stockBatch.count({
    where: { sellingPrice: { gt: 0 } },
  });
  const batchesZeroPrice = await prisma.stockBatch.count({
    where: { sellingPrice: { lte: 0 } },
  });
  const totalBatches = await prisma.stockBatch.count();

  console.log(`\n📊 Summary:`);
  console.log(`   Total batches: ${totalBatches}`);
  console.log(`   With sellingPrice > 0: ${batchesWithPrice}`);
  console.log(`   With sellingPrice = 0: ${batchesZeroPrice} (items with ₹0 selling price)`);
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
