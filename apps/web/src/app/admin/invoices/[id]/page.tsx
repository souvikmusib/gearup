'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
import { WhatsAppButton } from '@/components/shared/whatsapp-button';
import { FileText, CheckCircle, CreditCard, Download } from 'lucide-react';

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState('');
  const [newLine, setNewLine] = useState({ lineType: 'CUSTOM_CHARGE', description: '', quantity: '1', unitPrice: '', taxRate: '0', discountPercent: '0', discountMode: 'flat', amcPlanId: '', amcContractId: '' });
  const [addingLine, setAddingLine] = useState(false);
  const [showPdfMenu, setShowPdfMenu] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [amcPlans, setAmcPlans] = useState<any[]>([]);
  const [amcContracts, setAmcContracts] = useState<any[]>([]);

  const [refreshing, setRefreshing] = useState(false);
  const [addStep, setAddStep] = useState<'type' | 'details'>('type');
  const [amcUpsell, setAmcUpsell] = useState<{ show: boolean; plan: any; savings: number; partsSavings: number; serviceSavings: number } | null>(null);
  const [applyingAmc, setApplyingAmc] = useState(false);

  const loadInventory = async () => {
    if (inventoryItems.length) return;
    const res = await api.get<any>('/admin/inventory/items?pageSize=500');
    if (res.success) setInventoryItems(res.data?.items ?? res.data ?? []);
  };
  const loadWorkers = async () => {
    if (workers.length) return;
    const res = await api.get<any>('/admin/workers?pageSize=200');
    if (res.success) setWorkers(res.data?.items ?? res.data ?? []);
  };
  const loadAmcOptions = async () => {
    if (amcPlans.length) return;
    const [plansRes, contractsRes] = await Promise.all([
      api.get<any>('/admin/amc/plans'),
      api.get<any>('/admin/amc/contracts?status=ACTIVE'),
    ]);
    if (plansRes.success) setAmcPlans((plansRes.data ?? []).filter((p: any) => p.isActive));
    if (contractsRes.success) setAmcContracts(contractsRes.data ?? []);
  };

  const fetch = (useCache = false) => {
    const endpoint = `/admin/invoices/${id}`;
    if (useCache) {
      const { cached, promise } = api.getSWR<any>(endpoint);
      if (cached?.success) setData(cached.data);
      return promise.then((r) => { if (r.success) setData(r.data); });
    }
    setRefreshing(true);
    return api.get<any>(endpoint).then((r) => { if (r.success) setData(r.data); setRefreshing(false); });
  };
  useEffect(() => {
    fetch(true);
    // Pre-fetch inventory + workers so dropdowns are instant
    loadInventory();
    loadWorkers();
  }, [id]);

  // Check AMC upsell opportunity
  useEffect(() => {
    if (!data || !data.vehicleId || data.lineItems?.some((li: any) => li.lineType === 'AMC')) { setAmcUpsell(null); return; }
    // Check if vehicle already has active AMC
    api.get<any>('/admin/amc/contracts?status=ACTIVE').then((r) => {
      if (!r.success) return;
      const hasAmc = (r.data ?? []).some((c: any) => c.vehicleId === data.vehicleId);
      if (hasAmc) { setAmcUpsell(null); return; }
      // Get best plan for this vehicle and calculate savings
      api.get<any>('/admin/amc/plans').then((pr) => {
        if (!pr.success) return;
        const plans = (pr.data ?? []).filter((p: any) => p.isActive);
        if (plans.length === 0) { setAmcUpsell(null); return; }
        const plan = plans[0]; // pick first active plan
        const laborItems = data.lineItems?.filter((li: any) => li.lineType === 'LABOR') ?? [];
        const partItems = data.lineItems?.filter((li: any) => li.lineType === 'PART') ?? [];
        const serviceSavings = laborItems.reduce((s: number, li: any) => s + Number(li.lineTotal), 0);
        // Parts savings: 1% branded (assume all for now since isBranded defaults true)
        const partsSavings = partItems.reduce((s: number, li: any) => s + Number(li.lineTotal) * 0.01, 0);
        const totalSavings = serviceSavings + partsSavings;
        if (totalSavings > 0) setAmcUpsell({ show: true, plan, savings: totalSavings, partsSavings, serviceSavings });
        else setAmcUpsell(null);
      });
    });
  }, [data]);

  const applyAmc = async () => {
    if (!amcUpsell?.plan || !data) return;
    setApplyingAmc(true);
    // Add AMC plan line item
    await api.post<any>(`/admin/invoices/${id}/line-items`, {
      lineType: 'AMC', description: `AMC — ${amcUpsell.plan.planName}`,
      quantity: 1, unitPrice: Number(amcUpsell.plan.price), taxRate: 0, discountPercent: 0,
      amcPlanId: amcUpsell.plan.id,
    });
    // Apply 1% discount to all PART line items (branded default)
    for (const li of (data.lineItems ?? []).filter((l: any) => l.lineType === 'PART')) {
      const currentDisc = Number(li.discountPercent) || 0;
      if (currentDisc < 1) {
        await api.patch<any>(`/admin/invoices/${id}/line-items`, { lineItemId: li.id, discountPercent: currentDisc + 1 });
      }
    }
    setApplyingAmc(false);
    setAmcUpsell(null);
    fetch();
  };

  const finalize = async () => {
    setLoading('finalize');
    const res = await api.post<any>(`/admin/invoices/${id}/finalize`, {});
    if (res.success) fetch();
    setLoading('');
  };

  const revertToDraft = async () => {
    if (!confirm('Revert this invoice to DRAFT? This will allow editing line items again.')) return;
    setLoading('revert');
    const res = await api.delete<any>(`/admin/invoices/${id}/finalize`);
    if (res.success) fetch();
    else alert(res.error?.message || 'Cannot revert');
    setLoading('');
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading('pay');
    const res = await api.post<any>(`/admin/invoices/${id}/payments`, {
      amount: Number(payAmount), paymentMode: payMode, paymentDate: payDate + 'T00:00:00+05:30', referenceNumber: payRef || undefined,
    });
    if (res.success) { setShowPayForm(false); setPayAmount(''); setPayRef(''); fetch(); }
    setLoading('');
  };

  const addLine = async () => {
    if (!newLine.description) return;
    setAddingLine(true);
    const payload: Record<string, any> = {
      lineType: newLine.lineType, description: newLine.description,
      quantity: Number(newLine.quantity) || 1, unitPrice: Number(newLine.unitPrice) || 0, taxRate: Number(newLine.taxRate) || 0, discountPercent: Number(newLine.discountPercent) || 0,
    };
    if (newLine.lineType === 'DISCOUNT_ADJUSTMENT') payload.discountMode = newLine.discountMode;
    if (newLine.lineType === 'AMC' && newLine.amcContractId) payload.amcContractId = newLine.amcContractId;
    if (newLine.lineType === 'AMC' && newLine.amcPlanId && !newLine.amcContractId) payload.amcPlanId = newLine.amcPlanId;
    // Optimistic: add to table immediately
    const optimistic = { id: 'temp-' + Date.now(), ...payload, taxAmount: 0, lineTotal: payload.quantity * payload.unitPrice };
    setData((d: any) => d ? { ...d, lineItems: [...(d.lineItems || []), optimistic] } : d);
    setNewLine({ lineType: 'CUSTOM_CHARGE', description: '', quantity: '1', unitPrice: '', taxRate: '0', discountPercent: '0', discountMode: 'flat', amcPlanId: '', amcContractId: '' });
    setAddStep('type');
    const res = await api.post<any>(`/admin/invoices/${id}/line-items`, payload);
    setAddingLine(false);
    if (res.success) { fetch(); }
    else { fetch(); alert(res.error?.message || 'Failed to add line item'); }
  };

  const updateLine = async (lineItemId: string, field: string, value: string) => {
    const num = Number(value);
    if (isNaN(num)) return;
    await api.patch<any>(`/admin/invoices/${id}/line-items`, { lineItemId, [field]: num });
    fetch();
  };

  const removeLine = async (lineItemId: string) => {
    // Optimistic: remove from table immediately
    setData((d: any) => d ? { ...d, lineItems: d.lineItems?.filter((li: any) => li.id !== lineItemId) } : d);
    await api.delete<any>(`/admin/invoices/${id}/line-items?lineItemId=${lineItemId}`);
    fetch();
  };

  const openPdf = async (type = 'invoice') => {
    const token = localStorage.getItem('gearup_token');
    if (!token) { alert('Not authenticated. Please login again.'); return; }
    try {
      const res = await window.fetch(`${window.location.origin}/api/admin/invoices/${id}/pdf?type=${type}`, {
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

        {isFinalized && !isPaid && (
          <button onClick={revertToDraft} disabled={loading === 'revert'} className="inline-flex items-center gap-2 rounded-lg border border-yellow-500 px-4 py-2 text-sm font-medium text-yellow-700 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 disabled:opacity-50">
            {loading === 'revert' ? 'Reverting...' : 'Revert to Draft'}
          </button>
        )}

        <div className="relative">
          <button onClick={() => setShowPdfMenu(!showPdfMenu)} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            <Download className="h-4 w-4" />
            Download
          </button>
          {showPdfMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg z-10">
              <button onClick={() => { openPdf(); setShowPdfMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-t-lg">Invoice</button>
              <button onClick={() => { openPdf('customer-draft'); setShowPdfMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">Customer Draft Copy</button>
              <button onClick={() => { openPdf('mechanic'); setShowPdfMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-b-lg">Mechanic Copy</button>
            </div>
          )}
        </div>
      </div>

      {/* Payment Form */}
      {showPayForm && (
        <form onSubmit={recordPayment} className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Record Payment</h3>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Amount (₹)</label>
              <input type="number" step="0.01" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Payment Date</label>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputCls} />
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

      {/* AMC Upsell Banner */}
      {amcUpsell?.show && isDraft && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🛡️</div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Save ₹{Math.round(amcUpsell.savings)} on this bill with AMC!</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                  {amcUpsell.serviceSavings > 0 && `Service free (₹${Math.round(amcUpsell.serviceSavings)})`}
                  {amcUpsell.serviceSavings > 0 && amcUpsell.partsSavings > 0 && ' + '}
                  {amcUpsell.partsSavings > 0 && `Parts 1-2% off (₹${Math.round(amcUpsell.partsSavings)})`}
                  {` • AMC ${amcUpsell.plan.planName} @ ₹${Number(amcUpsell.plan.price).toLocaleString()}/year`}
                </p>
              </div>
            </div>
            <button onClick={applyAmc} disabled={applyingAmc} className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {applyingAmc ? 'Adding...' : '+ Add AMC'}
            </button>
          </div>
        </div>
      )}

      {/* Line Items */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">Line Items</h3>
          {refreshing && <span className="text-xs text-blue-500 animate-pulse">Updating...</span>}
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
              <th className="px-5 py-2.5 text-right">Disc %</th>
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
                    <td className="px-2 py-1.5 text-right"><input type="number" step="0.01" min="0" max="100" className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(li.discountPercent)} onBlur={(e) => updateLine(li.id, 'discountPercent', e.target.value)} /></td>
                  </>
                ) : (
                  <>
                    <td className="px-5 py-2.5 text-right">{Number(li.quantity)}</td>
                    <td className="px-5 py-2.5 text-right">₹{Number(li.unitPrice).toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right text-gray-500">{Number(li.taxRate)}%</td>
                    <td className="px-5 py-2.5 text-right text-gray-500">{Number(li.discountPercent)}%</td>
                  </>
                )}
                <td className="px-5 py-2.5 text-right font-semibold">₹{Number(li.lineTotal).toLocaleString()}</td>
                {isDraft && <td className="px-3 py-2.5"><button onClick={() => removeLine(li.id)} className="text-red-500 hover:text-red-700 text-xs">✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {isDraft && (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
            {addStep === 'type' ? (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-3">Add to Invoice</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { setNewLine({ ...newLine, lineType: 'PART', description: '', unitPrice: '', discountPercent: '0' }); setAddStep('details'); }} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium hover:bg-white dark:hover:bg-gray-700 transition">🔩 Part</button>
                  <button onClick={() => { setNewLine({ ...newLine, lineType: 'LABOR', description: '', unitPrice: '' }); setAddStep('details'); }} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium hover:bg-white dark:hover:bg-gray-700 transition">👷 Labor</button>
                  <button onClick={() => { setNewLine({ ...newLine, lineType: 'CUSTOM_CHARGE', description: '', unitPrice: '' }); setAddStep('details'); }} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium hover:bg-white dark:hover:bg-gray-700 transition">📝 Custom Charge</button>
                  <button onClick={() => { setNewLine({ ...newLine, lineType: 'DISCOUNT_ADJUSTMENT', description: 'Discount', unitPrice: '', discountMode: 'flat' }); setAddStep('details'); }} className="rounded-lg border border-green-300 dark:border-green-700 px-4 py-2.5 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition">🏷️ Discount</button>
                  <button onClick={() => { setNewLine({ ...newLine, lineType: 'AMC', description: '', unitPrice: '0' }); loadAmcOptions(); setAddStep('details'); }} className="rounded-lg border border-amber-300 dark:border-amber-700 px-4 py-2.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition">🛡️ AMC</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-gray-500">Add {newLine.lineType === 'PART' ? 'Part' : newLine.lineType === 'LABOR' ? 'Labor' : newLine.lineType === 'DISCOUNT_ADJUSTMENT' ? 'Discount' : newLine.lineType === 'AMC' ? 'AMC' : 'Custom Charge'}</p>
                  <button onClick={() => setAddStep('type')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
                </div>
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    {newLine.lineType === 'PART' ? (
                      <><label className="block text-[10px] text-gray-400 mb-0.5">Select Part <span className="text-red-500">*</span></label>
                      <select className={inputCls} value={newLine.description} onChange={(e) => {
                        const item = inventoryItems.find((i: any) => i.itemName === e.target.value);
                        setNewLine({ ...newLine, description: e.target.value, unitPrice: item && !item.variablePrice ? String(Number(item.sellingPrice)) : '', discountPercent: item ? String(Number(item.discountPercent) || '0') : '0' });
                      }}>
                        <option value="">Select part...</option>
                        {inventoryItems.map((i: any) => { const dp = Number(i.discountPercent) || 0; return <option key={i.id} value={i.itemName}>{i.itemName} ({i.sku}){i.variablePrice ? ' [Variable]' : ` — ₹${Number(i.sellingPrice)}`}{dp ? ` (${dp}% off)` : ''}</option>; })}
                      </select></>
                    ) : newLine.lineType === 'AMC' ? (
                      <><label className="block text-[10px] text-gray-400 mb-0.5">AMC Option</label>
                      <div className="space-y-1">
                        {amcContracts.filter((c: any) => c.vehicleId === data?.vehicleId && c.servicesRemaining > 0).length > 0 && (
                          <select className={inputCls} value={newLine.amcContractId} onChange={(e) => {
                            const contract = amcContracts.find((c: any) => c.id === e.target.value);
                            setNewLine({ ...newLine, amcContractId: e.target.value, amcPlanId: '', description: contract ? `AMC Service (${contract.plan?.planName} — ${contract.servicesRemaining} left)` : '', unitPrice: '0' });
                          }}>
                            <option value="">Use existing contract...</option>
                            {amcContracts.filter((c: any) => c.vehicleId === data?.vehicleId && c.servicesRemaining > 0).map((c: any) => <option key={c.id} value={c.id}>{c.contractNumber} — {c.plan?.planName} ({c.servicesRemaining}/{c.totalServices} left)</option>)}
                          </select>
                        )}
                        {!newLine.amcContractId && (
                          <select className={inputCls} value={newLine.amcPlanId} onChange={(e) => {
                            const plan = amcPlans.find((p: any) => p.id === e.target.value);
                            setNewLine({ ...newLine, amcPlanId: e.target.value, amcContractId: '', description: plan ? `AMC — ${plan.planName} (${plan.ccRange || plan.vehicleType})` : '', unitPrice: plan ? String(Number(plan.price)) : '0' });
                          }}>
                            <option value="">New AMC — select plan...</option>
                            {amcPlans.map((p: any) => <option key={p.id} value={p.id}>{p.planName} ({p.ccRange || p.vehicleType}) — ₹{Number(p.price).toLocaleString()}</option>)}
                          </select>
                        )}
                      </div></>
                    ) : newLine.lineType === 'LABOR' ? (
                      <><label className="block text-[10px] text-gray-400 mb-0.5">Worker <span className="text-red-500">*</span></label>
                      <select className={inputCls} value={newLine.description} onChange={(e) => setNewLine({ ...newLine, description: e.target.value ? `Labor — ${e.target.value}` : '' })}>
                        <option value="">Select worker...</option>
                        {workers.map((w: any) => <option key={w.id} value={w.fullName}>{w.fullName} ({w.designation || 'General'})</option>)}
                      </select></>
                    ) : (
                      <><label className="block text-[10px] text-gray-400 mb-0.5">{newLine.lineType === 'DISCOUNT_ADJUSTMENT' ? 'Reason' : 'Description'} <span className="text-red-500">*</span></label>
                      <input className={inputCls} placeholder={newLine.lineType === 'DISCOUNT_ADJUSTMENT' ? 'e.g. Loyalty discount' : 'e.g. Washing, Polishing'} value={newLine.description} onChange={(e) => setNewLine({ ...newLine, description: e.target.value })} /></>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] text-gray-400 mb-0.5">{newLine.lineType === 'DISCOUNT_ADJUSTMENT' ? (newLine.discountMode === 'percent' ? '% off' : 'Amount (₹)') : 'Price (₹)'}</label>
                    <input type="number" step="0.01" className={inputCls} placeholder="0" value={newLine.unitPrice} onChange={(e) => setNewLine({ ...newLine, unitPrice: e.target.value })} />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[10px] text-gray-400 mb-0.5">Qty</label>
                    <input type="number" className={inputCls} value={newLine.quantity} onChange={(e) => setNewLine({ ...newLine, quantity: e.target.value })} />
                  </div>
                  <div className="col-span-1">
                    {newLine.lineType === 'DISCOUNT_ADJUSTMENT' ? (
                      <><label className="block text-[10px] text-gray-400 mb-0.5">Mode</label>
                      <select className={inputCls} value={newLine.discountMode} onChange={(e) => setNewLine({ ...newLine, discountMode: e.target.value })}>
                        <option value="flat">₹</option><option value="percent">%</option>
                      </select></>
                    ) : (
                      <><label className="block text-[10px] text-gray-400 mb-0.5">Disc %</label>
                      <input type="number" step="0.01" min="0" max="100" className={inputCls} value={newLine.discountPercent} onChange={(e) => setNewLine({ ...newLine, discountPercent: e.target.value })} /></>
                    )}
                  </div>
                  <div className="col-span-3">
                    <button onClick={addLine} disabled={addingLine || !newLine.description} className="w-full rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                      {addingLine ? 'Adding...' : '+ Add'}
                    </button>
                  </div>
                </div>
              </div>
            )}
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
          {data.customer?.phoneNumber && data.invoiceStatus === 'FINALIZED' && (
            <div className="mt-2"><WhatsAppButton phone={data.customer.phoneNumber} message={`Hi ${data.customer.fullName}, your invoice ${data.invoiceNumber} for Rs.${Number(data.grandTotal).toFixed(0)} is ready. Thank you for choosing GearUp Servicing! - 9242519099`} /></div>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Vehicle</p>
          <p className="font-medium">{data.vehicle?.brand} {data.vehicle?.model}</p>
          <p className="text-gray-500">{data.vehicle?.registrationNumber}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Details</p>
          <p className="text-gray-500">Date: {new Date(data.invoiceDate).toLocaleDateString('en-IN')}</p>
          {data.jobCard && <button onClick={() => router.push(`/admin/job-cards/${data.jobCard.id}`)} className="text-sm text-blue-600 hover:underline">Job Card: {data.jobCard.jobCardNumber} →</button>}
          {data.finalizedAt && <p className="text-gray-500">Finalized: {new Date(data.finalizedAt).toLocaleDateString('en-IN')}</p>}
        </div>
      </div>
    </div>
  );
}
