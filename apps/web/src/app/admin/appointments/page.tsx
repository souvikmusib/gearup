'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function AppointmentsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customerId: '', vehicleId: '', appointmentDate: '', slotStart: '', slotEnd: '' });
  const [showNewCust, setShowNewCust] = useState(false);
  const [custForm, setCustForm] = useState({ fullName: '', phoneNumber: '' });
  const router = useRouter();

  const load = (s = search, st = statusFilter) => {
    const p = new URLSearchParams();
    if (s) p.set('search', s);
    if (st) p.set('status', st);
    const qs = p.toString();
    const endpoint = `/admin/appointments${qs ? `?${qs}` : ''}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) {
      setData(cached.data?.items ?? cached.data ?? []);
      setLoading(false);
    } else {
      setLoading(true);
    }
    promise.then((r) => { if (r.success) setData(r.data?.items ?? r.data ?? []); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const openCreate = async () => {
    setShowCreate(true);
    setError('');
    const res = await api.get<any>('/admin/customers?pageSize=200');
    if (res.success) setCustomers(res.data?.items ?? res.data ?? []);
  };

  const onCustomerChange = async (customerId: string) => {
    setForm((f) => ({ ...f, customerId, vehicleId: '' }));
    if (!customerId) { setVehicles([]); return; }
    const res = await api.get<any>(`/admin/vehicles?customerId=${customerId}&pageSize=100`);
    if (res.success) setVehicles(res.data?.items ?? res.data ?? []);
  };

  const submit = async () => {
    if (!form.customerId || !form.vehicleId || !form.appointmentDate) { setError('Fill all required fields'); return; }
    setSaving(true); setError('');
    const dt = new Date(form.appointmentDate);
    const slotEnd = new Date(dt.getTime() + 30 * 60000);
    // Use date portion directly to avoid timezone-shift issues
    const dateOnly = form.appointmentDate.slice(0, 10) + 'T00:00:00.000Z';
    const res = await api.post<any>('/admin/appointments', {
      customerId: form.customerId, vehicleId: form.vehicleId,
      appointmentDate: dateOnly, slotStart: dt.toISOString(), slotEnd: slotEnd.toISOString(),
    });
    setSaving(false);
    if (res.success) { setShowCreate(false); setForm({ customerId: '', vehicleId: '', appointmentDate: '', slotStart: '', slotEnd: '' }); load(); }
    else setError(res.error?.message || 'Failed to create');
  };

  const columns = [
    { key: 'referenceId', header: 'Reference' },
    { key: 'customer', header: 'Customer', render: (r: any) => r.customer?.fullName },
    { key: 'vehicle', header: 'Vehicle', render: (r: any) => r.vehicle?.registrationNumber },
    { key: 'appointmentDate', header: 'Date', render: (r: any) => new Date(r.appointmentDate).toLocaleDateString() },
    { key: 'slot', header: 'Slot', render: (r: any) => `${new Date(r.slotStart).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} - ${new Date(r.slotEnd).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'worker', header: 'Worker', render: (r: any) => r.worker?.fullName ?? '—' },
  ];

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  if (loading) return <ProcessLoader title="Loading appointments" steps={['Fetching schedule', 'Preparing list']} />;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Appointments" description="Manage appointment schedule" />
        <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ New Appointment</button>
      </div>
      <div className="flex gap-2 mb-4">
        <input className={inputCls + ' max-w-xs'} placeholder="Search appointments..." value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value, statusFilter); }} />
        <select className={inputCls + ' w-48'} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); load(search, e.target.value); }}>
          <option value="">All Statuses</option>
          {['REQUESTED','PENDING_REVIEW','CONFIRMED','RESCHEDULED','CANCELLED','NO_SHOW','CHECKED_IN','COMPLETED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/appointments/${r.id}`)} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Appointment">
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">Customer <span className="text-red-500">*</span></label>
              <button type="button" onClick={() => setShowNewCust(!showNewCust)} className="text-xs text-blue-600 hover:underline">{showNewCust ? '← Select existing' : '+ New customer'}</button>
            </div>
            {showNewCust ? (
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Full Name *" value={custForm.fullName} onChange={(e) => setCustForm({ ...custForm, fullName: e.target.value })} />
                <input className={inputCls} placeholder="Phone *" value={custForm.phoneNumber} onChange={(e) => setCustForm({ ...custForm, phoneNumber: e.target.value })} />
                <button type="button" onClick={async () => {
                  if (!custForm.fullName || !custForm.phoneNumber) return;
                  setSaving(true);
                  const res = await api.post<any>('/admin/customers', custForm);
                  setSaving(false);
                  if (res.success) { setCustomers((p) => [res.data, ...p]); onCustomerChange(res.data.id); setShowNewCust(false); setCustForm({ fullName: '', phoneNumber: '' }); }
                  else setError(res.error?.message || 'Failed');
                }} disabled={saving || !custForm.fullName || !custForm.phoneNumber} className="shrink-0 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">Add</button>
              </div>
            ) : (
              <select className={inputCls} value={form.customerId} onChange={(e) => onCustomerChange(e.target.value)}>
                <option value="">Select customer...</option>
                {customers.map((c: any) => <option key={c.id} value={c.id}>{c.fullName} ({c.phoneNumber})</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Vehicle <span className="text-red-500">*</span></label>
            <select className={inputCls} value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}>
              <option value="">Select vehicle...</option>
              {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.registrationNumber} — {v.brand} {v.model}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date & Time <span className="text-red-500">*</span></label>
            <input type="datetime-local" className={inputCls} value={form.appointmentDate} onChange={(e) => setForm((f) => ({ ...f, appointmentDate: e.target.value }))} />
          </div>
          <button onClick={submit} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Appointment'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
