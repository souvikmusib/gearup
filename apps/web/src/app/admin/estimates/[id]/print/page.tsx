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
        setTimeout(() => window.print(), 500);
      }
    });
  }, [id]);

  if (!data) return <p style={{ textAlign: 'center', padding: '40px', fontFamily: 'system-ui' }}>Loading...</p>;

  const grandTotal = Number(data.grandTotal);
  const subtotal = Number(data.subtotal);
  const taxTotal = Number(data.taxTotal);
  const createdDate = formatIST(data.createdAt);
  const validUntil = data.validUntil ? formatIST(data.validUntil) : null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --brand-red: #e01010;
          --dark-red: #ac0000;
          --surface-bg: #ffffff;
          --surface-muted: #f9f9f9;
          --text-primary: #1a1a1a;
          --text-muted: #6a6a6a;
          --border: #e5e5e5;
          --accent-green: #1a6b2a;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--text-primary); font-size: 12px; background: #f5f5f5; }
        @media print {
          body { background: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 10mm; size: A4; }
          .no-print { display: none !important; }
          .estimate-page { box-shadow: none !important; }
          nav, aside, [class*="Sidebar"], [class*="sidebar"] { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; overflow: visible !important; }
          .flex.h-screen { display: block !important; }
        }
        .estimate-page {
          max-width: 800px; margin: 20px auto; background: #fff; padding: 0;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-radius: 8px; overflow: hidden;
          color: #1a1a1a !important;
        }
        .header-bar {
          background: var(--text-primary); padding: 24px 40px; display: flex;
          justify-content: space-between; align-items: center;
        }
        .brand { display: flex; align-items: center; gap: 12px; }
        .brand img { height: 36px; width: auto; }
        .estimate-badge {
          background: var(--brand-red); color: #fff; padding: 8px 20px;
          border-radius: 4px; font-size: 16px; font-weight: 700; letter-spacing: 1px;
          text-transform: uppercase;
        }
        .body-content { padding: 32px 40px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
        .info-box { padding: 16px; background: var(--surface-muted); border-radius: 8px; border: 1px solid var(--border); }
        .info-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-muted); font-weight: 600; margin-bottom: 6px; }
        .info-value { font-size: 15px; font-weight: 600; }
        .info-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .meta-row { display: flex; gap: 16px; margin-bottom: 24px; }
        .meta-pill { padding: 6px 14px; background: var(--surface-muted); border-radius: 20px; font-size: 11px; color: var(--text-muted); border: 1px solid var(--border); }
        .meta-pill strong { color: var(--text-primary); }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .items-table th {
          text-align: left; padding: 10px 12px; font-size: 9px; text-transform: uppercase;
          letter-spacing: 1px; color: var(--text-muted); font-weight: 600;
          border-bottom: 2px solid var(--text-primary);
        }
        .items-table th.right { text-align: right; }
        .items-table th.center { text-align: center; }
        .items-table td { padding: 12px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-primary); }
        .items-table td.right { text-align: right; color: var(--text-primary); }
        .items-table td.center { text-align: center; color: var(--text-primary); }
        .items-table tr:last-child td { border-bottom: none; }
        .item-name { font-weight: 600; color: #1a1a1a; }
        .item-sku { font-size: 10px; color: #6a6a6a; }
        .totals-section { display: flex; justify-content: flex-end; }
        .totals-card {
          width: 280px; background: var(--text-primary); padding: 20px 24px;
          border-radius: 8px; color: #fff;
        }
        .totals-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
        .totals-row.grand {
          margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.15);
          font-size: 20px; font-weight: 700; color: var(--brand-red);
        }
        .totals-row.grand span:last-child { color: #fff; }
        .notes-box {
          margin-top: 24px; padding: 12px 16px; background: #fffbeb;
          border: 1px solid #fde68a; border-radius: 6px; font-size: 11px; color: #92400e;
        }
        .footer-section {
          margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border);
          text-align: center; color: var(--text-muted); font-size: 10px;
        }
        .footer-section strong { color: var(--text-primary); }
        .footer-contact { margin-top: 4px; }
        .validity-note {
          margin-top: 16px; padding: 10px 16px; background: #f0fdf4; border: 1px solid #bbf7d0;
          border-radius: 6px; font-size: 11px; color: var(--accent-green); text-align: center;
        }
        .print-btn {
          display: block; margin: 20px auto; padding: 12px 32px; background: var(--text-primary);
          color: var(--brand-red); border: none; border-radius: 6px; font-weight: 700;
          font-size: 13px; text-transform: uppercase; letter-spacing: 1px; cursor: pointer;
        }
        .print-btn:hover { background: #333; }
      `}} />

      <div className="estimate-page">
        <div className="header-bar">
          <div className="brand">
            <img src="/brand/gearup-logo.png" alt="GearUp" />
          </div>
          <div className="estimate-badge">Estimate</div>
        </div>

        <div className="body-content">
          <div className="meta-row">
            <div className="meta-pill"><strong>{data.estimateNumber}</strong></div>
            <div className="meta-pill">Date: <strong>{createdDate}</strong></div>
            {validUntil && <div className="meta-pill">Valid Until: <strong>{validUntil}</strong></div>}
          </div>

          <div className="info-grid">
            <div className="info-box">
              <div className="info-label">Customer</div>
              <div className="info-value">{data.customer?.fullName}</div>
              <div className="info-sub">{data.customer?.phoneNumber}</div>
              {data.customer?.addressLine1 && <div className="info-sub">{data.customer.addressLine1}{data.customer.city ? `, ${data.customer.city}` : ''}</div>}
            </div>
            <div className="info-box">
              <div className="info-label">Vehicle</div>
              {data.vehicle ? (
                <>
                  <div className="info-value">{data.vehicle.registrationNumber}</div>
                  <div className="info-sub">{data.vehicle.brand} {data.vehicle.model}</div>
                </>
              ) : (
                <div className="info-value" style={{ color: '#999' }}>—</div>
              )}
            </div>
          </div>

          <table className="items-table">
            <thead>
              <tr>
                <th style={{ width: '30px' }}>#</th>
                <th>Description</th>
                <th className="center" style={{ width: '50px' }}>Qty</th>
                <th className="right" style={{ width: '90px' }}>Unit Price</th>
                <th className="right" style={{ width: '90px' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item: any, i: number) => (
                <tr key={item.id}>
                  <td style={{ color: '#999' }}>{i + 1}</td>
                  <td>
                    <div className="item-name">{item.description}</div>
                    {item.inventoryItem?.sku && <div className="item-sku">{item.inventoryItem.sku}{item.inventoryItem.hsnCode ? ` · HSN ${item.inventoryItem.hsnCode}` : ''}</div>}
                  </td>
                  <td className="center">{Number(item.quantity)}</td>
                  <td className="right">₹{Number(item.unitPrice).toLocaleString('en-IN')}</td>
                  <td className="right" style={{ fontWeight: 600 }}>₹{Math.round(Number(item.quantity) * Number(item.unitPrice)).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals-section">
            <div className="totals-card">
              <div className="totals-row">
                <span>Subtotal</span>
                <span>₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              {taxTotal > 0 && (
                <div className="totals-row">
                  <span>Tax</span>
                  <span>₹{taxTotal.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="totals-row grand">
                <span>Total</span>
                <span>₹{grandTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {data.notes && (
            <div className="notes-box">
              <strong>Note:</strong> {data.notes}
            </div>
          )}

          <div className="validity-note">
            This is an estimate only. Final bill may vary based on actual parts used and labor required.
          </div>

          <div className="footer-section">
            <p><strong>GearUp Servicing</strong> — Professional Two-Wheeler Care</p>
            <p className="footer-contact">Milanpally, Katjuridanga, Bankura · 9242519099 · gearup.sgnk.ai@gmail.com</p>
            <p style={{ marginTop: '4px' }}>GSTIN: 19EHTPM1499B1ZS</p>
          </div>
        </div>
      </div>

      <button className="no-print print-btn" onClick={() => window.print()}>
        🖨️ Print Estimate
      </button>
    </>
  );
}
