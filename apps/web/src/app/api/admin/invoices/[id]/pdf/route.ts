import { NextRequest, NextResponse } from 'next/server';
import { toTitleCase } from '@/lib/title-case';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

// Escape user-controlled strings before interpolation into PDF/HTML templates.
// Prevents XSS via customer name, descriptions, settings, etc. rendered into the
// print-preview window (same-origin) — see audit finding pdf-html-xss.
function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateIST(date: Date | string, opts?: { long?: boolean; time?: boolean }): string {
  const d = new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
  const timePart = opts?.time ? ` · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : '';
  if (opts?.long) {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}${timePart}`;
  }
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}${timePart}`;
}

function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const scales = ['','Thousand','Lakh','Crore'];
  const toWords = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + toWords(n % 100) : '');
  };
  const int = Math.round(num);
  if (int < 1000) return toWords(int);
  const parts: string[] = [];
  const groups = [int % 1000, Math.floor(int / 1000) % 100, Math.floor(int / 100000) % 100, Math.floor(int / 10000000)];
  groups.forEach((g, i) => { if (g) parts.unshift(toWords(g) + ' ' + scales[i]); });
  return parts.join(' ').trim();
}

/**
 * Traditional Indian Tax Invoice (bordered A4 format).
 * - 2px solid bordered layout like automobile dealer invoices.
 * - GearUp branding: #dc2626 red, Segoe UI/Tahoma font.
 * - GST back-calculation: taxable = lineTotal/1.18, cgst=sgst=taxable*0.09.
 * - Handles DISCOUNT_ADJUSTMENT lines with negative GST.
 */
function generateInvoiceHTML(invoice: any, settings: Record<string, any>, logoUrl: string, itemMap: Record<string, any> = {}) {
  const biz = {
    name: settings['business.name'] || 'GearUp Auto Service',
    phone: settings['business.phone'] || '',
    email: settings['business.email'] || '',
    address: settings['business.address'] || '',
    gst: settings['business.gst'] || '',
    bankName: settings['business.bank.name'] || '',
    bankAccount: settings['business.bank.account'] || '',
    bankIfsc: settings['business.bank.ifsc'] || '',
    bankUpi: settings['business.bank.upi'] || '',
  };

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
  const rows = allItems.map((li: any, i: number) => {
    const item = li.referenceItemId ? itemMap[li.referenceItemId] : null;
    const sku = item?.sku || '';
    const hsn = li.hsnCode || item?.hsnCode || (li.lineType === 'PART' ? '87141090' : ['LABOR', 'SERVICE_CHARGE', 'CUSTOM_CHARGE', 'AMC'].includes(li.lineType) ? '998714' : '');
    const qty = Number(li.quantity);
    const rate = Number(li.unitPrice);
    const disc = Number(li.discountPercent) || 0;
    const lineTotal = Number(li.lineTotal);
    const gstRate = Number(li.taxRate) || 18; // fallback for old invoices
    const taxable = lineTotal / (1 + gstRate / 100);
    const cgst = taxable * (gstRate / 2) / 100;
    const sgst = taxable * (gstRate / 2) / 100;
    totalTaxable += taxable;
    totalCgst += cgst;
    totalSgst += sgst;

    const descDisplay = esc(li.description);
    const skuLine = (li.lineType === 'PART' && sku) ? `<br><span style="font-size:9px;color:#888;font-family:monospace">${esc(sku)}</span>` : '';
    const rowBg = li.lineType === 'SERVICE_CHARGE' || li.lineType === 'LABOR' ? 'background:#f0fdf4' : li.lineType === 'CUSTOM_CHARGE' ? 'background:#faf5ff' : li.lineType === 'DISCOUNT_ADJUSTMENT' ? 'background:#fef2f2' : (i % 2 === 1 ? 'background:#fafafa' : '');

    if (showGst) {
      return `<tr style="${rowBg}">
        <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:10px;color:#9ca3af">${i + 1}</td>
        <td style="border:1px solid #e5e7eb;padding:5px 6px;font-size:10px"><span style="font-weight:600">${descDisplay}</span>${skuLine}</td>
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
      <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:10px;color:#9ca3af">${i + 1}</td>
      <td style="border:1px solid #e5e7eb;padding:5px 6px;font-size:10px"><span style="font-weight:600">${descDisplay}</span>${skuLine}</td>
      <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:9.5px;color:#111;font-family:monospace">${hsn || '—'}</td>
      <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:10px">${qty}</td>
      <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:right;font-size:10px">${rate.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
      <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;font-size:10px;color:${disc ? '#16a34a' : '#9ca3af'};font-weight:${disc ? '600' : '400'}">${disc ? disc + '%' : '—'}</td>
      <td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:right;font-size:10px;font-weight:700">${lineTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
    </tr>`;
  }).join('');

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

  const gstColSpan = showGst ? 10 : 7;
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
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:left;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px">Description</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:center;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:55px">HSN</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:center;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:35px">Qty</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:right;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:65px">Unit Price</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:center;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:40px">Disc%</th>
        ${showGst ? `
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:right;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:65px">Taxable</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:right;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:55px">CGST</th>
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:right;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:55px">SGST</th>
        ` : ''}
        <th style="border:1px solid #b91c1c;padding:6px 4px;text-align:right;font-size:8px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;width:70px">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

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
      ${showGst ? `
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:11px;color:#555">Taxable Value</span><span style="font-size:11px;font-weight:600;font-family:monospace">₹${totalTaxable.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:11px;color:#555">CGST</span><span style="font-size:11px;font-weight:600;font-family:monospace">₹${totalCgst.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:11px;color:#555">SGST</span><span style="font-size:11px;font-weight:600;font-family:monospace">₹${totalSgst.toFixed(2)}</span></div>
      ` : ''}
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

function generateCustomerDraftHTML(invoice: any, settings: Record<string, any>, logoUrl: string) {
  const biz = {
    name: settings['business.name'] || 'GearUp Auto Service',
    phone: settings['business.phone'] || '',
    address: settings['business.address'] || '',
  };

  const rows = invoice.lineItems.filter((li: any) => li.lineType !== 'DISCOUNT_ADJUSTMENT').map((li: any, i: number) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${i + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(li.description)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${li.lineType === 'PART' ? 'Part' : li.lineType === 'LABOR' ? 'Labor' : li.lineType === 'AMC' ? 'AMC' : 'Service'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${Number(li.quantity)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600,700,800&display=swap"><title>Service Summary — ${esc(invoice.invoiceNumber)}</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Google Sans','Product Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a1a; font-size:13px; } .page { max-width:800px; margin:0 auto; padding:40px; } .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; padding-bottom:16px; border-bottom:2px solid #111; } .biz-name { font-size:20px; font-weight:700; } table { width:100%; border-collapse:collapse; margin-top:16px; } th { background:#f3f4f6; padding:10px 12px; text-align:left; font-size:11px; text-transform:uppercase; color:#666; font-weight:600; } .footer { margin-top:32px; padding-top:12px; border-top:1px solid #eee; text-align:center; color:#888; font-size:12px; }</style>
</head><body><div class="page">
  <div class="header">
    <div><img src="${esc(logoUrl)}" style="width:150px;margin-bottom:8px" alt="${esc(biz.name)}"><div class="biz-name">${esc(biz.name)}</div>${biz.phone ? `<div style="color:#666;font-size:12px">📞 ${esc(biz.phone)}</div>` : ''}</div>
    <div style="text-align:right"><div style="font-size:22px;font-weight:700">SERVICE SUMMARY</div><div style="color:#666;font-size:13px;margin-top:4px">${esc(invoice.invoiceNumber)}</div><div style="color:#666;font-size:12px;margin-top:4px">${formatDateIST(invoice.invoiceDate, { long: true })}</div></div>
  </div>
  <div style="display:flex;gap:16px;margin-bottom:20px">
    <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px"><div style="font-size:10px;text-transform:uppercase;color:#888;font-weight:600">Customer</div><div style="font-weight:500;margin-top:4px">${esc(toTitleCase(invoice.customer.fullName))}</div><div style="color:#666;font-size:12px">${esc(invoice.customer.phoneNumber)}</div></div>
    <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px"><div style="font-size:10px;text-transform:uppercase;color:#888;font-weight:600">Vehicle</div><div style="font-weight:500;margin-top:4px">${esc(invoice.vehicle?.brand ?? '')} ${esc(invoice.vehicle?.model ?? '')}</div><div style="color:#666;font-size:12px">${esc(invoice.vehicle?.registrationNumber ?? 'Counter Sale')}</div>${invoice.jobCard?.odometerAtIntake ? `<div style="color:#666;font-size:11px;margin-top:2px">Odometer: ${invoice.jobCard.odometerAtIntake.toLocaleString()} km${invoice.jobCard.fuelIndicator ? ` · Fuel: ${esc(invoice.jobCard.fuelIndicator)}` : ''}</div>` : ''}</div>
  </div>
  ${invoice.jobCard?.issueSummary ? `<div style="margin-bottom:16px;padding:12px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a"><strong>Issue:</strong> ${esc(invoice.jobCard.issueSummary)}</div>` : ''}
  <table><thead><tr><th>#</th><th>Service / Part</th><th style="text-align:center">Type</th><th style="text-align:center">Qty</th></tr></thead><tbody>${rows}</tbody></table>
  <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;text-align:center;font-weight:600;font-size:15px">Estimate Total: ₹${Number(invoice.grandTotal).toLocaleString()}</div>
  <div class="footer"><p>Thank you for choosing ${esc(biz.name)}!</p></div>
</div></body></html>`;
}

function generateMechanicCopyHTML(invoice: any, settings: Record<string, any>, logoUrl: string) {
  const biz = { name: settings['business.name'] || 'GearUp Auto Service' };

  const tasks = invoice.jobCard?.tasks?.map((t: any, i: number) => `
    <tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${i + 1}</td><td style="padding:6px 12px;border-bottom:1px solid #eee">${esc(t.taskName)}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${t.status === 'COMPLETED' || t.status === 'DONE' ? '✅' : '⬜'}</td></tr>`).join('') || '<tr><td colspan="3" style="padding:12px;color:#888;text-align:center">No tasks</td></tr>';

  const parts = invoice.jobCard?.parts?.map((p: any, i: number) => `
    <tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${i + 1}</td><td style="padding:6px 12px;border-bottom:1px solid #eee">${esc(p.inventoryItem?.itemName || 'Part')}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${Number(p.requiredQty)}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">₹${Number(p.unitPrice).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan="4" style="padding:12px;color:#888;text-align:center">No parts</td></tr>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600,700,800&display=swap"><title>Mechanic Copy — ${esc(invoice.jobCard?.jobCardNumber || invoice.invoiceNumber)}</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Google Sans','Product Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a1a; font-size:13px; } .page { max-width:800px; margin:0 auto; padding:40px; } table { width:100%; border-collapse:collapse; margin-top:8px; } th { background:#f3f4f6; padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase; color:#666; font-weight:600; } h2 { font-size:16px; margin-top:24px; margin-bottom:4px; }</style>
</head><body><div class="page">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #111">
    <div><div style="font-size:20px;font-weight:700">${esc(biz.name)}</div><div style="font-size:11px;color:#888;margin-top:2px">MECHANIC WORK ORDER</div></div>
    <div style="text-align:right"><div style="font-size:16px;font-weight:700">${esc(invoice.jobCard?.jobCardNumber || '-')}</div><div style="color:#666;font-size:12px">${formatDateIST(invoice.invoiceDate, { long: true, time: true })}</div></div>
  </div>
  <div style="display:flex;gap:16px;margin-bottom:20px">
    <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px"><strong>Vehicle:</strong> ${invoice.vehicle ? `${esc(invoice.vehicle.brand)} ${esc(invoice.vehicle.model)} — ${esc(invoice.vehicle.registrationNumber)}` : 'Counter Sale'}${invoice.jobCard?.odometerAtIntake ? `<br><span style="font-size:12px;color:#666">Odometer: ${invoice.jobCard.odometerAtIntake.toLocaleString()} km${invoice.jobCard.fuelIndicator ? ` · Fuel: ${esc(invoice.jobCard.fuelIndicator)}` : ''}</span>` : ''}</div>
    <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px"><strong>Customer:</strong> ${esc(toTitleCase(invoice.customer.fullName))} (${esc(invoice.customer.phoneNumber)})</div>
  </div>
  ${invoice.jobCard?.issueSummary ? `<div style="margin-bottom:16px;padding:12px;background:#fef3c7;border-radius:8px;border:1px solid #fde68a"><strong>Issue:</strong> ${esc(invoice.jobCard.issueSummary)}</div>` : ''}
  <h2>Tasks</h2>
  <table><thead><tr><th>#</th><th>Task</th><th style="text-align:center">Done</th></tr></thead><tbody>${tasks}</tbody></table>
  <h2>Parts Required</h2>
  <table><thead><tr><th>#</th><th>Part</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th></tr></thead><tbody>${parts}</tbody></table>
  <div style="margin-top:32px;border-top:1px solid #eee;padding-top:16px;display:flex;justify-content:space-between">
    <div><strong>Mechanic Signature:</strong> ___________________</div>
    <div><strong>Date:</strong> ___________________</div>
  </div>
</div></body></html>`;
}

/**
 * Gold-tier AMC invoice template (v3).
 * Same base structure as `generateInvoiceHTML` so a member sees a
 * familiar layout, but dressed in a premium gold palette and with
 * AMC-specific banners + line-item highlights.
 */
function generateAmcInvoiceHTML(invoice: any, settings: Record<string, any>, logoUrl: string, amcContract: any) {
  const biz = {
    name: settings['business.name'] || 'GearUp Auto Service',
    phone: settings['business.phone'] || '',
    email: settings['business.email'] || '',
    address: settings['business.address'] || '',
    gst: settings['business.gst'] || '',
    bankName: settings['business.bank.name'] || '',
    bankAccount: settings['business.bank.account'] || '',
    bankIfsc: settings['business.bank.ifsc'] || '',
    bankUpi: settings['business.bank.upi'] || '',
  };
  const footer = settings['invoice.footerNote'] || 'Thank you for being a Premium AMC member.';
  const showGst = !!invoice.showGst;

  const planPrice = Number(amcContract.plan.price);
  const amcSavings = invoice.lineItems
    .filter((li: any) => li.lineType === 'AMC' && Number(li.lineTotal) === 0)
    .reduce((s: number, li: any) => s + Number(li.quantity) * Number(li.unitPrice), 0);
  const discountFromAdjustments = invoice.lineItems
    .filter((li: any) => li.lineType === 'DISCOUNT_ADJUSTMENT')
    .reduce((s: number, li: any) => s + Math.abs(Number(li.lineTotal)), 0);
  const discountFromPercent = invoice.lineItems
    .filter((li: any) => li.lineType !== 'DISCOUNT_ADJUSTMENT' && Number(li.discountPercent) > 0)
    .reduce((s: number, li: any) => s + Number(li.quantity) * Number(li.unitPrice) * Number(li.discountPercent) / 100, 0);
  const totalDiscount = discountFromAdjustments + discountFromPercent;

  const nonDiscountItems = invoice.lineItems.filter((li: any) => li.lineType !== 'DISCOUNT_ADJUSTMENT');
  const discountItems = invoice.lineItems.filter((li: any) => li.lineType === 'DISCOUNT_ADJUSTMENT');
  const allDisplayItems = [...nonDiscountItems, ...discountItems];

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;

  const rows = allDisplayItems.map((li: any, i: number) => {
    const isAmcCovered = li.lineType === 'AMC' && Number(li.lineTotal) === 0;
    const isAmcPurchase = li.lineType === 'AMC' && Number(li.lineTotal) > 0;
    const disc = Number(li.discountPercent) || 0;
    const qty = Number(li.quantity);
    const rate = Number(li.unitPrice);
    const taxRate = Number(li.taxRate) || 0;
    const taxable = qty * rate * (1 - disc / 100);
    const taxAmt = taxable * (taxRate / 100);
    const hsn = li.hsnCode || (li.lineType === 'PART' ? '87141090' : li.lineType === 'LABOR' || li.lineType === 'SERVICE_CHARGE' || li.lineType === 'CUSTOM_CHARGE' || li.lineType === 'AMC' ? '998714' : '');
    const rowBg = isAmcCovered ? 'background:#fffbeb' : '';
    const cellBorder = isAmcCovered ? '#fde68a' : '#f3f4f6';
    const lineTotal = Number(li.lineTotal);
    // Back-calculate GST from inclusive price using per-line rate
    const gstRate = Number(li.taxRate) || 18;
    const gstTaxable = lineTotal / (1 + gstRate / 100);
    const gstCgst = gstTaxable * (gstRate / 2) / 100;
    const gstSgst = gstTaxable * (gstRate / 2) / 100;
    totalTaxable += gstTaxable;
    totalCgst += gstCgst;
    totalSgst += gstSgst;
    // Strip worker name from labor/service descriptions for PDF (e.g. "Labor — RAHUL GARAI" → "Labor")
    const displayDesc = (li.lineType === 'LABOR' || li.lineType === 'SERVICE_CHARGE') ? li.description.replace(/\s*[—–-]\s*[A-Z][A-Z\s]+$/, '') : li.description;
    // AMC purchase: show MRP strikethrough if available
    const mrp = Number(amcContract.plan?.mrpPrice) || 0;
    const rateCell = isAmcCovered
      ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:11px">₹${planPrice.toLocaleString('en-IN')}</span>`
      : isAmcPurchase && mrp > rate
        ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:11px">₹${mrp.toLocaleString('en-IN')}</span> <span style="font-weight:700;color:#111">₹${rate.toLocaleString('en-IN')}</span>`
        : `₹${rate.toLocaleString('en-IN')}`;
    return `<tr style="${rowBg}">
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:center;color:#9ca3af;font-size:10px">${i + 1}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder}">
        <div style="font-weight:600;color:#111">${esc(displayDesc)}${isAmcCovered ? '<span style="display:inline-block;margin-left:8px;background:#111;color:#D4A017;font-size:8px;font-weight:800;padding:2px 8px;border-radius:2px;text-transform:uppercase;letter-spacing:1.2px;border:1px solid #D4A017">★ AMC Covered</span>' : ''}</div>
      </td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:center;color:#6b7280;font-size:10px;font-family:'Google Sans Code',ui-monospace,monospace">${hsn || '—'}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:center">${qty}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:right">${rateCell}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:center;color:${disc ? '#16a34a' : '#9ca3af'};font-weight:${disc ? '600' : '400'}">${disc ? disc + '%' : '—'}</td>
      ${showGst ? `
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:right;font-size:11px;color:#6b7280">₹${gstTaxable.toFixed(2)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:right;font-size:11px;color:#6b7280">₹${gstCgst.toFixed(2)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:right;font-size:11px;color:#6b7280">₹${gstSgst.toFixed(2)}</td>
      ` : `
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:right;color:#6b7280;font-size:11px">${taxRate ? `${taxRate}%<br><span style="font-size:10px">₹${taxAmt.toFixed(2)}</span>` : '—'}</td>
      `}
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:right;font-weight:700;color:#111">${isAmcCovered ? '<span style="font-weight:800;color:#B45309;font-size:13px;letter-spacing:0.5px">FREE</span>' : `₹${Number(li.lineTotal).toLocaleString('en-IN')}`}</td>
    </tr>`;
  }).join('');

  const payments = invoice.payments?.map((p: any) => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6">${formatDateIST(p.paymentDate)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6">${esc(p.paymentMode)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;font-family:'Google Sans Code',ui-monospace,monospace;font-size:11px">${esc(p.referenceNumber || '—')}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:#16a34a">₹${Number(p.amount).toLocaleString('en-IN')}</td>
    </tr>`).join('') || '';

  const endDate = formatDateIST(amcContract.endDate, { long: true });
  const statusColor = invoice.paymentStatus === 'PAID' ? '#16a34a' : invoice.paymentStatus === 'PARTIALLY_PAID' ? '#d97706' : '#dc2626';
  const statusBg = invoice.paymentStatus === 'PAID' ? '#dcfce7' : invoice.paymentStatus === 'PARTIALLY_PAID' ? '#fef3c7' : '#fee2e2';
  const grandTotal = Number(invoice.grandTotal);
  const roundOff = Math.round(grandTotal) - grandTotal;
  const netAmount = Math.round(grandTotal);
  const amountWords = numberToWords(netAmount) + ' Rupees Only';
  const odometer = invoice.jobCard?.odometerAtIntake;
  const taxTotal = Number(invoice.taxTotal) || 0;
  const cgst = taxTotal / 2;
  const sgst = taxTotal / 2;
  // Back-calculated GST totals for showGst mode (use weighted average or sum from lines)
  const gstTaxableTotal = showGst ? totalTaxable : 0;
  const gstCgstTotal = showGst ? totalCgst : 0;
  const gstSgstTotal = showGst ? totalSgst : 0;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600,700,800&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Code:wght@400;500;600&display=swap">
<title>Invoice - ${esc(invoice.invoiceNumber)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Google Sans','Product Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#111; font-size:12px; background:#fff; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } @page { margin:8mm; size:A4; } }
.page { max-width:820px; margin:0 auto; background:#fff; border:2px solid #D4A017; }
table { width:100%; border-collapse:collapse; }
th { background:#FFFBEB; padding:10px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.6px; color:#92400E; font-weight:700; border-bottom:2px solid #FDE68A; }
.card-label { font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#9ca3af; font-weight:600; }
.card-value { font-size:13px; font-weight:600; color:#111; margin-top:4px; }
.card-meta { font-size:11px; color:#6b7280; margin-top:2px; line-height:1.5; }
</style></head><body><div class="page">

<!-- Premium dark header -->
<div style="background:linear-gradient(135deg,#1A1A1A 0%,#2D2D2D 100%);color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px;position:relative">
  <div style="flex:1;min-width:0">
    <img src="${esc(logoUrl)}" style="height:42px;width:auto;display:block;filter:brightness(0) invert(1)" alt="${esc(biz.name)}" />
    <div style="margin-top:10px;color:#D1D5DB;font-size:11px;line-height:1.55">
      ${biz.address ? `${esc(biz.address)}<br>` : ''}
      ${biz.phone ? `Tel: ${esc(biz.phone)}` : ''}${biz.phone && biz.email ? ' &nbsp;·&nbsp; ' : ''}${biz.email ? `${esc(biz.email)}` : ''}
      ${biz.gst ? `<br><span style="color:#D4A017;font-weight:600">GSTIN:</span> <span style="font-family:'Google Sans Code',ui-monospace,monospace">${esc(biz.gst)}</span>` : ''}
    </div>
  </div>
  <div style="text-align:right">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2.5px;color:#D4A017;font-weight:700">★ Premium AMC Invoice</div>
    <div style="font-size:22px;font-weight:800;color:#fff;margin-top:6px;font-family:'Google Sans Code',ui-monospace,monospace">${esc(invoice.invoiceNumber)}</div>
    <div style="font-size:11px;color:#D1D5DB;margin-top:6px">Issued <strong style="color:#fff">${formatDateIST(invoice.invoiceDate, { long: true })}</strong></div>
    <div style="margin-top:10px;display:inline-block;background:${statusBg};color:${statusColor};font-size:10px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase">${esc(invoice.paymentStatus.replace('_', ' '))}</div>
  </div>
</div>

<!-- Gold accent strip -->
<div style="height:4px;background:linear-gradient(90deg,#B45309 0%,#D4A017 30%,#FCD34D 50%,#D4A017 70%,#B45309 100%)"></div>

<!-- Membership banner -->
<div style="background:#FFFBEB;border-bottom:1px solid #FDE68A;padding:14px 32px;display:flex;justify-content:space-between;align-items:center">
  <div style="display:flex;align-items:center;gap:14px">
    <div style="width:38px;height:38px;background:linear-gradient(135deg,#D4A017,#FCD34D);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#111;font-size:18px;font-weight:800">★</div>
    <div>
      <div style="font-size:14px;font-weight:800;color:#111;letter-spacing:0.5px">AMC ${esc(amcContract.plan.planName)} <span style="color:#92400E;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;margin-left:6px">Premium Member</span></div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;font-family:'Google Sans Code',ui-monospace,monospace">Contract #${esc(amcContract.contractNumber)} · Valid till <strong style="color:#111;font-family:'Google Sans',sans-serif">${esc(endDate)}</strong></div>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:16px">
    <div style="text-align:center"><div style="font-size:22px;font-weight:800;color:#92400E;line-height:1">${amcContract.servicesRemaining}</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;margin-top:3px">Remaining</div></div>
    <div style="width:1px;height:32px;background:#FDE68A"></div>
    <div style="text-align:center"><div style="font-size:22px;font-weight:800;color:#92400E;line-height:1">${amcContract.totalServices}</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;margin-top:3px">Total</div></div>
  </div>
</div>

<!-- Body -->
<div style="padding:22px 32px">

  <!-- Bill-To / Vehicle / Job-Card cards -->
  <div style="display:flex;gap:12px;margin-bottom:22px">
    <div style="flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:12px">
      <div class="card-label">Bill To</div>
      <div class="card-value">${esc(toTitleCase(invoice.customer.fullName))}</div>
      <div class="card-meta">
        ${esc(invoice.customer.phoneNumber)}
        ${invoice.customer.email ? `<br>${esc(invoice.customer.email)}` : ''}
        ${invoice.customer.addressLine1 ? `<br>${esc(invoice.customer.addressLine1)}` : ''}
        ${invoice.customer.city ? `<br>${esc(invoice.customer.city)}${invoice.customer.postalCode ? ' — ' + esc(invoice.customer.postalCode) : ''}` : ''}
      </div>
    </div>
    <div style="flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:12px">
      <div class="card-label">Vehicle</div>
      <div class="card-value">${esc(toTitleCase(invoice.vehicle?.brand ?? ''))} ${esc(toTitleCase(invoice.vehicle?.model ?? ''))}</div>
      <div class="card-meta">
        ${invoice.vehicle?.registrationNumber ? `<span style="font-family:'Google Sans Code',ui-monospace,monospace;font-weight:600;color:#111">${esc(invoice.vehicle.registrationNumber)}</span>` : 'Counter Sale'}
        ${odometer ? `<br>Odometer: ${odometer.toLocaleString()} km` : ''}
        ${invoice.jobCard?.fuelIndicator ? `<br>Fuel: ${esc(invoice.jobCard.fuelIndicator)}` : ''}
      </div>
    </div>
    <div style="flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:12px">
      <div class="card-label">${invoice.jobCard ? 'Job Card' : 'Sale Type'}</div>
      <div class="card-value">${invoice.jobCard ? esc(invoice.jobCard.jobCardNumber) : 'Counter Sale'}</div>
      <div class="card-meta">
        Status: <strong style="color:#111">${esc(invoice.invoiceStatus)}</strong>
        ${invoice.finalizedAt ? `<br>Finalised: ${formatDateIST(invoice.finalizedAt)}` : ''}
        ${invoice.jobCard?.issueSummary ? `<br><span style="color:#9ca3af">Issue:</span> ${esc(invoice.jobCard.issueSummary.slice(0, 50))}${invoice.jobCard.issueSummary.length > 50 ? '…' : ''}` : ''}
      </div>
    </div>
  </div>

  <!-- Line items -->
  <table>
    <thead>
      <tr>
        <th style="width:30px;text-align:center">#</th>
        <th>Description</th>
        <th style="width:55px;text-align:center">HSN/SAC</th>
        <th style="width:50px;text-align:center">Qty</th>
        <th style="width:75px;text-align:right">Rate</th>
        <th style="width:50px;text-align:center">Disc</th>
        ${showGst ? `
        <th style="width:75px;text-align:right">Taxable</th>
        <th style="width:65px;text-align:right">CGST</th>
        <th style="width:65px;text-align:right">SGST</th>
        ` : `
        <th style="width:75px;text-align:right">Tax</th>
        `}
        <th style="width:90px;text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- Totals row -->
  <div style="display:flex;gap:18px;margin-top:20px">
    <div style="flex:1">
      <div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px 14px">
        <div class="card-label">Amount in Words</div>
        <div style="margin-top:5px;font-size:12px;color:#111;font-weight:500;line-height:1.5">${esc(amountWords)}</div>
      </div>
      ${biz.bankName || biz.bankUpi ? `
      <div style="margin-top:12px;border:1px solid #e5e7eb;border-radius:6px;padding:12px 14px">
        <div class="card-label">Payment Details</div>
        <div style="margin-top:5px;font-size:11px;color:#374151;line-height:1.7">
          ${biz.bankName ? `<div><strong>${esc(biz.bankName)}</strong></div>` : ''}
          ${biz.bankAccount ? `<div>A/c No: <span style="font-family:'Google Sans Code',ui-monospace,monospace">${esc(biz.bankAccount)}</span></div>` : ''}
          ${biz.bankIfsc ? `<div>IFSC: <span style="font-family:'Google Sans Code',ui-monospace,monospace">${esc(biz.bankIfsc)}</span></div>` : ''}
          ${biz.bankUpi ? `<div>UPI: <span style="font-family:'Google Sans Code',ui-monospace,monospace">${esc(biz.bankUpi)}</span></div>` : ''}
        </div>
      </div>` : ''}
    </div>
    <div style="width:280px">
      <table style="border-collapse:separate">
        <tr><td style="padding:5px 12px;color:#6b7280;font-size:12px">Total Amount</td><td style="padding:5px 12px;text-align:right;font-size:12px">₹${(netAmount + discountFromAdjustments).toLocaleString('en-IN')}</td></tr>
        ${discountFromAdjustments > 0 ? `<tr><td style="padding:5px 12px;color:#16a34a;font-size:12px;font-weight:600">Total Discount</td><td style="padding:5px 12px;text-align:right;color:#16a34a;font-size:12px;font-weight:600">−₹${discountFromAdjustments.toLocaleString('en-IN')}</td></tr>` : ''}
        ${amcSavings > 0 ? `<tr><td style="padding:6px 12px;color:#92400E;font-size:12px;font-weight:700;background:#FFFBEB"><span style="color:#D4A017">★</span> AMC Benefit</td><td style="padding:6px 12px;text-align:right;color:#92400E;font-size:12px;font-weight:700;background:#FFFBEB">−₹${amcSavings.toLocaleString('en-IN')}</td></tr>` : ''}
        ${taxTotal > 0 || showGst ? `
          <tr><td style="padding:5px 12px;color:#6b7280;font-size:11px">Taxable Value</td><td style="padding:5px 12px;text-align:right;font-size:11px">₹${(showGst ? gstTaxableTotal : (grandTotal - taxTotal)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          <tr><td style="padding:5px 12px;color:#6b7280;font-size:11px">CGST</td><td style="padding:5px 12px;text-align:right;font-size:11px">₹${(showGst ? gstCgstTotal : cgst).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          <tr><td style="padding:5px 12px;color:#6b7280;font-size:11px">SGST</td><td style="padding:5px 12px;text-align:right;font-size:11px">₹${(showGst ? gstSgstTotal : sgst).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
        ` : ''}
        ${Math.abs(roundOff) > 0.001 ? `<tr><td style="padding:5px 12px;color:#6b7280;font-size:11px">Round Off</td><td style="padding:5px 12px;text-align:right;font-size:11px">${roundOff > 0 ? '+' : ''}₹${roundOff.toFixed(2)}</td></tr>` : ''}
        <tr><td colspan="2" style="padding:0;border-top:2px solid #D4A017"></td></tr>
        <tr><td style="padding:10px 12px;font-size:14px;font-weight:800;color:#111">Net Total</td><td style="padding:10px 12px;text-align:right;font-size:16px;font-weight:800;color:#111">₹${netAmount.toLocaleString('en-IN')}</td></tr>
      </table>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-top:1px solid #e5e7eb;margin-top:4px">
        ${totalDiscount > 0 ? `<span style="font-size:10px;color:#16a34a">You saved ₹${totalDiscount.toLocaleString('en-IN')} on this invoice</span>` : '<span></span>'}
        ${Number(invoice.amountPaid) > 0 ? `<span style="font-size:11px;color:#16a34a;font-weight:600">Paid: ₹${Number(invoice.amountPaid).toLocaleString('en-IN')}</span>` : ''}
      </div>
        ${Number(invoice.amountDue) > 0 ? `<div style="margin-top:4px;padding:7px 12px;color:#dc2626;font-size:13px;font-weight:700;background:#fee2e2;border-radius:6px;text-align:center">Balance Due: ₹${Number(invoice.amountDue).toLocaleString('en-IN')}</div>` : ''}
    </div>
  </div>

  ${payments ? `
  <div style="margin-top:24px">
    <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Payment History</div>
    <table>
      <thead><tr><th>Date</th><th>Mode</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${payments}</tbody>
    </table>
  </div>` : ''}

  ${amcSavings > 0 ? `
  <!-- AMC Savings ribbon -->
  <div style="margin-top:24px;background:linear-gradient(135deg,#1A1A1A 0%,#2D2D2D 100%);color:#fff;border-radius:8px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;border:1px solid #D4A017">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="font-size:28px;color:#D4A017">★</div>
      <div>
        <div style="font-size:11px;color:#FCD34D;text-transform:uppercase;letter-spacing:1.5px;font-weight:600">You Saved Today</div>
        <div style="font-size:24px;font-weight:800;color:#fff;margin-top:2px">₹${amcSavings.toLocaleString('en-IN')}</div>
      </div>
    </div>
    <div style="text-align:right;color:#D1D5DB;font-size:11px;line-height:1.6">
      <div><strong style="color:#fff">${amcContract.servicesRemaining}</strong> free service${amcContract.servicesRemaining > 1 ? 's' : ''} remaining</div>
      <div>Plan valid until <strong style="color:#fff">${esc(endDate)}</strong></div>
    </div>
  </div>` : ''}

  <!-- Signature + Terms -->
  <div style="margin-top:24px;display:flex;gap:24px;align-items:flex-end">
    <div style="flex:1;font-size:10px;color:#6b7280;line-height:1.6">
      <div style="font-weight:600;color:#374151;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-size:9px">Terms & Conditions</div>
      <div>1. AMC benefits applied per active membership terms.</div>
      <div>2. Goods once sold will not be taken back or exchanged.</div>
      <div>3. Warranty as per manufacturer policy only.</div>
      <div>4. Subject to ${esc(biz.address ? biz.address.split(',').pop()?.trim() || 'local' : 'local')} jurisdiction.</div>
    </div>
    <div style="width:200px;text-align:center;font-size:10px;color:#6b7280">
      <div style="border-top:1px solid #111;padding-top:6px;margin-top:30px">
        <div style="font-weight:600;color:#111;font-size:11px">For ${esc(biz.name)}</div>
        <div style="margin-top:2px">Authorised Signatory</div>
      </div>
    </div>
  </div>

</div>

<!-- Footer -->
<div style="margin-top:8px;padding:14px 32px;background:#1A1A1A;color:#D4A017;border-top:2px solid #D4A017;display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:0.5px">
  <div>${esc(footer)}</div>
  <div style="color:#9ca3af">${esc(biz.name)}${biz.gst ? ` · GSTIN ${esc(biz.gst)}` : ''}</div>
</div>

</div></body></html>`;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.INVOICES_VIEW);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        lineItems: { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { paymentDate: 'desc' } },
        customer: true,
        vehicle: true,
        jobCard: { select: { jobCardNumber: true, issueSummary: true, odometerAtIntake: true, fuelIndicator: true, tasks: { select: { taskName: true, status: true } }, parts: { include: { inventoryItem: { select: { itemName: true } } } } } },
      },
    });

    const settingsRaw = await prisma.setting.findMany();
    const settings = Object.fromEntries(settingsRaw.map((s: any) => [s.key, s.value]));
    const logoUrl = `${req.nextUrl.origin}/brand/gearup.svg`;
    const markUrl = `${req.nextUrl.origin}/brand/gearup-favi.svg`;
    const type = req.nextUrl.searchParams.get('type') || 'invoice';

    // Lookup inventory items for SKU/MRP
    const refIds = invoice.lineItems.filter((li: any) => li.referenceItemId).map((li: any) => li.referenceItemId);
    const invItems = refIds.length > 0 ? await prisma.inventoryItem.findMany({ where: { id: { in: refIds } }, select: { id: true, sku: true, mrp: true, hsnCode: true } }) : [];
    const itemMap = Object.fromEntries(invItems.map((i: any) => [i.id, i]));

    // Check if invoice has AMC line items OR vehicle has an active AMC contract
    const hasAmc = invoice.lineItems.some((li: any) => li.lineType === 'AMC');
    let amcContract: any = null;
    if (invoice.vehicleId) {
      amcContract = await prisma.amcContract.findFirst({ where: { vehicleId: invoice.vehicleId, status: 'ACTIVE' }, include: { plan: true } });
    }
    // If invoice has AMC line (plan purchase) but contract doesn't exist yet, build from plan
    if (!amcContract && hasAmc) {
      const amcLine = invoice.lineItems.find((li: any) => li.lineType === 'AMC');
      if (amcLine?.referenceItemId) {
        const plan = await prisma.amcPlan.findUnique({ where: { id: amcLine.referenceItemId } });
        if (plan) {
          amcContract = {
            contractNumber: 'PENDING',
            totalServices: plan.totalServicesIncluded,
            servicesUsed: 0,
            servicesRemaining: plan.totalServicesIncluded,
            extraDiscountPercent: plan.extraDiscountPercent,
            laborDiscountPercent: plan.laborDiscountPercent,
            startDate: new Date(),
            endDate: new Date(Date.now() + plan.durationMonths * 30 * 86400000),
            plan,
          };
        }
      }
    }

    let html: string;
    if (type === 'combined') {
      const biz = { name: settings['business.name'] || 'GearUp Auto Service', phone: settings['business.phone'] || '' };
      const items = invoice.lineItems.filter((li: any) => li.lineType !== 'DISCOUNT_ADJUSTMENT');
      const rows = items.map((li: any, i: number) => `<tr><td style="padding:3px 6px;border-bottom:1px solid #eee;font-size:10px">${i+1}</td><td style="padding:3px 6px;border-bottom:1px solid #eee;font-size:10px">${esc((li.lineType === 'LABOR' || li.lineType === 'SERVICE_CHARGE') ? li.description.replace(/\s*[—–-]\s*[A-Z][A-Z\s]+$/, '') : li.description)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee;text-align:center;font-size:10px">${Number(li.quantity)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee;text-align:right;font-size:10px">₹${Number(li.lineTotal).toLocaleString()}</td></tr>`).join('');
      const tasks = invoice.jobCard?.tasks?.map((t: any, i: number) => `<tr><td style="padding:2px 4px;border-bottom:1px solid #eee;font-size:10px">${i+1}. ${esc(t.taskName)}</td><td style="padding:2px 4px;border-bottom:1px solid #eee;text-align:center;font-size:10px">${t.status === 'COMPLETED' || t.status === 'DONE' ? '✅' : '⬜'}</td></tr>`).join('') || '';
      const parts = invoice.jobCard?.parts?.map((p: any) => `<tr><td style="padding:2px 4px;border-bottom:1px solid #eee;font-size:10px">${esc(p.inventoryItem?.itemName || 'Part')}</td><td style="padding:2px 4px;border-bottom:1px solid #eee;text-align:center;font-size:10px">×${Number(p.requiredQty)}</td></tr>`).join('') || '';
      const vehicle = invoice.vehicle ? `${esc(invoice.vehicle.brand)} ${esc(invoice.vehicle.model)} — ${esc(invoice.vehicle.registrationNumber)}` : 'Counter Sale';
      const odometer = invoice.jobCard?.odometerAtIntake ? ` | Odo: ${invoice.jobCard.odometerAtIntake.toLocaleString()}km` : '';
      const fuel = invoice.jobCard?.fuelIndicator ? ` | Fuel: ${esc(invoice.jobCard.fuelIndicator)}` : '';

      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600,700,800&display=swap"><title>Combined — ${esc(invoice.invoiceNumber)}</title>
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
  <table><thead><tr><th>#</th><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <div style="margin-top:12px"><div style="padding:6px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:12px;font-weight:700">Total: ₹${Number(invoice.grandTotal).toLocaleString()} · ${esc(invoice.paymentStatus)}</span>
    <span style="font-size:9px;color:#666">Customer Signature: _______________</span>
  </div></div>
</div>

</div></body></html>`;
    } else if (type === 'customer-draft') {
      html = generateCustomerDraftHTML(invoice, settings, logoUrl);
    } else if (type === 'mechanic') {
      html = generateMechanicCopyHTML(invoice, settings, logoUrl);
    } else if (amcContract) {
      html = generateAmcInvoiceHTML(invoice, settings, logoUrl, amcContract);
    } else {
      html = generateInvoiceHTML(invoice, settings, logoUrl, itemMap);
    }

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${invoice.invoiceNumber}-${type}.html"`,
      },
    });
  } catch (e) { return handleApiError(e); }
}
