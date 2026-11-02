/**
 * Standard invoice. Layout lives in ./invoice-layout (shared with the AMC invoice so
 * both formats stay identical).
 */
import { renderInvoiceDocument } from './invoice-layout';

export function generateInvoiceHTML(
  invoice: any,
  settings: Record<string, any>,
  logoUrl: string,
  itemMap: Record<string, any> = {},
): string {
  return renderInvoiceDocument(invoice, settings, logoUrl, { itemMap });
}
