/**
 * Shared invoice layout (A4, bordered, two item tables) used by both the standard
 * invoice and the AMC invoice so the two formats stay identical.
 *
 *  - Table 1 "Parts"               : PART
 *  - Table 2 "Services & Charges"  : LABOR, SERVICE_CHARGE, CUSTOM_CHARGE, AMC (+ any unknown type)
 *  - Callout bar                   : DISCOUNT_ADJUSTMENT
 *  - An empty table is omitted entirely.
 *  - Every amount comes from stored values (lineTotal includes tax; taxAmount is stored),
 *    nothing is re-derived with an assumed GST rate.
 *  - Up to SINGLE_PAGE_MAX_ROWS item rows the invoice is zoomed to fit one A4 page;
 *    beyond that it flows onto further pages with repeating table headers.
 */
import { toTitleCase } from '@/lib/title-case';
import { esc, formatDateIST, numberToWords, buildBusinessInfo } from './helpers';

export interface InvoiceRenderOptions {
  itemMap?: Record<string, any>;
  amcContract?: any;
}

const CHANNEL_LABELS: Record<string, string> = {
  GATEWAY_1: 'Payment Gateway 1',
  GATEWAY_2: 'Payment Gateway 2',
  CASH: 'Cash',
};

/** Item rows that still fit one A4 page (with zoom). More rows flow onto extra pages. */
export const SINGLE_PAGE_MAX_ROWS = 15;
const MAX_ZOOM = 0.82;
const MIN_ZOOM = 0.7;

// ─── formatting ─────────────────────────────────────────────────────────────────

const money = (n: number): string => {
  const v = Math.abs(n) < 0.005 ? 0 : n;
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const qtyFmt = (n: number): string => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number): string => `${+n.toFixed(2)}%`;

function fmtDateTime(date: Date | string): string {
  const d = new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// ─── line classification ────────────────────────────────────────────────────────

const SERVICE_FALLBACK_SAC = '998714';
const PART_FALLBACK_HSN = '87141090';

interface Row {
  li: any;
  qty: number;
  rate: number;
  discPct: number;
  taxRate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  total: number;
  hsn: string;
  sku: string;
  mrp: number | null;
  amcCovered: boolean;
  free: boolean;
}

function buildRow(li: any, itemMap: Record<string, any>): Row {
  const item = li.referenceItemId ? itemMap[li.referenceItemId] : null;
  const total = Number(li.lineTotal) || 0;
  const tax = Number(li.taxAmount) || 0;
  const taxRate = Number(li.taxRate) || 0;
  const isPart = li.lineType === 'PART';
  return {
    li,
    qty: Number(li.quantity) || 0,
    rate: Number(li.unitPrice) || 0,
    discPct: Number(li.discountPercent) || 0,
    taxRate,
    taxable: total - tax,
    cgst: tax / 2,
    sgst: tax / 2,
    total,
    hsn: li.hsnCode || item?.hsnCode || (isPart ? PART_FALLBACK_HSN : SERVICE_FALLBACK_SAC),
    sku: item?.sku || '',
    mrp: item?.mrp != null ? Number(item.mrp) : null,
    amcCovered: li.lineType === 'AMC' && total === 0,
    free: total === 0 && (Number(li.discountPercent) || 0) >= 100,
  };
}

interface Section {
  rows: Row[];
  taxable: number;
  cgst: number;
  sgst: number;
  total: number;
}

function summarise(rows: Row[]): Section {
  return rows.reduce<Section>(
    (s, r) => ({ rows: s.rows, taxable: s.taxable + r.taxable, cgst: s.cgst + r.cgst, sgst: s.sgst + r.sgst, total: s.total + r.total }),
    { rows, taxable: 0, cgst: 0, sgst: 0, total: 0 },
  );
}

// ─── table rendering ────────────────────────────────────────────────────────────

const taxCell = (amount: number, rate: number) =>
  `<td class="r"><span class="taxcell">${money(amount)}<span class="pct">${pct(rate / 2)}</span></span></td>`;

function partRow(r: Row, n: number): string {
  const disc = r.discPct > 0 ? `${+r.discPct.toFixed(2)}%` : '—';
  return `<tr>
    <td class="c">${n}</td>
    <td class="l mono">${r.sku ? esc(r.sku) : '—'}</td>
    <td class="l">${esc(r.li.description)}</td>
    <td class="c">${qtyFmt(r.qty)}</td>
    <td class="r">${r.mrp != null ? money(r.mrp) : '—'}</td>
    <td class="r">${money(r.rate)}</td>
    <td class="c">${disc}</td>
    <td class="r">${money(r.taxable)}</td>
    ${taxCell(r.cgst, r.taxRate)}${taxCell(r.sgst, r.taxRate)}
    <td class="r bold">${r.free ? '<span class="free">FREE</span>' : money(r.total)}</td>
  </tr>`;
}

function serviceRow(r: Row, n: number): string {
  const disc = r.discPct > 0 ? `${+r.discPct.toFixed(2)}%` : '—';
  const badge = r.amcCovered
    ? ' <span class="badge covered">★ AMC COVERED</span>'
    : r.li.lineType === 'AMC' ? ' <span class="badge plan">★ AMC PLAN</span>' : '';
  const rate = r.free ? `<span class="strike">${money(r.rate)}</span>` : money(r.rate);
  return `<tr${r.li.lineType === 'AMC' ? ' class="amc-row"' : ''}>
    <td class="c">${n}</td>
    <td class="l">${esc(r.li.description)}${badge}</td>
    <td class="c mono">${esc(r.hsn)}</td>
    <td class="c">${qtyFmt(r.qty)}</td>
    <td class="r">${rate}</td>
    <td class="c">${disc}</td>
    <td class="r">${money(r.taxable)}</td>
    ${taxCell(r.cgst, r.taxRate)}${taxCell(r.sgst, r.taxRate)}
    <td class="r bold">${r.free ? '<span class="free">FREE</span>' : money(r.total)}</td>
  </tr>`;
}

function subtotalRow(label: string, labelSpan: number, s: Section): string {
  return `<tr class="sub"><td class="r" colspan="${labelSpan}">${label}</td>
    <td class="r">${money(s.taxable)}</td><td class="r">${money(s.cgst)}</td><td class="r">${money(s.sgst)}</td><td class="r">${money(s.total)}</td></tr>`;
}

function partsTable(s: Section): string {
  let n = 0;
  return `<div class="tbl-title">Parts</div>
  <table class="items">
    <thead><tr>
      <th style="width:24px">S.No</th><th style="width:120px">Part No.</th><th>Description</th>
      <th style="width:34px">Qty</th><th style="width:58px">MRP</th><th style="width:58px">Rate</th>
      <th style="width:44px">Disc%</th><th style="width:62px">Taxable Value</th>
      <th style="width:52px">CGST</th><th style="width:52px">SGST</th><th style="width:62px">Total</th>
    </tr></thead>
    <tbody>${s.rows.map((r) => partRow(r, ++n)).join('')}${subtotalRow('Parts Total', 7, s)}</tbody>
  </table>`;
}

function servicesTable(s: Section): string {
  let n = 0;
  return `<div class="tbl-title">Services &amp; Charges</div>
  <table class="items">
    <thead><tr>
      <th style="width:24px">S.No</th><th>Description</th><th style="width:58px">SAC</th>
      <th style="width:34px">Qty</th><th style="width:62px">Rate</th><th style="width:44px">Disc%</th>
      <th style="width:62px">Taxable Value</th><th style="width:52px">CGST</th><th style="width:52px">SGST</th><th style="width:62px">Total</th>
    </tr></thead>
    <tbody>${s.rows.map((r) => serviceRow(r, ++n)).join('')}${subtotalRow('Services Total', 6, s)}</tbody>
  </table>`;
}

// ─── styles ─────────────────────────────────────────────────────────────────────

const STYLES = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,Helvetica,sans-serif; color:#000; font-size:11px; background:#d9d9d9; padding:24px; }
.sheet { width:210mm; margin:0 auto; background:#fff; padding:7mm 10mm; }
.frame { border:1px solid #000; }
.r{text-align:right}.bold{font-weight:700}.muted{color:#555}.mono{font-family:monospace}
.doc-title{ text-align:center; font-size:15px; font-weight:700; padding:9px 0; border-bottom:1px solid #000; letter-spacing:1px; }
.company{ text-align:center; padding:16px 10px 18px; border-bottom:1px solid #000; position:relative; }
.company .logo{ position:absolute; left:16px; top:14px; height:36px; width:auto; }
.company h1{ font-size:19px; font-weight:800; letter-spacing:0.5px; margin-bottom:4px; }
.company p{ font-size:10px; line-height:1.7; color:#222; }
.amc-banner{ display:flex; justify-content:space-between; align-items:center; padding:9px 14px; background:#fffbeb; border-bottom:1px solid #000; }
.amc-banner .l{ font-size:11px; font-weight:800; color:#92400e; letter-spacing:0.3px; }
.amc-banner .l small{ display:block; font-weight:600; color:#6b7280; font-size:9px; margin-top:2px; }
.amc-banner .r{ display:flex; gap:14px; }
.amc-banner .stat{ text-align:center; } .amc-banner .stat b{ font-size:16px; color:#92400e; } .amc-banner .stat span{ display:block; font-size:8px; color:#6b7280; text-transform:uppercase; }
.meta{ display:flex; justify-content:space-between; padding:9px 14px; border-bottom:1px solid #000; font-size:10.5px; }
.meta .kv{ line-height:1.8; } .meta .kv b{ display:inline-block; min-width:95px; }
.band{ background:#efefef; border-bottom:1px solid #000; border-top:1px solid #000; padding:6px 14px; font-weight:700; font-size:10.5px; letter-spacing:0.3px; }
.grid2{ display:flex; border-bottom:1px solid #000; }
.grid2>div{ flex:1; padding:7px 14px; line-height:1.8; font-size:10.5px; }
.grid2>div:first-child{ border-right:1px solid #000; } .grid2 b{ display:inline-block; min-width:95px; vertical-align:top; }
.grid3{ display:flex; border-bottom:1px solid #000; }
.grid3>div{ flex:1; padding:7px 14px; line-height:1.8; font-size:10px; }
.grid3>div+div{ border-left:1px solid #000; } .grid3 b{ display:inline-block; min-width:78px; vertical-align:top; }
.counter-note{ padding:8px 14px; border-bottom:1px solid #000; font-size:10.5px; background:#fffbeb; }
table{ width:100%; border-collapse:collapse; }
.tbl-title{ background:#efefef; font-weight:700; padding:6px 14px; font-size:10.5px; border-top:1px solid #000; border-bottom:1px solid #000; letter-spacing:0.3px; }
.items th,.items td{ border:1px solid #999; padding:5px 6px; font-size:9.5px; }
.items th{ background:#f3f3f3; font-weight:700; text-align:center; }
.items td.l{text-align:left}.items td.c{text-align:center}.items td.r{text-align:right}
.items .sub td{ font-weight:700; background:#fafafa; padding:6px 6px; }
.items tr.amc-row td{ background:#fffbeb; }
.taxcell{ display:block; } .taxcell .pct{ display:block; font-size:8px; color:#666; }
.strike{ text-decoration:line-through; color:#999; }
.free{ font-weight:800; color:#b45309; }
.badge{ display:inline-block; font-size:7.5px; font-weight:800; padding:1px 6px; border-radius:2px; letter-spacing:0.8px; vertical-align:middle; }
.badge.plan{ background:#111; color:#d4a017; } .badge.covered{ background:#166534; color:#fff; }
.empty{ padding:14px; text-align:center; color:#666; border-bottom:1px solid #000; }
.disc-callout{ padding:8px 14px; background:#f0fdf4; border-bottom:1px solid #000; }
.disc-callout .row{ display:flex; justify-content:space-between; padding:2px 0; }
.disc-callout .l{ font-weight:700; color:#166534; font-size:10.5px; } .disc-callout .v{ font-weight:700; color:#16a34a; font-size:11px; }
.savings{ display:flex; justify-content:space-between; align-items:center; padding:9px 14px; background:#1a1a1a; color:#fcd34d; border-bottom:1px solid #000; }
.savings b{ font-size:15px; color:#fff; }
.note{ font-size:8.5px; color:#444; padding:7px 14px; font-style:italic; }
.totals-wrap{ display:flex; border-top:1px solid #000; }
.totals-left{ flex:1.1; border-right:1px solid #000; padding:14px 16px; font-size:10px; line-height:1.6; }
.totals-left .sig{ margin-top:36px; text-align:center; font-weight:700; }
.totals-right{ flex:1; }
.totals-right table td{ border:1px solid #999; padding:7px 10px; font-size:10.5px; }
.totals-right .lbl{ text-align:right; font-weight:700; background:#f7f7f7; }
.totals-right .colhdr{ text-align:center; font-weight:700; background:#efefef; }
.totals-right .amt{ text-align:right; }
.totals-right .pos{ color:#16a34a; font-weight:700; } .totals-right .neg{ color:#dc2626; font-weight:700; }
.grand td{ font-size:13px !important; font-weight:800; background:#fdecea !important; padding:9px 10px !important; }
.words{ border-top:1px solid #000; padding:9px 14px; font-size:10px; }
.footer-sign{ display:flex; border-top:1px solid #000; }
.footer-sign>div{ flex:1; padding:10px 14px; min-height:64px; font-size:10px; }
.footer-sign>div:first-child{ border-right:1px solid #000; }
@media print {
  html, body { background:#fff; padding:0; margin:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @page { size:A4; margin:6mm 8mm; }
  .sheet { width:100%; padding:0; zoom:var(--zoom, 0.82); }
  thead { display:table-header-group; }
  tr, .disc-callout, .savings { page-break-inside:avoid; break-inside:avoid; }
  .totals-wrap, .words, .footer-sign { page-break-inside:avoid; break-inside:avoid; }
}`;

// ─── main ───────────────────────────────────────────────────────────────────────

/** Zoom that fits `rows` item rows on one page; the more rows, the smaller (clamped). */
export function pickZoom(rows: number): number {
  const z = MAX_ZOOM - Math.max(0, rows - 10) * 0.024;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +z.toFixed(3)));
}

export function renderInvoiceDocument(
  invoice: any,
  settings: Record<string, any>,
  logoUrl: string,
  opts: InvoiceRenderOptions = {},
): string {
  const itemMap = opts.itemMap ?? {};
  const amc = opts.amcContract ?? null;
  const biz = buildBusinessInfo(settings);
  const allItems: any[] = invoice.lineItems || [];

  const partRows = allItems.filter((li) => li.lineType === 'PART').map((li) => buildRow(li, itemMap));
  const serviceRows = allItems
    .filter((li) => li.lineType !== 'PART' && li.lineType !== 'DISCOUNT_ADJUSTMENT')
    .sort((a, b) => Number(b.lineType === 'AMC') - Number(a.lineType === 'AMC'))
    .map((li) => buildRow(li, itemMap));
  const discountLines = allItems.filter((li) => li.lineType === 'DISCOUNT_ADJUSTMENT');

  const parts = summarise(partRows);
  const services = summarise(serviceRows);
  const sections: Array<{ key: string; label: string; s: Section }> = [];
  if (partRows.length) sections.push({ key: 'parts', label: 'Parts', s: parts });
  if (serviceRows.length) sections.push({ key: 'services', label: 'Services', s: services });
  const cols = Math.max(1, sections.length);

  // ── totals (reconcile to the stored grandTotal) ──
  const lineDiscount = discountLines.reduce((sum, li) => sum + Math.abs(Number(li.lineTotal) || 0), 0);
  const invoiceDiscount = Number(invoice.discountAmount) || 0;
  const totalDiscount = lineDiscount + invoiceDiscount;
  const grandTotal = Number(invoice.grandTotal) || 0;
  const computed = parts.total + services.total - totalDiscount;
  const roundOff = grandTotal - computed;
  const amountPaid = Number(invoice.amountPaid) || 0;
  const amountDue = Number(invoice.amountDue) || 0;
  const amountWords = `${numberToWords(Math.round(grandTotal))} Rupees Only`;

  // ── AMC ──
  const amcSavings = serviceRows
    .filter((r) => r.amcCovered)
    .reduce((sum, r) => sum + r.qty * r.rate, 0);
  const hasAmcPurchase = serviceRows.some((r) => r.li.lineType === 'AMC' && r.total > 0);

  // ── header blocks ──
  const vehicle = invoice.vehicle;
  const jobCard = invoice.jobCard;
  const customer = invoice.customer;
  const address = [customer.addressLine1, customer.addressLine2, customer.city, customer.state, customer.postalCode]
    .filter(Boolean).join(', ');
  const isCounterSale = !jobCard && !vehicle;
  const vehicleLabel = vehicle ? `${toTitleCase(vehicle.brand ?? '')} ${toTitleCase(vehicle.model ?? '')}`.trim() : '';
  const channelLabel = CHANNEL_LABELS[invoice.channel as string] ?? 'Cash';
  const placeOfSupply = settings['business.placeOfSupply'] || 'Intra-State (WEST BENGAL)';
  const jurisdiction = settings['invoice.jurisdiction'] || 'Bankura';
  const footerNote = settings['invoice.footerNote'] ? String(settings['invoice.footerNote']) : '';

  const rowCount = partRows.length + serviceRows.length;
  const singlePage = rowCount <= SINGLE_PAGE_MAX_ROWS;
  const zoom = singlePage ? pickZoom(rowCount) : MAX_ZOOM;

  const title = isCounterSale ? 'INVOICE · COUNTER SALE' : 'INVOICE';

  let amcBanner = '';
  if (amc) {
    const pending = amc.contractNumber === 'PENDING';
    const status = pending ? 'Activates on full payment' : hasAmcPurchase ? 'Membership Activated' : 'Active Member';
    const validity = pending
      ? `${amc.plan?.durationMonths ?? ''} months validity from activation`
      : `Contract ${esc(amc.contractNumber)} · Valid till ${esc(formatDateIST(amc.endDate, { long: true }))}`;
    amcBanner = `<div class="amc-banner">
      <div class="l">★ AMC ${esc((amc.plan?.planName ?? '').toUpperCase())} — ${status}<small>${validity}</small></div>
      <div class="r">
        ${pending ? '' : `<div class="stat"><b>${Number(amc.servicesRemaining)}</b><span>Remaining</span></div>`}
        <div class="stat"><b>${Number(amc.totalServices)}</b><span>Total</span></div>
      </div></div>`;
  }

  const detailBlock = isCounterSale
    ? `<div class="counter-note"><b>Sale Type:</b> Over-the-counter sale — no job card / vehicle linked.</div>`
    : `<div class="band">Job Card Details</div>
  <div class="grid3">
    <div>
      <div><b>Job Card No</b>: ${jobCard ? esc(jobCard.jobCardNumber) : '—'}</div>
      <div><b>Reg No</b>: ${vehicle?.registrationNumber ? esc(vehicle.registrationNumber) : '—'}</div>
      <div><b>Vehicle</b>: ${vehicleLabel ? esc(vehicleLabel) : '—'}</div>
    </div>
    <div>
      <div><b>Type</b>: ${vehicle?.vehicleType ? esc(toTitleCase(String(vehicle.vehicleType).toLowerCase())) : '—'}</div>
      <div><b>KM Reading</b>: ${jobCard?.odometerAtIntake ? Number(jobCard.odometerAtIntake).toLocaleString('en-IN') : '—'}</div>
      <div><b>Payment</b>: ${esc(String(invoice.paymentStatus).replace('_', ' '))}</div>
    </div>
    <div><div><b>Work</b>: ${jobCard?.issueSummary ? esc(jobCard.issueSummary) : '—'}</div></div>
  </div>`;

  const discountCallout = discountLines.length
    ? `<div class="disc-callout">${discountLines
        .map((d) => `<div class="row"><span class="l">🏷️ ${esc(d.description)}</span><span class="v">− ₹${money(Math.abs(Number(d.lineTotal) || 0))}</span></div>`)
        .join('')}</div>`
    : '';

  const savingsRibbon = amcSavings > 0
    ? `<div class="savings"><span>★ You saved today with AMC${amc?.plan?.planName ? ' ' + esc(amc.plan.planName) : ''}</span><b>₹${money(amcSavings)}</b></div>`
    : '';

  // ── totals grid ──
  const colHeads = sections.map((x) => `<td class="colhdr">${x.label}</td>`).join('');
  const perSection = (fn: (s: Section) => number) =>
    sections.map((x) => `<td class="amt">${money(fn(x.s))}</td>`).join('');
  const perSectionBold = (fn: (s: Section) => number) =>
    sections.map((x) => `<td class="amt bold">${money(fn(x.s))}</td>`).join('');
  const spanRow = (label: string, value: string, cls = '') =>
    `<tr><td class="lbl">${label}</td><td class="amt ${cls}" colspan="${cols}">${value}</td></tr>`;

  const totalsRows = [
    `<tr><td class="lbl"></td>${colHeads}</tr>`,
    `<tr><td class="lbl">Taxable Amount</td>${perSection((s) => s.taxable)}</tr>`,
    `<tr><td class="lbl">CGST</td>${perSection((s) => s.cgst)}</tr>`,
    `<tr><td class="lbl">SGST</td>${perSection((s) => s.sgst)}</tr>`,
    `<tr><td class="lbl">Net Amount</td>${perSectionBold((s) => s.total)}</tr>`,
    totalDiscount > 0 ? spanRow('Discount', `− ${money(totalDiscount)}`, 'pos') : '',
    Math.abs(roundOff) >= 0.005 ? spanRow(Math.abs(roundOff) < 1 ? 'Round Off' : 'Adjustment', `${roundOff > 0 ? '+' : '−'}${money(Math.abs(roundOff))}`) : '',
    `<tr class="grand"><td class="lbl">Total Invoice Value</td><td class="amt" colspan="${cols}">Rs. ${money(grandTotal)}</td></tr>`,
    amountDue > 0.005 && amountPaid > 0 ? spanRow('Amount Paid', money(amountPaid), 'pos') : '',
    amountDue > 0.005 ? spanRow('Balance Due', money(amountDue), 'neg') : '',
  ].join('');

  const bankLines = [
    biz.bankName ? `<div>Bank: ${esc(biz.bankName)}</div>` : '',
    biz.bankAccount ? `<div>A/C: ${esc(biz.bankAccount)}${biz.bankIfsc ? ` | IFSC: ${esc(biz.bankIfsc)}` : ''}</div>` : '',
    biz.bankUpi ? `<div>UPI: ${esc(biz.bankUpi)}</div>` : '',
  ].join('');

  const body = [
    sections.length === 0 ? `<div class="empty">No line items on this invoice.</div>` : '',
    partRows.length ? partsTable(parts) : '',
    serviceRows.length ? servicesTable(services) : '',
  ].join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice - ${esc(invoice.invoiceNumber)}</title>
<style>${STYLES}</style></head>
<body><div class="sheet" style="--zoom:${zoom}"><div class="frame">
  <div class="doc-title">${title}</div>
  <div class="company">
    ${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="${esc(biz.name)}" />` : ''}
    <h1>${esc(biz.name)}</h1>
    <p>${biz.address ? esc(biz.address) + '<br />' : ''}${[biz.phone ? 'Contact : ' + esc(biz.phone) : '', biz.email ? esc(biz.email) : ''].filter(Boolean).join(' &nbsp;|&nbsp; ')}${biz.gst ? '<br />GSTIN : ' + esc(biz.gst) : ''}</p>
  </div>
  ${amcBanner}
  <div class="meta">
    <div class="kv"><div><b>Invoice No</b>: ${esc(invoice.invoiceNumber)}</div><div><b>Invoice Date</b>: ${fmtDateTime(invoice.invoiceDate)}</div></div>
    <div class="kv"><div><b>Place of Supply</b>: ${esc(placeOfSupply)}</div><div><b>Payment Mode</b>: ${esc(channelLabel)}</div></div>
  </div>
  <div class="band">Customer Details</div>
  <div class="grid2">
    <div><div><b>Name</b>: ${esc(toTitleCase(customer.fullName))}</div><div><b>Mobile No</b>: ${esc(customer.phoneNumber)}</div></div>
    <div><div><b>Address</b>: ${address ? esc(address) : '—'}</div>${customer.email ? `<div><b>Email</b>: ${esc(customer.email)}</div>` : ''}</div>
  </div>
  ${detailBlock}
  ${body}
  ${discountCallout}
  ${savingsRibbon}
  <div class="note">** All prices are inclusive of applicable taxes.${amcSavings > 0 ? ` AMC covered services are shown as FREE (₹${money(amcSavings)} value).` : ''}</div>
  <div class="totals-wrap">
    <div class="totals-left">
      <div class="bold">For ${esc(biz.name)}</div>
      ${bankLines}
      <div class="sig">Authorised Signatory</div>
    </div>
    <div class="totals-right"><table>${totalsRows}</table></div>
  </div>
  <div class="words"><b>In Words:</b> ${esc(amountWords)}</div>
  <div class="footer-sign">
    <div class="muted"><b>Terms:</b> ${amc ? 'AMC benefits applied per membership terms. ' : ''}Goods once sold will not be taken back. Subject to ${esc(jurisdiction)} jurisdiction. E. &amp; O.E.${footerNote ? `<br />${esc(footerNote)}` : ''}</div>
    <div class="r bold">Customer Signature</div>
  </div>
</div></div></body></html>`;
}
