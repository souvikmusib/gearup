'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { Modal } from '@/components/shared/modal';
import { ProcessLoader } from '@/components/shared/process-loader';

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
    params.set('page', String(p));
    const endpoint = `/admin/invoices?${params}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) {
      setData(cached.data?.items ?? cached.data ?? []);
      setTotalPages(cached.data?.totalPages ?? 1);
      setLoading(false);
    } else {
      setLoading(true);
    }
    promise.then((res) => {
      if (res.success) { setData(res.data?.items ?? res.data ?? []); setTotalPages(res.data?.totalPages ?? 1); }
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
    setShowCreate(true); setError(''); setSelectedJC(null); setLineItems([]);
    setModalLoading(true);
    const res = await api.get<any>('/admin/job-cards?pageSize=100');
    setModalLoading(false);
    if (res.success) setJobCards((res.data?.items ?? res.data ?? []).filter((jc: any) => !['CANCELLED', 'CREATED'].includes(jc.status)));
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
      if (Number(res.data.finalLaborCost) > 0) items.push({ lineType: 'LABOR', description: 'Labor charges', quantity: 1, unitPrice: Number(res.data.finalLaborCost), taxRate: 0 });
      if (items.length === 0) items.push({ lineType: 'CUSTOM_CHARGE', description: '', quantity: 1, unitPrice: 0, taxRate: 0 });
      setLineItems(items);
    }
  };

  const addLine = () => setLineItems((l) => [...l, { lineType: 'CUSTOM_CHARGE', description: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
  const removeLine = (i: number) => setLineItems((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: any) => setLineItems((l) => l.map((li, idx) => idx === i ? { ...li, [field]: value } : li));

  const submit = async () => {
    if (!selectedJC || lineItems.length === 0) { setError('Select a job card and add line items'); return; }
    setSaving(true); setError('');
    const res = await api.post<any>('/admin/invoices', {
      customerId: selectedJC.customerId, vehicleId: selectedJC.vehicleId, jobCardId: selectedJC.id,
      invoiceDate: new Date().toISOString(), lineItems: lineItems.map((li, i) => ({ ...li, sortOrder: i })),
    });
    setSaving(false);
    if (res.success) { setShowCreate(false); load(); }
    else setError(res.error?.message || 'Failed to create');
  };

  const columns = [
    { key: 'invoiceNumber', header: 'Invoice #' }, { key: 'customer', header: 'Customer', render: (r: any) => r.customer?.fullName },
    { key: 'invoiceDate', header: 'Date', render: (r: any) => new Date(r.invoiceDate).toLocaleDateString() },
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
        <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ New Invoice</button>
      </div>
      <ListToolbar searchPlaceholder="Search invoices..." onSearch={onSearch}
        filters={[{ label: 'Payment Status', value: 'paymentStatus', options: PAYMENT_STATUSES }, { label: 'Invoice Status', value: 'invoiceStatus', options: INVOICE_STATUSES }]}
        onFilterChange={(k, v) => { setFilters(prev => ({ ...prev, [k]: v })); setPage(1); }} />
      {loading ? <ProcessLoader title="Loading invoices" steps={['Fetching latest invoice list', 'Checking payment status', 'Preparing table rows']} /> :
        <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/invoices/${r.id}`)} />}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Invoice">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {modalLoading && <ProcessLoader title="Preparing invoice form" steps={['Loading eligible job cards', 'Reading selected job-card parts', 'Calculating starter line items']} />}
          <div>
            <label className="block text-sm font-medium mb-1">Job Card *</label>
            <select className={inputCls} value={selectedJC?.id || ''} onChange={(e) => onJobCardSelect(e.target.value)}>
              <option value="">Select job card...</option>
              {jobCards.map((jc: any) => <option key={jc.id} value={jc.id}>{jc.jobCardNumber} — {jc.customer?.fullName} ({jc.vehicle?.registrationNumber})</option>)}
            </select>
          </div>
          {selectedJC && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Line Items</label>
                  <button onClick={addLine} className="text-xs text-blue-600 hover:underline">+ Add Line</button>
                </div>
                {lineItems.map((li, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-end">
                    <select className={`${inputCls} col-span-3`} value={li.lineType} onChange={(e) => updateLine(i, 'lineType', e.target.value)}>
                      <option value="PART">Part</option><option value="LABOR">Labor</option><option value="CUSTOM_CHARGE">Custom</option><option value="DISCOUNT_ADJUSTMENT">Discount</option>
                    </select>
                    <input className={`${inputCls} col-span-4`} placeholder="Description" value={li.description} onChange={(e) => updateLine(i, 'description', e.target.value)} />
                    <input type="number" className={`${inputCls} col-span-1`} placeholder="Qty" value={li.quantity} onChange={(e) => updateLine(i, 'quantity', Number(e.target.value))} />
                    <input type="number" className={`${inputCls} col-span-2`} placeholder="Price" value={li.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', Number(e.target.value))} />
                    <button onClick={() => removeLine(i)} className="col-span-2 text-xs text-red-500 hover:underline">Remove</button>
                  </div>
                ))}
              </div>
              <button onClick={submit} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Creating invoice...' : 'Create Invoice'}
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
