'use client';
import { toTitleCase } from '@/lib/title-case';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable } from '@gearup/ui';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { Modal } from '@/components/shared/modal';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { AlertTriangle, FolderOpen, Building2, List as ListIcon } from 'lucide-react';

export default function InventoryItemsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [form, setForm] = useState({ sku: '', itemName: '', categoryId: '', supplierId: '', unit: '', brand: '', costPrice: '', mrp: '', sellingPrice: '', discountPercent: '', quantityInStock: '', variablePrice: false, isBranded: true });
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ itemName: '', categoryId: '', supplierId: '', unit: '', brand: '', costPrice: '', mrp: '', sellingPrice: '', discountPercent: '', reorderLevel: '', storageLocation: '', isActive: true, variablePrice: false, isBranded: true });
  const [editSaving, setEditSaving] = useState(false);
  const [stockItem, setStockItem] = useState<any>(null);
  const [stockForm, setStockForm] = useState({ type: 'STOCK_IN', quantity: '', reason: '' });
  const [stockSaving, setStockSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'category' | 'company'>('list');
  const timer = useRef<NodeJS.Timeout>();

  const loadLookups = async () => {
    if (categories.length && suppliers.length) return;
    const [catRes, supRes] = await Promise.all([api.get<any>('/admin/inventory/categories'), api.get<any>('/admin/inventory/suppliers')]);
    if (catRes.success) setCategories(catRes.data ?? []);
    if (supRes.success) setSuppliers(supRes.data ?? []);
  };

  const load = useCallback((s = search, p = page, cat = categoryFilter) => {
    const params = new URLSearchParams();
    if (s) params.set('search', s);
    if (cat) params.set('categoryId', cat);
    params.set('page', String(p));
    const endpoint = `/admin/inventory/items?${params.toString()}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) {
      setData(cached.data?.items ?? cached.data ?? []);
      setTotalPages(cached.meta?.totalPages ?? 1);
      setLoading(false);
    } else {
      setLoading(true);
    }
    promise.then((res) => {
      if (res.success) { setData(res.data?.items ?? res.data ?? []); setTotalPages(res.meta?.totalPages ?? 1); }
      setLoading(false);
    });
  }, [search, page, categoryFilter]);

  useEffect(() => { load(); }, [page]);

  const onSearch = useCallback((q: string) => {
    setSearch(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPage(1); load(q, 1); }, 300);
  }, [load]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { ...form, costPrice: Number(form.costPrice), mrp: form.mrp ? Number(form.mrp) : undefined, sellingPrice: Number(form.sellingPrice), quantityInStock: Number(form.quantityInStock) };
    if (form.discountPercent) body.discountPercent = Number(form.discountPercent);
    if (!body.supplierId) delete body.supplierId;
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    const res = await api.post('/admin/inventory/items', body);
    setCreating(false);
    if (res.success) { setShowCreate(false); setForm({ sku: '', itemName: '', categoryId: '', supplierId: '', unit: '', brand: '', costPrice: '', mrp: '', sellingPrice: '', discountPercent: '', quantityInStock: '', variablePrice: false, isBranded: true }); load(); }
    else { setCreateError(res.error?.message || 'Failed to create item'); }
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setEditForm({
      itemName: item.itemName || '', categoryId: item.categoryId || '', supplierId: item.supplierId || '', unit: item.unit || '', brand: item.brand || '',
      costPrice: String(Number(item.costPrice) || ''), mrp: String(Number(item.mrp) || ''), sellingPrice: String(Number(item.sellingPrice) || ''), discountPercent: String(Number(item.discountPercent) || ''),
      reorderLevel: item.reorderLevel != null ? String(Number(item.reorderLevel)) : '', storageLocation: item.storageLocation || '', isActive: item.isActive ?? true, variablePrice: item.variablePrice ?? false, isBranded: item.isBranded ?? true,
    });
    loadLookups();
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    setEditSaving(true);
    const body: Record<string, unknown> = {
      itemName: editForm.itemName, categoryId: editForm.categoryId, supplierId: editForm.supplierId || null, unit: editForm.unit,
      brand: editForm.brand || null, costPrice: Number(editForm.costPrice), mrp: editForm.mrp ? Number(editForm.mrp) : null, sellingPrice: Number(editForm.sellingPrice), discountPercent: editForm.discountPercent ? Number(editForm.discountPercent) : null,
      reorderLevel: editForm.reorderLevel ? Number(editForm.reorderLevel) : null,
      storageLocation: editForm.storageLocation || null, isActive: editForm.isActive, variablePrice: editForm.variablePrice, isBranded: editForm.isBranded,
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
    { key: 'sku', header: 'SKU' }, { key: 'itemName', header: 'Item' }, { key: 'brand', header: 'Company', render: (r: any) => r.brand || '—' }, { key: 'category', header: 'Category', render: (r: any) => r.category?.categoryName },
    { key: 'quantityInStock', header: 'Stock', render: (r: any) => Number(r.quantityInStock) }, { key: 'mrp', header: 'MRP', render: (r: any) => r.mrp ? `₹${Number(r.mrp)}` : '—' }, { key: 'sellingPrice', header: 'Selling Price', render: (r: any) => `₹${Number(r.sellingPrice)}` },
    { key: 'discountedPrice', header: 'Discounted Price', render: (r: any) => { const dp = Number(r.discountPercent) || 0; const price = Number(r.sellingPrice) * (1 - dp / 100); return dp ? `₹${price.toFixed(0)} (${dp}% off)` : `₹${Number(r.sellingPrice)}`; } },
    { key: 'lowStock', header: 'Low?', render: (r: any) => r.reorderLevel && Number(r.quantityInStock) <= Number(r.reorderLevel) ? <AlertTriangle size={14} className="text-amber-500" /> : '—' },
    { key: 'actions', header: '', render: (r: any) => <button onClick={(e) => openStock(r, e)} className="text-xs text-blue-600 hover:underline">Stock Movement</button> },
  ];

  // Group data for card views
  const groupedByCategory = data.reduce((acc: Record<string, any[]>, item: any) => {
    const key = item.category?.categoryName || 'Uncategorized';
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});
  const groupedByCompany = data.reduce((acc: Record<string, any[]>, item: any) => {
    const key = item.brand || 'Unbranded';
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white";
  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

  const viewBtnCls = (active: boolean) => `px-3 py-1.5 rounded-lg text-sm font-medium border transition ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`;

  return (
    <div>
      <PageHeader title="Inventory Items" />
      <ListToolbar searchPlaceholder="Search items..." onSearch={onSearch} onCreateClick={() => { loadLookups(); setShowCreate(true); }} createLabel="Create Item" />

      {/* View mode toggle + category filter */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          <button onClick={() => setViewMode('list')} className={viewBtnCls(viewMode === 'list')}><span className="inline-flex items-center gap-1.5"><ListIcon size={14} /> List</span></button>
          <button onClick={() => setViewMode('category')} className={viewBtnCls(viewMode === 'category')}><span className="inline-flex items-center gap-1.5"><FolderOpen size={14} /> Category</span></button>
          <button onClick={() => setViewMode('company')} className={viewBtnCls(viewMode === 'company')}><span className="inline-flex items-center gap-1.5"><Building2 size={14} /> Company</span></button>
        </div>
        <select className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); load(search, 1, e.target.value); }} onFocus={loadLookups}>
          <option value="">All Categories</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.categoryName}</option>)}
        </select>
      </div>

      {loading ? <ProcessLoader title="Loading inventory" steps={['Fetching items', 'Preparing list']} /> : viewMode === 'list' ? (
        <DataTable columns={columns} data={data} keyField="id" onRowClick={openEdit} />
      ) : (
        <div className="space-y-6">
          {Object.entries(viewMode === 'category' ? groupedByCategory : groupedByCompany)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([group, items]) => (
            <div key={group}>
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-2">{viewMode === 'category' ? <FolderOpen size={16} className="text-blue-600" /> : <Building2 size={16} className="text-blue-600" />} {group}</span>
                <span className="text-xs font-normal text-gray-400">({(items as any[]).length} items)</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {(items as any[]).map((item: any) => (
                  <div key={item.id} onClick={() => openEdit(item)} className="cursor-pointer rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{toTitleCase(item.itemName)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{item.sku}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${Number(item.quantityInStock) <= 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : Number(item.quantityInStock) <= (Number(item.reorderLevel) || 3) ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                        {Number(item.quantityInStock)} in stock
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                      {item.brand && <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{toTitleCase(item.brand)}</span>}
                      <span>₹{Number(item.sellingPrice)}</span>
                      {Number(item.discountPercent) > 0 && <span className="text-green-600">{Number(item.discountPercent)}% off</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateError(null); }} title="Create Item">
        <form onSubmit={onSubmit} className="space-y-3">
          {createError && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">{createError}</div>}
          <div><label className="block text-xs font-medium mb-1">SKU <span className="text-red-500">*</span></label><input className={inputCls} placeholder="SKU" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
          <div><label className="block text-xs font-medium mb-1">Item Name <span className="text-red-500">*</span></label><input className={inputCls} placeholder="Item Name" required value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} /></div>
          <div><label className="block text-xs font-medium mb-1">Company / Brand</label><input className={inputCls} placeholder="e.g. Hero, Honda, Bajaj" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Category <span className="text-red-500">*</span></label>
              <SearchableSelect
                options={categories.map((c: any) => ({ value: c.id, label: c.categoryName }))}
                value={form.categoryId}
                onChange={(v) => setForm({ ...form, categoryId: v })}
                placeholder="Select category…"
              />
            </div>
            <div><label className={labelCls}>Supplier</label>
              <SearchableSelect
                options={[{ value: '', label: 'None' }, ...suppliers.map((s: any) => ({ value: s.id, label: s.supplierName, sublabel: s.phone }))]}
                value={form.supplierId}
                onChange={(v) => setForm({ ...form, supplierId: v })}
                placeholder="Select supplier…"
              />
            </div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Unit <span className="text-red-500">*</span></label><input className={inputCls} placeholder="e.g. pcs, litre" required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Cost Price" type="number" step="0.01" required value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
            <input className={inputCls} placeholder="MRP" type="number" step="0.01" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} />
            <input className={inputCls} placeholder="Selling Price" type="number" step="0.01" required value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
            <input className={inputCls} placeholder="Discount %" type="number" step="0.01" min="0" max="100" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} />
          </div>
          <input className={inputCls} placeholder="Initial Stock Quantity" type="number" required value={form.quantityInStock} onChange={(e) => setForm({ ...form, quantityInStock: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.variablePrice} onChange={(e) => setForm({ ...form, variablePrice: e.target.checked })} className="rounded" /><span>Variable price (enter price at sale time)</span></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isBranded} onChange={(e) => setForm({ ...form, isBranded: e.target.checked })} className="rounded" /><span>Branded product</span></label>
          <button type="submit" disabled={creating} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">{creating ? 'Creating...' : 'Create'}</button>
        </form>
      </Modal>
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`Edit: ${editItem?.sku ?? ''}`}>
        <form onSubmit={saveEdit} className="space-y-3">
          <div><label className={labelCls}>Item Name</label><input className={inputCls} required value={editForm.itemName} onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })} /></div>
          <div><label className={labelCls}>Company / Brand</label><input className={inputCls} placeholder="e.g. Hero, Honda, Bajaj" value={editForm.brand} onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Category</label>
              <SearchableSelect
                options={categories.map((c: any) => ({ value: c.id, label: c.categoryName }))}
                value={editForm.categoryId}
                onChange={(v) => setEditForm({ ...editForm, categoryId: v })}
                placeholder="Select category…"
              />
            </div>
            <div><label className={labelCls}>Supplier</label>
              <SearchableSelect
                options={[{ value: '', label: 'None' }, ...suppliers.map((s: any) => ({ value: s.id, label: s.supplierName, sublabel: s.phone }))]}
                value={editForm.supplierId}
                onChange={(v) => setEditForm({ ...editForm, supplierId: v })}
                placeholder="Select supplier…"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Cost Price</label><input className={inputCls} type="number" step="0.01" value={editForm.costPrice} onChange={(e) => setEditForm({ ...editForm, costPrice: e.target.value })} /></div>
            <div><label className={labelCls}>MRP</label><input className={inputCls} type="number" step="0.01" value={editForm.mrp} onChange={(e) => setEditForm({ ...editForm, mrp: e.target.value })} /></div>
            <div><label className={labelCls}>Selling Price</label><input className={inputCls} type="number" step="0.01" value={editForm.sellingPrice} onChange={(e) => setEditForm({ ...editForm, sellingPrice: e.target.value })} /></div>
            <div><label className={labelCls}>Discount %</label><input className={inputCls} type="number" step="0.01" min="0" max="100" value={editForm.discountPercent} onChange={(e) => setEditForm({ ...editForm, discountPercent: e.target.value })} /></div>
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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editForm.variablePrice} onChange={(e) => setEditForm({ ...editForm, variablePrice: e.target.checked })} className="rounded" />
            Variable price (enter price at sale time)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editForm.isBranded} onChange={(e) => setEditForm({ ...editForm, isBranded: e.target.checked })} className="rounded" />
            Branded product
          </label>
          <button type="submit" disabled={editSaving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {editSaving ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={async () => { if (!confirm('Delete this item?')) return; const res = await api.delete(`/admin/inventory/items/${editItem?.id}`); if (res.success) { setEditItem(null); load(); } else alert(res.error?.message || 'Cannot delete'); }} className="w-full mt-2 rounded-lg py-2 text-sm font-medium text-red-600 border border-red-300 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900/20">Delete Item</button>
        </form>
      </Modal>
      <Modal open={!!stockItem} onClose={() => setStockItem(null)} title={`Stock Movement: ${stockItem?.itemName ?? ''}`}>
        <p className="text-sm text-gray-500 mb-3">Current stock: <span className="font-semibold">{stockItem ? Number(stockItem.quantityInStock) : 0}</span></p>
        <form onSubmit={submitStock} className="space-y-3">
          <div><label className={labelCls}>Movement Type</label>
            <select className={inputCls} value={stockForm.type} onChange={(e) => setStockForm({ ...stockForm, type: e.target.value })}>
              <option value="STOCK_IN">Stock In — received from supplier</option>
              <option value="STOCK_OUT">Stock Out — sold / issued</option>
              <option value="ADJUSTMENT_INCREASE">Adjustment + — physical count higher</option>
              <option value="ADJUSTMENT_DECREASE">Adjustment − — damage / loss / count lower</option>
            </select>
          </div>
          <div><label className={labelCls}>Quantity</label><input className={inputCls} type="number" min="0.01" step="0.01" required value={stockForm.quantity} onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })} /></div>
          <div><label className={labelCls}>Reason / Reference</label><input className={inputCls} placeholder="e.g. PO #123 from ABC Supplier, or damage report" value={stockForm.reason} onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })} /></div>
          <button type="submit" disabled={stockSaving} className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {stockSaving ? 'Saving...' : 'Record Movement'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
