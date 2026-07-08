/**
 * Customer Draft / Service Summary template — grouped by type.
 * Simplified view without pricing details, for pre-approval sharing.
 */
import { toTitleCase } from '@/lib/title-case';
import { esc, formatDateIST, groupLineItems, buildBusinessInfo } from './helpers';

export function generateCustomerDraftHTML(invoice: any, settings: Record<string, any>, logoUrl: string): string {
  const biz = buildBusinessInfo(settings);

  const { parts, labor, custom } = groupLineItems(invoice.lineItems || []);

  // Build grouped rows with continuous serial
  let serial = 0;
  function buildRows(items: any[]): string {
    return items.map((li: any) => {
      serial++;
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${serial}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(li.description)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${li.lineType === 'PART' ? 'Part' : li.lineType === 'LABOR' ? 'Labor' : li.lineType === 'AMC' ? 'AMC' : 'Service'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${Number(li.quantity)}</td>
      </tr>`;
    }).join('');
  }

  function groupHeader(label: string, color: string, bg: string): string {
    return `<tr><td colspan="4" style="padding:6px 12px;font-size:10px;font-weight:700;color:${color};background:${bg};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #eee">${label}</td></tr>`;
  }

  let tableRows = '';
  if (parts.length > 0) {
    tableRows += groupHeader('⚙ Parts & Spares', '#1d4ed8', '#eff6ff');
    tableRows += buildRows(parts);
  }
  if (labor.length > 0) {
    tableRows += groupHeader('🔧 Labour & Service', '#166534', '#f0fdf4');
    tableRows += buildRows(labor);
  }
  if (custom.length > 0) {
    tableRows += groupHeader('📋 Additional', '#7e22ce', '#faf5ff');
    tableRows += buildRows(custom);
  }

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
  <table><thead><tr><th>#</th><th>Service / Part</th><th style="text-align:center">Type</th><th style="text-align:center">Qty</th></tr></thead><tbody>${tableRows}</tbody></table>
  <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;text-align:center;font-weight:600;font-size:15px">Estimate Total: ₹${Number(invoice.grandTotal).toLocaleString()}</div>
  <div class="footer"><p>Thank you for choosing ${esc(biz.name)}!</p></div>
</div></body></html>`;
}
