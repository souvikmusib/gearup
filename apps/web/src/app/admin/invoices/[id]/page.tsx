'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
import { FileText, CheckCircle, CreditCard, Download } from 'lucide-react';

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  const [loading, setLoading] = useState('');
  const [newLine, setNewLine] = useState({ lineType: 'CUSTOM_CHARGE', description: '', quantity: '1', unitPrice: '', taxRate: '0' });
  const [addingLine, setAddingLine] = useState(false);

  const fetch = () => {
    const endpoint = `/admin/invoices/${id}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) setData(cached.data);
    return promise.then((r) => {
      if (r.success) setData(r.data);
    });
  };
  useEffect(() => { fetch(); }, [id]);

  const finalize = async () => {
    setLoading('finalize');
    const res = await api.post<any>(`/admin/invoices/${id}/finalize`, {});
    if (res.success) fetch();
    setLoading('');
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading('pay');
    const res = await api.post<any>(`/admin/invoices/${id}/payments`, {
      amount: Number(payAmount), paymentMode: payMode, paymentDate: new Date().toISOString(), referenceNumber: payRef || undefined,
    });
    if (res.success) { setShowPayForm(false); setPayAmount(''); setPayRef(''); fetch(); }
    setLoading('');
  };

  const addLine = async () => {
    if (!newLine.description) return;
    setAddingLine(true);
    const res = await api.post<any>(`/admin/invoices/${id}/line-items`, {
      lineType: newLine.lineType, description: newLine.description,
      quantity: Number(newLine.quantity), unitPrice: Number(newLine.unitPrice), taxRate: Number(newLine.taxRate),
    });
    setAddingLine(false);
    if (res.success) { setNewLine({ lineType: 'CUSTOM_CHARGE', description: '', quantity: '1', unitPrice: '', taxRate: '0' }); fetch(); }
  };

  const updateLine = async (lineItemId: string, field: string, value: string) => {
    const num = Number(value);
    if (isNaN(num)) return;
    await api.patch<any>(`/admin/invoices/${id}/line-items`, { lineItemId, [field]: num });
    fetch();
  };

  const removeLine = async (lineItemId: string) => {
    await api.delete<any>(`/admin/invoices/${id}/line-items?lineItemId=${lineItemId}`);
    fetch();
  };

  const openPdf = async () => {
    const token = localStorage.getItem('gearup_token');
    if (!token) { alert('Not authenticated. Please login again.'); return; }
    try {
      const res = await window.fetch(`${window.location.origin}/api/admin/invoices/${id}/pdf`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) { alert('Failed to generate PDF'); return; }
      const html = await res.text();
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
    } catch (e) {
      console.error('PDF error:', e);
      alert('Failed to generate PDF');
    }
  };

  if (!data) return <div className="py-12 text-center text-gray-500 animate-pulse">Loading invoice...</div>;

  const isDraft = data.invoiceStatus === 'DRAFT';
  const isFinalized = data.invoiceStatus === 'FINALIZED';
  const isPaid = data.paymentStatus === 'PAID';

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

  return (
    <div className="space-y-6">
      <PageHeader title={`Invoice ${data.invoiceNumber}`} description={`${data.customer?.fullName} • ${data.vehicle?.brand} ${data.vehicle?.model} (${data.vehicle?.registrationNumber})`} />

      {/* Status + Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={data.invoiceStatus} />
        <StatusBadge status={data.paymentStatus} />
        <div className="flex-1" />

        {isDraft && (
          <button onClick={finalize} disabled={loading === 'finalize'} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            <CheckCircle className="h-4 w-4" />
            {loading === 'finalize' ? 'Finalizing...' : 'Finalize Invoice'}
          </button>
        )}

        {isFinalized && !isPaid && (
          <button onClick={() => { setShowPayForm(!showPayForm); setPayAmount(String(Number(data.amountDue))); }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <CreditCard className="h-4 w-4" />
            Record Payment
          </button>
        )}

        <button onClick={openPdf} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
          <Download className="h-4 w-4" />
          Download PDF
        </button>
      </div>

      {/* Payment Form */}
      {showPayForm && (
        <form onSubmit={recordPayment} className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Record Payment</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Amount (₹)</label>
              <input type="number" step="0.01" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Payment Mode</label>
              <select value={payMode} onChange={(e) => setPayMode(e.target.value)} className={inputCls}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reference # (optional)</label>
              <input value={payRef} onChange={(e) => setPayRef(e.target.value)} className={inputCls} placeholder="UPI ref / cheque no" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" disabled={loading === 'pay'} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {loading === 'pay' ? 'Recording...' : `Pay ₹${payAmount}`}
            </button>
            <button type="button" onClick={() => setShowPayForm(false)} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Subtotal</p>
          <p className="text-lg font-bold mt-1">₹{Number(data.subtotal).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Tax</p>
          <p className="text-lg font-bold mt-1">₹{Number(data.taxTotal).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Grand Total</p>
          <p className="text-xl font-bold mt-1">₹{Number(data.grandTotal).toLocaleString()}</p>
        </div>
        <div className={`rounded-xl border p-4 ${isPaid ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30' : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30'}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Balance Due</p>
          <p className={`text-xl font-bold mt-1 ${isPaid ? 'text-green-600' : 'text-red-600'}`}>₹{Number(data.amountDue).toLocaleString()}</p>
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">Line Items</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs uppercase text-gray-500 tracking-wide">
              <th className="px-5 py-2.5 text-left">#</th>
              <th className="px-5 py-2.5 text-left">Description</th>
              <th className="px-5 py-2.5 text-center">Type</th>
              <th className="px-5 py-2.5 text-right">Qty</th>
              <th className="px-5 py-2.5 text-right">Unit Price</th>
              <th className="px-5 py-2.5 text-right">Tax %</th>
              <th className="px-5 py-2.5 text-right">Total</th>
              {isDraft && <th className="px-3 py-2.5"></th>}
            </tr>
          </thead>
          <tbody>
            {data.lineItems?.map((li: any, i: number) => (
              <tr key={li.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-5 py-2.5 text-gray-500">{i + 1}</td>
                <td className="px-5 py-2.5 font-medium">{li.description}</td>
                <td className="px-5 py-2.5 text-center"><span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs">{li.lineType}</span></td>
                {isDraft ? (
                  <>
                    <td className="px-2 py-1.5 text-right"><input type="number" className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(li.quantity)} onBlur={(e) => updateLine(li.id, 'quantity', e.target.value)} /></td>
                    <td className="px-2 py-1.5 text-right"><input type="number" step="0.01" className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(li.unitPrice)} onBlur={(e) => updateLine(li.id, 'unitPrice', e.target.value)} /></td>
                    <td className="px-2 py-1.5 text-right"><input type="number" step="0.01" className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(li.taxRate)} onBlur={(e) => updateLine(li.id, 'taxRate', e.target.value)} /></td>
                  </>
                ) : (
                  <>
                    <td className="px-5 py-2.5 text-right">{Number(li.quantity)}</td>
                    <td className="px-5 py-2.5 text-right">₹{Number(li.unitPrice).toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right text-gray-500">{Number(li.taxRate)}%</td>
                  </>
                )}
                <td className="px-5 py-2.5 text-right font-semibold">₹{Number(li.lineTotal).toLocaleString()}</td>
                {isDraft && <td className="px-3 py-2.5"><button onClick={() => removeLine(li.id)} className="text-red-500 hover:text-red-700 text-xs">✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {isDraft && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex gap-2 items-end">
            <select className={inputCls + ' w-32'} value={newLine.lineType} onChange={(e) => setNewLine({ ...newLine, lineType: e.target.value })}>
              <option value="PART">Part</option><option value="LABOR">Labor</option><option value="CUSTOM_CHARGE">Custom</option><option value="DISCOUNT_ADJUSTMENT">Discount</option>
            </select>
            <input className={inputCls + ' flex-1'} placeholder="Description" value={newLine.description} onChange={(e) => setNewLine({ ...newLine, description: e.target.value })} />
            <input type="number" className={inputCls + ' w-16'} placeholder="Qty" value={newLine.quantity} onChange={(e) => setNewLine({ ...newLine, quantity: e.target.value })} />
            <input type="number" step="0.01" className={inputCls + ' w-24'} placeholder="Price" value={newLine.unitPrice} onChange={(e) => setNewLine({ ...newLine, unitPrice: e.target.value })} />
            <input type="number" step="0.01" className={inputCls + ' w-16'} placeholder="Tax%" value={newLine.taxRate} onChange={(e) => setNewLine({ ...newLine, taxRate: e.target.value })} />
            <button onClick={addLine} disabled={addingLine} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
              {addingLine ? '...' : '+ Add'}
            </button>
          </div>
        )}
      </div>

      {/* Payment History */}
      {data.payments?.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Payment History</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs uppercase text-gray-500 tracking-wide">
                <th className="px-5 py-2.5 text-left">Date</th>
                <th className="px-5 py-2.5 text-left">Mode</th>
                <th className="px-5 py-2.5 text-left">Reference</th>
                <th className="px-5 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p: any) => (
                <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-5 py-2.5">{new Date(p.paymentDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-2.5"><span className="rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs font-medium">{p.paymentMode}</span></td>
                  <td className="px-5 py-2.5 text-gray-500">{p.referenceNumber || '—'}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-green-600">₹{Number(p.amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice Meta */}
      <div className="grid gap-4 sm:grid-cols-3 text-sm">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Customer</p>
          <p className="font-medium">{data.customer?.fullName}</p>
          <p className="text-gray-500">{data.customer?.phoneNumber}</p>
          {data.customer?.email && <p className="text-gray-500">{data.customer.email}</p>}
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Vehicle</p>
          <p className="font-medium">{data.vehicle?.brand} {data.vehicle?.model}</p>
          <p className="text-gray-500">{data.vehicle?.registrationNumber}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Details</p>
          <p className="text-gray-500">Date: {new Date(data.invoiceDate).toLocaleDateString('en-IN')}</p>
          {data.jobCard && <p className="text-gray-500">Job: {data.jobCard.jobCardNumber}</p>}
          {data.finalizedAt && <p className="text-gray-500">Finalized: {new Date(data.finalizedAt).toLocaleDateString('en-IN')}</p>}
        </div>
      </div>
    </div>
  );
}
