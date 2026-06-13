'use client';
import { toTitleCase } from '@/lib/title-case';
import { formatIST, formatTimeIST } from '@/lib/time';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';
import { Pagination } from '@/components/shared/pagination';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { CustomerPicker } from '@/components/shared/customer-picker';

export default function AppointmentsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [showNewVeh, setShowNewVeh] = useState(false);
  const [vehForm, setVehForm] = useState({ vehicleType: 'BIKE', registrationNumber: '', brand: '', model: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customerId: '', vehicleId: '', appointmentDate: '', slotStart: '', slotEnd: '' });
  const router = useRouter();

  const load = (s = search, f = filters, pg = page) => {
    const p = new URLSearchParams();
    if (s) p.set('search', s);
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    p.set('page', String(pg));
    const endpoint = `/admin/appointments?${p.toString()}`;
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
  useEffect(() => { load(); }, [page, filters]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      load(val, filters, 1);
    }, 300);
  };

  const openCreate = () => {
    setShowCreate(true);
    setError('');
    setVehicles([]);
    setShowNewVeh(false);
    setForm({ customerId: '', vehicleId: '', appointmentDate: '', slotStart: '', slotEnd: '' });
  };

  const onCustomerChange = async (customerId: string) => {
    setForm((f) => ({ ...f, customerId, vehicleId: '' }));
    setShowNewVeh(false);
    if (!customerId) { setVehicles([]); return; }
    const res = await api.get<any>(`/admin/vehicles?customerId=${customerId}&pageSize=50`);
    if (res.success) setVehicles(res.data?.items ?? res.data ?? []);
  };

  const submit = async () => {
    if (!form.customerId || !form.vehicleId || !form.appointmentDate) { setError('Fill all required fields'); return; }
    setSaving(true); setError('');
    const dt = new Date(form.appointmentDate);
    const slotEnd = new Date(dt.getTime() + 30 * 60000);
    const res = await api.post<any>('/admin/appointments', {
      customerId: form.customerId, vehicleId: form.vehicleId,
      appointmentDate: dt.toISOString(), slotStart: dt.toISOString(), slotEnd: slotEnd.toISOString(),
    });
    setSaving(false);
    if (res.success) { setShowCreate(false); setForm({ customerId: '', vehicleId: '', appointmentDate: '', slotStart: '', slotEnd: '' }); load(); }
    else setError(res.error?.message || 'Failed to create');
  };

  const columns = [
    { key: 'referenceId', header: 'Reference' },
    { key: 'customer', header: 'Customer', render: (r: any) => toTitleCase(r.customer?.fullName) },
    { key: 'vehicle', header: 'Vehicle', render: (r: any) => r.vehicle?.registrationNumber },
    { key: 'appointmentDate', header: 'Date', render: (r: any) => formatIST(r.appointmentDate) },
    { key: 'slot', header: 'Slot', render: (r: any) => `${formatTimeIST(r.slotStart)} - ${formatTimeIST(r.slotEnd)}` },
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
      <ListToolbar
        searchPlaceholder="Search by reference or customer…"
        onSearch={onSearchChange}
        filters={[
          { label: 'Status', value: 'status', options: ['REQUESTED','PENDING_REVIEW','CONFIRMED','RESCHEDULED','CANCELLED','NO_SHOW','CHECKED_IN','COMPLETED'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) },
        ]}
        filterValues={filters}
        dateRange={{ fromKey: 'from', toKey: 'to', label: 'Appointment date' }}
        onFilterChange={(k, v) => { setFilters((prev) => ({ ...prev, [k]: v })); setPage(1); }}
      />
      <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/appointments/${r.id}`)} />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Appointment">
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <CustomerPicker
              value={form.customerId}
              onChange={(customerId) => { void onCustomerChange(customerId); }}
              onCustomerCreated={(customer) => { void onCustomerChange(customer.id); }}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">Vehicle <span className="text-red-500">*</span></label>
              {form.customerId && <button type="button" onClick={() => setShowNewVeh(!showNewVeh)} className="text-xs text-blue-600 hover:underline">{showNewVeh ? '← Select existing' : '+ New vehicle'}</button>}
            </div>
            {showNewVeh ? (
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Reg No *" value={vehForm.registrationNumber} onChange={(e) => setVehForm({ ...vehForm, registrationNumber: e.target.value.toUpperCase() })} />
                <input className={inputCls} placeholder="Brand *" value={vehForm.brand} onChange={(e) => setVehForm({ ...vehForm, brand: e.target.value })} />
                <input className={inputCls} placeholder="Model *" value={vehForm.model} onChange={(e) => setVehForm({ ...vehForm, model: e.target.value })} />
                <button type="button" onClick={async () => {
                  if (!vehForm.registrationNumber || !vehForm.brand || !vehForm.model || !form.customerId) return;
                  setSaving(true);
                  const res = await api.post<any>('/admin/vehicles', { ...vehForm, customerId: form.customerId });
                  setSaving(false);
                  if (res.success) { setVehicles((p) => [res.data, ...p]); setForm((f) => ({ ...f, vehicleId: res.data.id })); setShowNewVeh(false); setVehForm({ vehicleType: 'BIKE', registrationNumber: '', brand: '', model: '' }); }
                  else setError(res.error?.message || 'Failed');
                }} disabled={saving || !vehForm.registrationNumber || !vehForm.brand || !vehForm.model} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">Add</button>
              </div>
            ) : (
              <select className={inputCls} value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}>
                <option value="">Select vehicle...</option>
                {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.registrationNumber} — {v.brand} {v.model}</option>)}
              </select>
            )}
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
