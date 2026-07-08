/**
 * Gold-tier AMC invoice template (v3) — Option B grouped style.
 * Premium gold palette with AMC-specific banners + line-item highlights.
 * Groups items by type; discounts shown at total level.
 */
import { toTitleCase } from '@/lib/title-case';
import { esc, formatDateIST, numberToWords, groupLineItems, buildBusinessInfo } from './helpers';

export function generateAmcInvoiceHTML(invoice: any, settings: Record<string, any>, logoUrl: string, amcContract: any): string {
  const biz = buildBusinessInfo(settings);
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

  const allItems = invoice.lineItems || [];
  const { parts, labor, custom, discounts } = groupLineItems(allItems);

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;

  // Build rows for a group with continuous serial numbering
  let serial = 0;
  function buildGroupRows(items: any[]): string {
    return items.map((li: any) => {
      serial++;
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
      const gstRate = Number(li.taxRate) || 18;
      const gstTaxable = lineTotal / (1 + gstRate / 100);
      const gstCgst = gstTaxable * (gstRate / 2) / 100;
      const gstSgst = gstTaxable * (gstRate / 2) / 100;
      totalTaxable += gstTaxable;
      totalCgst += gstCgst;
      totalSgst += gstSgst;
      // Strip worker name from labor/service descriptions
      const displayDesc = (li.lineType === 'LABOR' || li.lineType === 'SERVICE_CHARGE') ? li.description.replace(/\s*[—–-]\s*[A-Z][A-Z\s]+$/, '') : li.description;
      // AMC purchase: show MRP strikethrough if available
      const mrp = Number(amcContract.plan?.mrpPrice) || 0;
      const rateCell = isAmcCovered
        ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:11px">₹${planPrice.toLocaleString('en-IN')}</span>`
        : isAmcPurchase && mrp > rate
          ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:11px">₹${mrp.toLocaleString('en-IN')}</span> <span style="font-weight:700;color:#111">₹${rate.toLocaleString('en-IN')}</span>`
          : `₹${rate.toLocaleString('en-IN')}`;
      return `<tr style="${rowBg}">
        <td style="padding:9px 10px;border-bottom:1px solid ${cellBorder};text-align:center;color:#9ca3af;font-size:10px">${serial}</td>
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
  }

  // Group header row
  const colCount = showGst ? 10 : 8;
  function groupHeaderRow(label: string, color: string, bgColor: string): string {
    return `<tr><td colspan="${colCount}" style="padding:7px 10px;font-size:9px;font-weight:700;color:${color};background:${bgColor};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${bgColor === '#eff6ff' ? '#bfdbfe' : bgColor === '#f0fdf4' ? '#bbf7d0' : '#e9d5ff'}">${label}</td></tr>`;
  }

  let tableRows = '';
  if (parts.length > 0) {
    tableRows += groupHeaderRow('⚙ Parts & Spares', '#1d4ed8', '#eff6ff');
    tableRows += buildGroupRows(parts);
  }
  if (labor.length > 0) {
    tableRows += groupHeaderRow('🔧 Labour & Service', '#166534', '#f0fdf4');
    tableRows += buildGroupRows(labor);
  }
  if (custom.length > 0) {
    tableRows += groupHeaderRow('📋 Additional Charges', '#7e22ce', '#faf5ff');
    tableRows += buildGroupRows(custom);
  }

  // Include discounts in GST calculation
  for (const d of discounts) {
    const gstRate = Number(d.taxRate) || 18;
    const lineTotal = Number(d.lineTotal);
    const gstTaxable = lineTotal / (1 + gstRate / 100);
    totalTaxable += gstTaxable;
    totalCgst += gstTaxable * (gstRate / 2) / 100;
    totalSgst += gstTaxable * (gstRate / 2) / 100;
  }

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
    <tbody>${tableRows}</tbody>
  </table>

  <!-- Discount callout (if any) -->
  ${discounts.length > 0 ? `
  <div style="margin-top:12px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px">
    <div style="font-size:9px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">🏷️ Discounts Applied</div>
    ${discounts.map((d: any) => `<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:10px;color:#374151">${esc(d.description)}</span><span style="font-size:10px;color:#16a34a;font-weight:600">−₹${Math.abs(Number(d.lineTotal)).toLocaleString('en-IN', {minimumFractionDigits: 2})}</span></div>`).join('')}
    ${discounts.length > 1 ? `<div style="display:flex;justify-content:space-between;padding-top:5px;margin-top:5px;border-top:1px dashed #bbf7d0"><span style="font-size:10px;font-weight:700;color:#166534">Total Savings</span><span style="font-size:11px;font-weight:700;color:#16a34a">−₹${discountFromAdjustments.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span></div>` : ''}
  </div>` : ''}

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
