/**
 * AMC invoice. Same layout as the standard invoice (./invoice-layout) plus the AMC
 * membership banner, plan / covered badges and the savings ribbon.
 */
import { renderInvoiceDocument } from './invoice-layout';

export function generateAmcInvoiceHTML(
  invoice: any,
  settings: Record<string, any>,
  logoUrl: string,
  amcContract: any,
  itemMap: Record<string, any> = {},
): string {
  return renderInvoiceDocument(invoice, settings, logoUrl, { itemMap, amcContract });
}
