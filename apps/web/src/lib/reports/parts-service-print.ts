/**
 * Print template for the Parts & Service report.
 *
 * Returns a self-contained A4 HTML document. Follows the same approach as
 * `lib/invoice-templates`: no PDF library, the browser's own print pipeline does
 * the conversion, so `@page` and `print-color-adjust` carry the layout.
 *
 * The two problem-part lists are printed in FULL. They are the point of the
 * document — a truncated list cannot be worked through — so tables repeat their
 * headers across page breaks and rows are kept whole.
 */

import { esc, formatDateIST } from '@/lib/invoice-templates/helpers';
import { GRADE_LABELS } from '@/lib/reports/parts-integrity';
import type { PartsServiceReport } from '@/lib/reports/parts-service-query';

const inr = (n: number) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const inr2 = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n === null ? '—' : `${Number(n).toFixed(1)}%`);

const LINE_TYPE_LABELS: Record<string, string> = {
  PART: 'Parts',
  SERVICE_CHARGE: 'Service charge',
  CUSTOM_CHARGE: 'Custom charge',
  LABOR: 'Labour',
  AMC: 'AMC sold',
  DISCOUNT_ADJUSTMENT: 'Discount (line)',
};

export function generatePartsServiceReportHTML(
  report: PartsServiceReport,
  settings: Record<string, unknown>,
): string {
  const { range, totals, partsIntegrity: pi, overheads, profitability: p, nullifDiagnostic: nd } = report;

  const bizName = String(settings['business.name'] ?? 'GearUp Servicing');
  const bizAddress = String(settings['business.address'] ?? '');
  const bizPhone = String(settings['business.phone'] ?? '');
  const bizGst = String(settings['business.gst'] ?? '');

  const gradeRows = pi.byGrade
    .map(
      (g) => `<tr>
        <td><b>${esc(g.label)}</b><div class="s">${esc(g.description)}</div></td>
        <td class="r">${g.lines}</td>
        <td class="r">${Math.round(g.qty)}</td>
        <td class="r"><b>${inr(g.revenue)}</b></td>
        <td class="r">${g.grade === 'OK' ? inr(g.cost) : '—'}</td>
        <td class="r">${g.sharePct.toFixed(1)}%</td>
        <td class="s">${esc(g.fix)}</td></tr>`,
    )
    .join('');

  const incomeRows = report.income
    .map(
      (i) => `<tr>
        <td>${esc(LINE_TYPE_LABELS[i.lineType] ?? i.lineType)}</td>
        <td class="r">${i.lines}</td>
        <td class="r">${i.amount < 0 ? '−' : ''}${inr(Math.abs(i.amount))}</td></tr>`,
    )
    .join('');

  const overheadRows = overheads.prorated.lines
    .map(
      (l) => `<tr>
        <td>${esc(l.label)}</td>
        <td class="r">${inr(l.monthly)}</td>
        <td class="r">${inr2(l.perDay)}</td>
        <td class="r"><b>${inr(l.forPeriod)}</b></td></tr>`,
    )
    .join('');

  const noCostRows = pi.noCostItems
    .map(
      (r, i) => `<tr>
        <td class="r m">${i + 1}</td>
        <td class="m">${esc(r.sku ?? '—')}</td>
        <td><b>${esc(r.name)}</b></td>
        <td class="s">${esc(r.category ?? '—')}</td>
        <td class="r">${r.lines}</td>
        <td class="r">${Math.round(r.qty)}</td>
        <td class="r">${inr(r.maxUnitPrice)}</td>
        <td class="r"><b>${inr(r.revenue)}</b></td></tr>`,
    )
    .join('');

  const unlinkedRows = pi.unlinkedItems
    .map(
      (r, i) => `<tr>
        <td class="r m">${i + 1}</td>
        <td><b>${esc(r.name)}</b></td>
        <td class="r">${r.lines}</td>
        <td class="r">${Math.round(r.qty)}</td>
        <td class="r">${inr(r.maxUnitPrice)}</td>
        <td class="r"><b>${inr(r.revenue)}</b></td></tr>`,
    )
    .join('');

  const scenario = (title: string, note: string, s: typeof p.reported, accent: boolean) => `
    <div class="pl ${accent ? 'accent' : ''}">
      <div class="pl-t">${esc(title)}</div>
      <div class="pl-n">${esc(note)}</div>
      <div class="pl-r"><span>Net income (ex-GST, after discount)</span><span>${inr(s.netIncome)}</span></div>
      <div class="pl-r"><span>Parts cost, recorded</span><span class="neg">− ${inr(s.partsCostRecorded)}</span></div>
      ${s.partsCostImplied > 0 ? `<div class="pl-r"><span>Parts cost, implied on uncosted</span><span class="neg">− ${inr(s.partsCostImplied)}</span></div>` : ''}
      <div class="pl-r sep"><span>Gross profit</span><span><b>${inr(s.grossProfit)}</b></span></div>
      <div class="pl-r"><span>Overheads (${range.days} days)</span><span class="neg">− ${inr(s.overheads)}</span></div>
      <div class="pl-r big"><span>Net profit</span>
        <span style="color:${s.netProfit < 0 ? '#b91c1c' : '#15803d'}">${inr(s.netProfit)}</span></div>
    </div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(bizName)} — Parts &amp; Service Report</title>
<style>
  @page{size:A4;margin:9mm}
  *{box-sizing:border-box}
  body{margin:0;font:9pt/1.45 "Google Sans",Inter,system-ui,sans-serif;color:#0f172a;
       -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .head{border-bottom:2.5px solid #e01010;padding-bottom:7px;margin-bottom:11px}
  .biz{font-size:15pt;font-weight:800;letter-spacing:-.3px}
  .meta{font-size:7.5pt;color:#64748b;margin-top:3px}
  h1{font-size:12pt;margin:0 0 2px} .sub{font-size:7.5pt;color:#64748b;margin:0 0 11px}
  .card{border:1px solid #cbd5e1;border-radius:5px;padding:9px;margin-bottom:8px;
        break-inside:avoid;page-break-inside:avoid}
  .card h2{font-size:9.5pt;margin:0 0 2px} .card .n{font-size:7pt;color:#64748b;margin:0 0 7px}
  .kpis{display:flex;gap:6px;margin-bottom:8px}
  .kpi{flex:1;border:1px solid #cbd5e1;border-radius:5px;padding:7px}
  .kpi.bad{border-color:#fca5a5;background:#fff5f5} .kpi.warn{border-color:#fcd34d;background:#fffbeb}
  .kpi .c{font-size:6.5pt;text-transform:uppercase;letter-spacing:.4px;color:#64748b;font-weight:700}
  .kpi .v{font-size:12.5pt;font-weight:800;margin-top:2px;letter-spacing:-.4px}
  .kpi.bad .v{color:#b91c1c} .kpi.warn .v{color:#b45309}
  .kpi .f{font-size:6.5pt;color:#64748b;margin-top:1px}
  table{width:100%;border-collapse:collapse}
  th{font-size:6.5pt;text-transform:uppercase;letter-spacing:.3px;color:#64748b;text-align:left;
     padding:4px 5px;border-bottom:1px solid #cbd5e1;font-weight:700}
  td{padding:3px 5px;border-bottom:1px solid #f1f5f9;font-size:7.5pt;vertical-align:top}
  th.r,td.r{text-align:right}
  .s{font-size:6.5pt;color:#64748b} .m{font-family:ui-monospace,Menlo,monospace;font-size:7pt}
  thead{display:table-header-group}
  tr{break-inside:avoid;page-break-inside:avoid}
  tr.tot td{border-top:1.5px solid #0f172a;font-weight:800}
  .cols{display:flex;gap:8px}
  .cols > *{flex:1}
  .pl{border:1px solid #cbd5e1;border-radius:5px;padding:9px}
  .pl.accent{border-color:#fdba74;background:#fff7ed}
  .pl-t{font-weight:700;font-size:9pt} .pl-n{font-size:6.5pt;color:#64748b;margin-bottom:6px}
  .pl-r{display:flex;justify-content:space-between;font-size:7.5pt;padding:2px 0}
  .pl-r.sep{border-top:1px solid #cbd5e1;margin-top:3px;padding-top:4px}
  .pl-r.big{border-top:1.5px solid #0f172a;margin-top:4px;padding-top:5px;font-weight:800;font-size:10pt}
  .neg{color:#b91c1c}
  .warnbox{background:#fef2f2;border:1px solid #fca5a5;border-radius:5px;padding:8px;margin-top:7px}
  .warnbox b{color:#991b1b} .warnbox p{margin:0;font-size:7pt;color:#7f1d1d}
  .brk{break-before:page;page-break-before:always}
  .foot{font-size:6.5pt;color:#64748b;margin-top:10px;border-top:1px solid #cbd5e1;padding-top:6px}
</style></head><body>

<div class="head">
  <div class="biz">${esc(bizName)}</div>
  <div class="meta">${[bizAddress, bizPhone && `Ph ${bizPhone}`, bizGst && `GSTIN ${bizGst}`]
    .filter(Boolean)
    .map((x) => esc(String(x)))
    .join(' · ')}</div>
</div>

<h1>Parts &amp; Service Report</h1>
<p class="sub">${esc(range.from)} to ${esc(range.to)} (${range.days} days) ·
  ${report.invoiceCount} finalized invoices · amounts ex-GST ·
  generated ${esc(formatDateIST(new Date(), { long: true, time: true }))} IST</p>

<div class="kpis">
  <div class="kpi"><div class="c">Parts sold</div><div class="v">${inr(totals.partsRevenue)}</div>
    <div class="f">${Math.round(pi.qty)} units · ${pi.lines} lines</div></div>
  <div class="kpi"><div class="c">Service charges</div><div class="v">${inr(totals.serviceRevenue)}</div>
    <div class="f">service, labour &amp; custom</div></div>
  <div class="kpi"><div class="c">Net income</div><div class="v">${inr(totals.netIncome)}</div>
    <div class="f">after ${inr(totals.discount)} discount</div></div>
</div>
<div class="kpis">
  <div class="kpi bad"><div class="c">No buying price</div>
    <div class="v">${inr(pi.byGrade.find((g) => g.grade === 'NO_COST')?.revenue ?? 0)}</div>
    <div class="f">${pi.noCostItems.length} items</div></div>
  <div class="kpi warn"><div class="c">No inventory link</div>
    <div class="v">${inr(pi.byGrade.find((g) => g.grade === 'UNLINKED')?.revenue ?? 0)}</div>
    <div class="f">${pi.unlinkedItems.length} descriptions</div></div>
  <div class="kpi"><div class="c">Cost coverage</div><div class="v">${pct(pi.coveragePct)}</div>
    <div class="f">${inr(pi.cost)} of cost known</div></div>
</div>

<div class="card">
  <h2>Monthly overheads &amp; profitability</h2>
  <p class="n">Monthly figures divided by ${overheads.prorated.divisor} for a daily rate,
    multiplied by the ${range.days} days in this period.</p>
  <table>
    <thead><tr><th>Overhead</th><th class="r">Monthly</th><th class="r">Per day</th>
      <th class="r">This period</th></tr></thead>
    <tbody>${overheadRows}
      <tr class="tot"><td>Total</td><td class="r">${inr(overheads.prorated.monthlyTotal)}</td>
        <td class="r">${inr2(overheads.prorated.perDayTotal)}</td>
        <td class="r">${inr(overheads.prorated.forPeriodTotal)}</td></tr></tbody>
  </table>
  <div class="cols" style="margin-top:8px">
    ${scenario('As reported', `Uses only the ${pct(pi.coveragePct)} of parts cost recorded`, p.reported, false)}
    ${scenario('Adjusted for missing cost data', `Charges uncosted parts at the ${pct(pi.costedMarginPct)} measured margin`, p.adjusted, true)}
  </div>
  <div class="warnbox"><p><b>The two net-profit figures differ by ${inr(p.uncertainty)}.</b>
    That spread is the cost of parts with no recorded buying price, not a business result.</p></div>
</div>

<div class="card">
  <h2>Parts cost integrity</h2>
  <p class="n">Each part line graded by whether a buying price can be established.
    Only "costed correctly" carries a usable cost.</p>
  <table>
    <thead><tr><th>Grade</th><th class="r">Lines</th><th class="r">Units</th><th class="r">Revenue</th>
      <th class="r">Known cost</th><th class="r">Share</th><th>Fix</th></tr></thead>
    <tbody>${gradeRows}</tbody>
  </table>
  <div class="warnbox"><p><b>Naive margin ${pct(pi.naiveMarginPct)} vs true margin
    ${pct(pi.costedMarginPct)} on costed parts.</b> ${inr(pi.revenueWithoutCost)} of parts revenue has no
    cost basis, so a blended margin over all parts treats it as pure profit.</p></div>
</div>

<div class="cols">
  <div class="card" style="flex:1">
    <h2>Income by line type</h2><p class="n">Ex-GST. Discount shown as a reduction.</p>
    <table><thead><tr><th>Type</th><th class="r">Lines</th><th class="r">Amount</th></tr></thead>
      <tbody>${incomeRows}</tbody></table>
  </div>
  <div class="card" style="flex:1">
    <h2>Catalog health</h2><p class="n">All active inventory items, not period-scoped.</p>
    <table><tbody>
      <tr><td>Missing cost price</td><td class="r"><b>${report.catalogHealth.missingCostPrice}</b> /
        ${report.catalogHealth.total}</td></tr>
      <tr><td>Has cost price</td><td class="r">${report.catalogHealth.total - report.catalogHealth.missingCostPrice} /
        ${report.catalogHealth.total}</td></tr>
      <tr><td>Sold this period without a cost price</td><td class="r"><b>${pi.noCostItems.length}</b></td></tr>
    </tbody></table>
    <p class="n" style="margin-top:6px">Cost resolution recovered ${inr2(nd.costRecovered)} across
      ${nd.linesAffected} lines that a plain COALESCE would have dropped
      (${nd.zeroCostRows} of ${nd.stockOutRows} stock-out rows store an explicit zero).</p>
  </div>
</div>

<div class="card brk">
  <h2>Complete list — parts with no buying price (${pi.noCostItems.length} items)</h2>
  <p class="n">Every item billed in this period whose costPrice is 0, highest revenue first.
    Total ${inr(pi.byGrade.find((g) => g.grade === 'NO_COST')?.revenue ?? 0)}.</p>
  <table><thead><tr><th class="r">#</th><th>SKU</th><th>Item</th><th>Category</th><th class="r">Lines</th>
    <th class="r">Units</th><th class="r">Sell price</th><th class="r">Revenue</th></tr></thead>
    <tbody>${noCostRows || '<tr><td colspan="8">None — every part sold had a buying price.</td></tr>'}</tbody></table>
</div>

<div class="card brk">
  <h2>Complete list — parts with no inventory link (${pi.unlinkedItems.length} descriptions)</h2>
  <p class="n">Free-typed part descriptions with no catalog record. These never move stock and never
    carry a cost. Total ${inr(pi.byGrade.find((g) => g.grade === 'UNLINKED')?.revenue ?? 0)}.</p>
  <table><thead><tr><th class="r">#</th><th>Description as typed</th><th class="r">Lines</th>
    <th class="r">Units</th><th class="r">Sell price</th><th class="r">Revenue</th></tr></thead>
    <tbody>${unlinkedRows || '<tr><td colspan="6">None — every part was linked to the catalog.</td></tr>'}</tbody></table>
</div>

<div class="foot">${esc(bizName)} · Parts &amp; Service Report · ${esc(range.from)} to ${esc(range.to)} ·
  amounts exclusive of GST · dates bucketed in Asia/Kolkata · finalized invoices only.</div>

<!--
  Self-triggering print. The invoice PDF flow has the opener attach a load
  listener instead, but for a Blob URL that listener can miss an already-fired
  load event. Printing from inside the document is race-free, so the page
  deliberately does NOT also call print() on the opened window.
-->
<script>window.addEventListener('load', function(){ window.print(); });</script>
</body></html>`;
}
