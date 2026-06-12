/**
 * One-time script: Convert stored names to Title Case in DB.
 * Run with: npx tsx scripts/migrate-title-case.ts
 * 
 * Safe to re-run (idempotent).
 * Only updates: fullName, itemName, brand, designation, supplierName, categoryName
 * Does NOT touch: IDs, phone numbers, emails, SKUs, registration numbers
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRESERVE_UPPERCASE = new Set(['AMC', 'GST', 'UPI', 'PDF', 'OTP', 'EMI', 'ID', 'SKU', 'MRP', 'HSN']);

function toTitleCase(str: string | null): string | null {
  if (!str) return str;
  return str.replace(/\S+/g, (word) => {
    const upper = word.toUpperCase();
    if (PRESERVE_UPPERCASE.has(upper)) return upper;
    if (/^[A-Z]{1,3}-\d/.test(word) || /^\d+[A-Z]/.test(word) || /^[A-Z]+\d+/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

async function main() {
  console.log('Starting title case migration...\n');

  // Customers
  const customers = await prisma.customer.findMany({ select: { id: true, fullName: true } });
  let updated = 0;
  for (const c of customers) {
    const newName = toTitleCase(c.fullName);
    if (newName !== c.fullName) {
      await prisma.customer.update({ where: { id: c.id }, data: { fullName: newName! } });
      updated++;
    }
  }
  console.log(`✅ Customers: ${updated}/${customers.length} updated`);

  // Workers
  const workers = await prisma.worker.findMany({ select: { id: true, fullName: true, designation: true } });
  updated = 0;
  for (const w of workers) {
    const data: any = {};
    const newName = toTitleCase(w.fullName);
    const newDesig = toTitleCase(w.designation);
    if (newName !== w.fullName) data.fullName = newName;
    if (newDesig !== w.designation) data.designation = newDesig;
    if (Object.keys(data).length) { await prisma.worker.update({ where: { id: w.id }, data }); updated++; }
  }
  console.log(`✅ Workers: ${updated}/${workers.length} updated`);

  // Inventory Items
  const items = await prisma.inventoryItem.findMany({ select: { id: true, itemName: true, brand: true } });
  updated = 0;
  for (const item of items) {
    const data: any = {};
    const newName = toTitleCase(item.itemName);
    const newBrand = toTitleCase(item.brand);
    if (newName !== item.itemName) data.itemName = newName;
    if (newBrand !== item.brand) data.brand = newBrand;
    if (Object.keys(data).length) { await prisma.inventoryItem.update({ where: { id: item.id }, data }); updated++; }
  }
  console.log(`✅ Inventory Items: ${updated}/${items.length} updated`);

  // Suppliers
  const suppliers = await prisma.supplier.findMany({ select: { id: true, supplierName: true } });
  updated = 0;
  for (const s of suppliers) {
    const newName = toTitleCase(s.supplierName);
    if (newName !== s.supplierName) { await prisma.supplier.update({ where: { id: s.id }, data: { supplierName: newName! } }); updated++; }
  }
  console.log(`✅ Suppliers: ${updated}/${suppliers.length} updated`);

  // Categories
  const categories = await prisma.inventoryCategory.findMany({ select: { id: true, categoryName: true } });
  updated = 0;
  for (const c of categories) {
    const newName = toTitleCase(c.categoryName);
    if (newName !== c.categoryName) { await prisma.inventoryCategory.update({ where: { id: c.id }, data: { categoryName: newName! } }); updated++; }
  }
  console.log(`✅ Categories: ${updated}/${categories.length} updated`);

  console.log('\n🎉 Done!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
