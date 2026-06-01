'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function AmcPlansPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ planName: '', vehicleType: 'BIKE', durationMonths: '12', totalServicesIncluded: '3', price: '', description: '', exclusions: '' });

  const load = () => {
    api.get<any>('/admin/amc/plans').then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setSaving(true); setError('');
    const res = await api.post<any>('/admin/amc/plans', {
      ...form,
      durationMonths: Number(form.durationMonths),
      totalServicesIncluded: Number(form.totalServicesIncluded),
      price: Number(form.price),
    });
    setSaving(false);
    if (res.success) { setShowCreate(false); setForm({ planName: '', vehicleType: 'BIKE', durationMonths: '12', totalServicesIncluded: '3', price: '', description: '', exclusions: '' }); load(); }
    else setError(res.error?.message || 'Failed');
  };

  const toggleActive = async (plan: any) => {
    await api.patch(`/admin/amc/plans/${plan.id}`, { isActive: !plan.isActive });
    load();
  };

  if (loading) return <ProcessLoader title="Loading AMC plans..." />;

  return (
    <div className="space-y-6">
      <PageHeader title="AMC Plans" actions={<button onClick={() => setShowCreate(true)} className="bg-blue-600 text-white rounded px-4 py-2 text-sm">+ New Plan</button>} />
      <DataTable
        keyField="id"
        columns={[
          { key: 'planName', header: 'Plan Name' },
          { key: 'vehicleType', header: 'Vehicle Type' },
          { key: 'durationMonths', header: 'Duration', render: (row: any) => `${row.durationMonths} months` },
          { key: 'totalServicesIncluded', header: 'Services' },
          { key: 'price', header: 'Price', render: (row: any) => `₹${Number(row.price).toLocaleString()}` },
          { key: '_count', header: 'Contracts', render: (row: any) => row._count?.contracts ?? 0 },
          { key: 'isActive', header: 'Status', render: (row: any) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
        ]}
        data={data}
        onRowClick={toggleActive}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create AMC Plan">
        <div className="space-y-3">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" placeholder="Plan Name" value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })} />
          <select className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
            <option value="BIKE">Bike</option>
            <option value="CAR">Car</option>
            <option value="OTHER">Other</option>
          </select>
          <div className="grid grid-cols-3 gap-2">
            <input className="border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" type="number" placeholder="Months" value={form.durationMonths} onChange={(e) => setForm({ ...form, durationMonths: e.target.value })} />
            <input className="border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" type="number" placeholder="Services" value={form.totalServicesIncluded} onChange={(e) => setForm({ ...form, totalServicesIncluded: e.target.value })} />
            <input className="border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" type="number" placeholder="Price (₹)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <textarea className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <textarea className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" placeholder="Exclusions (optional)" value={form.exclusions} onChange={(e) => setForm({ ...form, exclusions: e.target.value })} />
          <button disabled={saving || !form.planName || !form.price} onClick={handleCreate} className="w-full bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Plan'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
