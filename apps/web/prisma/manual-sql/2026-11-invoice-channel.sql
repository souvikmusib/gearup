-- Invoice payment channel (Gateway 1 / Gateway 2 / Cash)
-- Generated with: prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script
-- NOT applied automatically. Review, then apply with `pnpm db:push` or run this file.
--
-- Safety notes:
--  * Purely additive: no existing column, row or constraint is modified or dropped.
--  * ADD COLUMN with a constant DEFAULT is metadata-only on Postgres 11+ (this DB is 17.6),
--    so there is no table rewrite and no long lock on "Invoice".
--  * All existing invoices become 'CASH'. Historical payments cannot be mapped to a
--    gateway because PaymentMode has no gateway values; correct individual invoices by hand if needed.
--  * Rollback:
--      DROP INDEX "Invoice_channel_invoiceDate_idx";
--      ALTER TABLE "Invoice" DROP COLUMN "channel";
--      DROP TYPE "InvoiceChannel";

-- CreateEnum
CREATE TYPE "InvoiceChannel" AS ENUM ('GATEWAY_1', 'GATEWAY_2', 'CASH');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "channel" "InvoiceChannel" NOT NULL DEFAULT 'CASH';

-- CreateIndex
CREATE INDEX "Invoice_channel_invoiceDate_idx" ON "Invoice"("channel", "invoiceDate");
