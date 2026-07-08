/**
 * Traditional Indian Tax Invoice (bordered A4 format) — Option B grouped style.
 * - Single table with colored group-header rows separating Parts/Labor/Custom.
 * - DISCOUNT_ADJUSTMENT lines excluded from the table, shown as callout bar.
 * - GearUp branding: #dc2626 red, Google Sans font.
 * - GST back-calculation: taxable = lineTotal/(1+rate/100), cgst=sgst=taxable*rate/200.
 */
import { toTitleCase } from '@/lib/title-case';
import { esc, formatDateIST, numberToWords, groupLineItems, buildBusinessInfo } from './helpers';

export function generateInvoiceHTML(invoice: any, settings: Record<string, any>, logoUrl: string, itemMap: Record<string, any> = {}): string {
  const biz = buildBusinessInfo(settings);
  const showGst = !!invoice.showGst;
  const grandTotal = Number(invoice.grandTotal);
  const netAmount = Math.round(grandTotal);
  const roundOff = netAmount - grandTotal;
  const amountWords = numberToWords(netAmount) + ' Rupees Only';

  // GST totals (back-calculated from inclusive amounts)
  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;

  const allItems = invoice.lineItems || [];
  const { parts, labor, custom, discounts } = groupLineItems(allItems);

  // Build rows for a group with continuous serial numbering
  let serial = 0;
  function buildGroupRows(items: any[]): string {
    return items.map((li: any) => {
      serial++;
      const item = li.referenceItemId ? itemMap[li.referenceItemId] : null;
      const sku = item?.sku || '';
      const hsn = li.hsnCode || item?.hsnCode || (li.lineType === 'PART' ? '87141090' : ['LABOR', 'SERVICE_CHARGE', 'CUSTOM_CHARGE', 'AMC'].includes(li.lineType) ? '998714' : '');
      const qty = Number(li.quantity);
      const rate = Number(li.unitPrice);
      const disc = Number(li.discountPercent) || 0;
      const lineTotal = Number(li.lineTotal);
      const gstRate = Number(li.taxRate) || 18;
      const taxable = lineTotal / (1 + gstRate / 100);
      const cgst = taxable * (gstRate / 2) / 100;
      const sgst = taxable * (gstRate / 2) / 100;
      totalTaxable += taxable;
      totalCgst += cgst;
      totalSgst += sgst;

      const descDisplay = esc(li.description);
      const partNo = li.lineType === 'PART' && sku ? esc(sku) : '—';
      const rowBg = serial % 2 === 0 ? 'background:#fafafa' : '';

      if (showGst) {
        return `<tr style="${rowBg}">
          <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:10px;color:#9ca3af">${serial}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:left;font-size:9.5px;color:#111;font-family:monospace;font-weight:600">${partNo}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 6px;font-size:10px;font-weight:600">${descDisplay}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:9.5px;color:#111;font-family:monospace">${hsn || '—'}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:10px">${qty}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:right;font-size:10px">${rate.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:10px;color:${disc ? '#16a34a' : '#9ca3af'};font-weight:${disc ? '600' : '400'}">${disc ? disc + '%' : '—'}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:right;font-size:10px;color:#6b7280">${taxable.toFixed(2)}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:right;font-size:10px;color:#6b7280">${cgst.toFixed(2)}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:right;font-size:10px;color:#6b7280">${sgst.toFixed(2)}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:right;font-size:10px;font-weight:700">${lineTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
        </tr>`;
      }
      return `<tr style="${rowBg}">
        <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:10px;color:#9ca3af">${serial}</td>
        <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:left;font-size:9.5px;color:#111;font-family:monospace;font-weight:600">${partNo}</td>
        <td style="border:1px solid #e5e7eb;padding:5px 6px;font-size:10px;font-weight:600">${descDisplay}</td>
        <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:9.5px;color:#111;font-family:monospace">${hsn || '—'}</td>
        <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:10px">${qty}</td>
        <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:right;font-size:10px">${rate.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
        <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:10px;color:${disc ? '#16a34a' : '#9ca3af'};font-weight:${disc ? '600' : '400'}">${disc ? disc + '%' : '—'}</td>
        <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:right;font-size:10px;font-weight:700">${lineTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
      </tr>`;
    }).join('');
  }

  // Group header row generator
  const gstColSpan = showGst ? 11 : 8;
  function groupHeaderRow(label: string, color: string, bgColor: string): string {
    return `<tr><td colspan="${gstColSpan}" style="border:1px solid #e5e7eb;padding:5px 10px;font-size:9px;font-weight:700;color:${color};background:${bgColor};text-transform:uppercase;letter-spacing:1px">${label}</td></tr>`;
  }

  // Build full table body with group headers
  let tableBody = '';
  if (parts.length > 0) {
    tableBody += groupHeaderRow('⚙ Parts & Spares', '#1d4ed8', '#eff6ff');
    tableBody += buildGroupRows(parts);
  }
  if (labor.length > 0) {
    tableBody += groupHeaderRow('🔧 Labour & Service', '#166534', '#f0fdf4');
    tableBody += buildGroupRows(labor);
  }
  if (custom.length > 0) {
    tableBody += groupHeaderRow('📋 Additional Charges', '#7e22ce', '#faf5ff');
    tableBody += buildGroupRows(custom);
  }

  // Discount callout bar (between table and totals)
  let discountCallout = '';
  const totalDiscountAmount = discounts.reduce((s: number, li: any) => s + Math.abs(Number(li.lineTotal)), 0);
  if (discounts.length === 1) {
    const d = discounts[0];
    discountCallout = `
    <div style="margin:0;padding:8px 14px;background:#f0fdf4;border:1px solid #bbf7d0;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:10px;color:#166534;font-weight:600">🏷️ ${esc(d.description)}</span>
      <span style="font-size:11px;color:#16a34a;font-weight:700">−₹${Math.abs(Number(d.lineTotal)).toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
    </div>`;
    // Include discount in GST calculation
    const gstRate = Number(d.taxRate) || 18;
    const lineTotal = Number(d.lineTotal);
    const taxable = lineTotal / (1 + gstRate / 100);
    totalTaxable += taxable;
    totalCgst += taxable * (gstRate / 2) / 100;
    totalSgst += taxable * (gstRate / 2) / 100;
  } else if (discounts.length > 1) {
    const discountRows = discounts.map((d: any) => {
      // Include in GST calculation
      const gstRate = Number(d.taxRate) || 18;
      const lineTotal = Number(d.lineTotal);
      const taxable = lineTotal / (1 + gstRate / 100);
      totalTaxable += taxable;
      totalCgst += taxable * (gstRate / 2) / 100;
      totalSgst += taxable * (gstRate / 2) / 100;
      return `<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:10px;color:#374151">${esc(d.description)}</span><span style="font-size:10px;color:#16a34a;font-weight:600">−₹${Math.abs(Number(d.lineTotal)).toLocaleString('en-IN', {minimumFractionDigits: 2})}</span></div>`;
    }).join('');
    discountCallout = `
    <div style="margin:0;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0">
      <div style="font-size:9px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">🏷️ Discounts Applied</div>
      ${discountRows}
      <div style="display:flex;justify-content:space-between;padding-top:5px;margin-top:5px;border-top:1px dashed #bbf7d0"><span style="font-size:10px;font-weight:700;color:#166534">Total Savings</span><span style="font-size:11px;font-weight:700;color:#16a34a">−₹${totalDiscountAmount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span></div>
    </div>`;
  }

  // HSN-wise tax grouping for the summary table
  const hsnGroups: Record<string, { taxable: number; cgst: number; sgst: number; rate: number }> = {};
  allItems.forEach((li: any) => {
    const item = li.referenceItemId ? itemMap[li.referenceItemId] : null;
    const hsn = li.hsnCode || item?.hsnCode || (li.lineType === 'PART' ? '87141090' : ['LABOR', 'SERVICE_CHARGE', 'CUSTOM_CHARGE', 'AMC'].includes(li.lineType) ? '998714' : '');
    if (!hsn) return;
    const lineTotal = Number(li.lineTotal);
    const gstRate = Number(li.taxRate) || 18;
    const taxable = lineTotal / (1 + gstRate / 100);
    if (!hsnGroups[hsn]) hsnGroups[hsn] = { taxable: 0, cgst: 0, sgst: 0, rate: gstRate };
    hsnGroups[hsn].taxable += taxable;
    hsnGroups[hsn].cgst += taxable * (gstRate / 2) / 100;
    hsnGroups[hsn].sgst += taxable * (gstRate / 2) / 100;
  });

  const paymentLabel = invoice.paymentStatus === 'PAID' ? 'PAID' : invoice.paymentStatus === 'PARTIALLY_PAID' ? 'PARTIAL' : 'UNPAID';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Invoice - ${esc(invoice.invoiceNumber)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600,700,800&display=swap">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Google Sans','Product Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#111; font-size:12px; background:#fff; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } @page { margin:6mm; size:A4; } }
</style></head><body>
<div style="max-width:210mm;margin:0 auto;border:2px solid #222;padding:0">

  <!-- Header -->
  <div style="display:flex;border-bottom:2px solid #222;justify-content:space-between;padding:12px 18px">
    <div>
      ${logoUrl ? `<img src="${esc(logoUrl)}" style="height:36px;width:auto;display:block;margin-bottom:4px" alt="${esc(biz.name)}" />` : `<div style="font-size:28px;font-weight:900;color:#dc2626">GEAR UP</div>`}
      <div style="font-size:8.5px;font-weight:700;color:#555;letter-spacing:2.5px;text-transform:uppercase">Service · Spares · Safety</div>
      <div style="font-size:9px;color:#444;margin-top:5px;line-height:1.4">${esc(biz.address)}</div>
    </div>
    <div style="text-align:right;font-size:10px;color:#333;line-height:1.6">
      ${biz.gst ? `<div style="font-weight:800;font-size:11px">GSTIN: ${esc(biz.gst)}</div>` : ''}
      ${biz.phone ? `<div>Mob: ${esc(biz.phone)}</div>` : ''}
      ${biz.email ? `<div>Email: ${esc(biz.email)}</div>` : ''}
    </div>
  </div>

  <!-- TAX INVOICE badge -->
  <div style="text-align:center;padding:6px 0;border-bottom:2px solid #222;background:#fef2f2">
    <span style="font-size:15px;font-weight:900;color:#dc2626;letter-spacing:4px">INVOICE</span>
    <span style="font-size:9px;color:#888;margin-left:10px">Original</span>
  </div>

  <!-- Info grid -->
  <div style="display:flex;border-bottom:2px solid #222">
    <div style="flex:1;border-right:1px solid #222">
      <div style="display:flex;padding:4px 12px;border-bottom:1px solid #e5e7eb">
        <span style="font-weight:700;min-width:85px;font-size:10px;color:#555">Invoice No.</span>
        <span style="font-weight:600;font-size:10.5px">${esc(invoice.invoiceNumber)}</span>
      </div>
      <div style="display:flex;padding:4px 12px;border-bottom:1px solid #e5e7eb">
        <span style="font-weight:700;min-width:85px;font-size:10px;color:#555">Date</span>
        <span style="font-weight:600;font-size:10.5px">${formatDateIST(invoice.invoiceDate, { long: true, time: true })}</span>
      </div>
      <div style="display:flex;padding:4px 12px;border-bottom:1px solid #e5e7eb">
        <span style="font-weight:700;min-width:85px;font-size:10px;color:#555">Job Card</span>
        <span style="font-weight:600;font-size:10.5px">${invoice.jobCard ? esc(invoice.jobCard.jobCardNumber) : 'Counter Sale'}</span>
      </div>
      <div style="display:flex;padding:4px 12px">
        <span style="font-weight:700;min-width:85px;font-size:10px;color:#555">Payment</span>
        <span style="font-weight:600;font-size:10.5px">${paymentLabel}</span>
      </div>
    </div>
    <div style="flex:1">
      <div style="display:flex;padding:4px 12px;border-bottom:1px solid #e5e7eb">
        <span style="font-weight:700;min-width:85px;font-size:10px;color:#555">Customer</span>
        <span style="font-weight:600;font-size:10.5px">${esc(toTitleCase(invoice.customer.fullName))}</span>
      </div>
      <div style="display:flex;padding:4px 12px;border-bottom:1px solid #e5e7eb">
        <span style="font-weight:700;min-width:85px;font-size:10px;color:#555">Phone</span>
        <span style="font-weight:600;font-size:10.5px">${esc(invoice.customer.phoneNumber)}</span>
      </div>
      <div style="display:flex;padding:4px 12px;border-bottom:1px solid #e5e7eb">
        <span style="font-weight:700;min-width:85px;font-size:10px;color:#555">Vehicle</span>
        <span style="font-weight:600;font-size:10.5px">${esc(toTitleCase(invoice.vehicle?.brand ?? ''))} ${esc(toTitleCase(invoice.vehicle?.model ?? ''))}</span>
      </div>
      <div style="display:flex;padding:4px 12px">
        <span style="font-weight:700;min-width:85px;font-size:10px;color:#555">Reg. No.</span>
        <span style="font-weight:600;font-size:10.5px">${esc(invoice.vehicle?.registrationNumber ?? 'N/A')}</span>
      </div>
    </div>
  </div>

  <!-- Pricing note -->
  <div style="padding:4px 12px;font-size:8.5px;color:#666;background:#f9fafb;border-bottom:1px solid #e5e7eb">
    * All prices inclusive of GST. Amount = Qty × Unit Price × (1 − Discount%)
  </div>

  <!-- Items table -->
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:#dc2626">
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:center;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:25px">SL</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:left;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:90px">Part No.</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:left;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px">Description</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:center;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:55px">HSN/SAC</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:center;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:35px">Qty</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:right;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:65px">Rate</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:center;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:40px">Disc%</th>
        ${showGst ? `
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:right;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:60px">Taxable</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:right;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:50px">CGST</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:right;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:50px">SGST</th>
        ` : ''}
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:right;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:70px">Amount</th>
      </tr>
    </thead>
    <tbody>${tableBody}</tbody>
  </table>

  <!-- Discount callout -->
  ${discountCallout}

  <!-- Bottom: HSN tax table + words (left) | Totals (right) -->
  <div style="display:flex;border-top:2px solid #222">
    <div style="flex:55%;border-right:1px solid #222;padding:10px 12px">
      ${showGst ? `
      <table style="width:100%;border-collapse:collapse;font-size:9px">
        <thead>
          <tr><th style="background:#f3f4f6;padding:3px 4px;border:1px solid #ddd;font-weight:700">HSN/SAC</th><th style="background:#f3f4f6;padding:3px 4px;border:1px solid #ddd;font-weight:700">Rate</th><th style="background:#f3f4f6;padding:3px 4px;border:1px solid #ddd;font-weight:700">Taxable</th><th style="background:#f3f4f6;padding:3px 4px;border:1px solid #ddd;font-weight:700">CGST</th><th style="background:#f3f4f6;padding:3px 4px;border:1px solid #ddd;font-weight:700">SGST</th><th style="background:#f3f4f6;padding:3px 4px;border:1px solid #ddd;font-weight:700">Tax Total</th></tr>
        </thead>
        <tbody>
          ${Object.entries(hsnGroups).map(([hsn, g]: [string, any]) => `<tr><td style="padding:3px 4px;border:1px solid #ddd;text-align:center">${hsn}</td><td style="padding:3px 4px;border:1px solid #ddd;text-align:center">${g.rate}%</td><td style="padding:3px 4px;border:1px solid #ddd;text-align:center">${g.taxable.toFixed(2)}</td><td style="padding:3px 4px;border:1px solid #ddd;text-align:center">${g.cgst.toFixed(2)}</td><td style="padding:3px 4px;border:1px solid #ddd;text-align:center">${g.sgst.toFixed(2)}</td><td style="padding:3px 4px;border:1px solid #ddd;text-align:center">${(g.cgst + g.sgst).toFixed(2)}</td></tr>`).join('')}
          <tr style="font-weight:700;background:#f9fafb"><td colspan="2" style="padding:3px 4px;border:1px solid #ddd"><strong>Total</strong></td><td style="padding:3px 4px;border:1px solid #ddd;text-align:center"><strong>${totalTaxable.toFixed(2)}</strong></td><td style="padding:3px 4px;border:1px solid #ddd;text-align:center"><strong>${totalCgst.toFixed(2)}</strong></td><td style="padding:3px 4px;border:1px solid #ddd;text-align:center"><strong>${totalSgst.toFixed(2)}</strong></td><td style="padding:3px 4px;border:1px solid #ddd;text-align:center"><strong>${(totalCgst + totalSgst).toFixed(2)}</strong></td></tr>
        </tbody>
      </table>` : ''}
      <div style="font-size:10px;color:#333;margin-top:8px;padding:5px 8px;background:#fef2f2;border-radius:3px;border-left:3px solid #dc2626"><strong>₹ in words:</strong> ${esc(amountWords)}</div>
    </div>
    <!-- Right: Totals -->
    <div style="flex:45%;padding:10px 12px">
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:11px;font-weight:700;color:#333">Subtotal</span><span style="font-size:11px;font-weight:700;font-family:monospace">₹${Number(invoice.subtotal).toLocaleString('en-IN', {minimumFractionDigits: 2})}</span></div>
      ${showGst ? `
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:11px;color:#555">Taxable Value</span><span style="font-size:11px;font-weight:600;font-family:monospace">₹${totalTaxable.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:11px;color:#555">CGST</span><span style="font-size:11px;font-weight:600;font-family:monospace">₹${totalCgst.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:11px;color:#555">SGST</span><span style="font-size:11px;font-weight:600;font-family:monospace">₹${totalSgst.toFixed(2)}</span></div>
      ` : ''}
      ${totalDiscountAmount > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:11px;color:#16a34a;font-weight:600">Discount${discounts.length > 1 ? ' (' + discounts.length + ')' : ''}</span><span style="font-size:11px;font-weight:600;font-family:monospace;color:#16a34a">−₹${totalDiscountAmount.toFixed(2)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:11px;color:#555">Round Off</span><span style="font-size:11px;font-weight:600;font-family:monospace">${roundOff >= 0 ? '+' : ''}₹${roundOff.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:6px;border-top:2px solid #222">
        <span style="font-size:15px;font-weight:900;color:#dc2626">GRAND TOTAL</span>
        <span style="font-size:15px;font-weight:900;color:#dc2626">\u20B9${netAmount.toLocaleString('en-IN')}</span>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #ddd">
        <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:11px;color:#555">Paid (${esc(invoice.payments?.[0]?.paymentMode || 'Cash')})</span><span style="font-size:11px;font-weight:700;font-family:monospace;color:#16a34a">₹${Number(invoice.amountPaid).toLocaleString('en-IN')}</span></div>
        <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:11px;color:#555">Balance</span><span style="font-size:11px;font-weight:600;font-family:monospace">₹${Number(invoice.amountDue).toLocaleString('en-IN')}</span></div>
      </div>
    </div>
  </div>

  <!-- Footer: Bank (left) + Auth signatory (right) -->
  <div style="display:flex;border-top:2px solid #222">
    <div style="flex:1;padding:10px 12px;border-right:1px solid #222;font-size:9px;color:#555;line-height:1.6">
      <div style="font-weight:700;font-size:9.5px;color:#333;margin-bottom:3px">Bank Details:</div>
      ${biz.bankName ? `<div>Bank: ${esc(biz.bankName)}</div>` : ''}
      ${biz.bankAccount ? `<div>A/C: ${esc(biz.bankAccount)}${biz.bankIfsc ? ` | IFSC: ${esc(biz.bankIfsc)}` : ''}</div>` : ''}
      ${biz.bankUpi ? `<div style="font-weight:600;margin-top:4px">UPI: ${esc(biz.bankUpi)}</div>` : ''}
    </div>
    <div style="width:180px;padding:10px 12px;text-align:right">
      <div style="font-size:9.5px;color:#555">For <strong style="color:#dc2626">${esc(biz.name)}</strong></div>
      <div style="height:35px"></div>
      <div style="font-weight:700;font-size:10px">Authorised Signatory</div>
    </div>
  </div>

  <div style="padding:5px 12px;border-top:1px solid #e5e7eb;font-size:8px;color:#999">
    * All prices inclusive of GST &nbsp;• Goods once sold will not be taken back &nbsp;• Subject to Bankura jurisdiction &nbsp;• E. & O. E.
  </div>

</div>
</body></html>`;
}
