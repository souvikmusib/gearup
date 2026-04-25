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
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [form, setForm] = useState({ sku: '', itemName: '', categoryId: '', supplierId: '', unit: '', costPrice: '', sellingPrice: '', quantityInStock: '' });
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ itemName: '', categoryId: '', supplierId: '', unit: '', costPrice: '', sellingPrice: '', reorderLevel: '', storageLocation: '', isActive: true });
  const [editSaving, setEditSaving] = useState(false);
  const [stockItem, setStockItem] = useState<any>(null);
  const [stockForm, setStockForm] = useState({ type: 'STOCK_IN', quantity: '', reason: '' });
  const [stockSaving, setStockSaving] = useState(false);
  const timer = useRef<NodeJS.Timeout>();

  const loadLookups = async () => {
    if (categories.length && suppliers.length) return;
    const [catRes, supRes] = await Promise.all([api.get<any>('/admin/inventory/categories'), api.get<any>('/admin/inventory/suppliers')]);
    if (catRes.success) setCategories(catRes.data ?? []);
    if (supRes.success) setSuppliers(supRes.data ?? []);
  };

  const load = useCallback((s = search, p = page) => {
    const params = new URLSearchParams();
    if (s) params.set('search', s);
    params.set('page', String(p));
    const endpoint = `/admin/inventory/items?${params.toString()}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) {
      setData(cached.data?.items ?? cached.data ?? []);
      setTotalPages(cached.data?.totalPages ?? 1);
      setLoading(false);
    } else {
      setLoading(true);
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
    const body: Record<string, unknown> = { ...form, costPrice: Number(form.costPrice), sellingPrice: Number(form.sellingPrice), quantityInStock: Number(form.quantityInStock) };
    if (!body.supplierId) delete body.supplierId;
    const res = await api.post('/admin/inventory/items', body);
    if (res.success) { setShowCreate(false); setForm({ sku: '', itemName: '', categoryId: '', supplierId: '', unit: '', costPrice: '', sellingPrice: '', quantityInStock: '' }); load(); }
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setEditForm({
      itemName: item.itemName || '', categoryId: item.categoryId || '', supplierId: item.supplierId || '', unit: item.unit || '',
      costPrice: String(Number(item.costPrice) || ''), sellingPrice: String(Number(item.sellingPrice) || ''),
      reorderLevel: item.reorderLevel != null ? String(Number(item.reorderLevel)) : '', storageLocation: item.storageLocation || '', isActive: item.isActive ?? true,
    });
    loadLookups();
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    setEditSaving(true);
    const body: Record<string, unknown> = {
      itemName: editForm.itemName, categoryId: editForm.categoryId, supplierId: editForm.supplierId || null, unit: editForm.unit,
      costPrice: Number(editForm.costPrice), sellingPrice: Number(editForm.sellingPrice),
      reorderLevel: editForm.reorderLevel ? Number(editForm.reorderLevel) : null,
      storageLocation: editForm.storageLocation || null, isActive: editForm.isActive,
    };
    const res = await api.patch(`/admin/inventory/items/${editItem.id}`, body);
    setEditSaving(false);
    if (res.success) { setEditItem(null); load(); }
  };

  const openStock = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setStockItem(item);
    setStockForm({ type: 'STOCK_IN', quantity: '', reason: '' });
  };

  const submitStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockItem || !stockForm.quantity) return;
    setStockSaving(true);
    const res = await api.post(`/admin/inventory/items/${stockItem.id}/stock`, { type: stockForm.type, quantity: Number(stockForm.quantity), reason: stockForm.reason || undefined });
    setStockSaving(false);
    if (res.success) { setStockItem(null); load(); }
  };

  const columns = [
    { key: 'sku', header: 'SKU' }, { key: 'itemName', header: 'Item' }, { key: 'category', header: 'Category', render: (r: any) => r.category?.categoryName },
    { key: 'quantityInStock', header: 'Stock', render: (r: any) => Number(r.quantityInStock) }, { key: 'sellingPrice', header: 'Price', render: (r: any) => `₹${Number(r.sellingPrice)}` },
    { key: 'lowStock', header: 'Low?', render: (r: any) => r.reorderLevel && Number(r.quantityInStock) <= Number(r.reorderLevel) ? '⚠️' : '—' },
    { key: 'actions', header: '', render: (r: any) => <button onClick={(e) => openStock(r, e)} className="text-xs text-blue-600 hover:underline">Adjust</button> },
  ];

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white";
  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

  return (
    <div>
      <PageHeader title="Inventory Items" />
      <ListToolbar searchPlaceholder="Search items..." onSearch={onSearch} onCreateClick={() => setShowCreate(true)} createLabel="Create Item" />
      {loading ? <p className="py-8 text-center text-gray-500">Loading...</p> :
        <DataTable columns={columns} data={data} keyField="id" onRowClick={openEdit} />}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Item">
        <form onSubmit={onSubmit} className="space-y-3">
          <input className={inputCls} placeholder="SKU" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <input className={inputCls} placeholder="Item Name" required value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Category *</label>
              <select className={inputCls} required value={form.categoryId} onFocus={loadLookups} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Select...</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.categoryName}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Supplier</label>
              <select className={inputCls} value={form.supplierId} onFocus={loadLookups} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">None</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.supplierName}</option>)}
              </select>
            </div>
          </div>
          <input className={inputCls} placeholder="Unit (e.g. pcs, litre)" required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Cost Price" type="number" step="0.01" required value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
            <input className={inputCls} placeholder="Selling Price" type="number" step="0.01" required value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
          </div>
          <input className={inputCls} placeholder="Initial Stock Quantity" type="number" required value={form.quantityInStock} onChange={(e) => setForm({ ...form, quantityInStock: e.target.value })} />
          <button type="submit" className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">Create</button>
        </form>
      </Modal>
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`Edit: ${editItem?.sku ?? ''}`}>
        <form onSubmit={saveEdit} className="space-y-3">
          <div><label className={labelCls}>Item Name</label><input className={inputCls} required value={editForm.itemName} onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Category</label>
              <select className={inputCls} value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}>
                <option value="">Select...</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.categoryName}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Supplier</label>
              <select className={inputCls} value={editForm.supplierId} onChange={(e) => setEditForm({ ...editForm, supplierId: e.target.value })}>
                <option value="">None</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.supplierName}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Cost Price</label><input className={inputCls} type="number" step="0.01" value={editForm.costPrice} onChange={(e) => setEditForm({ ...editForm, costPrice: e.target.value })} /></div>
            <div><label className={labelCls}>Selling Price</label><input className={inputCls} type="number" step="0.01" value={editForm.sellingPrice} onChange={(e) => setEditForm({ ...editForm, sellingPrice: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Unit</label><input className={inputCls} required value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} /></div>
            <div><label className={labelCls}>Reorder Level</label><input className={inputCls} type="number" value={editForm.reorderLevel} onChange={(e) => setEditForm({ ...editForm, reorderLevel: e.target.value })} /></div>
          </div>
          <div><label className={labelCls}>Storage Location</label><input className={inputCls} value={editForm.storageLocation} onChange={(e) => setEditForm({ ...editForm, storageLocation: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} className="rounded" />
            Active
          </label>
          <button type="submit" disabled={editSaving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {editSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </Modal>
      <Modal open={!!stockItem} onClose={() => setStockItem(null)} title={`Adjust Stock: ${stockItem?.itemName ?? ''}`}>
        <p className="text-sm text-gray-500 mb-3">Current stock: <span className="font-semibold">{stockItem ? Number(stockItem.quantityInStock) : 0}</span></p>
        <form onSubmit={submitStock} className="space-y-3">
          <div><label className={labelCls}>Type</label>
            <select className={inputCls} value={stockForm.type} onChange={(e) => setStockForm({ ...stockForm, type: e.target.value })}>
              <option value="STOCK_IN">Stock In (received from supplier)</option>
              <option value="STOCK_OUT">Stock Out (damaged / lost)</option>
              <option value="ADJUSTMENT_INCREASE">Adjustment +</option>
              <option value="ADJUSTMENT_DECREASE">Adjustment −</option>
            </select>
          </div>
          <div><label className={labelCls}>Quantity</label><input className={inputCls} type="number" min="0.01" step="0.01" required value={stockForm.quantity} onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })} /></div>
          <div><label className={labelCls}>Reason</label><input className={inputCls} placeholder="e.g. Received from ABC Supplier" value={stockForm.reason} onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })} /></div>
          <button type="submit" disabled={stockSaving} className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {stockSaving ? 'Saving...' : 'Submit Adjustment'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
