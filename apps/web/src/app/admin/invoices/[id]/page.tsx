'use client';
import { toTitleCase } from '@/lib/title-case';
import { formatIST, formatTimeIST } from '@/lib/time';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
import { WhatsAppButton } from '@/components/shared/whatsapp-button';
import { FileText, CheckCircle, CreditCard, Download } from 'lucide-react';
import { Modal } from '@/components/shared/modal';

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
  const [newLine, setNewLine] = useState({ lineType: 'CUSTOM_CHARGE', description: '', quantity: '1', unitPrice: '', taxRate: '0', discountPercent: '0', discountMode: 'flat', amcPlanId: '', amcContractId: '', inventoryItemId: '' });
  const [addingLine, setAddingLine] = useState(false);
  const [showPdfMenu, setShowPdfMenu] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [amcPlans, setAmcPlans] = useState<any[]>([]);
  const [amcContracts, setAmcContracts] = useState<any[]>([]);

  const [refreshing, setRefreshing] = useState(false);
  const [addStep, setAddStep] = useState<'type' | 'details'>('type');
  const [editingLines, setEditingLines] = useState(false);
  const [lineEdits, setLineEdits] = useState<Record<string, any>>({});
  const [showNewPart, setShowNewPart] = useState(false);
  const [newPartForm, setNewPartForm] = useState({ sku: '', itemName: '', unit: 'PCS', costPrice: '', sellingPrice: '', quantityInStock: '' });
  const [amcUpsell, setAmcUpsell] = useState<{ show: boolean; plan: any; savings: number; partsSavings: number; serviceSavings: number } | null>(null);
  const [applyingAmc, setApplyingAmc] = useState(false);

  const loadInventory = async () => {
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
    // Defer inventory/workers load until user interacts with line-item form
    // loadInventory();
    // loadWorkers();
  }, [id]);

  // Check AMC upsell opportunity
  useEffect(() => {
    if (!data || !data.vehicleId || data.lineItems?.some((li: any) => li.lineType === 'AMC')) { setAmcUpsell(null); return; }
    // Check if vehicle already has active AMC
    api.get<any>('/admin/amc/contracts?status=ACTIVE').then((r) => {
      if (!r.success) return;
      const hasAmc = (r.data ?? []).some((c: any) => c.vehicleId === data.vehicleId);
      if (hasAmc) { setAmcUpsell(null); return; }
      // Get best plan matching vehicle CC
      Promise.all([api.get<any>('/admin/amc/plans'), api.get<any>(`/admin/vehicles/${data.vehicleId}`)]).then(([pr, vr]) => {
        if (!pr.success || !vr.success) return;
        const plans = (pr.data ?? []).filter((p: any) => p.isActive);
        if (plans.length === 0) { setAmcUpsell(null); return; }
        const vehicleCC = vr.data?.engineCC;
        // Match plan by CC range (e.g. "100-125" matches CC between 100-125)
        let plan = plans[0];
        if (vehicleCC) {
          const matched = plans.find((p: any) => {
            if (!p.ccRange) return false;
            const match = p.ccRange.match(/(\d+)/g);
            if (match && match.length >= 2) return vehicleCC >= Number(match[0]) && vehicleCC <= Number(match[1]);
            if (match && match.length === 1) return vehicleCC >= Number(match[0]);
            return false;
          });
          if (matched) plan = matched;
        }
        const laborItems = data.lineItems?.filter((li: any) => li.lineType === 'SERVICE_CHARGE') ?? [];
        const partItems = data.lineItems?.filter((li: any) => li.lineType === 'PART') ?? [];
        const serviceSavings = laborItems.reduce((s: number, li: any) => s + Number(li.lineTotal), 0);
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
    if (newLine.lineType === 'PART' && newLine.inventoryItemId) payload.inventoryItemId = newLine.inventoryItemId;
    // Optimistic: add to table immediately
    const optimistic = { id: 'temp-' + Date.now(), ...payload, taxAmount: 0, lineTotal: payload.quantity * payload.unitPrice };
    setData((d: any) => d ? { ...d, lineItems: [...(d.lineItems || []), optimistic] } : d);
    setNewLine({ lineType: 'CUSTOM_CHARGE', description: '', quantity: '1', unitPrice: '', taxRate: '0', discountPercent: '0', discountMode: 'flat', amcPlanId: '', amcContractId: '', inventoryItemId: '' });
    setAddStep('type');
    const res = await api.post<any>(`/admin/invoices/${id}/line-items`, payload);
    setAddingLine(false);
    if (res.success) { fetch(); }
    else { fetch(); alert(res.error?.message || 'Failed to add line item'); }
  };

  const saveAllEdits = async () => {
    const changed = Object.entries(lineEdits).filter(([_, v]) => Object.keys(v).length > 0);
    if (changed.length === 0) return;
    for (const [lineItemId, fields] of changed) {
      const payload: any = { lineItemId };
      if (fields.quantity !== undefined) payload.quantity = Number(fields.quantity);
      if (fields.unitPrice !== undefined) payload.unitPrice = Number(fields.unitPrice);
      if (fields.taxRate !== undefined) payload.taxRate = Number(fields.taxRate);
      if (fields.discountPercent !== undefined) payload.discountPercent = Number(fields.discountPercent);
      await api.patch<any>(`/admin/invoices/${id}/line-items`, payload);
    }
    setEditingLines(false);
    setLineEdits({});
    fetch();
  };

  const hasLineChanges = Object.values(lineEdits).some((v: any) => Object.keys(v).length > 0);

  const removeLine = async (lineItemId: string) => {
    // Optimistic: remove from table immediately
    setData((d: any) => d ? { ...d, lineItems: d.lineItems?.filter((li: any) => li.id !== lineItemId) } : d);
    const res = await api.delete<any>(`/admin/invoices/${id}/line-items?lineItemId=${lineItemId}`);
    fetch();
    if (!res.success) alert(res.error?.message || 'Failed to remove line item');
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
              <button onClick={() => { openPdf('combined'); setShowPdfMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-b-lg">Customer + Mechanic (1 page)</button>
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
      <div className="grid gap-4 sm:grid-cols-5">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Subtotal</p>
          <p className="text-lg font-bold mt-1">₹{Number(data.subtotal).toLocaleString()}</p>
        </div>
        {(() => { const disc = data.lineItems?.reduce((s: number, li: any) => s + (Number(li.discountPercent) > 0 ? Number(li.quantity) * Number(li.unitPrice) * Number(li.discountPercent) / 100 : 0), 0) || 0; return disc > 0 ? (
        <div className="rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 p-4">
          <p className="text-xs text-green-600 uppercase tracking-wide">Discount</p>
          <p className="text-lg font-bold mt-1 text-green-600">-₹{disc.toLocaleString()}</p>
        </div>) : null; })()}
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

      {/* AMC Savings Banner */}
      {(() => {
        const scLine = data.lineItems?.find((li: any) => li.lineType === 'SERVICE_CHARGE' && Number(li.discountPercent) === 100);
        const amcLine = data.lineItems?.find((li: any) => li.lineType === 'AMC');
        if (!scLine && !amcLine) return null;
        const perVisit = scLine ? Number(scLine.unitPrice) : 0;
        const contract = data.amcContract || null;
        const planPrice = amcLine ? Number(amcLine.unitPrice) : 0;
        const totalServices = contract?.totalServices || 3;
        const totalSaving = perVisit > 0 ? (perVisit * totalServices) - planPrice : 0;
        const remaining = contract?.servicesRemaining ?? '—';
        return (
          <div className="rounded-xl border border-green-200 dark:border-green-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-5">
            <div className="flex items-center gap-2 mb-2"><span className="text-lg">🎉</span><span className="font-bold text-green-700 dark:text-green-400">AMC Savings</span></div>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              {perVisit > 0 && <div><span className="text-gray-500">This visit saved:</span><span className="ml-2 font-bold text-green-600">₹{perVisit}</span></div>}
              {totalSaving > 0 && <div><span className="text-gray-500">Total plan savings:</span><span className="ml-2 font-bold text-green-600">₹{totalSaving}</span></div>}
              <div><span className="text-gray-500">Services remaining:</span><span className="ml-2 font-bold">{remaining}</span></div>
            </div>
          </div>
        );
      })()}

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
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">Line Items</h3>
            {refreshing && <span className="text-xs text-blue-500 animate-pulse">Updating...</span>}
          </div>
          {isDraft && (
            editingLines ? (
              <div className="flex gap-2">
                <button onClick={saveAllEdits} disabled={!hasLineChanges} className="text-xs font-semibold text-green-600 hover:text-green-800 disabled:opacity-40 disabled:cursor-not-allowed">Save</button>
                <button onClick={() => { setEditingLines(false); setLineEdits({}); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setEditingLines(true)} className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
            )
          )}
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
                  editingLines ? (
                  <>
                    <td className="px-2 py-1.5 text-right"><input type="number" className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(li.quantity)} onChange={(e) => setLineEdits((prev) => ({ ...prev, [li.id]: { ...prev[li.id], quantity: e.target.value } }))} /></td>
                    <td className="px-2 py-1.5 text-right"><input type="number" step="0.01" className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(li.unitPrice)} onChange={(e) => setLineEdits((prev) => ({ ...prev, [li.id]: { ...prev[li.id], unitPrice: e.target.value } }))} /></td>
                    <td className="px-2 py-1.5 text-right"><input type="number" step="0.01" className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(li.taxRate)} onChange={(e) => setLineEdits((prev) => ({ ...prev, [li.id]: { ...prev[li.id], taxRate: e.target.value } }))} /></td>
                    <td className="px-2 py-1.5 text-right"><input type="number" step="0.01" min="0" max="100" className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(li.discountPercent)} onChange={(e) => setLineEdits((prev) => ({ ...prev, [li.id]: { ...prev[li.id], discountPercent: e.target.value } }))} /></td>
                  </>
                  ) : (
                  <>
                    <td className="px-5 py-2.5 text-right">{Number(li.quantity)}</td>
                    <td className="px-5 py-2.5 text-right">₹{Number(li.unitPrice).toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right text-gray-500">{Number(li.taxRate)}%</td>
                    <td className="px-5 py-2.5 text-right text-gray-500">{Number(li.discountPercent)}%</td>
                  </>
                  )
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
                  <button onClick={() => { loadInventory(); setNewLine({ ...newLine, lineType: 'PART', description: '', unitPrice: '', discountPercent: '0', inventoryItemId: '' }); setAddStep('details'); }} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium hover:bg-white dark:hover:bg-gray-700 transition">🔩 Part</button>
                  <button onClick={() => { loadWorkers(); setNewLine({ ...newLine, lineType: 'LABOR', description: '', unitPrice: '' }); setAddStep('details'); }} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium hover:bg-white dark:hover:bg-gray-700 transition">👷 Labor</button>
                  <button onClick={() => { setNewLine({ ...newLine, lineType: 'SERVICE_CHARGE', description: 'General Service', unitPrice: '' }); setAddStep('details'); }} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium hover:bg-white dark:hover:bg-gray-700 transition">🔧 Service Charge</button>
                  <button onClick={() => { setNewLine({ ...newLine, lineType: 'CUSTOM_CHARGE', description: '', unitPrice: '' }); setAddStep('details'); }} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium hover:bg-white dark:hover:bg-gray-700 transition">📝 Custom Charge</button>
                  <button onClick={() => { setNewLine({ ...newLine, lineType: 'DISCOUNT_ADJUSTMENT', description: 'Discount', unitPrice: '', discountMode: 'flat' }); setAddStep('details'); }} className="rounded-lg border border-green-300 dark:border-green-700 px-4 py-2.5 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition">🏷️ Discount</button>
                  <button onClick={() => { setNewLine({ ...newLine, lineType: 'AMC', description: '', unitPrice: '0' }); loadAmcOptions(); setAddStep('details'); }} className="rounded-lg border border-amber-300 dark:border-amber-700 px-4 py-2.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition">🛡️ AMC</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-gray-500">Add {newLine.lineType === 'PART' ? 'Part' : newLine.lineType === 'LABOR' ? 'Labor' : newLine.lineType === 'SERVICE_CHARGE' ? 'Service Charge' : newLine.lineType === 'DISCOUNT_ADJUSTMENT' ? 'Discount' : newLine.lineType === 'AMC' ? 'AMC' : 'Custom Charge'}</p>
                  <button onClick={() => setAddStep('type')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
                </div>
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    {newLine.lineType === 'PART' ? (
                      <><label className="block text-[10px] text-gray-400 mb-0.5 flex items-center justify-between">
                        <span>Select Part <span className="text-red-500">*</span></span>
                        <button type="button" onClick={() => setShowNewPart(true)} className="text-blue-600 hover:underline">+ New Part</button>
                      </label>
                      <div className="relative">
                        <input className={inputCls} placeholder="Type to search parts..." value={newLine.description} onChange={(e) => setNewLine({ ...newLine, description: e.target.value, unitPrice: '', inventoryItemId: '' })} onFocus={(e) => e.target.setAttribute('data-open', '1')} onBlur={(e) => setTimeout(() => e.target.removeAttribute('data-open'), 200)} autoComplete="off" />
                        {!inventoryItems.some((i: any) => i.itemName === newLine.description) && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
                            {inventoryItems.filter((i: any) => { if (!newLine.description) return true; const q = newLine.description.toLowerCase().replace(/\s+/g, ' '); return i.itemName.toLowerCase().replace(/\s+/g, ' ').includes(q) || i.sku.toLowerCase().includes(q); }).map((i: any) => {
                              const dp = Number(i.discountPercent) || 0;
                              return <button key={i.id} type="button" onClick={() => setNewLine({ ...newLine, description: i.itemName, unitPrice: i.variablePrice ? '' : String(Number(i.sellingPrice)), discountPercent: String(dp), inventoryItemId: i.id })} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700 last:border-0">
                                <span className="font-medium">{i.itemName}</span> <span className="text-xs text-gray-400">({i.sku})</span>{i.variablePrice ? <span className="text-xs text-amber-500 ml-1">[Variable]</span> : <span className="text-xs text-gray-500 ml-1">₹{Number(i.sellingPrice)}</span>}{dp ? <span className="text-xs text-green-600 ml-1">{dp}% off</span> : ''}
                              </button>;
                            })}
                            {inventoryItems.filter((i: any) => { if (!newLine.description) return true; const q = newLine.description.toLowerCase().replace(/\s+/g, ' '); return i.itemName.toLowerCase().replace(/\s+/g, ' ').includes(q) || i.sku.toLowerCase().includes(q); }).length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No matches</p>}
                          </div>
                        )}
                      </div></>
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
                  <td className="px-5 py-2.5">{formatIST(p.paymentDate)}</td>
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
          <p className="text-gray-500">Date: {formatIST(data.invoiceDate)}</p>
          {data.jobCard && <button onClick={() => router.push(`/admin/job-cards/${data.jobCard.id}`)} className="text-sm text-blue-600 hover:underline">Job Card: {data.jobCard.jobCardNumber} →</button>}
          {data.finalizedAt && <p className="text-gray-500">Finalized: {formatIST(data.finalizedAt)}</p>}
        </div>
      </div>

      {/* New Part Modal */}
      <Modal open={showNewPart} onClose={() => setShowNewPart(false)} title="Add New Part to Inventory">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">SKU <span className="text-red-500">*</span></label><input className={inputCls} value={newPartForm.sku} onChange={(e) => setNewPartForm({ ...newPartForm, sku: e.target.value })} placeholder="e.g. OIL-20W40" /></div>
            <div><label className="block text-xs font-medium mb-1">Unit</label><input className={inputCls} value={newPartForm.unit} onChange={(e) => setNewPartForm({ ...newPartForm, unit: e.target.value })} placeholder="PCS / LTR / SET" /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Item Name <span className="text-red-500">*</span></label><input className={inputCls} value={newPartForm.itemName} onChange={(e) => setNewPartForm({ ...newPartForm, itemName: e.target.value })} placeholder="e.g. Engine Oil 20W40 1L" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium mb-1">Cost Price</label><input type="number" step="0.01" className={inputCls} value={newPartForm.costPrice} onChange={(e) => setNewPartForm({ ...newPartForm, costPrice: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Selling Price <span className="text-red-500">*</span></label><input type="number" step="0.01" className={inputCls} value={newPartForm.sellingPrice} onChange={(e) => setNewPartForm({ ...newPartForm, sellingPrice: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Stock Qty</label><input type="number" className={inputCls} value={newPartForm.quantityInStock} onChange={(e) => setNewPartForm({ ...newPartForm, quantityInStock: e.target.value })} /></div>
          </div>
          <button type="button" disabled={!newPartForm.sku || !newPartForm.itemName || !newPartForm.sellingPrice} onClick={async () => {
            const res = await api.post<any>('/admin/inventory/items', { ...newPartForm, costPrice: Number(newPartForm.costPrice) || 0, sellingPrice: Number(newPartForm.sellingPrice), quantityInStock: Number(newPartForm.quantityInStock) || 0 });
            if (res.success) {
              setInventoryItems((prev) => [res.data, ...prev]);
              setNewLine({ ...newLine, description: res.data.itemName, unitPrice: String(Number(res.data.sellingPrice)), discountPercent: '0', inventoryItemId: res.data.id });
              setShowNewPart(false);
              setNewPartForm({ sku: '', itemName: '', unit: 'PCS', costPrice: '', sellingPrice: '', quantityInStock: '' });
            } else { alert(res.error?.message || 'Failed to create part'); }
          }} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            Create & Select Part
          </button>
        </div>
      </Modal>
    </div>
  );
}
