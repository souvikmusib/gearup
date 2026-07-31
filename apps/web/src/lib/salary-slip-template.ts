/**
 * Salary Slip HTML template — matching GearUp invoice branding.
 * Supports multiple line items (Salary, Incentive, Bonus, etc.)
 */
import { esc, formatDateIST, numberToWords, type BusinessInfo } from './invoice-templates/helpers';

export interface SalarySlipLineItem {
  label: string;
  amount: number;
}

export interface SalarySlipData {
  workerName: string;
  designation?: string;
  month: number; // 1-12
  year: number;
  lineItems: SalarySlipLineItem[];
  paymentMode?: string;
  paymentDate: Date | string;
  notes?: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function generateSalarySlipHTML(
  data: SalarySlipData,
  settings: Record<string, any>,
  logoUrl: string,
): string {
  const biz: BusinessInfo = {
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

  const monthName = MONTHS[data.month - 1] || 'Unknown';
  const totalAmount = data.lineItems.reduce((sum, li) => sum + li.amount, 0);
  const amountWords = numberToWords(Math.round(totalAmount)) + ' Rupees Only';
  const paymentDate = formatDateIST(data.paymentDate, { long: true });
  const paymentMode = data.paymentMode
    ? data.paymentMode.replace('_', ' ')
    : '—';

  // Build line item rows
  const lineItemRows = data.lineItems.map((li, i) => {
    const rowBg = i % 2 === 0 ? '' : 'background:#fafafa';
    return `<tr style="${rowBg}">
      <td style="padding:10px 14px;font-size:12px;font-weight:600;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb">${esc(li.label)}</td>
      <td style="padding:10px 14px;text-align:right;font-size:13px;font-weight:700;border-bottom:1px solid #e5e7eb">₹${li.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Salary Slip - ${esc(data.workerName)} - ${monthName} ${data.year}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600,700,800&display=swap">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Google Sans','Product Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#111; font-size:12px; background:#fff; }
@page { size:A4; margin:12mm; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head><body>
<div style="max-width:750px;margin:0 auto;padding:24px;border:2px solid #111">

  <!-- Header (logo only — text is part of the logo) -->
  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #dc2626;padding-bottom:14px;margin-bottom:0">
    <div style="display:flex;align-items:center;gap:12px">
      <img src="${logoUrl}" alt="GearUp" style="height:52px;width:auto" onerror="this.style.display='none'">
      <div>
        <div style="font-size:9px;color:#6b7280;margin-top:2px">${esc(biz.address)}</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:9px;color:#6b7280">Phone: ${esc(biz.phone)}</div>
      <div style="font-size:9px;color:#6b7280">Email: ${esc(biz.email)}</div>
      ${biz.gst ? `<div style="font-size:9px;color:#6b7280;margin-top:2px">GSTIN: <strong>${esc(biz.gst)}</strong></div>` : ''}
    </div>
  </div>

  <!-- Title Badge -->
  <div style="background:#dc2626;color:#fff;text-align:center;padding:8px 0;font-size:14px;font-weight:700;letter-spacing:1.5px">
    SALARY SLIP
  </div>

  <!-- Period Info -->
  <div style="display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #e5e7eb">
    <div>
      <span style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">For the month of</span>
      <div style="font-size:16px;font-weight:700;color:#111;margin-top:2px">${monthName} ${data.year}</div>
    </div>
    <div style="text-align:right">
      <span style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Date of Payment</span>
      <div style="font-size:12px;font-weight:600;color:#111;margin-top:2px">${paymentDate}</div>
    </div>
  </div>

  <!-- Employee Details -->
  <table style="width:100%;border-collapse:collapse;margin-top:16px">
    <tr>
      <td style="border:1px solid #e5e7eb;padding:10px 14px;width:35%;background:#f9fafb">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Employee Name</div>
        <div style="font-size:14px;font-weight:700;margin-top:3px">${esc(data.workerName)}</div>
      </td>
      <td style="border:1px solid #e5e7eb;padding:10px 14px;width:30%;background:#f9fafb">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Designation</div>
        <div style="font-size:12px;font-weight:600;margin-top:3px">${esc(data.designation || '—')}</div>
      </td>
      <td style="border:1px solid #e5e7eb;padding:10px 14px;width:35%;background:#f9fafb">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Payment Mode</div>
        <div style="font-size:12px;font-weight:600;margin-top:3px">${esc(paymentMode)}</div>
      </td>
    </tr>
  </table>

  <!-- Line Items Table -->
  <div style="margin-top:20px;border:2px solid #111;padding:0">
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#dc2626">
          <th style="padding:8px 14px;text-align:left;color:#fff;font-size:11px;font-weight:700;letter-spacing:0.5px;border-right:1px solid rgba(255,255,255,0.3)">DESCRIPTION</th>
          <th style="padding:8px 14px;text-align:right;color:#fff;font-size:11px;font-weight:700;letter-spacing:0.5px">AMOUNT (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemRows}
        ${data.notes ? `<tr>
          <td colspan="2" style="padding:8px 14px;font-size:10px;color:#6b7280;border-bottom:1px solid #e5e7eb">Note: ${esc(data.notes)}</td>
        </tr>` : ''}
        <tr style="background:#f9fafb">
          <td style="padding:12px 14px;font-size:12px;font-weight:800;text-transform:uppercase">Net Pay</td>
          <td style="padding:12px 14px;text-align:right;font-size:16px;font-weight:800;color:#dc2626">₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Amount in Words -->
  <div style="margin-top:10px;padding:8px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:4px">
    <span style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Amount in words: </span>
    <span style="font-size:11px;font-weight:600;color:#111">${esc(amountWords)}</span>
  </div>

  <!-- Signatures -->
  <div style="display:flex;justify-content:space-between;margin-top:50px;padding-top:0">
    <div style="text-align:center;width:40%">
      <div style="border-top:1px solid #111;padding-top:6px;font-size:10px;color:#6b7280">Employee Signature</div>
    </div>
    <div style="text-align:center;width:40%">
      <div style="border-top:1px solid #111;padding-top:6px;font-size:10px;color:#6b7280">For ${esc(biz.name)}</div>
      <div style="font-size:9px;color:#9ca3af;margin-top:2px">Authorized Signatory</div>
    </div>
  </div>

  <!-- Footer -->
  <div style="margin-top:30px;padding-top:10px;border-top:1px dashed #e5e7eb;text-align:center">
    <div style="font-size:8px;color:#9ca3af">This is a computer-generated document. No physical signature required.</div>
  </div>

</div>
</body></html>`;
}
