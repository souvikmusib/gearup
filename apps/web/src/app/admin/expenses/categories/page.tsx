'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function ExpenseCategoriesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ categoryName: '', description: '' });
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ categoryName: '', description: '' });
  const [saving, setSaving] = useState(false);

  const load = () => api.get<any>('/admin/expenses/categories').then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const res = await api.post('/admin/expenses/categories', form);
    setSaving(false);
    if (res.success) { setShowCreate(false); setForm({ categoryName: '', description: '' }); load(); }
  };

  const openEdit = (item: any) => { setEditItem(item); setEditForm({ categoryName: item.categoryName || '', description: item.description || '' }); };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const res = await api.patch(`/admin/expenses/categories/${editItem.id}`, editForm);
    setSaving(false);
    if (res.success) { setEditItem(null); load(); }
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this category? Expenses using it will be affected.')) return;
    const res = await api.delete<any>(`/admin/expenses/categories/${id}`);
    if (res.success) load();
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Expense Categories" />
        <button onClick={() => setShowCreate(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ Add Category</button>
      </div>
      <DataTable columns={[
        { key: 'categoryName', header: 'Category' },
        { key: 'description', header: 'Description', render: (r: any) => r.description || '—' },
        { key: 'count', header: 'Expenses', render: (r: any) => r._count?.expenses ?? 0 },
        { key: 'actions', header: '', render: (r: any) => <button onClick={(e) => remove(r.id, e)} className="text-xs text-red-500 hover:underline">Delete</button> },
      ]} data={data} keyField="id" onRowClick={openEdit} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Expense Category">
        <form onSubmit={submit} className="space-y-3">
          <input className={inputCls} placeholder="Category Name" required value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })} />
          <input className={inputCls} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button type="submit" disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Creating...' : 'Create'}</button>
        </form>
      </Modal>
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Expense Category">
        <form onSubmit={saveEdit} className="space-y-3">
          <input className={inputCls} placeholder="Category Name" required value={editForm.categoryName} onChange={(e) => setEditForm({ ...editForm, categoryName: e.target.value })} />
          <input className={inputCls} placeholder="Description" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          <button type="submit" disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        </form>
      </Modal>
    </div>
  );
}
