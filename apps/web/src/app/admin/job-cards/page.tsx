'use client';
import { formatIST } from '@/lib/time';
import { toTitleCase, toSentenceCase } from '@/lib/title-case';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';
import { Pagination } from '@/components/shared/pagination';
import { formatRegNumber } from '@/lib/format-reg';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { CustomerPicker } from '@/components/shared/customer-picker';

export default function JobCardsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [allWorkers, setAllWorkers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customerId: '', vehicleId: '', issueSummary: '', priority: '', customerComplaints: '', odometerAtIntake: '', fuelIndicator: '', serviceRequestId: '', appointmentId: '' });
  const [newVeh, setNewVeh] = useState(false);
  const [vehForm, setVehForm] = useState({ vehicleType: 'BIKE' as string, registrationNumber: '', brand: '', model: '' });
  const router = useRouter();
  const searchParams = useSearchParams();

  const load = (s = search, f = filters, pg = page) => {
    const p = new URLSearchParams();
    if (s) p.set('search', s);
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    p.set('page', String(pg));
    const endpoint = `/admin/job-cards?${p.toString()}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) {
      setData(cached.data?.items ?? cached.data ?? []);
      setTotalPages(cached.meta?.totalPages ?? 1);
      setLoading(false);
    } else {
      setLoading(true);
    }
    promise.then((r) => { if (r.success) { setData(r.data?.items ?? r.data ?? []); setTotalPages(r.meta?.totalPages ?? 1); } setLoading(false); });
  };
  useEffect(() => {
    load();
    api.get<any>('/admin/workers?status=ACTIVE&pageSize=100').then((r) => { if (r.success) setAllWorkers(r.data?.items ?? r.data ?? []); });
  }, []);
  useEffect(() => { load(); }, [page, filters]);

  // Auto-open create modal when redirected from service request
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      const customerId = searchParams.get('customerId') || '';
      const vehicleId = searchParams.get('vehicleId') || '';
      const issueSummary = searchParams.get('issueSummary') || '';
      const customerComplaints = searchParams.get('customerComplaints') || '';
      setForm((f) => ({ ...f, customerId, vehicleId, issueSummary, customerComplaints, serviceRequestId: searchParams.get('serviceRequestId') || '', appointmentId: searchParams.get('appointmentId') || '' }));
      setShowCreate(true);
      // Load vehicles for the pre-selected customer
      if (customerId) {
        api.get<any>(`/admin/vehicles?customerId=${customerId}&pageSize=50`).then((res) => { if (res.success) setVehicles(res.data?.items ?? res.data ?? []); });
      }
    }
  }, [searchParams]);

  const openCreate = () => {
    setShowCreate(true); setError(''); setNewVeh(false);
    setVehicles([]);
    setForm({ customerId: '', vehicleId: '', issueSummary: '', priority: '', customerComplaints: '', odometerAtIntake: '', fuelIndicator: '', serviceRequestId: '', appointmentId: '' });
  };

  const onCustomerChange = async (customerId: string) => {
    setForm((f) => ({ ...f, customerId, vehicleId: '' })); setNewVeh(false);
    if (!customerId) { setVehicles([]); return; }
    const res = await api.get<any>(`/admin/vehicles?customerId=${customerId}&pageSize=50`);
    if (res.success) setVehicles(res.data?.items ?? res.data ?? []);
  };

  const createVehicle = async () => {
    if (!vehForm.registrationNumber || !vehForm.brand || !vehForm.model) { setError('Registration, brand and model are required'); return; }
    if (!form.customerId) { setError('Select or create a customer first'); return; }
    setError(''); setSaving(true);
    const res = await api.post<any>('/admin/vehicles', { ...vehForm, customerId: form.customerId });
    setSaving(false);
    if (res.success && res.data) {
      setVehicles((prev) => [res.data, ...prev]);
      setForm((f) => ({ ...f, vehicleId: res.data.id }));
      setNewVeh(false);
      setVehForm({ vehicleType: 'BIKE', registrationNumber: '', brand: '', model: '' });
    } else { setError(res.error?.message || 'Failed to create vehicle'); }
  };

  const submit = async () => {
    if (!form.customerId || !form.vehicleId || !form.issueSummary) { setError('Fill all required fields'); return; }
    setSaving(true); setError('');
    const payload: Record<string, unknown> = { ...form, odometerAtIntake: form.odometerAtIntake ? Number(form.odometerAtIntake) : undefined, fuelIndicator: form.fuelIndicator || undefined };
    if (!payload.serviceRequestId) delete payload.serviceRequestId;
    if (!payload.appointmentId) delete payload.appointmentId;
    const res = await api.post<any>('/admin/job-cards', payload);
    setSaving(false);
    if (res.success) { setShowCreate(false); setForm({ customerId: '', vehicleId: '', issueSummary: '', priority: '', customerComplaints: '', odometerAtIntake: '', fuelIndicator: '', serviceRequestId: '', appointmentId: '' }); load(); }
    else setError(res.error?.message || 'Failed to create');
  };

  const columns = [
    { key: 'jobCardNumber', header: 'Job Card', nowrap: true, render: (r: any) => (
      <div>
        <span className="font-medium text-sm">{r.jobCardNumber}</span>
        <span className="block text-[10px] text-gray-400">{formatIST(r.createdAt, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
      </div>
    )},
    { key: 'customer', header: 'Customer / Vehicle', render: (r: any) => (
      <div className="min-w-0">
        <span className="font-medium text-sm">{toTitleCase(r.customer?.fullName)}</span>
        <span className="block text-xs text-gray-500">{r.vehicle?.registrationNumber} {r.vehicle?.brand ? `· ${toTitleCase(r.vehicle.brand)}` : ''}</span>
        {r.issueSummary && <span title={r.issueSummary} className="block text-xs text-gray-400 line-clamp-2">{toSentenceCase(r.issueSummary)}</span>}
      </div>
    )},
    { key: 'status', header: 'Status', nowrap: true, render: (r: any) => (
      <div className="flex flex-col gap-0.5">
        <StatusBadge status={r.status} />
        {r.priority && <span className="text-[10px] text-gray-400">{r.priority}</span>}
      </div>
    )},
    { key: 'workers', header: 'Workers', render: (r: any) => (
      <span className="text-xs text-gray-600 dark:text-gray-400">{r.assignments?.map((a: any) => toTitleCase(a.worker?.fullName)).join(', ') || '—'}</span>
    ), className: 'hidden md:table-cell' },
    { key: 'invoice', header: 'Invoice', nowrap: true, render: (r: any) => {
      const inv = r.invoices?.[0];
      if (!inv) return <span className="text-xs text-gray-300">—</span>;
      const color = inv.paymentStatus === 'PAID' ? 'text-green-600 bg-green-50 dark:bg-green-900/20 hover:bg-green-100' : inv.invoiceStatus === 'DRAFT' ? 'text-gray-500 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100' : 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100';
      const label = inv.paymentStatus === 'PAID' ? 'Paid' : inv.invoiceStatus === 'DRAFT' ? 'Draft' : 'Unpaid';
      return <a href={`/admin/invoices/${inv.id}`} onClick={(e) => e.stopPropagation()} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${color}`}>{label}</a>;
    }},
  ];

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  if (loading) return <ProcessLoader title="Loading job cards" steps={['Fetching active jobs', 'Preparing list']} />;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Job Cards" description="Active and completed work orders" />
        <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ New Job Card</button>
      </div>

      <ListToolbar
        searchPlaceholder="Search by job-card # or customer…"
        searchValue={search}
        onSearch={(s) => { setSearch(s); setPage(1); load(s, filters, 1); }}
        filters={[
          { label: 'Status', value: 'status', options: [
            { value: 'CREATED', label: 'Open' },
            { value: 'ESTIMATE_PREPARED', label: 'Estimate Ready' },
            { value: 'WORK_IN_PROGRESS', label: 'In Progress' },
            { value: 'READY_FOR_DELIVERY', label: 'Ready' },
            { value: 'DELIVERED', label: 'Delivered' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ] },
          { label: 'Worker', value: 'workerId', options: allWorkers.map((w: any) => ({ value: w.id, label: w.fullName + (typeof w._count?.assignments === 'number' ? ` (${w._count.assignments})` : '') })) },
          { label: 'Priority', value: 'priority', options: [
            { value: 'URGENT', label: 'Urgent' },
            { value: 'HIGH', label: 'High' },
            { value: 'MEDIUM', label: 'Medium' },
            { value: 'LOW', label: 'Low' },
          ] },
        ]}
        filterValues={filters}
        dateRange={{ fromKey: 'from', toKey: 'to', label: 'Created' }}
        onFilterChange={(k, v) => { setFilters((prev) => ({ ...prev, [k]: v })); setPage(1); }}
      />

      <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/job-cards/${r.id}`)} />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Job Card">
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Customer */}
          <CustomerPicker
            value={form.customerId}
            onChange={(customerId) => { void onCustomerChange(customerId); }}
            onCustomerCreated={(customer) => { void onCustomerChange(customer.id); }}
          />

          {/* Vehicle */}
          {!newVeh ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">Vehicle <span className="text-red-500">*</span></label>
                {form.customerId && <button type="button" onClick={() => setNewVeh(true)} className="text-xs text-blue-600 hover:underline">+ New Vehicle</button>}
              </div>
              <SearchableSelect
                options={vehicles.map((v: any) => ({ value: v.id, label: v.registrationNumber, sublabel: `${v.brand ?? ''} ${v.model ?? ''}`.trim() || undefined }))}
                value={form.vehicleId}
                onChange={(v) => setForm((f) => ({ ...f, vehicleId: v }))}
                placeholder="Search by reg number, brand, or model…"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">New Vehicle</span>
                <button type="button" onClick={() => setNewVeh(false)} className="text-xs text-gray-500 hover:underline">Cancel</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className={inputCls} value={vehForm.vehicleType} onChange={(e) => setVehForm({ ...vehForm, vehicleType: e.target.value })}>
                  <option value="BIKE">Motorcycle</option><option value="OTHER">Scooter / Other</option>
                </select>
                <input className={inputCls} placeholder="WB-26-AB-1234" value={vehForm.registrationNumber} onChange={(e) => setVehForm({ ...vehForm, registrationNumber: formatRegNumber(e.target.value) })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Brand *" value={vehForm.brand} onChange={(e) => setVehForm({ ...vehForm, brand: e.target.value })} />
                <input className={inputCls} placeholder="Model *" value={vehForm.model} onChange={(e) => setVehForm({ ...vehForm, model: e.target.value })} />
              </div>
              <button type="button" onClick={createVehicle} disabled={saving} className="w-full rounded-lg bg-green-600 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Creating...' : 'Create Vehicle'}
              </button>
            </div>
          )}

          <div><label className="block text-sm font-medium mb-1">Issue Summary <span className="text-red-500">*</span></label><textarea className={inputCls} rows={2} value={form.issueSummary} onChange={(e) => setForm((f) => ({ ...f, issueSummary: e.target.value }))} /></div>
          <div><label className="block text-sm font-medium mb-1">Customer Complaints</label><textarea className={inputCls} rows={2} value={form.customerComplaints} onChange={(e) => setForm((f) => ({ ...f, customerComplaints: e.target.value }))} /></div>
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <select className={inputCls} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              <option value="">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Odometer Reading (km)</label><input type="number" className={inputCls} placeholder="e.g. 23450" value={form.odometerAtIntake} onChange={(e) => setForm((f) => ({ ...f, odometerAtIntake: e.target.value }))} /></div>
          <div><label className="block text-sm font-medium mb-1">Fuel Indicator</label><select className={inputCls} value={form.fuelIndicator} onChange={(e) => setForm((f) => ({ ...f, fuelIndicator: e.target.value }))}><option value="">Select...</option><option value="E">E (Empty)</option><option value="1/4">1/4</option><option value="1/2">1/2</option><option value="3/4">3/4</option><option value="F">F (Full)</option></select></div>
          <button onClick={submit} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Job Card'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
