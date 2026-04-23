'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function AppointmentsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customerId: '', vehicleId: '', appointmentDate: '', slotStart: '', slotEnd: '' });
  const router = useRouter();

  const load = () => api.get<any>('/admin/appointments').then((r) => { if (r.success) setData(r.data?.items ?? r.data ?? []); setLoading(false); });
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
    { key: 'customer', header: 'Customer', render: (r: any) => r.customer?.fullName },
    { key: 'vehicle', header: 'Vehicle', render: (r: any) => r.vehicle?.registrationNumber },
    { key: 'appointmentDate', header: 'Date', render: (r: any) => new Date(r.appointmentDate).toLocaleDateString() },
    { key: 'slot', header: 'Slot', render: (r: any) => `${new Date(r.slotStart).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} - ${new Date(r.slotEnd).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'worker', header: 'Worker', render: (r: any) => r.worker?.fullName ?? '—' },
  ];

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Appointments" description="Manage appointment schedule" />
        <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ New Appointment</button>
      </div>
      <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/appointments/${r.id}`)} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Appointment">
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="block text-sm font-medium mb-1">Customer *</label>
            <select className={inputCls} value={form.customerId} onChange={(e) => onCustomerChange(e.target.value)}>
              <option value="">Select customer...</option>
              {customers.map((c: any) => <option key={c.id} value={c.id}>{c.fullName} ({c.phoneNumber})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Vehicle *</label>
            <select className={inputCls} value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}>
              <option value="">Select vehicle...</option>
              {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.registrationNumber} — {v.brand} {v.model}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date & Time *</label>
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
