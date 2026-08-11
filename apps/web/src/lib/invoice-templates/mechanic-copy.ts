/**
 * Mechanic Work Order copy — tasks and parts checklist for the workshop floor.
 */
import { toTitleCase } from '@/lib/title-case';
import { esc, formatDateIST, buildBusinessInfo } from './helpers';

export function generateMechanicCopyHTML(invoice: any, settings: Record<string, any>, logoUrl: string): string {
  const biz = buildBusinessInfo(settings);

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
  <div style="margin-top:24px;padding:12px;background:#e0f2fe;border-radius:8px;border:1px solid #bae6fd;display:flex;justify-content:space-between;align-items:center">
    <div><strong>Estimated Delivery:</strong> ___________________</div>
    <div style="font-size:11px;color:#666">(Date &amp; Time)</div>
  </div>
  <div style="margin-top:32px;border-top:1px solid #eee;padding-top:16px;display:flex;justify-content:space-between">
    <div><strong>Mechanic Signature:</strong> ___________________</div>
    <div><strong>Date:</strong> ___________________</div>
  </div>
</div></body></html>`;
}
