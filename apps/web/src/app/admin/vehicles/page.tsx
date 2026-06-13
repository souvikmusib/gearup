'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable } from '@gearup/ui';
import { formatRegNumber } from '@/lib/format-reg';
import { Modal } from '@/components/shared/modal';
import { Pagination } from '@/components/shared/pagination';
import { CustomerPicker } from '@/components/shared/customer-picker';

export default function VehiclesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customerId: '', vehicleType: 'BIKE', registrationNumber: '', brand: '', model: '', variant: '', fuelType: '', engineCC: '' });
  const router = useRouter();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = (s = search, pg = page) => {
    const p = new URLSearchParams();
    if (s) p.set('search', s);
    p.set('page', String(pg));
    const qs = p.toString();
    const endpoint = `/admin/vehicles?${qs}`;
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
  useEffect(() => { load(); }, [page]);

  const openCreate = () => {
    setShowCreate(true); setError('');
  };

  const submit = async () => {
    if (!form.customerId || !form.registrationNumber || !form.brand || !form.model) { setError('Fill required fields'); return; }
    setSaving(true); setError('');
    const res = await api.post<any>('/admin/vehicles', form);
    setSaving(false);
    if (res.success) { setShowCreate(false); setForm({ customerId: '', vehicleType: 'BIKE', registrationNumber: '', brand: '', model: '', variant: '', fuelType: '', engineCC: '' }); load(); }
    else setError(res.error?.message || 'Failed');
  };

  const columns = [
    { key: 'registrationNumber', header: 'Reg No' }, { key: 'customer', header: 'Customer', render: (r: any) => r.customer?.fullName },
    { key: 'vehicleType', header: 'Type' }, { key: 'brand', header: 'Brand' }, { key: 'model', header: 'Model' },
  ];
  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  if (loading) return <ProcessLoader title="Loading vehicles" steps={['Fetching vehicle records', 'Preparing list']} />;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Vehicles" />
        <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ Add Vehicle</button>
      </div>
      <div className="mb-4">
        <input className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" placeholder="Search by reg number, brand..." value={search} onChange={(e) => { const v = e.target.value; setSearch(v); if (searchTimer.current) clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => load(v), 300); }} />
      </div>
      <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/vehicles/${r.id}`)} />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Vehicle">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <CustomerPicker value={form.customerId} onChange={(customerId) => setForm((prev) => ({ ...prev, customerId }))} />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Type <span className="text-red-500">*</span></label>
              <select className={inputCls} value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
                <option value="BIKE">Motorcycle</option><option value="OTHER">Scooter / Other</option>
              </select>
            </div>
            <div><label className="block text-xs font-medium mb-1">Reg Number <span className="text-red-500">*</span></label><input className={inputCls} value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: formatRegNumber(e.target.value) })} placeholder="WB68K5489" /></div>
            <div><label className="block text-xs font-medium mb-1">Brand <span className="text-red-500">*</span></label><input className={inputCls} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Model <span className="text-red-500">*</span></label><input className={inputCls} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Variant</label><input className={inputCls} value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Engine CC</label><input type="number" className={inputCls} value={form.engineCC} onChange={(e) => setForm({ ...form, engineCC: e.target.value })} placeholder="e.g. 125" /></div>
            <div><label className="block text-xs font-medium mb-1">Fuel Type</label><input className={inputCls} value={form.fuelType} onChange={(e) => setForm({ ...form, fuelType: e.target.value })} placeholder="Petrol/Diesel/EV" /></div>
          </div>
          <button onClick={submit} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Creating...' : 'Add Vehicle'}</button>
        </div>
      </Modal>
    </div>
  );
}
