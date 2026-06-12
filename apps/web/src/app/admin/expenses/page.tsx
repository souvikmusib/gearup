'use client';
import { formatIST, formatTimeIST } from '@/lib/time';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';
import { Pagination } from '@/components/shared/pagination';
import { ListToolbar } from '@/components/shared/list-toolbar';

export default function ExpensesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const catFilter = filters.categoryId ?? '';
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ expenseDate: '', categoryId: '', title: '', amount: '', vendorName: '', paymentMode: 'CASH', notes: '' });
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ expenseDate: '', categoryId: '', title: '', amount: '', vendorName: '', paymentMode: 'CASH', notes: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const load = (s = search, f = filters, pg = page) => {
    const p = new URLSearchParams();
    if (s) p.set('search', s);
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    p.set('page', String(pg));
    const endpoint = `/admin/expenses?${p.toString()}`;
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
  useEffect(() => {
    load();
    const { cached, promise } = api.getSWR<any>('/admin/expenses/categories');
    if (cached?.success) setCategories(cached.data ?? []);
    promise.then((r) => { if (r.success) setCategories(r.data ?? []); });
  }, [page, filters]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (v: string) => {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(v, filters, 1), 300);
  };
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const openCreate = async () => {
    setShowCreate(true); setError('');
    if (categories.length === 0) {
      await loadCategories();
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
    setEditError('');
    setEditForm({
      expenseDate: item.expenseDate ? new Date(item.expenseDate).toISOString().split('T')[0] : '',
      categoryId: item.categoryId || '', title: item.title || '', amount: String(Number(item.amount) || ''),
      vendorName: item.vendorName || '', paymentMode: item.paymentMode || 'CASH', notes: item.notes || '',
    });
    if (categories.length === 0) loadCategories();
  };

  const loadCategories = async () => {
    const catRes = await api.get<any>('/admin/expenses/categories');
    if (catRes.success) {
      setCategories(catRes.data ?? []);
    }
  };

  const saveEdit = async () => {
    if (!editItem) return;
    if (!editForm.expenseDate || !editForm.categoryId || !editForm.title || !editForm.amount) { setEditError('Fill required fields'); return; }
    const amt = Number(editForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) { setEditError('Amount must be greater than 0'); return; }
    setEditSaving(true); setEditError('');
    const res = await api.patch<any>(`/admin/expenses/${editItem.id}`, { ...editForm, amount: amt });
    setEditSaving(false);
    if (res.success) { setEditItem(null); load(); }
    else setEditError(res.error?.message || 'Failed to save');
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  if (loading) return <ProcessLoader title="Loading expenses" steps={['Fetching expense records', 'Preparing list']} />;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Expenses" />
        <div className="flex gap-2">
          <a href="/admin/expenses/categories" className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-800">Manage Categories</a>
          <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ Add Expense</button>
        </div>
      </div>
      <ListToolbar
        searchPlaceholder="Search expenses..."
        onSearch={(s) => { setSearch(s); setPage(1); load(s, filters, 1); }}
        filters={[
          { label: 'Category', value: 'categoryId', options: categories.map((c: any) => ({ value: c.id, label: c.categoryName })) },
          { label: 'Payment Mode', value: 'paymentMode', options: [
            { value: 'CASH', label: 'Cash' },
            { value: 'UPI', label: 'UPI' },
            { value: 'CARD', label: 'Card' },
            { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
          ] },
        ]}
        filterValues={filters}
        dateRange={{ fromKey: 'from', toKey: 'to', label: 'Expense date' }}
        onFilterChange={(k, v) => { setFilters((prev) => ({ ...prev, [k]: v })); setPage(1); }}
      />
      <DataTable columns={[
        { key: 'expenseDate', header: 'Date', render: (r: any) => formatIST(r.expenseDate) },
        { key: 'title', header: 'Title' },
        { key: 'category', header: 'Category', render: (r: any) => r.category?.categoryName },
        { key: 'amount', header: 'Amount', render: (r: any) => `₹${Number(r.amount)}` },
        { key: 'vendorName', header: 'Vendor' },
        { key: 'paymentMode', header: 'Mode' },
        { key: 'actions', header: '', render: (r: any) => <button onClick={(e) => deleteExpense(r.id, e)} className="text-xs text-red-500 hover:underline">Delete</button> },
      ]} data={data} keyField="id" onRowClick={openEdit} />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Expense">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Date <span className="text-red-500">*</span></label><input type="date" className={inputCls} value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Amount <span className="text-red-500">*</span></label><input type="number" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Title <span className="text-red-500">*</span></label><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className="block text-xs font-medium mb-1">Category <span className="text-red-500">*</span></label>
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
          {editError && <p className="text-sm text-red-600">{editError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Date <span className="text-red-500">*</span></label><input type="date" className={inputCls} value={editForm.expenseDate} onChange={(e) => setEditForm({ ...editForm, expenseDate: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Amount <span className="text-red-500">*</span></label><input type="number" min="0.01" step="0.01" className={inputCls} value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Title <span className="text-red-500">*</span></label><input className={inputCls} value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></div>
          <div><label className="block text-xs font-medium mb-1">Category <span className="text-red-500">*</span></label>
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
