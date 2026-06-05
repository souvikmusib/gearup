import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

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
  const totalDiscount = discountItems.reduce((s: number, li: any) => s + Math.abs(Number(li.lineTotal)), 0);

  const rows = nonDiscountItems.map((li: any, i: number) => {
    const item = li.referenceItemId ? itemMap[li.referenceItemId] : null;
    const sku = item?.sku || '';
    const mrp = item?.mrp ? Number(item.mrp) : null;
    const disc = Number(li.discountPercent) || 0;
    return `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center">${i + 1}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee">${sku ? `<span style="color:#666;font-size:10px">${sku}</span> ` : ''}${li.description}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center">${Number(li.quantity)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right">${mrp ? `₹${mrp.toLocaleString()}` : '—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right">₹${Number(li.unitPrice).toLocaleString()}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center">${disc ? disc + '%' : '—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">₹${Number(li.lineTotal).toLocaleString()}</td>
    </tr>`;
  }).join('');

  const payments = invoice.payments?.map((p: any) => `
    <tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${new Date(p.paymentDate).toLocaleDateString('en-IN')}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${p.paymentMode}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${p.referenceNumber || '-'}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">₹${Number(p.amount).toLocaleString()}</td></tr>`).join('') || '';

  const statusColor = invoice.paymentStatus === 'PAID' ? '#16a34a' : invoice.paymentStatus === 'PARTIALLY_PAID' ? '#d97706' : '#dc2626';
  const grandTotal = Number(invoice.grandTotal);
  const roundOff = Math.round(grandTotal) - grandTotal;
  const netAmount = Math.round(grandTotal);
  const amountWords = numberToWords(netAmount) + ' Rupees Only';
  const odometer = invoice.jobCard?.odometerAtIntake;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice ${invoice.invoiceNumber}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a1a; font-size:12px; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
.page { max-width:800px; margin:0 auto; padding:30px; }
table { width:100%; border-collapse:collapse; }
th { background:#f3f4f6; padding:8px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#666; font-weight:600; }
</style></head><body><div class="page">

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #111">
  <div>
    <img src="${logoUrl}" style="height:45px;margin-bottom:8px" alt="${biz.name}">
    <div style="font-size:10px;color:#666;margin-top:4px">${biz.address}</div>
    ${biz.phone ? `<div style="font-size:10px;color:#666">Ph: ${biz.phone}</div>` : ''}
    ${biz.gst ? `<div style="font-size:10px;color:#666">GSTIN: ${biz.gst}</div>` : ''}
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:700">TAX INVOICE</div>
    <div style="color:#666;font-size:12px;margin-top:4px">${invoice.invoiceNumber}</div>
    <div style="color:#666;font-size:11px;margin-top:2px">Date: ${new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}</div>
    <div style="margin-top:6px"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;color:white;background:${statusColor}">${invoice.paymentStatus}</span></div>
  </div>
</div>

<div style="display:flex;gap:12px;margin-bottom:20px">
  <div style="flex:1;background:#f9fafb;padding:12px;border-radius:6px">
    <div style="font-size:9px;text-transform:uppercase;color:#888;font-weight:600">Bill To</div>
    <div style="font-weight:600;margin-top:3px">${invoice.customer.fullName}</div>
    <div style="color:#666;font-size:11px">${invoice.customer.phoneNumber}</div>
    ${invoice.customer.email ? `<div style="color:#666;font-size:11px">${invoice.customer.email}</div>` : ''}
  </div>
  <div style="flex:1;background:#f9fafb;padding:12px;border-radius:6px">
    <div style="font-size:9px;text-transform:uppercase;color:#888;font-weight:600">Vehicle</div>
    <div style="font-weight:600;margin-top:3px">${invoice.vehicle?.brand ?? ''} ${invoice.vehicle?.model ?? ''}</div>
    <div style="color:#666;font-size:11px">${invoice.vehicle?.registrationNumber ?? 'Counter Sale'}</div>
    ${odometer ? `<div style="color:#666;font-size:11px">Odometer: ${odometer.toLocaleString()} km</div>` : ''}
  </div>
  <div style="flex:1;background:#f9fafb;padding:12px;border-radius:6px">
    <div style="font-size:9px;text-transform:uppercase;color:#888;font-weight:600">Details</div>
    ${invoice.jobCard ? `<div style="font-weight:600;margin-top:3px">${invoice.jobCard.jobCardNumber}</div>` : '<div style="font-weight:600;margin-top:3px">Counter Sale</div>'}
    <div style="color:#666;font-size:11px">Status: ${invoice.invoiceStatus}</div>
    ${invoice.finalizedAt ? `<div style="color:#666;font-size:11px">Finalized: ${new Date(invoice.finalizedAt).toLocaleDateString('en-IN')}</div>` : ''}
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
      <strong>Amount in words:</strong> ${amountWords}
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

<div style="margin-top:30px;padding-top:12px;border-top:1px solid #eee">
  <p style="font-size:10px;color:#666;margin-bottom:4px">* Goods once sold will not be taken back / No Exchange / No Return</p>
  <p style="text-align:center;color:#888;font-size:11px;margin-top:8px">${footer}</p>
  <p style="text-align:center;color:#888;font-size:10px;margin-top:2px">${biz.name}${biz.gst ? ` | GSTIN: ${biz.gst}` : ''}</p>
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
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${li.description}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${li.lineType === 'PART' ? 'Part' : li.lineType === 'LABOR' ? 'Labor' : li.lineType === 'AMC' ? 'AMC' : 'Service'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${Number(li.quantity)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Service Summary — ${invoice.invoiceNumber}</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a1a; font-size:13px; } .page { max-width:800px; margin:0 auto; padding:40px; } .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; padding-bottom:16px; border-bottom:2px solid #111; } .biz-name { font-size:20px; font-weight:700; } table { width:100%; border-collapse:collapse; margin-top:16px; } th { background:#f3f4f6; padding:10px 12px; text-align:left; font-size:11px; text-transform:uppercase; color:#666; font-weight:600; } .footer { margin-top:32px; padding-top:12px; border-top:1px solid #eee; text-align:center; color:#888; font-size:12px; }</style>
</head><body><div class="page">
  <div class="header">
    <div><img src="${logoUrl}" style="width:150px;margin-bottom:8px" alt="${biz.name}"><div class="biz-name">${biz.name}</div>${biz.phone ? `<div style="color:#666;font-size:12px">📞 ${biz.phone}</div>` : ''}</div>
    <div style="text-align:right"><div style="font-size:22px;font-weight:700">SERVICE SUMMARY</div><div style="color:#666;font-size:13px;margin-top:4px">${invoice.invoiceNumber}</div><div style="color:#666;font-size:12px;margin-top:4px">${new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}</div></div>
  </div>
  <div style="display:flex;gap:16px;margin-bottom:20px">
    <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px"><div style="font-size:10px;text-transform:uppercase;color:#888;font-weight:600">Customer</div><div style="font-weight:500;margin-top:4px">${invoice.customer.fullName}</div><div style="color:#666;font-size:12px">${invoice.customer.phoneNumber}</div></div>
    <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px"><div style="font-size:10px;text-transform:uppercase;color:#888;font-weight:600">Vehicle</div><div style="font-weight:500;margin-top:4px">${invoice.vehicle?.brand ?? ''} ${invoice.vehicle?.model ?? ''}</div><div style="color:#666;font-size:12px">${invoice.vehicle?.registrationNumber ?? 'Counter Sale'}</div>${invoice.jobCard?.odometerAtIntake ? `<div style="color:#666;font-size:11px;margin-top:2px">Odometer: ${invoice.jobCard.odometerAtIntake.toLocaleString()} km${invoice.jobCard.fuelIndicator ? ` · Fuel: ${invoice.jobCard.fuelIndicator}` : ''}</div>` : ''}</div>
  </div>
  ${invoice.jobCard?.issueSummary ? `<div style="margin-bottom:16px;padding:12px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a"><strong>Issue:</strong> ${invoice.jobCard.issueSummary}</div>` : ''}
  <table><thead><tr><th>#</th><th>Service / Part</th><th style="text-align:center">Type</th><th style="text-align:center">Qty</th></tr></thead><tbody>${rows}</tbody></table>
  <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;text-align:center;font-weight:600;font-size:15px">Estimate Total: ₹${Number(invoice.grandTotal).toLocaleString()}</div>
  <div class="footer"><p>Thank you for choosing ${biz.name}!</p></div>
</div></body></html>`;
}

function generateMechanicCopyHTML(invoice: any, settings: Record<string, any>, logoUrl: string) {
  const biz = { name: settings['business.name'] || 'GearUp Auto Service' };

  const tasks = invoice.jobCard?.tasks?.map((t: any, i: number) => `
    <tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${i + 1}</td><td style="padding:6px 12px;border-bottom:1px solid #eee">${t.taskName}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${t.status === 'COMPLETED' ? '✅' : '⬜'}</td></tr>`).join('') || '<tr><td colspan="3" style="padding:12px;color:#888;text-align:center">No tasks</td></tr>';

  const parts = invoice.jobCard?.parts?.map((p: any, i: number) => `
    <tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${i + 1}</td><td style="padding:6px 12px;border-bottom:1px solid #eee">${p.inventoryItem?.itemName || 'Part'}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${Number(p.requiredQty)}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">₹${Number(p.unitPrice).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan="4" style="padding:12px;color:#888;text-align:center">No parts</td></tr>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mechanic Copy — ${invoice.jobCard?.jobCardNumber || invoice.invoiceNumber}</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a1a; font-size:13px; } .page { max-width:800px; margin:0 auto; padding:40px; } table { width:100%; border-collapse:collapse; margin-top:8px; } th { background:#f3f4f6; padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase; color:#666; font-weight:600; } h2 { font-size:16px; margin-top:24px; margin-bottom:4px; }</style>
</head><body><div class="page">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #111">
    <div><div style="font-size:20px;font-weight:700">${biz.name}</div><div style="font-size:11px;color:#888;margin-top:2px">MECHANIC WORK ORDER</div></div>
    <div style="text-align:right"><div style="font-size:16px;font-weight:700">${invoice.jobCard?.jobCardNumber || '-'}</div><div style="color:#666;font-size:12px">${new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}</div></div>
  </div>
  <div style="display:flex;gap:16px;margin-bottom:20px">
    <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px"><strong>Vehicle:</strong> ${invoice.vehicle ? `${invoice.vehicle.brand} ${invoice.vehicle.model} — ${invoice.vehicle.registrationNumber}` : 'Counter Sale'}${invoice.jobCard?.odometerAtIntake ? `<br><span style="font-size:12px;color:#666">Odometer: ${invoice.jobCard.odometerAtIntake.toLocaleString()} km${invoice.jobCard.fuelIndicator ? ` · Fuel: ${invoice.jobCard.fuelIndicator}` : ''}</span>` : ''}</div>
    <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px"><strong>Customer:</strong> ${invoice.customer.fullName} (${invoice.customer.phoneNumber})</div>
  </div>
  ${invoice.jobCard?.issueSummary ? `<div style="margin-bottom:16px;padding:12px;background:#fef3c7;border-radius:8px;border:1px solid #fde68a"><strong>Issue:</strong> ${invoice.jobCard.issueSummary}</div>` : ''}
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

  const rows = invoice.lineItems.map((li: any, i: number) => {
    const isAmcCovered = li.lineType === 'AMC' && Number(li.lineTotal) === 0;
    return `<tr${isAmcCovered ? ' style="background:#fefce8"' : ''}>
      <td style="padding:10px 12px;border-bottom:1px solid ${isAmcCovered ? '#fde047' : '#f3f4f6'}">${i + 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${isAmcCovered ? '#fde047' : '#f3f4f6'}"><strong>${li.description}</strong>${isAmcCovered ? '<span style="display:inline-block;background:#111;color:#d4a017;font-size:8px;font-weight:700;padding:2px 7px;border-radius:2px;text-transform:uppercase;letter-spacing:1px;margin-left:8px;border:1px solid #d4a017">★ AMC</span>' : ''}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${isAmcCovered ? '#fde047' : '#f3f4f6'};text-align:right">${Number(li.quantity)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${isAmcCovered ? '#fde047' : '#f3f4f6'};text-align:right">${isAmcCovered ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:11px">₹${planPrice.toLocaleString()}</span>` : `₹${Number(li.unitPrice).toLocaleString()}`}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${isAmcCovered ? '#fde047' : '#f3f4f6'};text-align:right;font-weight:600">${isAmcCovered ? '<span style="font-weight:800;color:#dc2626;font-size:13px">FREE</span>' : `₹${Number(li.lineTotal).toLocaleString()}`}</td>
    </tr>`;
  }).join('');

  const payments = invoice.payments?.map((p: any) => `
    <tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${new Date(p.paymentDate).toLocaleDateString('en-IN')}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${p.paymentMode}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${p.referenceNumber || '-'}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:#16a34a">₹${Number(p.amount).toLocaleString()}</td></tr>`).join('') || '';

  const endDate = new Date(amcContract.endDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${invoice.invoiceNumber}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a1a; font-size:13px; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } @page { margin:10mm; } }
.page { max-width:800px; margin:0 auto; border:2px solid #111; }
table { width:100%; border-collapse:collapse; }
th { background:#f9fafb; padding:9px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280; font-weight:600; border-bottom:2px solid #e5e7eb; }
</style></head><body><div class="page">

<div style="background:#111;color:white;padding:22px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #dc2626">
  <div style="display:flex;align-items:center;gap:14px">
    <img src="${logoUrl}" style="height:48px;width:auto" alt="${biz.name}">
    <div>
      <div style="color:#d4a017;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:2px">Service · Spares · Safety</div>
      <div style="color:#9ca3af;font-size:11px;margin-top:4px">${biz.address} · ${biz.phone}</div>
    </div>
  </div>
  <div style="text-align:right">
    <div style="font-size:20px;font-weight:800">${invoice.invoiceNumber}</div>
    <div style="color:#9ca3af;font-size:12px;margin-top:4px">${new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}</div>
    <div style="display:inline-block;background:${invoice.paymentStatus === 'PAID' ? '#16a34a' : '#dc2626'};color:white;font-size:10px;font-weight:700;padding:3px 10px;border-radius:3px;margin-top:6px;letter-spacing:0.5px">${invoice.paymentStatus}</div>
  </div>
</div>

<div style="background:#dc2626;color:white;padding:14px 32px;display:flex;justify-content:space-between;align-items:center">
  <div style="display:flex;align-items:center;gap:12px">
    <span style="color:#d4a017;font-size:22px">★</span>
    <div>
      <div style="font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px">AMC ${amcContract.plan.planName} Member</div>
      <div style="font-size:10px;opacity:0.9">#${amcContract.contractNumber} · Valid till ${endDate}</div>
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
    <div style="border:1px solid #e5e7eb;padding:11px;border-radius:4px;flex:1"><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:600">Customer</div><div style="font-size:13px;margin-top:3px;font-weight:600">${invoice.customer.fullName}</div><div style="font-size:11px;color:#6b7280;margin-top:1px">${invoice.customer.phoneNumber}</div></div>
    <div style="border:1px solid #e5e7eb;padding:11px;border-radius:4px;flex:1"><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:600">Vehicle</div><div style="font-size:13px;margin-top:3px;font-weight:600">${invoice.vehicle?.brand ?? ''} ${invoice.vehicle?.model ?? ''}</div><div style="font-size:11px;color:#6b7280;margin-top:1px">${invoice.vehicle?.registrationNumber ?? 'Counter Sale'}</div></div>
    <div style="border:1px solid #e5e7eb;padding:11px;border-radius:4px;flex:1"><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:600">Job Card</div><div style="font-size:13px;margin-top:3px;font-weight:600">${invoice.jobCard?.jobCardNumber ?? '-'}</div><div style="font-size:11px;color:#6b7280;margin-top:1px">${invoice.jobCard?.issueSummary?.slice(0, 30) ?? ''}</div></div>
  </div>

  <table><thead><tr><th style="width:30px">#</th><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>

  <div style="margin-top:16px;display:flex;justify-content:flex-end">
    <table style="width:240px"><tbody>
      <tr><td style="padding:5px 10px;border:none;font-size:13px;color:#6b7280">Subtotal</td><td style="padding:5px 10px;border:none;font-size:13px;text-align:right">₹${Number(invoice.subtotal).toLocaleString()}</td></tr>
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
    <div><div style="font-size:18px;font-weight:800;color:#d4a017">₹${amcSavings.toLocaleString()} Saved</div><div style="font-size:11px;color:#9ca3af;margin-top:1px">AMC ${amcContract.plan.planName} benefit applied</div></div>
  </div>
  <div style="text-align:right;color:#9ca3af;font-size:11px;line-height:1.6"><strong style="color:white">${amcContract.servicesRemaining} free service${amcContract.servicesRemaining > 1 ? 's' : ''}</strong> remaining<br>Valid until ${endDate}</div>
</div>

<div style="padding:12px 32px;text-align:center;color:#6b7280;font-size:10px;border-top:1px solid #f3f4f6">
  Thank you for choosing Gear Up! · ${biz.gst ? `GSTIN: ${biz.gst} · ` : ''}${biz.email}
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
      const rows = items.map((li: any, i: number) => `<tr><td style="padding:3px 6px;border-bottom:1px solid #eee;font-size:10px">${i+1}</td><td style="padding:3px 6px;border-bottom:1px solid #eee;font-size:10px">${li.description}</td><td style="padding:3px 6px;border-bottom:1px solid #eee;text-align:center;font-size:10px">${Number(li.quantity)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee;text-align:right;font-size:10px">₹${Number(li.lineTotal).toLocaleString()}</td></tr>`).join('');
      const tasks = invoice.jobCard?.tasks?.map((t: any, i: number) => `<tr><td style="padding:2px 4px;border-bottom:1px solid #eee;font-size:10px">${i+1}. ${t.taskName}</td><td style="padding:2px 4px;border-bottom:1px solid #eee;text-align:center;font-size:10px">${t.status === 'COMPLETED' ? '✅' : '⬜'}</td></tr>`).join('') || '';
      const parts = invoice.jobCard?.parts?.map((p: any) => `<tr><td style="padding:2px 4px;border-bottom:1px solid #eee;font-size:10px">${p.inventoryItem?.itemName || 'Part'}</td><td style="padding:2px 4px;border-bottom:1px solid #eee;text-align:center;font-size:10px">×${Number(p.requiredQty)}</td></tr>`).join('') || '';
      const vehicle = invoice.vehicle ? `${invoice.vehicle.brand} ${invoice.vehicle.model} — ${invoice.vehicle.registrationNumber}` : 'Counter Sale';
      const odometer = invoice.jobCard?.odometerAtIntake ? ` | Odo: ${invoice.jobCard.odometerAtIntake.toLocaleString()}km` : '';
      const fuel = invoice.jobCard?.fuelIndicator ? ` | Fuel: ${invoice.jobCard.fuelIndicator}` : '';

      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Combined — ${invoice.invoiceNumber}</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a1a; font-size:11px; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } @page { margin:8mm; size:A4; } }
table { width:100%; border-collapse:collapse; } th { background:#f3f4f6; padding:4px 6px; text-align:left; font-size:9px; text-transform:uppercase; color:#666; font-weight:600; }
.page { width:100%; height:277mm; display:flex; flex-direction:column; }
.section-top { padding:16px 24px; flex:3; display:flex; flex-direction:column; }
.cut { border-top:2px dashed #aaa; margin:0 24px; position:relative; }
.cut::before { content:'✂ cut here'; position:absolute; top:-8px; left:0; background:#fff; padding:0 8px; color:#999; font-size:10px; }
.section-bottom { padding:12px 24px; flex:2; }
.header { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1.5px solid #111; }
.meta { display:flex; gap:8px; margin-bottom:6px; font-size:11px; }
.meta-box { background:#f9fafb; padding:5px 8px; border-radius:4px; flex:1; }
.meta-label { font-size:8px; text-transform:uppercase; color:#888; font-weight:600; }
</style></head><body><div class="page">

<div class="section-top">
  <div class="header">
    <div><img src="${logoUrl}" style="height:26px" alt="${biz.name}"><span style="font-size:8px;color:#999;margin-left:6px;letter-spacing:1px">SERVICE · SPARES · SAFETY</span></div>
    <div style="text-align:right"><strong style="font-size:11px">CUSTOMER COPY</strong><br><span style="font-size:9px;color:#666">${invoice.invoiceNumber} · ${new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}</span></div>
  </div>
  <div class="meta">
    <div class="meta-box"><div class="meta-label">Customer</div>${invoice.customer.fullName} · ${invoice.customer.phoneNumber}</div>
    <div class="meta-box"><div class="meta-label">Vehicle</div>${vehicle}${odometer}${fuel}</div>
  </div>
  ${invoice.jobCard?.issueSummary ? `<div style="margin-bottom:4px;padding:3px 8px;background:#fffbeb;border-radius:4px;font-size:10px"><strong>Issue:</strong> ${invoice.jobCard.issueSummary}</div>` : ''}
  <table><thead><tr><th>#</th><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <div style="margin-top:auto;padding:6px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;text-align:right;font-size:12px;font-weight:700">Estimate Total: ₹${Number(invoice.grandTotal).toLocaleString()} · ${invoice.paymentStatus}</div>
  <div style="text-align:center;font-size:9px;color:#888;margin-top:6px">Thank you for choosing ${biz.name}! · ${biz.phone}</div>
</div>

<div class="cut"></div>

<div class="section-bottom">
  <div class="header">
    <div><img src="${logoUrl}" style="height:24px" alt="${biz.name}"><span style="font-size:8px;color:#666;margin-left:6px">MECHANIC WORK ORDER</span></div>
    <div style="text-align:right"><strong style="font-size:10px">${invoice.jobCard?.jobCardNumber || invoice.invoiceNumber}</strong><br><span style="font-size:9px;color:#666">${new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}</span></div>
  </div>
  <div class="meta">
    <div class="meta-box"><div class="meta-label">Vehicle</div>${vehicle}${odometer}${fuel}</div>
    <div class="meta-box"><div class="meta-label">Customer</div>${invoice.customer.fullName} · ${invoice.customer.phoneNumber}</div>
  </div>
  ${invoice.jobCard?.issueSummary ? `<div style="margin-bottom:4px;padding:3px 8px;background:#fef3c7;border-radius:4px;font-size:10px"><strong>Issue:</strong> ${invoice.jobCard.issueSummary}</div>` : ''}
  <div style="display:flex;gap:12px">
    ${tasks ? `<div style="flex:1"><strong style="font-size:9px;text-transform:uppercase;color:#666">Tasks</strong><table><tbody>${tasks}</tbody></table></div>` : ''}
    ${parts ? `<div style="flex:1"><strong style="font-size:9px;text-transform:uppercase;color:#666">Parts</strong><table><tbody>${parts}</tbody></table></div>` : ''}
  </div>
  <div style="margin-top:8px;display:flex;justify-content:space-between;font-size:9px;color:#666"><div>Mechanic: _______________</div><div>Date: _______________</div></div>
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
