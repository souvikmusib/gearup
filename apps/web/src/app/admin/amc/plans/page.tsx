'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

const emptyForm = { planName: '', vehicleType: 'BIKE', ccRange: '', durationMonths: '12', totalServicesIncluded: '3', price: '', extraDiscountPercent: '0', laborDiscountPercent: '100', description: '', exclusions: '' };

export default function AmcPlansPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);

  const load = () => { api.get<any>('/admin/amc/plans').then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditId(null); setForm(emptyForm); setShowForm(true); setError(''); };
  const openEdit = (plan: any) => {
    setEditId(plan.id);
    setForm({ planName: plan.planName, vehicleType: plan.vehicleType, ccRange: plan.ccRange || '', durationMonths: String(plan.durationMonths), totalServicesIncluded: String(plan.totalServicesIncluded), price: String(plan.price), extraDiscountPercent: String(Number(plan.extraDiscountPercent) || 0), laborDiscountPercent: String(Number(plan.laborDiscountPercent) ?? 100), description: plan.description || '', exclusions: plan.exclusions || '' });
    setShowForm(true); setError('');
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    const payload = { ...form, durationMonths: Number(form.durationMonths), totalServicesIncluded: Number(form.totalServicesIncluded), price: Number(form.price), extraDiscountPercent: Number(form.extraDiscountPercent), laborDiscountPercent: Number(form.laborDiscountPercent) };
    const res = editId
      ? await api.patch<any>(`/admin/amc/plans/${editId}`, payload)
      : await api.post<any>('/admin/amc/plans', payload);
    setSaving(false);
    if (res.success) { setShowForm(false); load(); }
    else setError(res.error?.message || 'Failed');
  };

  const handleDelete = async (plan: any) => {
    if (!confirm(`Delete "${plan.planName}"?`)) return;
    const res = await api.delete<any>(`/admin/amc/plans/${plan.id}`);
    if (res.success) load();
    else alert(res.error?.message || 'Cannot delete');
  };

  const toggleActive = async (plan: any) => {
    await api.patch(`/admin/amc/plans/${plan.id}`, { isActive: !plan.isActive });
    load();
  };

  if (loading) return <ProcessLoader title="Loading AMC plans..." />;

  return (
    <div className="space-y-6">
      <PageHeader title="AMC Plans" actions={<button onClick={openCreate} className="bg-blue-600 text-white rounded px-4 py-2 text-sm">+ New Plan</button>} />
      <DataTable
        keyField="id"
        columns={[
          { key: 'planName', header: 'Plan Name' },
          { key: 'vehicleType', header: 'Type' },
          { key: 'ccRange', header: 'CC Range' },
          { key: 'durationMonths', header: 'Duration', render: (row: any) => `${row.durationMonths} mo` },
          { key: 'totalServicesIncluded', header: 'Services' },
          { key: 'price', header: 'Price', render: (row: any) => `₹${Number(row.price).toLocaleString()}` },
          { key: '_count', header: 'Contracts', render: (row: any) => row._count?.contracts ?? 0 },
          { key: 'isActive', header: 'Status', render: (row: any) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
          { key: 'actions', header: '', render: (row: any) => (
            <div className="flex gap-2">
              <button onClick={(e) => { e.stopPropagation(); openEdit(row); }} className="text-blue-600 text-xs hover:underline">Edit</button>
              <button onClick={(e) => { e.stopPropagation(); toggleActive(row); }} className="text-yellow-600 text-xs hover:underline">{row.isActive ? 'Deactivate' : 'Activate'}</button>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(row); }} className="text-red-600 text-xs hover:underline">Delete</button>
            </div>
          )},
        ]}
        data={data}
      />

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit Plan' : 'Create Plan'}>
        <div className="space-y-3">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" placeholder="Plan Name" value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })} />
          <select className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
            <option value="BIKE">Bike</option><option value="SCOOTY">Scooty</option>
          </select>
          <select className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" value={form.ccRange} onChange={(e) => setForm({ ...form, ccRange: e.target.value })}>
            <option value="">Select CC Range</option>
            <option value="100-125cc">100-125cc</option>
            <option value="150cc+">150cc+</option>
            <option value="220cc+">220cc+</option>
            <option value="350cc+">350cc+</option>
            <option value="650cc+">650cc+</option>
          </select>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-xs text-gray-500">Duration (months)</label><input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" type="number" value={form.durationMonths} onChange={(e) => setForm({ ...form, durationMonths: e.target.value })} /></div>
            <div><label className="text-xs text-gray-500">No. of Services</label><input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" type="number" value={form.totalServicesIncluded} onChange={(e) => setForm({ ...form, totalServicesIncluded: e.target.value })} /></div>
            <div><label className="text-xs text-gray-500">Price (₹)</label><input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-gray-500">Extra Parts Discount (%)</label><input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" type="number" step="0.01" min="0" max="100" value={form.extraDiscountPercent} onChange={(e) => setForm({ ...form, extraDiscountPercent: e.target.value })} /></div>
            <div><label className="text-xs text-gray-500">Labor Discount (%)</label><input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" type="number" step="0.01" min="0" max="100" value={form.laborDiscountPercent} onChange={(e) => setForm({ ...form, laborDiscountPercent: e.target.value })} /></div>
          </div>
          <textarea className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <textarea className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" placeholder="Exclusions" value={form.exclusions} onChange={(e) => setForm({ ...form, exclusions: e.target.value })} />
          <button disabled={saving || !form.planName || !form.price} onClick={handleSave} className="w-full bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">
            {saving ? 'Saving...' : editId ? 'Update Plan' : 'Create Plan'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
