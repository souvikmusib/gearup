'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

const empty = { supplierName: '', phone: '', email: '', address: '', contactPerson: '', notes: '' };

export default function SuppliersPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);

  const load = () => {
    const { cached, promise } = api.getSWR<any>('/admin/inventory/suppliers');
    if (cached?.success) { setData(cached.data ?? []); setLoading(false); }
    else setLoading(true);
    promise.then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const res = await api.post('/admin/inventory/suppliers', form);
    setSaving(false);
    if (res.success) { setShowCreate(false); setForm({ ...empty }); load(); }
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setEditForm({ supplierName: item.supplierName || '', phone: item.phone || '', email: item.email || '', address: item.address || '', contactPerson: item.contactPerson || '', notes: item.notes || '' });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const res = await api.patch(`/admin/inventory/suppliers/${editItem.id}`, editForm);
    setSaving(false);
    if (res.success) { setEditItem(null); load(); }
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this supplier?')) return;
    const res = await api.delete<any>(`/admin/inventory/suppliers/${id}`);
    if (res.success) load();
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

  const fields = (f: typeof form, set: (v: typeof form) => void) => (
    <div className="space-y-3">
      <div><label className={labelCls}>Supplier Name *</label><input className={inputCls} required value={f.supplierName} onChange={(e) => set({ ...f, supplierName: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Phone</label><input className={inputCls} value={f.phone} onChange={(e) => set({ ...f, phone: e.target.value })} /></div>
        <div><label className={labelCls}>Email</label><input className={inputCls} value={f.email} onChange={(e) => set({ ...f, email: e.target.value })} /></div>
      </div>
      <div><label className={labelCls}>Contact Person</label><input className={inputCls} value={f.contactPerson} onChange={(e) => set({ ...f, contactPerson: e.target.value })} /></div>
      <div><label className={labelCls}>Address</label><input className={inputCls} value={f.address} onChange={(e) => set({ ...f, address: e.target.value })} /></div>
      <div><label className={labelCls}>Notes</label><textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => set({ ...f, notes: e.target.value })} /></div>
    </div>
  );

  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Suppliers" />
        <button onClick={() => setShowCreate(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ Add Supplier</button>
      </div>
      <DataTable columns={[
        { key: 'supplierName', header: 'Name' },
        { key: 'phone', header: 'Phone' },
        { key: 'contactPerson', header: 'Contact' },
        { key: 'email', header: 'Email', render: (r: any) => r.email || '—' },
        { key: 'items', header: 'Items', render: (r: any) => r._count?.items ?? 0 },
        { key: 'actions', header: '', render: (r: any) => <button onClick={(e) => remove(r.id, e)} className="text-xs text-red-500 hover:underline">Delete</button> },
      ]} data={data} keyField="id" onRowClick={openEdit} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Supplier">
        <form onSubmit={submit}>
          {fields(form, setForm)}
          <button type="submit" disabled={saving} className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Creating...' : 'Create'}</button>
        </form>
      </Modal>
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Supplier">
        <form onSubmit={saveEdit}>
          {fields(editForm, setEditForm)}
          <button type="submit" disabled={saving} className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        </form>
      </Modal>
    </div>
  );
}
