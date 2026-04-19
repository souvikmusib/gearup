'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { Modal } from '@/components/shared/modal';

export default function InventoryItemsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ sku: '', itemName: '', categoryId: '', unit: '', costPrice: '', sellingPrice: '', quantityInStock: '' });
  const timer = useRef<NodeJS.Timeout>();

  const load = useCallback((s = search, p = page) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (s) params.set('search', s);
    params.set('page', String(p));
    const endpoint = `/admin/inventory/items?${params.toString()}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) {
      setData(cached.data?.items ?? cached.data ?? []);
      setTotalPages(cached.data?.totalPages ?? 1);
      setLoading(false);
    }
    promise.then((res) => {
      if (res.success) { setData(res.data?.items ?? res.data ?? []); setTotalPages(res.data?.totalPages ?? 1); }
      setLoading(false);
    });
  }, [search, page]);

  useEffect(() => { load(); }, [page]);

  const onSearch = useCallback((q: string) => {
    setSearch(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPage(1); load(q, 1); }, 300);
  }, [load]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...form, costPrice: Number(form.costPrice), sellingPrice: Number(form.sellingPrice), quantityInStock: Number(form.quantityInStock) };
    const res = await api.post('/admin/inventory/items', body);
    if (res.success) { setShowCreate(false); setForm({ sku: '', itemName: '', categoryId: '', unit: '', costPrice: '', sellingPrice: '', quantityInStock: '' }); load(); }
  };

  const columns = [
    { key: 'sku', header: 'SKU' }, { key: 'itemName', header: 'Item' }, { key: 'category', header: 'Category', render: (r: any) => r.category?.categoryName },
    { key: 'quantityInStock', header: 'Stock', render: (r: any) => Number(r.quantityInStock) }, { key: 'sellingPrice', header: 'Price', render: (r: any) => `₹${Number(r.sellingPrice)}` },
    { key: 'lowStock', header: 'Low?', render: (r: any) => r.reorderLevel && Number(r.quantityInStock) <= Number(r.reorderLevel) ? '⚠️' : '—' },
  ];

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white";

  return (
    <div>
      <PageHeader title="Inventory Items" />
      <ListToolbar searchPlaceholder="Search items..." onSearch={onSearch} onCreateClick={() => setShowCreate(true)} createLabel="Create Item" />
      {loading ? <p className="py-8 text-center text-gray-500">Loading...</p> :
        <DataTable columns={columns} data={data} keyField="id" />}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Item">
        <form onSubmit={onSubmit} className="space-y-3">
          <input className={inputCls} placeholder="SKU" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <input className={inputCls} placeholder="Item Name" required value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
          <input className={inputCls} placeholder="Category ID" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} />
          <input className={inputCls} placeholder="Unit (e.g. pcs, litre)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <input className={inputCls} placeholder="Cost Price" type="number" step="0.01" required value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
          <input className={inputCls} placeholder="Selling Price" type="number" step="0.01" required value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
          <input className={inputCls} placeholder="Quantity in Stock" type="number" required value={form.quantityInStock} onChange={(e) => setForm({ ...form, quantityInStock: e.target.value })} />
          <button type="submit" className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">Create</button>
        </form>
      </Modal>
    </div>
  );
}
