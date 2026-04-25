'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function VehiclesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customerId: '', vehicleType: 'BIKE', registrationNumber: '', brand: '', model: '', variant: '', fuelType: '' });
  const router = useRouter();

  const load = (s = search) => {
    const p = new URLSearchParams();
    if (s) p.set('search', s);
    const qs = p.toString();
    const endpoint = `/admin/vehicles${qs ? `?${qs}` : ''}`;
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
    setShowCreate(true); setError('');
    const res = await api.get<any>('/admin/customers?pageSize=200');
    if (res.success) setCustomers(res.data?.items ?? res.data ?? []);
  };

  const submit = async () => {
    if (!form.customerId || !form.registrationNumber || !form.brand || !form.model) { setError('Fill required fields'); return; }
    setSaving(true); setError('');
    const res = await api.post<any>('/admin/vehicles', form);
    setSaving(false);
    if (res.success) { setShowCreate(false); setForm({ customerId: '', vehicleType: 'BIKE', registrationNumber: '', brand: '', model: '', variant: '', fuelType: '' }); load(); }
    else setError(res.error?.message || 'Failed');
  };

  const columns = [
    { key: 'registrationNumber', header: 'Reg No' }, { key: 'customer', header: 'Customer', render: (r: any) => r.customer?.fullName },
    { key: 'vehicleType', header: 'Type' }, { key: 'brand', header: 'Brand' }, { key: 'model', header: 'Model' },
  ];
  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Vehicles" />
        <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ Add Vehicle</button>
      </div>
      <div className="mb-4">
        <input className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" placeholder="Search by reg number, brand..." value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value); }} />
      </div>
      <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/vehicles/${r.id}`)} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Vehicle">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div><label className="block text-xs font-medium mb-1">Customer *</label>
            <select className={inputCls} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">Select...</option>
              {customers.map((c: any) => <option key={c.id} value={c.id}>{c.fullName} ({c.phoneNumber})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Type *</label>
              <select className={inputCls} value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
                <option value="BIKE">Motorcycle</option><option value="OTHER">Scooter / Other</option>
              </select>
            </div>
            <div><label className="block text-xs font-medium mb-1">Reg Number *</label><input className={inputCls} value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Brand *</label><input className={inputCls} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Model *</label><input className={inputCls} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Variant</label><input className={inputCls} value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Fuel Type</label><input className={inputCls} value={form.fuelType} onChange={(e) => setForm({ ...form, fuelType: e.target.value })} placeholder="Petrol/Diesel/EV" /></div>
          </div>
          <button onClick={submit} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Creating...' : 'Add Vehicle'}</button>
        </div>
      </Modal>
    </div>
  );
}
