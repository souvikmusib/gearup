'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { formatIST } from '@/lib/time';

export default function EstimatePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get<any>(`/admin/estimates/${id}`).then((res) => {
      if (res.success) {
        setData(res.data);
        setTimeout(() => window.print(), 600);
      }
    });
  }, [id]);

  if (!data) return <p style={{ textAlign: 'center', padding: '40px', fontFamily: 'system-ui' }}>Loading...</p>;

  // Separate items by line type
  const partItems = (data.items || []).filter((i: any) => !i.lineType || i.lineType === 'PART');
  const labourItems = (data.items || []).filter((i: any) => i.lineType === 'LABOR');
  const serviceItems = (data.items || []).filter((i: any) => i.lineType === 'SERVICE_CHARGE' || i.lineType === 'CUSTOM_CHARGE');
  const discountItems = (data.items || []).filter((i: any) => i.lineType === 'DISCOUNT_ADJUSTMENT');

  // Compute totals
  const computeLineTotal = (item: any) => {
    const base = Number(item.quantity) * Number(item.unitPrice);
    const disc = base * (Number(item.discountPercent || 0) / 100);
    const afterDisc = base - disc;
    const taxRate = Number(item.taxRate || 0);
    const cgst = afterDisc * (taxRate / 200); // half of total GST
    const sgst = cgst;
    const total = afterDisc + cgst + sgst;
    return { base: afterDisc, cgst, sgst, taxRate, total };
  };

  const partsTotal = partItems.reduce((sum: number, i: any) => sum + computeLineTotal(i).total, 0);
  const labourTotal = labourItems.reduce((sum: number, i: any) => sum + computeLineTotal(i).total, 0);
  const serviceTotal = serviceItems.reduce((sum: number, i: any) => sum + computeLineTotal(i).total, 0);
  const discountTotal = discountItems.reduce((sum: number, i: any) => sum + computeLineTotal(i).total, 0);
  const totalCGST = [...partItems, ...labourItems, ...serviceItems].reduce((sum: number, i: any) => sum + computeLineTotal(i).cgst, 0);
  const totalSGST = [...partItems, ...labourItems, ...serviceItems].reduce((sum: number, i: any) => sum + computeLineTotal(i).sgst, 0);
  const grandTotal = partsTotal + labourTotal + serviceTotal - discountTotal;

  const createdDate = formatIST(data.createdAt);
  const validUntil = data.validUntil ? formatIST(data.validUntil) : null;

  const formatCurrency = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const formatDecimal = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        :root { --brand-red: #e01010; --dark: #1a1a1a; --muted: #6a6a6a; --border: #e0e0e0; --surface: #f9f9f9; --accent-green: #16a34a; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', -apple-system, sans-serif; font-size: 11px; color: var(--dark); background: #f0f0f0; }
        @media print {
          body { background: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 8mm; size: A4; }
          .no-print { display: none !important; }
          .page { box-shadow: none !important; margin: 0 !important; }
          nav, aside, [class*="Sidebar"], [class*="sidebar"] { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; overflow: visible !important; }
          .flex.h-screen { display: block !important; }
        }
        .page { max-width: 800px; margin: 20px auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.1); overflow: hidden; }
        .header { display: flex; justify-content: space-between; align-items: center; padding: 20px 32px; background: var(--dark); color: #fff; }
        .header-left img { height: 36px; }
        .header-right { text-align: right; color: #ccc; font-size: 10px; line-height: 1.6; }
        .header-right .name { font-size: 13px; font-weight: 700; color: #fff; }
        .header-right .gstin { font-weight: 600; color: #aaa; }
        .title-bar { background: var(--brand-red); text-align: center; padding: 6px; color: #fff; font-size: 14px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
        .info-section { padding: 24px 32px 16px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
        .info-col { }
        .info-col + .info-col { border-left: 1px solid var(--border); }
        .info-row { display: grid; grid-template-columns: 130px 1fr; border-bottom: 1px solid var(--border); }
        .info-row:last-child { border-bottom: none; }
        .info-label { padding: 7px 10px; background: var(--surface); font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); border-right: 1px solid var(--border); }
        .info-value { padding: 7px 10px; font-weight: 500; font-size: 11px; }
        .section-title { padding: 10px 0 6px; font-size: 12px; font-weight: 700; color: var(--dark); border-bottom: 2px solid var(--dark); margin: 16px 32px 0; }
        .est-table { width: calc(100% - 64px); margin: 0 32px; border-collapse: collapse; margin-top: 4px; }
        .est-table th { text-align: left; padding: 7px 6px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.7px; color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--border); background: var(--surface); }
        .est-table th.r { text-align: right; }
        .est-table th.c { text-align: center; }
        .est-table td { padding: 6px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
        .est-table td.r { text-align: right; }
        .est-table td.c { text-align: center; }
        .est-table td.code { font-family: 'SF Mono', Consolas, monospace; font-size: 10px; color: var(--muted); }
        .est-table tr:last-child td { border-bottom: none; }
        .subtotal-row td { border-top: 2px solid var(--dark) !important; font-weight: 700; padding-top: 8px !important; background: var(--surface); }
        .totals-section { margin: 20px 32px; display: flex; justify-content: flex-end; }
        .totals-box { width: 300px; border: 2px solid var(--dark); border-radius: 6px; overflow: hidden; }
        .totals-row { display: flex; justify-content: space-between; padding: 9px 14px; border-bottom: 1px solid var(--border); font-size: 12px; }
        .totals-row:last-child { border-bottom: none; }
        .totals-row.grand { background: var(--dark); color: #fff; font-size: 15px; font-weight: 700; }
        .totals-row.grand .amt { color: var(--brand-red); }
        .notes-section { margin: 14px 32px; padding: 10px 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; }
        .notes-section strong { font-size: 9px; text-transform: uppercase; color: #92400e; }
        .notes-section p { margin-top: 3px; font-size: 11px; color: #78350f; }
        .validity { margin: 10px 32px; padding: 7px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; text-align: center; font-size: 10px; color: var(--accent-green); }
        .signatures { margin: 36px 32px 16px; display: flex; justify-content: space-between; }
        .sig-box { text-align: center; width: 200px; }
        .sig-line { border-top: 1px solid var(--dark); margin-bottom: 5px; }
        .sig-label { font-size: 10px; color: var(--muted); }
        .sig-for { font-size: 10px; font-weight: 600; margin-top: 2px; }
        .footer { margin: 0 32px; padding: 14px 0; border-top: 1px solid var(--border); text-align: center; font-size: 10px; color: var(--muted); }
        .footer strong { color: var(--dark); }
        .print-btn { display: block; margin: 20px auto; padding: 12px 32px; background: var(--dark); color: var(--brand-red); border: none; border-radius: 6px; font-weight: 700; font-size: 13px; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; }
        .print-btn:hover { background: #333; }
      `}} />

      <div className="page">
        {/* Header */}
        <div className="header">
          <div className="header-left">
            <img src="/brand/gearup-logo.png" alt="GearUp" />
          </div>
          <div className="header-right">
            <div className="name">GearUp Servicing</div>
            <div>Milanpally, Katjuridanga, Bankura, WB 722101</div>
            <div>📞 9242519099 · gearup.sgnk.ai@gmail.com</div>
            <div className="gstin">GSTIN: 19EHTPM1499B1ZS</div>
          </div>
        </div>
        <div className="title-bar">Service Estimate</div>

        {/* Customer & Estimate Info */}
        <div className="info-section">
          <div className="info-grid">
            <div className="info-col">
              <div className="info-row">
                <div className="info-label">Customer</div>
                <div className="info-value">{data.customer?.fullName}</div>
              </div>
              <div className="info-row">
                <div className="info-label">Mobile</div>
                <div className="info-value">{data.customer?.phoneNumber || '—'}</div>
              </div>
              {data.customer?.email && (
                <div className="info-row">
                  <div className="info-label">Email</div>
                  <div className="info-value">{data.customer.email}</div>
                </div>
              )}
              {data.customer?.addressLine1 && (
                <div className="info-row">
                  <div className="info-label">Address</div>
                  <div className="info-value">{data.customer.addressLine1}{data.customer.city ? `, ${data.customer.city}` : ''}</div>
                </div>
              )}
              {data.notes && (
                <div className="info-row">
                  <div className="info-label">Customer Voice</div>
                  <div className="info-value" style={{ color: '#e01010', fontWeight: 600 }}>{data.notes}</div>
                </div>
              )}
            </div>
            <div className="info-col">
              <div className="info-row">
                <div className="info-label">Estimate #</div>
                <div className="info-value" style={{ fontWeight: 700 }}>{data.estimateNumber}</div>
              </div>
              <div className="info-row">
                <div className="info-label">Estimate Date</div>
                <div className="info-value">{createdDate}</div>
              </div>
              {validUntil && (
                <div className="info-row">
                  <div className="info-label">Valid Until</div>
                  <div className="info-value">{validUntil}</div>
                </div>
              )}
              {data.vehicle && (
                <>
                  <div className="info-row">
                    <div className="info-label">Reg Number</div>
                    <div className="info-value" style={{ fontWeight: 700 }}>{data.vehicle.registrationNumber}</div>
                  </div>
                  <div className="info-row">
                    <div className="info-label">Vehicle</div>
                    <div className="info-value">{data.vehicle.brand} {data.vehicle.model}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Parts Section */}
        {partItems.length > 0 && (
          <>
            <div className="section-title">Parts Description</div>
            <table className="est-table">
              <thead>
                <tr>
                  <th style={{ width: '75px' }}>Code</th>
                  <th>Description</th>
                  <th className="c" style={{ width: '32px' }}>Qty</th>
                  <th className="r" style={{ width: '68px' }}>Price</th>
                  <th className="c" style={{ width: '50px' }}>GST %</th>
                  <th className="r" style={{ width: '58px' }}>CGST</th>
                  <th className="r" style={{ width: '58px' }}>SGST</th>
                  <th className="r" style={{ width: '75px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {partItems.map((item: any, i: number) => {
                  const calc = computeLineTotal(item);
                  const gstPct = calc.taxRate;
                  const halfGst = gstPct / 2;
                  return (
                    <tr key={item.id || i}>
                      <td className="code">{item.inventoryItem?.sku || item.hsnCode || '—'}</td>
                      <td>{item.description}</td>
                      <td className="c">{Number(item.quantity)}</td>
                      <td className="r">{formatDecimal(Number(item.unitPrice))}</td>
                      <td className="c">{gstPct > 0 ? `${halfGst}%+${halfGst}%` : '0%'}</td>
                      <td className="r">{formatDecimal(calc.cgst)}</td>
                      <td className="r">{formatDecimal(calc.sgst)}</td>
                      <td className="r" style={{ fontWeight: 600 }}>{formatCurrency(calc.total)}</td>
                    </tr>
                  );
                })}
                <tr className="subtotal-row">
                  <td colSpan={5}></td>
                  <td className="r" colSpan={2} style={{ fontSize: '10px', color: '#6a6a6a' }}>Parts Total</td>
                  <td className="r" style={{ fontSize: '13px' }}>{formatCurrency(partsTotal)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* Labour Section */}
        {labourItems.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: '20px' }}>Labour Description</div>
            <table className="est-table">
              <thead>
                <tr>
                  <th style={{ width: '75px' }}>Code</th>
                  <th>Description</th>
                  <th className="c" style={{ width: '35px' }}>Hrs</th>
                  <th className="r" style={{ width: '68px' }}>Rate/Hr</th>
                  <th className="c" style={{ width: '50px' }}>GST %</th>
                  <th className="r" style={{ width: '58px' }}>CGST</th>
                  <th className="r" style={{ width: '58px' }}>SGST</th>
                  <th className="r" style={{ width: '75px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {labourItems.map((item: any, i: number) => {
                  const calc = computeLineTotal(item);
                  const gstPct = calc.taxRate;
                  const halfGst = gstPct / 2;
                  return (
                    <tr key={item.id || i}>
                      <td className="code">{item.inventoryItem?.sku || item.hsnCode || '—'}</td>
                      <td>{item.description}</td>
                      <td className="c">{Number(item.quantity).toFixed(2)}</td>
                      <td className="r">{formatDecimal(Number(item.unitPrice))}</td>
                      <td className="c">{gstPct > 0 ? `${halfGst}%+${halfGst}%` : '0%'}</td>
                      <td className="r">{formatDecimal(calc.cgst)}</td>
                      <td className="r">{formatDecimal(calc.sgst)}</td>
                      <td className="r" style={{ fontWeight: 600 }}>{formatCurrency(calc.total)}</td>
                    </tr>
                  );
                })}
                <tr className="subtotal-row">
                  <td colSpan={5}></td>
                  <td className="r" colSpan={2} style={{ fontSize: '10px', color: '#6a6a6a' }}>Labour Total</td>
                  <td className="r" style={{ fontSize: '13px' }}>{formatCurrency(labourTotal)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* Service/Custom Charges */}
        {serviceItems.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: '20px' }}>Other Charges</div>
            <table className="est-table">
              <thead>
                <tr>
                  <th style={{ width: '75px' }}>Code</th>
                  <th>Description</th>
                  <th className="c" style={{ width: '32px' }}>Qty</th>
                  <th className="r" style={{ width: '68px' }}>Price</th>
                  <th className="c" style={{ width: '50px' }}>GST %</th>
                  <th className="r" style={{ width: '58px' }}>CGST</th>
                  <th className="r" style={{ width: '58px' }}>SGST</th>
                  <th className="r" style={{ width: '75px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {serviceItems.map((item: any, i: number) => {
                  const calc = computeLineTotal(item);
                  const gstPct = calc.taxRate;
                  const halfGst = gstPct / 2;
                  return (
                    <tr key={item.id || i}>
                      <td className="code">{item.hsnCode || '—'}</td>
                      <td>{item.description}</td>
                      <td className="c">{Number(item.quantity)}</td>
                      <td className="r">{formatDecimal(Number(item.unitPrice))}</td>
                      <td className="c">{gstPct > 0 ? `${halfGst}%+${halfGst}%` : '0%'}</td>
                      <td className="r">{formatDecimal(calc.cgst)}</td>
                      <td className="r">{formatDecimal(calc.sgst)}</td>
                      <td className="r" style={{ fontWeight: 600 }}>{formatCurrency(calc.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {/* Totals */}
        <div className="totals-section">
          <div className="totals-box">
            {partItems.length > 0 && (
              <div className="totals-row"><span>Parts Subtotal</span><span>{formatCurrency(partsTotal)}</span></div>
            )}
            {labourItems.length > 0 && (
              <div className="totals-row"><span>Labour Subtotal</span><span>{formatCurrency(labourTotal)}</span></div>
            )}
            {serviceItems.length > 0 && (
              <div className="totals-row"><span>Other Charges</span><span>{formatCurrency(serviceTotal)}</span></div>
            )}
            {discountItems.length > 0 && (
              <div className="totals-row" style={{ color: '#dc2626' }}><span>Discount</span><span>−{formatCurrency(discountTotal)}</span></div>
            )}
            {totalCGST > 0 && (
              <>
                <div className="totals-row"><span>CGST</span><span>{formatDecimal(totalCGST)}</span></div>
                <div className="totals-row"><span>SGST</span><span>{formatDecimal(totalSGST)}</span></div>
              </>
            )}
            <div className="totals-row grand">
              <span>Total Estimate</span>
              <span className="amt">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="notes-section">
          <strong>Note:</strong>
          <p>This is an estimate only. Final bill may vary based on actual parts used, labour hours, and additional issues discovered during service.</p>
        </div>

        {/* Validity */}
        <div className="validity">
          This estimate is valid for 7 days from the date of issue. Prices subject to change after validity period.
        </div>

        {/* Signatures */}
        <div className="signatures">
          <div className="sig-box">
            <div className="sig-line"></div>
            <div className="sig-label">Customer Signature & Date</div>
          </div>
          <div className="sig-box">
            <div className="sig-line"></div>
            <div className="sig-label">Authorised Signatory</div>
            <div className="sig-for">FOR: GearUp Servicing</div>
          </div>
        </div>

        {/* Footer */}
        <div className="footer">
          <p><strong>GearUp Servicing</strong> — Professional Two-Wheeler Care</p>
          <p style={{ marginTop: '4px' }}>Milanpally, Katjuridanga, Bankura · 9242519099 · gearup.sgnk.ai@gmail.com</p>
          <p style={{ marginTop: '2px', fontWeight: 600 }}>GSTIN: 19EHTPM1499B1ZS</p>
        </div>
      </div>

      <button className="no-print print-btn" onClick={() => window.print()}>
        🖨️ Print / Save as PDF
      </button>
    </>
  );
}
