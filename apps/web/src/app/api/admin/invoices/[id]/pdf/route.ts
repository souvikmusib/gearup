import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

function generateInvoiceHTML(invoice: any, settings: Record<string, any>, logoUrl: string) {
  const biz = {
    name: settings['business.name'] || 'GearUp Auto Service',
    phone: settings['business.phone'] || '',
    email: settings['business.email'] || '',
    address: settings['business.address'] || '',
    gst: settings['business.gst'] || '',
  };
  const footer = settings['invoice.footer'] || 'Thank you for your business!';

  const rows = invoice.lineItems.map((li: any, i: number) => {
    const disc = Number(li.discountPercent) || 0;
    const discAmount = disc ? Number(li.quantity) * Number(li.unitPrice) * (disc / 100) : 0;
    return `
    <tr>
      <td style="padding:8px 12px;border-bottom:${disc ? 'none' : '1px solid #eee'}">${i + 1}</td>
      <td style="padding:8px 12px;border-bottom:${disc ? 'none' : '1px solid #eee'}">${li.description}</td>
      <td style="padding:8px 12px;border-bottom:${disc ? 'none' : '1px solid #eee'};text-align:center">${li.lineType}</td>
      <td style="padding:8px 12px;border-bottom:${disc ? 'none' : '1px solid #eee'};text-align:right">${Number(li.quantity)}</td>
      <td style="padding:8px 12px;border-bottom:${disc ? 'none' : '1px solid #eee'};text-align:right">₹${Number(li.unitPrice).toLocaleString()}</td>
      <td style="padding:8px 12px;border-bottom:${disc ? 'none' : '1px solid #eee'};text-align:right">${Number(li.taxRate)}%</td>
      <td style="padding:8px 12px;border-bottom:${disc ? 'none' : '1px solid #eee'};text-align:right;font-weight:600">₹${Number(li.lineTotal).toLocaleString()}</td>
    </tr>${disc ? `
    <tr style="color:#16a34a;font-size:11px">
      <td style="padding:0 12px 8px;border-bottom:1px solid #eee"></td>
      <td colspan="3" style="padding:0 12px 8px;border-bottom:1px solid #eee">↳ Discount ${disc}% (-₹${discAmount.toFixed(0)})</td>
      <td style="border-bottom:1px solid #eee"></td>
      <td style="border-bottom:1px solid #eee"></td>
      <td style="border-bottom:1px solid #eee"></td>
    </tr>` : ''}`;
  }).join('');

  const payments = invoice.payments?.map((p: any) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${new Date(p.paymentDate).toLocaleDateString('en-IN')}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${p.paymentMode}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${p.referenceNumber || '-'}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">₹${Number(p.amount).toLocaleString()}</td>
    </tr>`).join('') || '';

  const statusColor = invoice.paymentStatus === 'PAID' ? '#16a34a' : invoice.paymentStatus === 'PARTIALLY_PAID' ? '#d97706' : '#dc2626';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a1a; font-size:13px; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    .page { max-width:800px; margin:0 auto; padding:40px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:20px; border-bottom:2px solid #111; }
    .biz-name { font-size:22px; font-weight:700; }
    .biz-logo { display:block; width:180px; height:auto; margin-bottom:10px; }
    .biz-detail { color:#666; font-size:12px; margin-top:4px; }
    .inv-title { font-size:28px; font-weight:700; text-align:right; }
    .inv-number { color:#666; font-size:14px; text-align:right; margin-top:4px; }
    .status { display:inline-block; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; color:white; }
    .meta { display:flex; justify-content:space-between; margin-bottom:28px; }
    .meta-box { background:#f9fafb; padding:16px; border-radius:8px; flex:1; margin:0 6px; }
    .meta-box:first-child { margin-left:0; }
    .meta-box:last-child { margin-right:0; }
    .meta-label { font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#888; font-weight:600; }
    .meta-value { font-size:13px; margin-top:4px; font-weight:500; }
    table { width:100%; border-collapse:collapse; }
    th { background:#f3f4f6; padding:10px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#666; font-weight:600; }
    .totals { margin-top:16px; display:flex; justify-content:flex-end; }
    .totals-table { width:280px; }
    .totals-table td { padding:6px 12px; }
    .totals-table .grand { font-size:16px; font-weight:700; border-top:2px solid #111; padding-top:10px; }
    .footer { margin-top:40px; padding-top:16px; border-top:1px solid #eee; text-align:center; color:#888; font-size:12px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <img class="biz-logo" src="${logoUrl}" alt="${biz.name}">
        <div class="biz-name">${biz.name}</div>
        ${biz.address ? `<div class="biz-detail">${biz.address}</div>` : ''}
        ${biz.phone ? `<div class="biz-detail">📞 ${biz.phone}</div>` : ''}
        ${biz.email ? `<div class="biz-detail">✉ ${biz.email}</div>` : ''}
        ${biz.gst ? `<div class="biz-detail">GSTIN: ${biz.gst}</div>` : ''}
      </div>
      <div>
        <div class="inv-title">INVOICE</div>
        <div class="inv-number">${invoice.invoiceNumber}</div>
        <div style="text-align:right;margin-top:8px">
          <span class="status" style="background:${statusColor}">${invoice.paymentStatus}</span>
        </div>
      </div>
    </div>

    <div class="meta">
      <div class="meta-box">
        <div class="meta-label">Bill To</div>
        <div class="meta-value">${invoice.customer.fullName}</div>
        <div style="color:#666;font-size:12px;margin-top:2px">${invoice.customer.phoneNumber}</div>
        ${invoice.customer.email ? `<div style="color:#666;font-size:12px">${invoice.customer.email}</div>` : ''}
      </div>
      <div class="meta-box">
        <div class="meta-label">Vehicle</div>
        <div class="meta-value">${invoice.vehicle?.brand ?? ''} ${invoice.vehicle?.model ?? ''}</div>
        <div style="color:#666;font-size:12px;margin-top:2px">${invoice.vehicle?.registrationNumber ?? 'Counter Sale'}</div>
      </div>
      <div class="meta-box">
        <div class="meta-label">Invoice Date</div>
        <div class="meta-value">${new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}</div>
        ${invoice.jobCard ? `<div style="color:#666;font-size:12px;margin-top:2px">Job: ${invoice.jobCard.jobCardNumber}</div>` : ''}
        <div style="color:#666;font-size:12px">Status: ${invoice.invoiceStatus}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:40px">#</th>
          <th>Description</th>
          <th style="text-align:center">Type</th>
          <th style="text-align:right">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:right">Tax</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <table class="totals-table">
        <tr><td style="color:#666">Subtotal</td><td style="text-align:right">₹${Number(invoice.subtotal).toLocaleString()}</td></tr>
        ${Number(invoice.discountAmount) > 0 ? `<tr><td style="color:#666">Discount</td><td style="text-align:right;color:#16a34a">-₹${Number(invoice.discountAmount).toLocaleString()}</td></tr>` : ''}
        <tr><td style="color:#666">Tax</td><td style="text-align:right">₹${Number(invoice.taxTotal).toLocaleString()}</td></tr>
        <tr><td class="grand">Grand Total</td><td class="grand" style="text-align:right">₹${Number(invoice.grandTotal).toLocaleString()}</td></tr>
        <tr><td style="color:#666">Paid</td><td style="text-align:right;color:#16a34a">₹${Number(invoice.amountPaid).toLocaleString()}</td></tr>
        ${Number(invoice.amountDue) > 0 ? `<tr><td style="font-weight:600;color:#dc2626">Balance Due</td><td style="text-align:right;font-weight:600;color:#dc2626">₹${Number(invoice.amountDue).toLocaleString()}</td></tr>` : ''}
      </table>
    </div>

    ${payments ? `
    <div style="margin-top:28px">
      <div style="font-size:14px;font-weight:600;margin-bottom:8px">Payment History</div>
      <table>
        <thead><tr><th>Date</th><th>Mode</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${payments}</tbody>
      </table>
    </div>` : ''}

    <div class="footer">
      <p>${footer}</p>
      <p style="margin-top:4px">${biz.name} ${biz.gst ? `| GSTIN: ${biz.gst}` : ''}</p>
    </div>
  </div>
</body>
</html>`;
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
    <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px"><div style="font-size:10px;text-transform:uppercase;color:#888;font-weight:600">Vehicle</div><div style="font-weight:500;margin-top:4px">${invoice.vehicle?.brand ?? ''} ${invoice.vehicle?.model ?? ''}</div><div style="color:#666;font-size:12px">${invoice.vehicle?.registrationNumber ?? 'Counter Sale'}</div></div>
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
    <div style="flex:1;background:#f9fafb;padding:12px;border-radius:8px"><strong>Vehicle:</strong> ${invoice.vehicle ? `${invoice.vehicle.brand} ${invoice.vehicle.model} — ${invoice.vehicle.registrationNumber}` : 'Counter Sale'}</div>
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
        jobCard: { select: { jobCardNumber: true, issueSummary: true, tasks: { select: { taskName: true, status: true } }, parts: { include: { inventoryItem: { select: { itemName: true } } } } } },
      },
    });

    const settingsRaw = await prisma.setting.findMany();
    const settings = Object.fromEntries(settingsRaw.map((s: any) => [s.key, s.value]));
    const logoUrl = `${req.nextUrl.origin}/brand/gearup-logo.png`;
    const type = req.nextUrl.searchParams.get('type') || 'invoice';

    let html: string;
    if (type === 'customer-draft') {
      html = generateCustomerDraftHTML(invoice, settings, logoUrl);
    } else if (type === 'mechanic') {
      html = generateMechanicCopyHTML(invoice, settings, logoUrl);
    } else {
      html = generateInvoiceHTML(invoice, settings, logoUrl);
    }

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${invoice.invoiceNumber}-${type}.html"`,
      },
    });
  } catch (e) { return handleApiError(e); }
}
