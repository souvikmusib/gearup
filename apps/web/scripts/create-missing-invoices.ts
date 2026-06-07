// Run with: npx tsx scripts/create-missing-invoices.ts
import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const prisma = new PrismaClient();
const alphanumeric = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
const generateInvoiceNumber = () => `INV-${alphanumeric()}`;

async function main() {
  const jobCards = await prisma.jobCard.findMany({
    where: { invoices: { none: {} } },
    select: { id: true, jobCardNumber: true, customerId: true, vehicleId: true, createdAt: true },
  });

  console.log(`Found ${jobCards.length} job cards without invoices`);

  for (const jc of jobCards) {
    await prisma.invoice.create({
      data: {
        invoiceNumber: generateInvoiceNumber(),
        jobCardId: jc.id,
        customerId: jc.customerId,
        vehicleId: jc.vehicleId,
        saleType: 'SERVICE',
        invoiceDate: jc.createdAt,
        invoiceStatus: 'DRAFT',
        paymentStatus: 'UNPAID',
      } as any,
    });
    console.log(`  ✅ ${jc.jobCardNumber} → invoice created`);
  }

  console.log('Done.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
