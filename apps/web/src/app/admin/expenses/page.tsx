'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function ExpensesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ expenseDate: '', categoryId: '', title: '', amount: '', vendorName: '', paymentMode: 'CASH', notes: '' });
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ expenseDate: '', categoryId: '', title: '', amount: '', vendorName: '', paymentMode: 'CASH', notes: '' });
  const [editSaving, setEditSaving] = useState(false);

  const load = (s = search, cat = catFilter) => {
    const p = new URLSearchParams();
    if (s) p.set('search', s);
    if (cat) p.set('categoryId', cat);
    api.get<any>(`/admin/expenses?${p}`).then((r) => { if (r.success) setData(r.data?.items ?? r.data ?? []); setLoading(false); });
  };
  useEffect(() => { load(); api.get<any>('/admin/expenses/categories').then((r) => { if (r.success) setCategories(r.data ?? []); }); }, []);

  const openCreate = async () => {
    setShowCreate(true); setError('');
    const res = await api.get<any>('/admin/expenses?categoryId=_categories');
    // Try to get categories from a separate endpoint or extract from existing data
    if (categories.length === 0) {
      const catRes = await api.get<any>('/admin/expenses?pageSize=200');
      if (catRes.success) {
        const cats = new Map();
        (catRes.data?.items ?? catRes.data ?? []).forEach((e: any) => { if (e.category) cats.set(e.category.categoryName, e.categoryId); });
        setCategories(Array.from(cats, ([name, id]) => ({ id, categoryName: name })));
      }
    }
  };

  const submit = async () => {
    if (!form.expenseDate || !form.categoryId || !form.title || !form.amount) { setError('Fill required fields'); return; }
    setSaving(true); setError('');
    const res = await api.post<any>('/admin/expenses', { ...form, amount: Number(form.amount) });
    setSaving(false);
    if (res.success) { setShowCreate(false); setForm({ expenseDate: '', categoryId: '', title: '', amount: '', vendorName: '', paymentMode: 'CASH', notes: '' }); load(); }
    else setError(res.error?.message || 'Failed');
  };

  const deleteExpense = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this expense?')) return;
    const res = await api.delete<any>(`/admin/expenses/${id}`);
    if (res.success) load();
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setEditForm({
      expenseDate: item.expenseDate ? new Date(item.expenseDate).toISOString().split('T')[0] : '',
      categoryId: item.categoryId || '', title: item.title || '', amount: String(Number(item.amount) || ''),
      vendorName: item.vendorName || '', paymentMode: item.paymentMode || 'CASH', notes: item.notes || '',
    });
    if (categories.length === 0) loadCategories();
  };

  const loadCategories = async () => {
    const catRes = await api.get<any>('/admin/expenses?pageSize=200');
    if (catRes.success) {
      const cats = new Map();
      (catRes.data?.items ?? catRes.data ?? []).forEach((e: any) => { if (e.category) cats.set(e.category.categoryName, e.categoryId); });
      setCategories(Array.from(cats, ([name, id]) => ({ id, categoryName: name })));
    }
  };

  const saveEdit = async () => {
    if (!editItem) return;
    setEditSaving(true);
    const res = await api.patch(`/admin/expenses/${editItem.id}`, { ...editForm, amount: Number(editForm.amount) });
    setEditSaving(false);
    if (res.success) { setEditItem(null); load(); }
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Expenses" />
        <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ Add Expense</button>
      </div>
      <div className="flex gap-2 mb-4">
        <input className={inputCls + ' max-w-xs'} placeholder="Search expenses..." value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value, catFilter); }} />
        <select className={inputCls + ' w-48'} value={catFilter} onChange={(e) => { setCatFilter(e.target.value); load(search, e.target.value); }}>
          <option value="">All Categories</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.categoryName}</option>)}
        </select>
      </div>
      <DataTable columns={[
        { key: 'expenseDate', header: 'Date', render: (r: any) => new Date(r.expenseDate).toLocaleDateString() },
        { key: 'title', header: 'Title' },
        { key: 'category', header: 'Category', render: (r: any) => r.category?.categoryName },
        { key: 'amount', header: 'Amount', render: (r: any) => `₹${Number(r.amount)}` },
        { key: 'vendorName', header: 'Vendor' },
        { key: 'paymentMode', header: 'Mode' },
        { key: 'actions', header: '', render: (r: any) => <button onClick={(e) => deleteExpense(r.id, e)} className="text-xs text-red-500 hover:underline">Delete</button> },
      ]} data={data} keyField="id" onRowClick={openEdit} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Expense">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Date *</label><input type="date" className={inputCls} value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Amount *</label><input type="number" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Title *</label><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className="block text-xs font-medium mb-1">Category *</label>
            <select className={inputCls} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Select...</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.categoryName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Vendor</label><input className={inputCls} value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Payment Mode</label>
              <select className={inputCls} value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
                <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Notes</label><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button onClick={submit} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Creating...' : 'Add Expense'}</button>
        </div>
      </Modal>
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Expense">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Date</label><input type="date" className={inputCls} value={editForm.expenseDate} onChange={(e) => setEditForm({ ...editForm, expenseDate: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Amount</label><input type="number" className={inputCls} value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Title</label><input className={inputCls} value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></div>
          <div><label className="block text-xs font-medium mb-1">Category</label>
            <select className={inputCls} value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}>
              <option value="">Select...</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.categoryName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Vendor</label><input className={inputCls} value={editForm.vendorName} onChange={(e) => setEditForm({ ...editForm, vendorName: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Payment Mode</label>
              <select className={inputCls} value={editForm.paymentMode} onChange={(e) => setEditForm({ ...editForm, paymentMode: e.target.value })}>
                <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Notes</label><textarea className={inputCls} rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></div>
          <button onClick={saveEdit} disabled={editSaving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{editSaving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </Modal>
    </div>
  );
}
