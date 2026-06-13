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

function formatDateIST(date: Date | string, opts?: { long?: boolean }): string {
  const d = new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
  if (opts?.long) {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
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
 * Industry-standard invoice template (v3).
 * - Google Sans throughout.
 * - SVG wordmark on top, accent strip in brand red.
 * - Bill-To / Vehicle / Job-Card cards; itemised table with HSN/SAC
 *   when available, discount column, tax column, amount.
 * - Totals box with subtotal / discount / tax / round-off / grand
 *   total, plus amount-paid + balance-due when relevant.
 * - Amount in words, bank details, authorised signatory, terms.
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
  const footer = settings['invoice.footer'] || 'Thank you for your business!';

  const nonDiscountItems = invoice.lineItems.filter((li: any) => li.lineType !== 'DISCOUNT_ADJUSTMENT');
  const discountItems = invoice.lineItems.filter((li: any) => li.lineType === 'DISCOUNT_ADJUSTMENT');
  const discountFromAdjustments = discountItems.reduce((s: number, li: any) => s + Math.abs(Number(li.lineTotal)), 0);
  const discountFromPercent = invoice.lineItems.filter((li: any) => li.lineType !== 'DISCOUNT_ADJUSTMENT' && Number(li.discountPercent) > 0).reduce((s: number, li: any) => s + Number(li.quantity) * Number(li.unitPrice) * Number(li.discountPercent) / 100, 0);
  const totalDiscount = discountFromAdjustments + discountFromPercent;

  const rows = nonDiscountItems.map((li: any, i: number) => {
    const item = li.referenceItemId ? itemMap[li.referenceItemId] : null;
    const sku = item?.sku || '';
    const mrp = item?.mrp ? Number(item.mrp) : null;
    const disc = Number(li.discountPercent) || 0;
    const qty = Number(li.quantity);
    const rate = Number(li.unitPrice);
    const taxRate = Number(li.taxRate) || 0;
    const taxable = qty * rate * (1 - disc / 100);
    const taxAmt = taxable * (taxRate / 100);
    const hsn = item?.hsn || (li.lineType === 'PART' ? '8714' : li.lineType === 'LABOR' || li.lineType === 'SERVICE_CHARGE' ? '9987' : '');
    return `<tr>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;text-align:center;color:#9ca3af;font-size:10px">${i + 1}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6">
        <div style="font-weight:600;color:#111">${esc(li.description)}</div>
        ${sku ? `<div style="color:#9ca3af;font-size:10px;margin-top:1px;font-family:'Google Sans Code',ui-monospace,monospace">SKU: ${esc(sku)}</div>` : ''}
      </td>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;text-align:center;color:#6b7280;font-size:10px;font-family:'Google Sans Code',ui-monospace,monospace">${hsn || '—'}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;text-align:center">${qty}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;text-align:right">${mrp ? `<span style="color:#9ca3af">₹${mrp.toLocaleString('en-IN')}</span>` : '—'}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;text-align:right">₹${rate.toLocaleString('en-IN')}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;text-align:center;color:${disc ? '#16a34a' : '#9ca3af'};font-weight:${disc ? '600' : '400'}">${disc ? disc + '%' : '—'}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;font-size:11px">${taxRate ? `${taxRate}%<br><span style="font-size:10px">₹${taxAmt.toFixed(2)}</span>` : '—'}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:700;color:#111">₹${Number(li.lineTotal).toLocaleString('en-IN')}</td>
    </tr>`;
  }).join('');

  const payments = invoice.payments?.map((p: any) => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6">${formatDateIST(p.paymentDate)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6">${esc(p.paymentMode)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;font-family:'Google Sans Code',ui-monospace,monospace;font-size:11px">${esc(p.referenceNumber || '—')}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:#16a34a">₹${Number(p.amount).toLocaleString('en-IN')}</td>
    </tr>`).join('') || '';

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

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600,700,800&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Code:wght@400;500;600&display=swap">
<title>Invoice ${esc(invoice.invoiceNumber)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Google Sans','Product Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#111; font-size:12px; background:#fff; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } @page { margin:8mm; size:A4; } }
.page { max-width:820px; margin:0 auto; background:#fff; }
table { width:100%; border-collapse:collapse; }
th { background:#fafafa; padding:10px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.6px; color:#6b7280; font-weight:600; border-bottom:2px solid #e5e7eb; }
.card-label { font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#9ca3af; font-weight:600; }
.card-value { font-size:13px; font-weight:600; color:#111; margin-top:4px; }
.card-meta { font-size:11px; color:#6b7280; margin-top:2px; line-height:1.5; }
</style></head><body><div class="page">

<!-- Header band -->
<div style="background:#fff;border-bottom:1px solid #e5e7eb">
  <div style="padding:24px 32px 18px 32px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px">
    <div style="flex:1;min-width:0">
      <img src="${esc(logoUrl)}" style="height:42px;width:auto;display:block" alt="${esc(biz.name)}" />
      <div style="margin-top:10px;color:#6b7280;font-size:11px;line-height:1.55">
        ${biz.address ? `${esc(biz.address)}<br>` : ''}
        ${biz.phone ? `Tel: ${esc(biz.phone)}` : ''}${biz.phone && biz.email ? ' &nbsp;·&nbsp; ' : ''}${biz.email ? `${esc(biz.email)}` : ''}
        ${biz.gst ? `<br><span style="color:#111;font-weight:600">GSTIN:</span> <span style="font-family:'Google Sans Code',ui-monospace,monospace">${esc(biz.gst)}</span>` : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;font-weight:600">Tax Invoice</div>
      <div style="font-size:22px;font-weight:800;color:#111;margin-top:6px;font-family:'Google Sans Code',ui-monospace,monospace">${esc(invoice.invoiceNumber)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:6px">Issued <strong style="color:#111">${formatDateIST(invoice.invoiceDate, { long: true })}</strong></div>
      <div style="margin-top:10px;display:inline-block;background:${statusBg};color:${statusColor};font-size:10px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase">${esc(invoice.paymentStatus.replace('_', ' '))}</div>
    </div>
  </div>
  <!-- Brand accent strip -->
  <div style="height:3px;background:linear-gradient(90deg,#FF0000 0%,#AC0000 100%)"></div>
</div>

<!-- Body -->
<div style="padding:24px 32px">

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
        <th style="width:70px;text-align:right">MRP</th>
        <th style="width:70px;text-align:right">Rate</th>
        <th style="width:50px;text-align:center">Disc</th>
        <th style="width:75px;text-align:right">Tax</th>
        <th style="width:85px;text-align:right">Amount</th>
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
        <tr><td style="padding:5px 12px;color:#6b7280;font-size:12px">Subtotal</td><td style="padding:5px 12px;text-align:right;font-size:12px">₹${Number(invoice.subtotal).toLocaleString('en-IN')}</td></tr>
        ${totalDiscount > 0 ? `<tr><td style="padding:5px 12px;color:#16a34a;font-size:12px;font-weight:600">Discount</td><td style="padding:5px 12px;text-align:right;color:#16a34a;font-size:12px;font-weight:600">−₹${totalDiscount.toLocaleString('en-IN')}</td></tr>` : ''}
        ${taxTotal > 0 ? `
          <tr><td style="padding:5px 12px;color:#6b7280;font-size:11px">CGST (½ Tax)</td><td style="padding:5px 12px;text-align:right;font-size:11px">₹${cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          <tr><td style="padding:5px 12px;color:#6b7280;font-size:11px">SGST (½ Tax)</td><td style="padding:5px 12px;text-align:right;font-size:11px">₹${sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
        ` : ''}
        ${Math.abs(roundOff) > 0.001 ? `<tr><td style="padding:5px 12px;color:#6b7280;font-size:11px">Round Off</td><td style="padding:5px 12px;text-align:right;font-size:11px">${roundOff > 0 ? '+' : ''}₹${roundOff.toFixed(2)}</td></tr>` : ''}
        <tr><td colspan="2" style="padding:0;border-top:2px solid #111"></td></tr>
        <tr><td style="padding:10px 12px;font-size:14px;font-weight:800;color:#111">Net Total</td><td style="padding:10px 12px;text-align:right;font-size:16px;font-weight:800;color:#111">₹${netAmount.toLocaleString('en-IN')}</td></tr>
        ${Number(invoice.amountPaid) > 0 ? `<tr><td style="padding:5px 12px;color:#16a34a;font-size:12px;border-top:1px solid #e5e7eb">Amount Paid</td><td style="padding:5px 12px;text-align:right;color:#16a34a;font-size:12px;border-top:1px solid #e5e7eb">₹${Number(invoice.amountPaid).toLocaleString('en-IN')}</td></tr>` : ''}
        ${Number(invoice.amountDue) > 0 ? `<tr><td style="padding:7px 12px;color:#dc2626;font-size:13px;font-weight:700;background:#fee2e2">Balance Due</td><td style="padding:7px 12px;text-align:right;color:#dc2626;font-size:13px;font-weight:700;background:#fee2e2">₹${Number(invoice.amountDue).toLocaleString('en-IN')}</td></tr>` : ''}
      </table>
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

  <!-- Signature + Terms -->
  <div style="margin-top:30px;display:flex;gap:24px;align-items:flex-end">
    <div style="flex:1;font-size:10px;color:#6b7280;line-height:1.6">
      <div style="font-weight:600;color:#374151;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-size:9px">Terms & Conditions</div>
      <div>1. Goods once sold will not be taken back or exchanged.</div>
      <div>2. Warranty as per manufacturer policy only.</div>
      <div>3. Subject to ${esc(biz.address ? biz.address.split(',').pop()?.trim() || 'local' : 'local')} jurisdiction.</div>
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
<div style="margin-top:18px;padding:14px 32px;background:#fafafa;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#9ca3af">
  <div>${esc(footer)}</div>
  <div>${esc(biz.name)}${biz.gst ? ` · GSTIN ${esc(biz.gst)}` : ''}</div>
</div>

</div></body></html>`;
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
    <div style="text-align:right"><div style="font-size:16px;font-weight:700">${esc(invoice.jobCard?.jobCardNumber || '-')}</div><div style="color:#666;font-size:12px">${formatDateIST(invoice.invoiceDate)}</div></div>
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
  const footer = settings['invoice.footer'] || 'Thank you for being a Premium AMC member.';

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

  const rows = nonDiscountItems.map((li: any, i: number) => {
    const isAmcCovered = li.lineType === 'AMC' && Number(li.lineTotal) === 0;
    const disc = Number(li.discountPercent) || 0;
    const qty = Number(li.quantity);
    const rate = Number(li.unitPrice);
    const taxRate = Number(li.taxRate) || 0;
    const taxable = qty * rate * (1 - disc / 100);
    const taxAmt = taxable * (taxRate / 100);
    const hsn = li.lineType === 'PART' ? '8714' : li.lineType === 'LABOR' || li.lineType === 'SERVICE_CHARGE' ? '9987' : li.lineType === 'AMC' ? '9987' : '';
    const rowBg = isAmcCovered ? 'background:#fffbeb' : '';
    const cellBorder = isAmcCovered ? '#fde68a' : '#f3f4f6';
    return `<tr style="${rowBg}">
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:center;color:#9ca3af;font-size:10px">${i + 1}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder}">
        <div style="font-weight:600;color:#111">${esc(li.description)}${isAmcCovered ? '<span style="display:inline-block;margin-left:8px;background:#111;color:#D4A017;font-size:8px;font-weight:800;padding:2px 8px;border-radius:2px;text-transform:uppercase;letter-spacing:1.2px;border:1px solid #D4A017">★ AMC Covered</span>' : ''}</div>
      </td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:center;color:#6b7280;font-size:10px;font-family:'Google Sans Code',ui-monospace,monospace">${hsn || '—'}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:center">${qty}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:right">${isAmcCovered ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:11px">₹${planPrice.toLocaleString('en-IN')}</span>` : `₹${rate.toLocaleString('en-IN')}`}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:center;color:${disc ? '#16a34a' : '#9ca3af'};font-weight:${disc ? '600' : '400'}">${disc ? disc + '%' : '—'}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:right;color:#6b7280;font-size:11px">${taxRate ? `${taxRate}%<br><span style="font-size:10px">₹${taxAmt.toFixed(2)}</span>` : '—'}</td>
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

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600,700,800&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Code:wght@400;500;600&display=swap">
<title>AMC Invoice ${esc(invoice.invoiceNumber)}</title>
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
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2.5px;color:#D4A017;font-weight:700">★ Premium AMC Tax Invoice</div>
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
        <th style="width:75px;text-align:right">Tax</th>
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
        <tr><td style="padding:5px 12px;color:#6b7280;font-size:12px">Subtotal</td><td style="padding:5px 12px;text-align:right;font-size:12px">₹${Number(invoice.subtotal).toLocaleString('en-IN')}</td></tr>
        ${totalDiscount > 0 ? `<tr><td style="padding:5px 12px;color:#16a34a;font-size:12px;font-weight:600">Discount</td><td style="padding:5px 12px;text-align:right;color:#16a34a;font-size:12px;font-weight:600">−₹${totalDiscount.toLocaleString('en-IN')}</td></tr>` : ''}
        ${amcSavings > 0 ? `<tr><td style="padding:6px 12px;color:#92400E;font-size:12px;font-weight:700;background:#FFFBEB"><span style="color:#D4A017">★</span> AMC Benefit</td><td style="padding:6px 12px;text-align:right;color:#92400E;font-size:12px;font-weight:700;background:#FFFBEB">−₹${amcSavings.toLocaleString('en-IN')}</td></tr>` : ''}
        ${taxTotal > 0 ? `
          <tr><td style="padding:5px 12px;color:#6b7280;font-size:11px">CGST (½ Tax)</td><td style="padding:5px 12px;text-align:right;font-size:11px">₹${cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          <tr><td style="padding:5px 12px;color:#6b7280;font-size:11px">SGST (½ Tax)</td><td style="padding:5px 12px;text-align:right;font-size:11px">₹${sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
        ` : ''}
        ${Math.abs(roundOff) > 0.001 ? `<tr><td style="padding:5px 12px;color:#6b7280;font-size:11px">Round Off</td><td style="padding:5px 12px;text-align:right;font-size:11px">${roundOff > 0 ? '+' : ''}₹${roundOff.toFixed(2)}</td></tr>` : ''}
        <tr><td colspan="2" style="padding:0;border-top:2px solid #D4A017"></td></tr>
        <tr><td style="padding:10px 12px;font-size:14px;font-weight:800;color:#111">Net Total</td><td style="padding:10px 12px;text-align:right;font-size:16px;font-weight:800;color:#111">₹${netAmount.toLocaleString('en-IN')}</td></tr>
        ${Number(invoice.amountPaid) > 0 ? `<tr><td style="padding:5px 12px;color:#16a34a;font-size:12px;border-top:1px solid #e5e7eb">Amount Paid</td><td style="padding:5px 12px;text-align:right;color:#16a34a;font-size:12px;border-top:1px solid #e5e7eb">₹${Number(invoice.amountPaid).toLocaleString('en-IN')}</td></tr>` : ''}
        ${Number(invoice.amountDue) > 0 ? `<tr><td style="padding:7px 12px;color:#dc2626;font-size:13px;font-weight:700;background:#fee2e2">Balance Due</td><td style="padding:7px 12px;text-align:right;color:#dc2626;font-size:13px;font-weight:700;background:#fee2e2">₹${Number(invoice.amountDue).toLocaleString('en-IN')}</td></tr>` : ''}
      </table>
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
    const invItems = refIds.length > 0 ? await prisma.inventoryItem.findMany({ where: { id: { in: refIds } }, select: { id: true, sku: true, mrp: true } }) : [];
    const itemMap = Object.fromEntries(invItems.map((i: any) => [i.id, i]));

    // Check if invoice has AMC line items
    const hasAmc = invoice.lineItems.some((li: any) => li.lineType === 'AMC');
    let amcContract: any = null;
    if (hasAmc && invoice.vehicleId) {
      amcContract = await prisma.amcContract.findFirst({ where: { vehicleId: invoice.vehicleId, status: 'ACTIVE' }, include: { plan: true } });
    }

    let html: string;
    if (type === 'combined') {
      const biz = { name: settings['business.name'] || 'GearUp Auto Service', phone: settings['business.phone'] || '' };
      const items = invoice.lineItems.filter((li: any) => li.lineType !== 'DISCOUNT_ADJUSTMENT');
      const rows = items.map((li: any, i: number) => `<tr><td style="padding:3px 6px;border-bottom:1px solid #eee;font-size:10px">${i+1}</td><td style="padding:3px 6px;border-bottom:1px solid #eee;font-size:10px">${esc(li.description)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee;text-align:center;font-size:10px">${Number(li.quantity)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee;text-align:right;font-size:10px">₹${Number(li.lineTotal).toLocaleString()}</td></tr>`).join('');
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
.section-top { padding-bottom:14px; }
.cut { border-top:2px dashed #aaa; margin:14px 0; position:relative; }
.cut::before { content:'✂ cut here'; position:absolute; top:-8px; left:0; background:#fff; padding:0 8px; color:#999; font-size:10px; }
.section-bottom { padding-top:6px; }
.header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1.5px solid #111; }
.meta { display:flex; gap:8px; margin-bottom:8px; font-size:11px; }
.meta-box { background:#f9fafb; padding:6px 10px; border-radius:4px; flex:1; }
.meta-label { font-size:8px; text-transform:uppercase; color:#888; font-weight:600; margin-bottom:2px; }
.signature-row { margin-top:14px; display:flex; justify-content:space-between; font-size:10px; color:#666; padding-top:6px; border-top:1px solid #f3f4f6; }
</style></head><body><div>

<div class="section-top">
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
    } else if (hasAmc && amcContract) {
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
