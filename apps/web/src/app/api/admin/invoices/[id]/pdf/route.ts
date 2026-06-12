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

function generateInvoiceHTML(invoice: any, settings: Record<string, any>, logoUrl: string, itemMap: Record<string, any> = {}) {
  const biz = {
    name: settings['business.name'] || 'GearUp Auto Service',
    phone: settings['business.phone'] || '',
    email: settings['business.email'] || '',
    address: settings['business.address'] || '',
    gst: settings['business.gst'] || '',
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
    return `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center">${i + 1}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee">${sku ? `<span style="color:#666;font-size:10px">${esc(sku)}</span> ` : ''}${esc(li.description)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center">${Number(li.quantity)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right">${mrp ? `₹${mrp.toLocaleString()}` : '—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right">₹${Number(li.unitPrice).toLocaleString()}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center">${disc ? disc + '%' : '—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">₹${Number(li.lineTotal).toLocaleString()}</td>
    </tr>`;
  }).join('');

  const payments = invoice.payments?.map((p: any) => `
    <tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatDateIST(p.paymentDate)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(p.paymentMode)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(p.referenceNumber || '-')}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">₹${Number(p.amount).toLocaleString()}</td></tr>`).join('') || '';

  const statusColor = invoice.paymentStatus === 'PAID' ? '#16a34a' : invoice.paymentStatus === 'PARTIALLY_PAID' ? '#d97706' : '#dc2626';
  const grandTotal = Number(invoice.grandTotal);
  const roundOff = Math.round(grandTotal) - grandTotal;
  const netAmount = Math.round(grandTotal);
  const amountWords = numberToWords(netAmount) + ' Rupees Only';
  const odometer = invoice.jobCard?.odometerAtIntake;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600,700,800&display=swap"><title>Invoice ${esc(invoice.invoiceNumber)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Google Sans','Product Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a1a; font-size:12px; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
.page { max-width:800px; margin:0 auto; padding:30px; }
table { width:100%; border-collapse:collapse; }
th { background:#f3f4f6; padding:8px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#666; font-weight:600; }
</style></head><body><div class="page">

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #111">
  <div>
    <img src="${esc(logoUrl)}" style="height:45px;margin-bottom:8px" alt="${esc(biz.name)}">
    <div style="font-size:10px;color:#666;margin-top:4px">${esc(biz.address)}</div>
    ${biz.phone ? `<div style="font-size:10px;color:#666">Ph: ${esc(biz.phone)}</div>` : ''}
    ${biz.gst ? `<div style="font-size:10px;color:#666">GSTIN: ${esc(biz.gst)}</div>` : ''}
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:700">INVOICE</div>
    <div style="color:#666;font-size:12px;margin-top:4px">${esc(invoice.invoiceNumber)}</div>
    <div style="color:#666;font-size:11px;margin-top:2px">Date: ${formatDateIST(invoice.invoiceDate, { long: true })}</div>
    <div style="margin-top:6px"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;color:white;background:${statusColor}">${esc(invoice.paymentStatus)}</span></div>
  </div>
</div>

<div style="display:flex;gap:12px;margin-bottom:20px">
  <div style="flex:1;background:#f9fafb;padding:12px;border-radius:6px">
    <div style="font-size:9px;text-transform:uppercase;color:#888;font-weight:600">Bill To</div>
    <div style="font-weight:600;margin-top:3px">${esc(toTitleCase(invoice.customer.fullName))}</div>
    <div style="color:#666;font-size:11px">${esc(invoice.customer.phoneNumber)}</div>
    ${invoice.customer.email ? `<div style="color:#666;font-size:11px">${esc(invoice.customer.email)}</div>` : ''}
  </div>
  <div style="flex:1;background:#f9fafb;padding:12px;border-radius:6px">
    <div style="font-size:9px;text-transform:uppercase;color:#888;font-weight:600">Vehicle</div>
    <div style="font-weight:600;margin-top:3px">${esc(invoice.vehicle?.brand ?? '')} ${esc(invoice.vehicle?.model ?? '')}</div>
    <div style="color:#666;font-size:11px">${esc(invoice.vehicle?.registrationNumber ?? 'Counter Sale')}</div>
    ${odometer ? `<div style="color:#666;font-size:11px">Odometer: ${odometer.toLocaleString()} km</div>` : ''}
  </div>
  <div style="flex:1;background:#f9fafb;padding:12px;border-radius:6px">
    <div style="font-size:9px;text-transform:uppercase;color:#888;font-weight:600">Details</div>
    ${invoice.jobCard ? `<div style="font-weight:600;margin-top:3px">${esc(invoice.jobCard.jobCardNumber)}</div>` : '<div style="font-weight:600;margin-top:3px">Counter Sale</div>'}
    <div style="color:#666;font-size:11px">Status: ${esc(invoice.invoiceStatus)}</div>
    ${invoice.finalizedAt ? `<div style="color:#666;font-size:11px">Finalized: ${formatDateIST(invoice.finalizedAt)}</div>` : ''}
  </div>
</div>

<table>
  <thead><tr>
    <th style="width:30px;text-align:center">#</th>
    <th>Part No. & Description</th>
    <th style="text-align:center">Qty</th>
    <th style="text-align:right">MRP</th>
    <th style="text-align:right">Rate</th>
    <th style="text-align:center">Disc%</th>
    <th style="text-align:right">Amount</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<div style="display:flex;justify-content:space-between;margin-top:16px">
  <div style="flex:1">
    <div style="font-size:11px;color:#666;margin-top:8px;border:1px solid #e5e7eb;padding:8px 10px;border-radius:4px">
      <strong>Amount in words:</strong> ${esc(amountWords)}
    </div>
  </div>
  <table style="width:240px;margin-left:20px">
    <tr><td style="padding:4px 10px;color:#666">Subtotal</td><td style="padding:4px 10px;text-align:right">₹${Number(invoice.subtotal).toLocaleString()}</td></tr>
    ${totalDiscount > 0 ? `<tr><td style="padding:4px 10px;color:#666">Discount</td><td style="padding:4px 10px;text-align:right;color:#16a34a">-₹${totalDiscount.toLocaleString()}</td></tr>` : ''}
    ${Number(invoice.taxTotal) > 0 ? `<tr><td style="padding:4px 10px;color:#666">Tax</td><td style="padding:4px 10px;text-align:right">₹${Number(invoice.taxTotal).toLocaleString()}</td></tr>` : ''}
    ${Math.abs(roundOff) > 0.001 ? `<tr><td style="padding:4px 10px;color:#666">Round Off</td><td style="padding:4px 10px;text-align:right">${roundOff > 0 ? '+' : ''}₹${roundOff.toFixed(2)}</td></tr>` : ''}
    <tr><td style="padding:6px 10px;font-size:14px;font-weight:700;border-top:2px solid #111">Net Amount</td><td style="padding:6px 10px;text-align:right;font-size:14px;font-weight:700;border-top:2px solid #111">₹${netAmount.toLocaleString()}</td></tr>
    ${Number(invoice.amountPaid) > 0 ? `<tr><td style="padding:4px 10px;color:#666">Paid</td><td style="padding:4px 10px;text-align:right;color:#16a34a">₹${Number(invoice.amountPaid).toLocaleString()}</td></tr>` : ''}
    ${Number(invoice.amountDue) > 0 ? `<tr><td style="padding:4px 10px;color:#dc2626;font-weight:600">Balance Due</td><td style="padding:4px 10px;text-align:right;color:#dc2626;font-weight:600">₹${Number(invoice.amountDue).toLocaleString()}</td></tr>` : ''}
  </table>
</div>

${payments ? `<div style="margin-top:20px"><div style="font-size:12px;font-weight:600;margin-bottom:6px">Payment History</div><table><thead><tr><th>Date</th><th>Mode</th><th>Ref</th><th style="text-align:right">Amount</th></tr></thead><tbody>${payments}</tbody></table></div>` : ''}

${(() => { const scLine = invoice.lineItems.find((li: any) => li.lineType === 'SERVICE_CHARGE' && Number(li.discountPercent) === 100); const amcLine = invoice.lineItems.find((li: any) => li.lineType === 'AMC' && Number(li.lineTotal) > 0); if (!scLine && !amcLine) return ''; const perVisit = scLine ? Number(scLine.unitPrice) : 0; const planPrice = amcLine ? Number(amcLine.unitPrice) : 0; const totalServices = 3; const totalSaving = perVisit > 0 ? (perVisit * totalServices) - planPrice : 0; return `<div style="margin-top:20px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px"><div style="font-weight:700;font-size:13px;color:#166534;margin-bottom:6px">🎉 AMC Member Savings</div><div style="font-size:12px;color:#333">${perVisit > 0 ? `Service Charge Saved: <strong>₹${perVisit}</strong><br>` : ''}${totalSaving > 0 ? `Total Plan Savings: <strong>₹${totalSaving}</strong> (${totalServices} services × ₹${perVisit} − ₹${planPrice} plan)` : ''}</div></div>`; })()}

<div style="margin-top:30px;padding-top:12px;border-top:1px solid #eee">
  <p style="font-size:10px;color:#666;margin-bottom:4px">* Goods once sold will not be taken back / No Exchange / No Return</p>
  <p style="text-align:center;color:#888;font-size:11px;margin-top:8px">${esc(footer)}</p>
  <p style="text-align:center;color:#888;font-size:10px;margin-top:2px">${esc(biz.name)}${biz.gst ? ` | GSTIN: ${esc(biz.gst)}` : ''}</p>
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

function generateAmcInvoiceHTML(invoice: any, settings: Record<string, any>, logoUrl: string, amcContract: any) {
  const biz = {
    name: settings['business.name'] || 'GearUp Auto Service',
    phone: settings['business.phone'] || '',
    email: settings['business.email'] || '',
    address: settings['business.address'] || '',
    gst: settings['business.gst'] || '',
  };

  const planPrice = Number(amcContract.plan.price);
  const amcSavings = invoice.lineItems.filter((li: any) => li.lineType === 'AMC' && Number(li.lineTotal) === 0).length * planPrice;
  const discountFromAdjustments = invoice.lineItems.filter((li: any) => li.lineType === 'DISCOUNT_ADJUSTMENT').reduce((s: number, li: any) => s + Math.abs(Number(li.lineTotal)), 0);
  const discountFromPercent = invoice.lineItems.filter((li: any) => li.lineType !== 'DISCOUNT_ADJUSTMENT' && Number(li.discountPercent) > 0).reduce((s: number, li: any) => s + Number(li.quantity) * Number(li.unitPrice) * Number(li.discountPercent) / 100, 0);
  const totalDiscount = discountFromAdjustments + discountFromPercent;

  const rows = invoice.lineItems.map((li: any, i: number) => {
    const isAmcCovered = li.lineType === 'AMC' && Number(li.lineTotal) === 0;
    return `<tr${isAmcCovered ? ' style="background:#fefce8"' : ''}>
      <td style="padding:10px 12px;border-bottom:1px solid ${isAmcCovered ? '#fde047' : '#f3f4f6'}">${i + 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${isAmcCovered ? '#fde047' : '#f3f4f6'}"><strong>${esc(li.description)}</strong>${isAmcCovered ? '<span style="display:inline-block;background:#111;color:#d4a017;font-size:8px;font-weight:700;padding:2px 7px;border-radius:2px;text-transform:uppercase;letter-spacing:1px;margin-left:8px;border:1px solid #d4a017">★ AMC</span>' : ''}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${isAmcCovered ? '#fde047' : '#f3f4f6'};text-align:right">${Number(li.quantity)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${isAmcCovered ? '#fde047' : '#f3f4f6'};text-align:right">${isAmcCovered ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:11px">₹${planPrice.toLocaleString()}</span>` : `₹${Number(li.unitPrice).toLocaleString()}`}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${isAmcCovered ? '#fde047' : '#f3f4f6'};text-align:right;font-weight:600">${isAmcCovered ? '<span style="font-weight:800;color:#dc2626;font-size:13px">FREE</span>' : `₹${Number(li.lineTotal).toLocaleString()}`}</td>
    </tr>`;
  }).join('');

  const payments = invoice.payments?.map((p: any) => `
    <tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${formatDateIST(p.paymentDate)}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${esc(p.paymentMode)}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${esc(p.referenceNumber || '-')}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:#16a34a">₹${Number(p.amount).toLocaleString()}</td></tr>`).join('') || '';

  const endDate = formatDateIST(amcContract.endDate, { long: true });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600,700,800&display=swap"><title>Invoice ${esc(invoice.invoiceNumber)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Google Sans','Product Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a1a; font-size:13px; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } @page { margin:10mm; } }
.page { max-width:800px; margin:0 auto; border:2px solid #111; }
table { width:100%; border-collapse:collapse; }
th { background:#f9fafb; padding:9px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280; font-weight:600; border-bottom:2px solid #e5e7eb; }
</style></head><body><div class="page">

<div style="background:#111;color:white;padding:22px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #dc2626">
  <div style="display:flex;align-items:center;gap:14px">
    <img src="${esc(logoUrl)}" style="height:48px;width:auto" alt="${esc(biz.name)}">
    <div>
      <div style="color:#d4a017;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:2px">Service · Spares · Safety</div>
      <div style="color:#9ca3af;font-size:11px;margin-top:4px">${esc(biz.address)} · ${esc(biz.phone)}</div>
    </div>
  </div>
  <div style="text-align:right">
    <div style="font-size:20px;font-weight:800">${esc(invoice.invoiceNumber)}</div>
    <div style="color:#9ca3af;font-size:12px;margin-top:4px">${formatDateIST(invoice.invoiceDate, { long: true })}</div>
    <div style="display:inline-block;background:${invoice.paymentStatus === 'PAID' ? '#16a34a' : '#dc2626'};color:white;font-size:10px;font-weight:700;padding:3px 10px;border-radius:3px;margin-top:6px;letter-spacing:0.5px">${esc(invoice.paymentStatus)}</div>
  </div>
</div>

<div style="background:#dc2626;color:white;padding:14px 32px;display:flex;justify-content:space-between;align-items:center">
  <div style="display:flex;align-items:center;gap:12px">
    <span style="color:#d4a017;font-size:22px">★</span>
    <div>
      <div style="font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px">AMC ${esc(amcContract.plan.planName)} Member</div>
      <div style="font-size:10px;opacity:0.9">#${esc(amcContract.contractNumber)} · Valid till ${esc(endDate)}</div>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:14px">
    <div style="text-align:center"><div style="font-size:22px;font-weight:800;color:#d4a017">${amcContract.servicesRemaining}</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.85">Remaining</div></div>
    <div style="width:1px;height:30px;background:rgba(255,255,255,0.3)"></div>
    <div style="text-align:center"><div style="font-size:22px;font-weight:800;color:#d4a017">${amcContract.totalServices}</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.85">Total</div></div>
  </div>
</div>

<div style="padding:24px 32px">
  <div style="display:flex;gap:10px;margin-bottom:22px">
    <div style="border:1px solid #e5e7eb;padding:11px;border-radius:4px;flex:1"><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:600">Customer</div><div style="font-size:13px;margin-top:3px;font-weight:600">${esc(toTitleCase(invoice.customer.fullName))}</div><div style="font-size:11px;color:#6b7280;margin-top:1px">${esc(invoice.customer.phoneNumber)}</div></div>
    <div style="border:1px solid #e5e7eb;padding:11px;border-radius:4px;flex:1"><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:600">Vehicle</div><div style="font-size:13px;margin-top:3px;font-weight:600">${esc(invoice.vehicle?.brand ?? '')} ${esc(invoice.vehicle?.model ?? '')}</div><div style="font-size:11px;color:#6b7280;margin-top:1px">${esc(invoice.vehicle?.registrationNumber ?? 'Counter Sale')}</div></div>
    <div style="border:1px solid #e5e7eb;padding:11px;border-radius:4px;flex:1"><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:600">Job Card</div><div style="font-size:13px;margin-top:3px;font-weight:600">${esc(invoice.jobCard?.jobCardNumber ?? '-')}</div><div style="font-size:11px;color:#6b7280;margin-top:1px">${esc(invoice.jobCard?.issueSummary?.slice(0, 30) ?? '')}</div></div>
  </div>

  <table><thead><tr><th style="width:30px">#</th><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>

  <div style="margin-top:16px;display:flex;justify-content:flex-end">
    <table style="width:240px"><tbody>
      <tr><td style="padding:5px 10px;border:none;font-size:13px;color:#6b7280">Subtotal</td><td style="padding:5px 10px;border:none;font-size:13px;text-align:right">₹${Number(invoice.subtotal).toLocaleString()}</td></tr>
      ${totalDiscount > 0 ? `<tr><td style="padding:5px 10px;border:none;font-size:13px;color:#16a34a;font-weight:600">Discount</td><td style="padding:5px 10px;border:none;font-size:13px;text-align:right;color:#16a34a;font-weight:600">-₹${totalDiscount.toLocaleString()}</td></tr>` : ''}
      ${amcSavings > 0 ? `<tr><td style="padding:5px 10px;border:none;font-size:13px;color:#dc2626;font-weight:700">★ AMC Benefit</td><td style="padding:5px 10px;border:none;font-size:13px;text-align:right;color:#dc2626;font-weight:700">−₹${amcSavings.toLocaleString()}</td></tr>` : ''}
      ${Number(invoice.taxTotal) > 0 ? `<tr><td style="padding:5px 10px;border:none;font-size:13px;color:#6b7280">Tax</td><td style="padding:5px 10px;border:none;font-size:13px;text-align:right">₹${Number(invoice.taxTotal).toLocaleString()}</td></tr>` : ''}
      <tr><td style="padding:5px 10px;border:none;font-size:18px;font-weight:800;border-top:3px solid #111;padding-top:10px">Total</td><td style="padding:5px 10px;border:none;font-size:18px;font-weight:800;text-align:right;border-top:3px solid #111;padding-top:10px">₹${Number(invoice.grandTotal).toLocaleString()}</td></tr>
    </tbody></table>
  </div>

  ${payments ? `<div style="margin-top:20px"><div style="font-size:12px;font-weight:600;margin-bottom:6px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Payments</div><table><thead><tr><th>Date</th><th>Mode</th><th>Ref</th><th style="text-align:right">Amount</th></tr></thead><tbody>${payments}</tbody></table></div>` : ''}
</div>

<div style="background:#111;padding:16px 32px;display:flex;align-items:center;justify-content:space-between">
  <div style="display:flex;align-items:center;gap:12px;color:white">
    <span style="color:#d4a017;font-size:20px">★</span>
    <div><div style="font-size:18px;font-weight:800;color:#d4a017">₹${amcSavings.toLocaleString()} Saved</div><div style="font-size:11px;color:#9ca3af;margin-top:1px">AMC ${esc(amcContract.plan.planName)} benefit applied</div></div>
  </div>
  <div style="text-align:right;color:#9ca3af;font-size:11px;line-height:1.6"><strong style="color:white">${amcContract.servicesRemaining} free service${amcContract.servicesRemaining > 1 ? 's' : ''}</strong> remaining<br>Valid until ${esc(endDate)}</div>
</div>

<div style="padding:12px 32px;text-align:center;color:#6b7280;font-size:10px;border-top:1px solid #f3f4f6">
  Thank you for choosing Gear Up! · ${biz.gst ? `GSTIN: ${esc(biz.gst)} · ` : ''}${esc(biz.email)}
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
    const logoUrl = `${req.nextUrl.origin}/brand/gearup-logo.png`;
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
