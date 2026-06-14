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
import { InventoryEditModal } from '@/components/inventory/edit-modal';
import { AlertTriangle, FolderOpen, Building2, List as ListIcon, MoreVertical } from 'lucide-react';
import { getBrandStyle, getBrandInitial } from '@/lib/brand-logos';

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
  const [vehicleBrands, setVehicleBrands] = useState<any[]>([]);
  const [vehicleModels, setVehicleModels] = useState<any[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [editModelIds, setEditModelIds] = useState<string[]>([]);
  const [itemMenuOpen, setItemMenuOpen] = useState<string | null>(null);
  const timer = useRef<NodeJS.Timeout>();

  const loadLookups = async () => {
    if (categories.length && suppliers.length) return;
    const [catRes, supRes] = await Promise.all([api.get<any>('/admin/inventory/categories'), api.get<any>('/admin/inventory/suppliers')]);
    if (catRes.success) setCategories(catRes.data ?? []);
    if (supRes.success) setSuppliers(supRes.data ?? []);
  };

  const loadVehicleCatalog = async () => {
    if (vehicleBrands.length) return;
    const res = await api.get<any>('/admin/inventory/catalog?level=brands');
    if (res.success) {
      setVehicleBrands(res.data);
      // Load all models for all brands
      const allModels: any[] = [];
      for (const b of res.data) {
        const mRes = await api.get<any>(`/admin/inventory/catalog?level=models&brandId=${b.id}`);
        if (mRes.success) allModels.push(...mRes.data.map((m: any) => ({ ...m, brandId: b.id, brandName: b.name })));
      }
      setVehicleModels(allModels);
    }
  };

  const load = useCallback((s = search, p = page, cat = categoryFilter) => {
    const params = new URLSearchParams();
    if (s) params.set('search', s);
    if (cat) params.set('categoryId', cat);
    if (viewMode === 'list') {
      params.set('page', String(p));
    } else {
      params.set('pageSize', '500');
    }
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
  }, [search, page, categoryFilter, viewMode]);

  useEffect(() => { load(); }, [page, viewMode]);

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
    if (selectedModelIds.length) body.modelIds = selectedModelIds;
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    const res = await api.post('/admin/inventory/items', body);
    setCreating(false);
    if (res.success) { setShowCreate(false); setForm({ sku: '', itemName: '', categoryId: '', supplierId: '', unit: '', brand: '', costPrice: '', mrp: '', sellingPrice: '', discountPercent: '', quantityInStock: '', variablePrice: false, isBranded: true }); setSelectedModelIds([]); load(); }
    else { setCreateError(res.error?.message || 'Failed to create item'); }
  };

  const openEdit = async (item: any) => {
    setEditItem(item);
    setEditForm({
      itemName: item.itemName || '', categoryId: item.categoryId || '', supplierId: item.supplierId || '', unit: item.unit || '', brand: item.brand || '',
      costPrice: String(Number(item.costPrice) || ''), mrp: String(Number(item.mrp) || ''), sellingPrice: String(Number(item.sellingPrice) || ''), discountPercent: String(Number(item.discountPercent) || ''),
      reorderLevel: item.reorderLevel != null ? String(Number(item.reorderLevel)) : '', storageLocation: item.storageLocation || '', isActive: item.isActive ?? true, variablePrice: item.variablePrice ?? false, isBranded: item.isBranded ?? true,
    });
    loadLookups();
    loadVehicleCatalog();
    const res = await api.get<any>(`/admin/inventory/items/${item.id}`);
    if (res.success && res.data.vehicleModels) {
      setEditModelIds(res.data.vehicleModels.map((vm: any) => vm.vehicleModelId));
    } else {
      setEditModelIds([]);
    }
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
      modelIds: editModelIds,
    };
    const res = await api.patch(`/admin/inventory/items/${editItem.id}`, body);
    setEditSaving(false);
    if (res.success) { setEditItem(null); load(); }
  };

  const openStock = (item: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStockItem(item);
    setStockForm({ type: 'STOCK_IN', quantity: '', reason: '' });
    setItemMenuOpen(null);
  };

  const deleteItem = async (item: any) => {
    if (!confirm(`Delete "${item.itemName}"? This cannot be undone.`)) return;
    setItemMenuOpen(null);
    await api.delete(`/admin/inventory/items/${item.id}`);
    load();
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
    { key: 'sku', header: 'SKU' },
    { key: 'itemName', header: 'Item', render: (r: any) => <span title={r.itemName}>{r.itemName}</span> },
    { key: 'brand', header: 'Company', render: (r: any) => r.brand || '—' },
    { key: 'category', header: 'Category', render: (r: any) => r.category?.categoryName || '—' },
    { key: 'quantityInStock', header: 'Stock', render: (r: any) => {
      const qty = Number(r.quantityInStock);
      const low = r.reorderLevel && qty <= Number(r.reorderLevel);
      return <span className={qty <= 0 ? 'text-red-600 font-medium' : low ? 'text-amber-600 font-medium' : ''}>{qty}</span>;
    }},
    { key: 'costPrice', header: 'Purchase (₹)', render: (r: any) => `₹${Number(r.costPrice)}` },
    { key: 'sellingPrice', header: 'Selling (₹)', render: (r: any) => {
      const dp = Number(r.discountPercent) || 0;
      const price = Number(r.sellingPrice);
      return dp ? <span>₹{(price * (1 - dp/100)).toFixed(0)} <span className="text-xs text-gray-400 line-through">₹{price}</span></span> : <span>₹{price}</span>;
    }},
    { key: 'actions', header: '', render: (r: any) => (
      <div className="relative" onClick={e => e.stopPropagation()}>
        <button onClick={() => setItemMenuOpen(itemMenuOpen === r.id ? null : r.id)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"><MoreVertical size={16} /></button>
        {itemMenuOpen === r.id && (
          <>
          <div className="fixed inset-0 z-40" onClick={() => setItemMenuOpen(null)} />
          <div className="absolute right-0 top-8 z-50 w-44 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
            <button onClick={() => { setItemMenuOpen(null); openEdit(r); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">✏️ Edit</button>
            <button onClick={() => openStock(r)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">📦 Adjust Stock</button>
            <button onClick={() => { setItemMenuOpen(null); navigator.clipboard.writeText(r.sku); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">📋 Copy SKU</button>
            <button onClick={() => deleteItem(r)} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">🗑️ Delete</button>
          </div>
          </>
        )}
      </div>
    )},
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

  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white";
  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

  const viewBtnCls = (active: boolean) => `px-3 py-1.5 rounded-lg text-sm font-medium border transition ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`;

  return (
    <div>
      <PageHeader title="Inventory Items" />
      <ListToolbar searchPlaceholder="Search items..." onSearch={onSearch} onCreateClick={() => { loadLookups(); loadVehicleCatalog(); setShowCreate(true); }} createLabel="Create Item" />

      {/* View mode toggle + category filter */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          <button onClick={() => { setViewMode('list'); setExpandedGroup(null); }} className={viewBtnCls(viewMode === 'list')}><span className="inline-flex items-center gap-1.5"><ListIcon size={14} /> List</span></button>
          <button onClick={() => { setViewMode('category'); setExpandedGroup(null); }} className={viewBtnCls(viewMode === 'category')}><span className="inline-flex items-center gap-1.5"><FolderOpen size={14} /> Category</span></button>
          <button onClick={() => { setViewMode('company'); setExpandedGroup(null); }} className={viewBtnCls(viewMode === 'company')}><span className="inline-flex items-center gap-1.5"><Building2 size={14} /> Company</span></button>
        </div>
        <select className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); load(search, 1, e.target.value); }} onFocus={loadLookups}>
          <option value="">All Categories</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.categoryName}</option>)}
        </select>
      </div>

      {loading ? <ProcessLoader title="Loading inventory" steps={['Fetching items', 'Preparing list']} /> : viewMode === 'list' ? (
        <DataTable columns={columns} data={data} keyField="id" onRowClick={openEdit} />
      ) : expandedGroup ? (
        <div>
          <button onClick={() => setExpandedGroup(null)} className="mb-3 text-sm text-blue-600 hover:underline flex items-center gap-1">← Back to all {viewMode === 'category' ? 'categories' : 'companies'}</button>
          <h3 className="text-lg font-bold mb-3">{expandedGroup} <span className="text-sm font-normal text-gray-400">({(viewMode === 'category' ? groupedByCategory : groupedByCompany)[expandedGroup]?.length || 0} items)</span></h3>
          <DataTable columns={columns} data={(viewMode === 'category' ? groupedByCategory : groupedByCompany)[expandedGroup] || []} keyField="id" onRowClick={openEdit} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Object.entries(viewMode === 'category' ? groupedByCategory : groupedByCompany)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([group, items]) => (
            <button key={group} onClick={() => setExpandedGroup(group)} className="aspect-square rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition flex flex-col items-center justify-center text-center">
              {viewMode === 'company' ? (
                <span className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mb-2" style={{ color: getBrandStyle(group).color, backgroundColor: getBrandStyle(group).bg }}>{getBrandInitial(group)}</span>
              ) : (
                <span className="text-2xl mb-2">📂</span>
              )}
              <span className="font-medium text-sm leading-tight">{group}</span>
              <span className="text-xs text-gray-400 mt-1">{(items as any[]).length} items</span>
            </button>
          ))}
        </div>
      )}
      {viewMode === 'list' && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateError(null); }} title="Create Item">
        <form onSubmit={onSubmit} className="space-y-3">
          {createError && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">{createError}</div>}
          <div><label className="block text-xs font-medium mb-1">SKU <span className="text-red-500">*</span></label><input className={inputCls} placeholder="SKU" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
          <div><label className="block text-xs font-medium mb-1">Item Name <span className="text-red-500">*</span></label><input className={inputCls} placeholder="Item Name" required value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} /></div>
          <div><label className="block text-xs font-medium mb-1">Company / Brand</label><input className={inputCls} list="brand-options" placeholder="e.g. Hero, Honda, Bajaj" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /><datalist id="brand-options">{[...new Set(data.map((i: any) => i.brand).filter(Boolean))].sort().map((b: string) => <option key={b} value={b} />)}</datalist></div>
          <div><label className="block text-xs font-medium mb-1">Compatible Models</label>
            <div className="max-h-32 overflow-y-auto border rounded-lg p-2 space-y-1 bg-gray-50 dark:bg-gray-800">
              {vehicleBrands.filter(b => !form.brand || b.name.toLowerCase() === form.brand.toLowerCase()).map((b: any) => (
                <div key={b.id}>
                  <div className="text-xs font-semibold text-gray-500 mt-1">{b.name}</div>
                  {vehicleModels.filter((m: any) => m.brandId === b.id).map((m: any) => (
                    <label key={m.id} className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 px-1 rounded">
                      <input type="checkbox" checked={selectedModelIds.includes(m.id)} onChange={(e) => setSelectedModelIds(e.target.checked ? [...selectedModelIds, m.id] : selectedModelIds.filter(x => x !== m.id))} className="rounded" />
                      {m.name}
                    </label>
                  ))}
                </div>
              ))}
              {vehicleBrands.length === 0 && <span className="text-xs text-gray-400">Loading models...</span>}
            </div>
            {selectedModelIds.length > 0 && <span className="text-xs text-blue-600">{selectedModelIds.length} selected</span>}
          </div>
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
            <input className={inputCls} placeholder="MRP" type="number" step="0.01" value={form.mrp} onChange={(e) => { const mrp = e.target.value; const dp = Number(form.discountPercent) || 0; const sp = mrp ? String((Number(mrp) * (1 - dp / 100)).toFixed(2)) : form.sellingPrice; setForm({ ...form, mrp, sellingPrice: sp }); }} />
            <input className={inputCls} placeholder="Selling Price" type="number" step="0.01" required value={form.sellingPrice} onChange={(e) => { const sp = e.target.value; const mrp = Number(form.mrp); const dp = mrp && Number(sp) ? String(((1 - Number(sp) / mrp) * 100).toFixed(1)) : form.discountPercent; setForm({ ...form, sellingPrice: sp, discountPercent: dp }); }} />
            <input className={inputCls} placeholder="Discount %" type="number" step="0.01" min="0" max="100" value={form.discountPercent} onChange={(e) => { const dp = e.target.value; const mrp = Number(form.mrp); const sp = mrp ? String((mrp * (1 - Number(dp) / 100)).toFixed(2)) : form.sellingPrice; setForm({ ...form, discountPercent: dp, sellingPrice: sp }); }} />
          </div>
          <input className={inputCls} placeholder="Initial Stock Quantity" type="number" required value={form.quantityInStock} onChange={(e) => setForm({ ...form, quantityInStock: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.variablePrice} onChange={(e) => setForm({ ...form, variablePrice: e.target.checked })} className="rounded" /><span>Variable price (enter price at sale time)</span></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isBranded} onChange={(e) => setForm({ ...form, isBranded: e.target.checked })} className="rounded" /><span>Branded product</span></label>
          <button type="submit" disabled={creating} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">{creating ? 'Creating...' : 'Create'}</button>
        </form>
      </Modal>
      <InventoryEditModal itemId={editItem?.id || null} onClose={() => setEditItem(null)} onSaved={load} />
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
