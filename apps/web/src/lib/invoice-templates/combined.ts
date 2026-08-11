/**
 * Combined template — mechanic work order (top) + customer copy (bottom) on one A4 page.
 * Cut line separates the two halves.
 */
import { toTitleCase } from '@/lib/title-case';
import { esc, formatDateIST, buildBusinessInfo } from './helpers';

export function generateCombinedHTML(invoice: any, settings: Record<string, any>, logoUrl: string): string {
  const biz = buildBusinessInfo(settings);
  const items = invoice.lineItems.filter((li: any) => li.lineType !== 'DISCOUNT_ADJUSTMENT');
  const rows = items.map((li: any, i: number) => `<tr><td style="padding:3px 6px;border-bottom:1px solid #eee;font-size:10px">${i+1}</td><td style="padding:3px 6px;border-bottom:1px solid #eee;font-size:10px">${esc((li.lineType === 'LABOR' || li.lineType === 'SERVICE_CHARGE') ? li.description.replace(/\s*[—–-]\s*[A-Z][A-Z\s]+$/, '') : li.description)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee;text-align:center;font-size:10px">${Number(li.quantity)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee;text-align:right;font-size:10px">₹${Number(li.lineTotal).toLocaleString()}</td></tr>`).join('');
  const tasks = invoice.jobCard?.tasks?.map((t: any, i: number) => `<tr><td style="padding:2px 4px;border-bottom:1px solid #eee;font-size:10px">${i+1}. ${esc(t.taskName)}</td><td style="padding:2px 4px;border-bottom:1px solid #eee;text-align:center;font-size:10px">${t.status === 'COMPLETED' || t.status === 'DONE' ? '✅' : '⬜'}</td></tr>`).join('') || '';
  const parts = invoice.jobCard?.parts?.map((p: any) => `<tr><td style="padding:2px 4px;border-bottom:1px solid #eee;font-size:10px">${esc(p.inventoryItem?.itemName || 'Part')}</td><td style="padding:2px 4px;border-bottom:1px solid #eee;text-align:center;font-size:10px">×${Number(p.requiredQty)}</td></tr>`).join('') || '';
  const vehicle = invoice.vehicle ? `${esc(invoice.vehicle.brand)} ${esc(invoice.vehicle.model)} — ${esc(invoice.vehicle.registrationNumber)}` : 'Counter Sale';
  const odometer = invoice.jobCard?.odometerAtIntake ? ` | Odo: ${invoice.jobCard.odometerAtIntake.toLocaleString()}km` : '';
  const fuel = invoice.jobCard?.fuelIndicator ? ` | Fuel: ${esc(invoice.jobCard.fuelIndicator)}` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600,700,800&display=swap"><title>Combined — ${esc(invoice.invoiceNumber)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Google Sans','Product Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a1a; font-size:11px; padding:14px 20px; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; padding:0; } @page { margin:8mm; size:A4; } }
table { width:100%; border-collapse:collapse; }
th { background:#f3f4f6; padding:4px 6px; text-align:left; font-size:9px; text-transform:uppercase; color:#666; font-weight:600; }
.section-top { min-height:72vh; padding-bottom:14px; display:flex; flex-direction:column; justify-content:space-between; }
.cut { border-top:2px dashed #aaa; margin:6px 0; position:relative; }
.cut::before { content:'✂ cut here'; position:absolute; top:-8px; left:0; background:#fff; padding:0 8px; color:#999; font-size:10px; }
.section-bottom { padding-top:6px; max-height:25vh; }
.header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1.5px solid #111; }
.meta { display:flex; gap:8px; margin-bottom:8px; font-size:11px; }
.meta-box { background:#f9fafb; padding:6px 10px; border-radius:4px; flex:1; }
.meta-label { font-size:8px; text-transform:uppercase; color:#888; font-weight:600; margin-bottom:2px; }
.signature-row { margin-top:14px; display:flex; justify-content:space-between; font-size:10px; color:#666; padding-top:6px; border-top:1px solid #f3f4f6; }
</style></head><body><div>

<div class="section-top">
  <div>
  <div class="header">
    <div><img src="${esc(logoUrl)}" style="height:26px" alt="${esc(biz.name)}"><span style="font-size:8px;color:#666;margin-left:6px">MECHANIC WORK ORDER</span></div>
    <div style="text-align:right"><strong style="font-size:11px">${esc(invoice.jobCard?.jobCardNumber || invoice.invoiceNumber)}</strong><br><span style="font-size:9px;color:#666">${formatDateIST(invoice.invoiceDate)}</span></div>
  </div>
  <div class="meta">
    <div class="meta-box"><div class="meta-label">Vehicle</div>${vehicle}${odometer}${fuel}</div>
    <div class="meta-box"><div class="meta-label">Customer</div>${esc(toTitleCase(invoice.customer.fullName))} · ${esc(invoice.customer.phoneNumber)}</div>
  </div>
  <div style="margin-bottom:4px;padding:3px 8px;background:#e0f2fe;border-radius:4px;font-size:10px"><strong>Estimated Delivery:</strong> _______________</div>
  ${invoice.jobCard?.issueSummary ? `<div style="margin-bottom:4px;padding:3px 8px;background:#fef3c7;border-radius:4px;font-size:10px"><strong>Issue:</strong> ${esc(invoice.jobCard.issueSummary)}</div>` : ''}
  <div style="display:flex;gap:12px">
    ${tasks ? `<div style="flex:1"><strong style="font-size:9px;text-transform:uppercase;color:#666">Tasks</strong><table><tbody>${tasks}</tbody></table></div>` : ''}
    ${parts ? `<div style="flex:1"><strong style="font-size:9px;text-transform:uppercase;color:#666">Parts</strong><table><tbody>${parts}</tbody></table></div>` : ''}
  </div>
  </div>
  <div class="signature-row"><div>Mechanic: _______________</div><div>Date: _______________</div></div>
</div>

<div class="cut"></div>

<div class="section-bottom">
  <div class="header">
    <div><img src="${esc(logoUrl)}" style="height:24px" alt="${esc(biz.name)}"><span style="font-size:8px;color:#999;margin-left:6px;letter-spacing:1px">SERVICE · SPARES · SAFETY</span></div>
    <div style="text-align:right"><strong style="font-size:10px">CUSTOMER COPY</strong><br><span style="font-size:9px;color:#666">${esc(invoice.invoiceNumber)} · ${formatDateIST(invoice.invoiceDate)}</span></div>
  </div>
  <div class="meta">
    <div class="meta-box"><div class="meta-label">Customer</div>${esc(toTitleCase(invoice.customer.fullName))} · ${esc(invoice.customer.phoneNumber)}</div>
    <div class="meta-box"><div class="meta-label">Vehicle</div>${vehicle}${odometer}${fuel}</div>
  </div>
  <div style="margin-bottom:4px;padding:3px 8px;background:#e0f2fe;border-radius:4px;font-size:10px"><strong>Estimated Delivery:</strong> _______________</div>
  <table><thead><tr><th>#</th><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <div style="margin-top:12px"><div style="padding:6px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:12px;font-weight:700">Total: ₹${Number(invoice.grandTotal).toLocaleString()} · ${esc(invoice.paymentStatus)}</span>
    <span style="font-size:9px;color:#666">Customer Signature: _______________</span>
  </div></div>
</div>

</div></body></html>`;
}
