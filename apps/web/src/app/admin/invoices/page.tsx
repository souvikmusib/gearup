'use client';
import { toTitleCase } from '@/lib/title-case';
import { formatIST } from '@/lib/time';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { Modal } from '@/components/shared/modal';
import { ProcessLoader } from '@/components/shared/process-loader';
import { CustomerPicker } from '@/components/shared/customer-picker';
import { VehicleRegLookup } from '@/components/shared/vehicle-reg-lookup';
import { SearchableSelect } from '@/components/shared/searchable-select';

const PAYMENT_STATUSES = ['UNPAID','PARTIALLY_PAID','PAID'].map(s => ({ label: s.replace(/_/g, ' '), value: s }));
const INVOICE_STATUSES = ['DRAFT','FINALIZED','CANCELLED'].map(s => ({ label: s, value: s }));

export default function InvoicesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [saleType, setSaleType] = useState<'SERVICE' | 'COUNTER' | 'ESTIMATE'>('SERVICE');
  const [counterCustomerId, setCounterCustomerId] = useState('')
  const [estimateCustomerId, setEstimateCustomerId] = useState('');
  const [estimateVehicleId, setEstimateVehicleId] = useState('');
  const [estimateVehicles, setEstimateVehicles] = useState<any[]>([]);
  const [jobCards, setJobCards] = useState<any[]>([]);
  const [selectedJC, setSelectedJC] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const timer = useRef<NodeJS.Timeout>();

  const load = useCallback((s = search, f = filters, p = page) => {
    const params = new URLSearchParams();
    if (s) params.set('search', s);
    if (f.paymentStatus) params.set('paymentStatus', f.paymentStatus);
    if (f.invoiceStatus) params.set('invoiceStatus', f.invoiceStatus);
    if (f.from) params.set('from', f.from);
    if (f.to) params.set('to', f.to);
    params.set('page', String(p));
    const endpoint = `/admin/invoices?${params}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) {
      setData(cached.data?.items ?? cached.data ?? []);
      setTotalPages(cached.meta?.totalPages ?? 1);
      setLoading(false);
    } else {
      setLoading(true);
    }
    promise.then((res) => {
      if (res.success) { setData(res.data?.items ?? res.data ?? []); setTotalPages(res.meta?.totalPages ?? 1); }
      setLoading(false);
    });
  }, [search, filters, page]);

  useEffect(() => { load(); }, [page, filters]);

  const onSearch = useCallback((q: string) => {
    setSearch(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPage(1); load(q, filters, 1); }, 300);
  }, [filters, load]);

  const openCreate = async () => {
    setSaleType('SERVICE');
    setShowCreate(true); setError(''); setSelectedJC(null); setLineItems([]);
    setModalLoading(true);
    const res = await api.get<any>('/admin/job-cards?pageSize=100');
    setModalLoading(false);
  };

  const openEstimate = async () => {
    setSaleType('ESTIMATE');
    setShowCreate(true); setError(''); setSelectedJC(null); setLineItems([]);
    setEstimateCustomerId(''); setEstimateVehicleId(''); setEstimateVehicles([]);
    setEstimateItems([]); setEstPartSearch('');
  };

  const onEstimateCustomerChange = async (customerId: string) => {
    setEstimateCustomerId(customerId);
    setEstimateVehicleId('');
    if (!customerId) { setEstimateVehicles([]); return; }
    const res = await api.get<any>(`/admin/vehicles?customerId=${customerId}&pageSize=50`);
    if (res.success) setEstimateVehicles(res.data?.items ?? res.data ?? []);
  };

  // ── Estimate part picker state ──
  const [estimateItems, setEstimateItems] = useState<Array<{ inventoryItemId: string; description: string; quantity: number; unitPrice: number; taxRate: number }>>([]);
  const [estPartSearch, setEstPartSearch] = useState('');
  const [estPartDropdownOpen, setEstPartDropdownOpen] = useState(false);
  const [estInventoryItems, setEstInventoryItems] = useState<any[]>([]);
  const estQueryRef = useRef('');

  const loadEstimateInventory = async (search = '') => {
    const normalized = search.trim();
    estQueryRef.current = normalized;
    const params = new URLSearchParams({ pageSize: '25' });
    if (normalized) params.set('search', normalized);
    const res = await api.get<any>(`/admin/inventory/items?${params.toString()}`);
    if (estQueryRef.current !== normalized) return;
    if (res.success) setEstInventoryItems(res.data?.items ?? res.data ?? []);
  };

  const addEstimatePart = (item: any) => {
    // Check if already added
    const existing = estimateItems.findIndex(i => i.inventoryItemId === item.id);
    if (existing >= 0) {
      setEstimateItems(items => items.map((it, idx) => idx === existing ? { ...it, quantity: it.quantity + 1 } : it));
    } else {
      setEstimateItems(items => [...items, {
        inventoryItemId: item.id,
        description: item.itemName,
        quantity: 1,
        unitPrice: Number(item.mrp || item.sellingPrice),
        taxRate: Number(item.taxRate || 0),
      }]);
    }
    setEstPartSearch('');
    setEstPartDropdownOpen(false);
  };

  const updateEstimateItem = (index: number, field: string, value: number) => {
    setEstimateItems(items => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removeEstimateItem = (index: number) => {
    setEstimateItems(items => items.filter((_, i) => i !== index));
  };

  const submitEstimate = async () => {
    if (!estimateCustomerId || estimateItems.length === 0) { setError('Select a customer and add at least one part'); return; }
    setSaving(true); setError('');
    const res = await api.post<any>('/admin/estimates', {
      customerId: estimateCustomerId,
      vehicleId: estimateVehicleId || undefined,
      items: estimateItems.map((item, i) => ({ ...item, sortOrder: i })),
    });
    setSaving(false);
    if (res.success) {
      setShowCreate(false);
      router.push(`/admin/estimates/${res.data.id}`);
    } else {
      setError(res.error?.message || 'Failed to create estimate');
    }
  };

  const [counterInvoiceStarted, setCounterInvoiceStarted] = useState(false);

  const openCounterSale = () => {
    setSaleType('COUNTER');
    setShowCreate(true); setError(''); setSelectedJC(null); setCounterCustomerId('');
    setLineItems([]); setCounterInvoiceStarted(false);
  };

  const onJobCardSelect = async (jcId: string) => {
    if (!jcId) { setSelectedJC(null); setLineItems([]); return; }
    setModalLoading(true);
    const res = await api.get<any>(`/admin/job-cards/${jcId}`);
    setModalLoading(false);
    if (res.success) {
      setSelectedJC(res.data);
      const items: any[] = [];
      res.data.parts?.forEach((p: any) => items.push({ lineType: 'PART', description: p.inventoryItem?.itemName || 'Part', quantity: Number(p.requiredQty), unitPrice: Number(p.unitPrice), taxRate: 0 }));
      const laborCost = Number(res.data.estimatedLaborCost);
      if (laborCost > 0) items.push({ lineType: 'LABOR', description: 'Labor charges', quantity: 1, unitPrice: laborCost, taxRate: 0 });
      if (items.length === 0) items.push({ lineType: 'CUSTOM_CHARGE', description: '', quantity: 1, unitPrice: 0, taxRate: 0 });
      setLineItems(items);
    }
  };

  const addLine = () => setLineItems((l) => [...l, { lineType: 'CUSTOM_CHARGE', description: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
  const addDiscount = () => setLineItems((l) => [...l, { lineType: 'DISCOUNT_ADJUSTMENT', description: 'Discount', quantity: 1, unitPrice: 0, taxRate: 0, discountMode: 'flat' }]);
  const removeLine = (i: number) => setLineItems((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: any) => setLineItems((l) => l.map((li, idx) => idx === i ? { ...li, [field]: value } : li));

  const submit = async () => {
    if (saleType === 'SERVICE' && (!selectedJC || lineItems.length === 0)) { setError('Select a job card and add line items'); return; }
    if (saleType === 'COUNTER' && lineItems.length === 0) { setError('Add at least one line item'); return; }
    if (saleType === 'COUNTER' && !counterCustomerId) { setError('Select a customer'); return; }
    if (saleType === 'ESTIMATE' && !estimateCustomerId) { setError('Select a customer'); return; }
    setSaving(true); setError('');

    let customerId = '';
    if (saleType === 'SERVICE' && selectedJC) {
      customerId = selectedJC.customerId;
    } else if (saleType === 'ESTIMATE') {
      customerId = estimateCustomerId;
    } else {
      customerId = counterCustomerId;
    }

    const payload: Record<string, any> = {
      saleType,
      customerId,
      invoiceDate: new Date().toISOString(),
      lineItems: lineItems.map((li, i) => ({ ...li, sortOrder: i })),
    };
    if (saleType === 'SERVICE' && selectedJC) {
      payload.vehicleId = selectedJC.vehicleId;
      payload.jobCardId = selectedJC.id;
    }
    if (saleType === 'ESTIMATE' && estimateVehicleId) {
      payload.vehicleId = estimateVehicleId;
    }
    const res = await api.post<any>('/admin/invoices', payload);
    setSaving(false);
    if (res.success) { setShowCreate(false); load(); }
    else setError(res.error?.message || 'Failed to create');
  };

  const columns = [
    { key: 'invoiceNumber', header: 'Invoice #' }, { key: 'customer', header: 'Customer', render: (r: any) => toTitleCase(r.customer?.fullName) },
    { key: 'invoiceDate', header: 'Date', render: (r: any) => formatIST(r.invoiceDate) },
    { key: 'grandTotal', header: 'Total', render: (r: any) => `₹${Number(r.grandTotal)}` },
    { key: 'amountDue', header: 'Due', render: (r: any) => `₹${Number(r.amountDue)}` },
    { key: 'paymentStatus', header: 'Payment', render: (r: any) => <StatusBadge status={r.paymentStatus} /> },
    { key: 'invoiceStatus', header: 'Status', render: (r: any) => <StatusBadge status={r.invoiceStatus} /> },
  ];

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Invoices" />
        <div className="flex gap-2">
          <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ New Invoice</button>
          <button onClick={openEstimate} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">+ Create Estimate</button>
          <button onClick={openCounterSale} className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950">+ Counter Sale</button>
        </div>
      </div>
      <ListToolbar
        searchPlaceholder="Search invoices..."
        onSearch={onSearch}
        filters={[
          { label: 'Payment Status', value: 'paymentStatus', options: PAYMENT_STATUSES },
          { label: 'Invoice Status', value: 'invoiceStatus', options: INVOICE_STATUSES },
        ]}
        filterValues={filters}
        dateRange={{ fromKey: 'from', toKey: 'to', label: 'Invoice date' }}
        onFilterChange={(k, v) => { setFilters((prev) => ({ ...prev, [k]: v })); setPage(1); }}
      />
      {loading ? <ProcessLoader title="Loading invoices" steps={['Fetching latest invoice list', 'Checking payment status', 'Preparing table rows']} /> :
        <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/invoices/${r.id}`)} />}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={saleType === 'COUNTER' ? 'Counter Sale' : saleType === 'ESTIMATE' ? 'Create Estimate' : 'Create Invoice'}>
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {modalLoading && <ProcessLoader title="Preparing invoice form" steps={['Loading eligible job cards', 'Reading selected job-card parts', 'Calculating starter line items']} />}
          <div>
            {saleType === 'SERVICE' ? (
              <>
                <label className="block text-sm font-medium mb-1">Job Card <span className="text-red-500">*</span></label>
                <select className={inputCls} value={selectedJC?.id || ''} onChange={(e) => onJobCardSelect(e.target.value)}>
                  <option value="">Select job card...</option>
                  {jobCards.map((jc: any) => <option key={jc.id} value={jc.id}>{jc.jobCardNumber} — {jc.customer?.fullName} ({jc.vehicle?.registrationNumber})</option>)}
                </select>
              </>
            ) : saleType === 'ESTIMATE' ? (
              <div className="space-y-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                {/* Quick reg number lookup */}
                <VehicleRegLookup onResolved={({ customerId, vehicleId }) => {
                  setEstimateCustomerId(customerId);
                  setEstimateVehicleId(vehicleId);
                  void onEstimateCustomerChange(customerId).then(() => setEstimateVehicleId(vehicleId));
                }} />

                <div className="relative flex items-center"><div className="flex-1 border-t border-gray-200 dark:border-gray-700" /><span className="px-3 text-xs text-gray-400">or pick manually</span><div className="flex-1 border-t border-gray-200 dark:border-gray-700" /></div>

                {/* Customer */}
                <CustomerPicker
                  value={estimateCustomerId}
                  onChange={(customerId) => { void onEstimateCustomerChange(customerId); }}
                  onCustomerCreated={(customer) => { void onEstimateCustomerChange(customer.id); }}
                />

                {/* Vehicle */}
                <div>
                  <label className="text-sm font-medium block mb-1">Vehicle</label>
                  <SearchableSelect
                    options={estimateVehicles.map((v: any) => ({ value: v.id, label: v.registrationNumber, sublabel: `${v.brand ?? ''} ${v.model ?? ''}`.trim() || undefined }))}
                    value={estimateVehicleId}
                    onChange={(v) => setEstimateVehicleId(v)}
                    placeholder="Search by reg number, brand, or model…"
                    disabled={!estimateCustomerId}
                  />
                  {!estimateCustomerId && <p className="text-xs text-gray-400 mt-1">Select a customer first to see their vehicles.</p>}
                </div>
              </div>
            ) : (
              <div className="space-y-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <CustomerPicker value={counterCustomerId} onChange={setCounterCustomerId} />
              </div>
            )}
          </div>
          {saleType === 'COUNTER' && !counterInvoiceStarted && counterCustomerId && (
            <button onClick={async () => {
              setSaving(true); setError('');
              const res = await api.post<any>('/admin/invoices', { saleType: 'COUNTER', customerId: counterCustomerId, invoiceDate: new Date().toISOString(), lineItems: [] });
              setSaving(false);
              if (res.success) { setShowCreate(false); window.location.href = `/admin/invoices/${res.data.id}`; }
              else setError(res.error?.message || 'Failed to create');
            }} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Creating...' : 'Create Invoice'}</button>
          )}
          {(selectedJC || (saleType === 'COUNTER' && counterInvoiceStarted) || (saleType === 'ESTIMATE' && estimateCustomerId)) && (
            <>
              {saleType === 'ESTIMATE' ? (
                /* ── Estimate Part Picker ── */
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] text-gray-400 block mb-1">Search Part</span>
                    <div className="relative">
                      <input className={inputCls} placeholder="Type to search parts..." value={estPartSearch}
                        onFocus={() => { void loadEstimateInventory(estPartSearch); setEstPartDropdownOpen(true); }}
                        onChange={(e) => { const s = e.target.value; setEstPartSearch(s); setEstPartDropdownOpen(true); if (!s || s.length >= 2) void loadEstimateInventory(s); }}
                        onBlur={() => setTimeout(() => setEstPartDropdownOpen(false), 150)}
                        autoComplete="off"
                      />
                      {estPartDropdownOpen && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
                          {estInventoryItems.map((i: any) => (
                            <button key={i.id} type="button" onClick={() => addEstimatePart(i)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700 last:border-0">
                              <span className="font-medium">{i.itemName}</span> <span className="text-xs text-gray-400">({i.sku})</span> <span className="text-xs text-green-600 ml-1">₹{Number(i.mrp || i.sellingPrice)}</span>
                            </button>
                          ))}
                          {estInventoryItems.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No matches</p>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Estimate items list */}
                  {estimateItems.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium text-gray-600 dark:text-gray-400">Part</th>
                            <th className="text-center px-2 py-1.5 font-medium text-gray-600 dark:text-gray-400 w-16">Qty</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-600 dark:text-gray-400 w-20">Price</th>
                            <th className="text-right px-3 py-1.5 font-medium text-gray-600 dark:text-gray-400 w-20">Total</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {estimateItems.map((item, i) => (
                            <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-1.5 text-gray-900 dark:text-white truncate max-w-[160px]" title={item.description}>{item.description}</td>
                              <td className="px-2 py-1"><input type="number" min="1" step="0.5" className="w-14 text-center rounded border border-gray-200 dark:border-gray-600 bg-transparent text-sm py-0.5" value={item.quantity} onChange={(e) => updateEstimateItem(i, 'quantity', Number(e.target.value))} /></td>
                              <td className="px-2 py-1"><input type="number" min="0" step="1" className="w-18 text-right rounded border border-gray-200 dark:border-gray-600 bg-transparent text-sm py-0.5" value={item.unitPrice} onChange={(e) => updateEstimateItem(i, 'unitPrice', Number(e.target.value))} /></td>
                              <td className="px-3 py-1.5 text-right font-medium">₹{Math.round(item.quantity * item.unitPrice)}</td>
                              <td className="px-1"><button onClick={() => removeEstimateItem(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex justify-between items-center px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-t font-semibold text-sm">
                        <span>Estimate Total</span>
                        <span className="text-lg">₹{estimateItems.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0)}</span>
                      </div>
                    </div>
                  )}

                  <button onClick={submitEstimate} disabled={saving || estimateItems.length === 0} className="w-full rounded-lg bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                    {saving ? 'Creating...' : 'Create Estimate'}
                  </button>
                </div>
              ) : (
              /* ── Invoice Line Items (SERVICE / COUNTER) ── */
              <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Line Items</label>
                  <div className="flex gap-3">
                    <button onClick={addLine} className="text-xs text-blue-600 hover:underline">+ Add Line</button>
                    <button onClick={addDiscount} className="text-xs text-green-600 hover:underline">+ Add Discount</button>
                  </div>
                </div>
                {lineItems.map((li, i) => (
                  <div key={i} className={`grid grid-cols-12 gap-2 mb-2 items-end ${li.lineType === 'DISCOUNT_ADJUSTMENT' ? 'bg-green-50 dark:bg-green-900/20 rounded-lg p-2 border border-green-200 dark:border-green-800' : ''}`}>
                    {li.lineType === 'DISCOUNT_ADJUSTMENT' ? (
                      <>
                        <input className={`${inputCls} col-span-5`} placeholder="Discount reason" value={li.description} onChange={(e) => updateLine(i, 'description', e.target.value)} />
                        <select className={`${inputCls} col-span-2`} value={li.discountMode || 'flat'} onChange={(e) => updateLine(i, 'discountMode', e.target.value)}>
                          <option value="flat">₹ Flat</option><option value="percent">% Percent</option>
                        </select>
                        <input type="number" className={`${inputCls} col-span-3`} placeholder={li.discountMode === 'percent' ? '% off' : '₹ amount'} value={li.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', Number(e.target.value))} />
                        <button onClick={() => removeLine(i)} className="col-span-2 text-xs text-red-500 hover:underline">Remove</button>
                      </>
                    ) : (
                      <>
                        <select className={`${inputCls} col-span-3`} value={li.lineType} onChange={(e) => updateLine(i, 'lineType', e.target.value)}>
                          <option value="PART">Part</option><option value="LABOR">Labor</option><option value="CUSTOM_CHARGE">Custom</option><option value="DISCOUNT_ADJUSTMENT">Discount</option>
                        </select>
                        <input className={`${inputCls} col-span-4`} placeholder="Description" value={li.description} onChange={(e) => updateLine(i, 'description', e.target.value)} />
                        <input type="number" className={`${inputCls} col-span-1`} placeholder="Qty" value={li.quantity} onChange={(e) => updateLine(i, 'quantity', Number(e.target.value))} />
                        <input type="number" className={`${inputCls} col-span-2`} placeholder="Price" value={li.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', Number(e.target.value))} />
                        <button onClick={() => removeLine(i)} className="col-span-2 text-xs text-red-500 hover:underline">Remove</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={submit} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Creating...' : 'Create Invoice'}
              </button>
              </>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
