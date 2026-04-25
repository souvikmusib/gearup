'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function JobCardsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customerId: '', vehicleId: '', issueSummary: '', priority: '', customerComplaints: '' });
  const [newCust, setNewCust] = useState(false);
  const [custForm, setCustForm] = useState({ fullName: '', phoneNumber: '', email: '' });
  const [newVeh, setNewVeh] = useState(false);
  const [vehForm, setVehForm] = useState({ vehicleType: 'CAR' as string, registrationNumber: '', brand: '', model: '' });
  const router = useRouter();

  const load = (s = search, st = statusFilter) => {
    const p = new URLSearchParams();
    if (s) p.set('search', s);
    if (st) p.set('status', st);
    api.get<any>(`/admin/job-cards?${p}`).then((r) => { if (r.success) setData(r.data?.items ?? r.data ?? []); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const openCreate = async () => {
    setShowCreate(true); setError(''); setNewCust(false); setNewVeh(false);
    const res = await api.get<any>('/admin/customers?pageSize=200');
    if (res.success) setCustomers(res.data?.items ?? res.data ?? []);
  };

  const onCustomerChange = async (customerId: string) => {
    setForm((f) => ({ ...f, customerId, vehicleId: '' })); setNewVeh(false);
    if (!customerId) { setVehicles([]); return; }
    const res = await api.get<any>(`/admin/vehicles?customerId=${customerId}&pageSize=100`);
    if (res.success) setVehicles(res.data?.items ?? res.data ?? []);
  };

  const createCustomer = async () => {
    if (!custForm.fullName || !custForm.phoneNumber) { setError('Customer name and phone are required'); return; }
    setError(''); setSaving(true);
    const res = await api.post<any>('/admin/customers', { ...custForm, source: 'JOB_CARD_FORM' });
    setSaving(false);
    if (res.success && res.data) {
      setCustomers((prev) => [res.data, ...prev]);
      setForm((f) => ({ ...f, customerId: res.data.id, vehicleId: '' }));
      setVehicles([]);
      setNewCust(false);
      setCustForm({ fullName: '', phoneNumber: '', email: '' });
    } else { setError(res.error?.message || 'Failed to create customer'); }
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
      setVehForm({ vehicleType: 'CAR', registrationNumber: '', brand: '', model: '' });
    } else { setError(res.error?.message || 'Failed to create vehicle'); }
  };

  const submit = async () => {
    if (!form.customerId || !form.vehicleId || !form.issueSummary) { setError('Fill all required fields'); return; }
    setSaving(true); setError('');
    const res = await api.post<any>('/admin/job-cards', form);
    setSaving(false);
    if (res.success) { setShowCreate(false); setForm({ customerId: '', vehicleId: '', issueSummary: '', priority: '', customerComplaints: '' }); load(); }
    else setError(res.error?.message || 'Failed to create');
  };

  const columns = [
    { key: 'jobCardNumber', header: 'Job Card #' },
    { key: 'customer', header: 'Customer', render: (r: any) => r.customer?.fullName },
    { key: 'vehicle', header: 'Vehicle', render: (r: any) => r.vehicle?.registrationNumber },
    { key: 'issueSummary', header: 'Issue' },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'priority', header: 'Priority', render: (r: any) => r.priority ?? '—' },
    { key: 'workers', header: 'Workers', render: (r: any) => r.assignments?.map((a: any) => a.worker?.fullName).join(', ') || '—' },
  ];

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Job Cards" description="Active and completed work orders" />
        <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ New Job Card</button>
      </div>
      <div className="flex gap-2 mb-4">
        <input className={inputCls + ' max-w-xs'} placeholder="Search job cards..." value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value, statusFilter); }} />
        <select className={inputCls + ' w-48'} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); load(search, e.target.value); }}>
          <option value="">All Statuses</option>
          {['CREATED','UNDER_INSPECTION','ESTIMATE_PREPARED','AWAITING_CUSTOMER_APPROVAL','APPROVED','WORK_IN_PROGRESS','PARTS_PENDING','QUALITY_CHECK','READY_FOR_DELIVERY','DELIVERED','CANCELLED','CLOSED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/job-cards/${r.id}`)} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Job Card">
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Customer */}
          {!newCust ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">Customer *</label>
                <button type="button" onClick={() => setNewCust(true)} className="text-xs text-blue-600 hover:underline">+ New Customer</button>
              </div>
              <select className={inputCls} value={form.customerId} onChange={(e) => onCustomerChange(e.target.value)}>
                <option value="">Select customer...</option>
                {customers.map((c: any) => <option key={c.id} value={c.id}>{c.fullName} ({c.phoneNumber})</option>)}
              </select>
            </div>
          ) : (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">New Customer</span>
                <button type="button" onClick={() => setNewCust(false)} className="text-xs text-gray-500 hover:underline">Cancel</button>
              </div>
              <input className={inputCls} placeholder="Full Name *" value={custForm.fullName} onChange={(e) => setCustForm({ ...custForm, fullName: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Phone *" value={custForm.phoneNumber} onChange={(e) => setCustForm({ ...custForm, phoneNumber: e.target.value })} />
                <input className={inputCls} placeholder="Email" value={custForm.email} onChange={(e) => setCustForm({ ...custForm, email: e.target.value })} />
              </div>
              <button type="button" onClick={createCustomer} disabled={saving} className="w-full rounded-lg bg-green-600 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Creating...' : 'Create Customer'}
              </button>
            </div>
          )}

          {/* Vehicle */}
          {!newVeh ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">Vehicle *</label>
                {form.customerId && <button type="button" onClick={() => setNewVeh(true)} className="text-xs text-blue-600 hover:underline">+ New Vehicle</button>}
              </div>
              <select className={inputCls} value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}>
                <option value="">Select vehicle...</option>
                {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.registrationNumber} — {v.brand} {v.model}</option>)}
              </select>
            </div>
          ) : (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">New Vehicle</span>
                <button type="button" onClick={() => setNewVeh(false)} className="text-xs text-gray-500 hover:underline">Cancel</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className={inputCls} value={vehForm.vehicleType} onChange={(e) => setVehForm({ ...vehForm, vehicleType: e.target.value })}>
                  <option value="CAR">Car</option><option value="BIKE">Bike</option><option value="OTHER">Other</option>
                </select>
                <input className={inputCls} placeholder="Reg. Number *" value={vehForm.registrationNumber} onChange={(e) => setVehForm({ ...vehForm, registrationNumber: e.target.value })} />
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

          <div><label className="block text-sm font-medium mb-1">Issue Summary *</label><textarea className={inputCls} rows={2} value={form.issueSummary} onChange={(e) => setForm((f) => ({ ...f, issueSummary: e.target.value }))} /></div>
          <div><label className="block text-sm font-medium mb-1">Customer Complaints</label><textarea className={inputCls} rows={2} value={form.customerComplaints} onChange={(e) => setForm((f) => ({ ...f, customerComplaints: e.target.value }))} /></div>
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <select className={inputCls} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              <option value="">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
            </select>
          </div>
          <button onClick={submit} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Job Card'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
