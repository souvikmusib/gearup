'use client';
import { formatIST } from '@/lib/time';
import { toTitleCase } from '@/lib/title-case';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable } from '@gearup/ui';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { Modal } from '@/components/shared/modal';
import { InventoryItemForm, EMPTY_FORM, type InventoryItemFormData } from '@/components/inventory/inventory-item-form';
import { AlertTriangle, FolderOpen, Building2, List as ListIcon, MoreVertical } from 'lucide-react';
import { getBrandStyle, getBrandInitial } from '@/lib/brand-logos';
import { useAuth } from '@/lib/auth/auth-context';
import { PERMISSIONS } from '@gearup/types';

export default function InventoryItemsPage() {
  const { hasPermission } = useAuth();
  const canHardDelete = hasPermission(PERMISSIONS.INVENTORY_HARD_DELETE);
  const canViewCost = hasPermission(PERMISSIONS.INVENTORY_VIEW_COST);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [hsnRates, setHsnRates] = useState<{ hsnCode: string; rate: number; description: string | null }[]>([]);
  const [form, setForm] = useState<InventoryItemFormData>(EMPTY_FORM);
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState<InventoryItemFormData>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [stockItem, setStockItem] = useState<any>(null);
  const [stockForm, setStockForm] = useState({ type: 'STOCK_IN', quantity: '', reason: '', costPrice: '', sellingPrice: '', mrp: '', supplierId: '', purchaseRef: '', expiryDate: '' });
  const [stockSaving, setStockSaving] = useState(false);
  const [batchesItem, setBatchesItem] = useState<any>(null);
  const [batchesData, setBatchesData] = useState<any>(null);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'category' | 'company'>('list');
  const [vehicleBrands, setVehicleBrands] = useState<any[]>([]);
  const [vehicleModels, setVehicleModels] = useState<any[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [editModelIds, setEditModelIds] = useState<string[]>([]);
  const [itemMenuOpen, setItemMenuOpen] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const timer = useRef<NodeJS.Timeout>();

  const loadLookups = async () => {
    if (categories.length && suppliers.length) return;
    const [catRes, supRes, hsnRes] = await Promise.all([api.get<any>('/admin/inventory/categories'), api.get<any>('/admin/inventory/suppliers'), api.get<any>('/admin/hsn-rates')]);
    if (catRes.success) setCategories(catRes.data ?? []);
    if (supRes.success) setSuppliers(supRes.data ?? []);
    if (hsnRes.success) setHsnRates(hsnRes.data ?? []);
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
    if (!canViewCost) delete body.costPrice;
    if (form.discountPercent) body.discountPercent = Number(form.discountPercent); else delete body.discountPercent;
    if (form.amcDiscountPercent) body.amcDiscountPercent = Number(form.amcDiscountPercent); else delete body.amcDiscountPercent;
    if (form.reorderLevel) body.reorderLevel = Number(form.reorderLevel); else delete body.reorderLevel;
    if (!body.supplierId) delete body.supplierId;
    if (selectedModelIds.length) body.modelIds = selectedModelIds;
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    const res = await api.post('/admin/inventory/items', body);
    setCreating(false);
    if (res.success) { setShowCreate(false); setForm(EMPTY_FORM); setSelectedModelIds([]); load(); }
    else { setCreateError(res.error?.message || 'Failed to create item'); }
  };

  const openEdit = async (item: any) => {
    setEditItem(item);
    setEditForm({
      sku: item.sku || '', itemName: item.itemName || '', categoryId: item.categoryId || '', supplierId: item.supplierId || '', unit: item.unit || '', brand: item.brand || '',
      costPrice: String(Number(item.costPrice) || ''), mrp: String(Number(item.mrp) || ''), sellingPrice: String(Number(item.sellingPrice) || ''), discountPercent: String(Number(item.discountPercent) || ''),
      amcDiscountPercent: String(Number(item.amcDiscountPercent) || ''),
      quantityInStock: String(Number(item.quantityInStock) || ''),
      reorderLevel: item.reorderLevel != null ? String(Number(item.reorderLevel)) : '', storageLocation: item.storageLocation || '', hsnCode: item.hsnCode || '', isActive: item.isActive ?? true, variablePrice: item.variablePrice ?? false, isBranded: item.isBranded ?? true,
    });
    loadLookups();
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
      sku: editForm.sku || undefined,
      itemName: editForm.itemName, categoryId: editForm.categoryId || undefined, supplierId: editForm.supplierId || null, unit: editForm.unit || undefined,
      brand: editForm.brand || null, costPrice: Number(editForm.costPrice), mrp: editForm.mrp ? Number(editForm.mrp) : null, sellingPrice: Number(editForm.sellingPrice), discountPercent: editForm.discountPercent ? Number(editForm.discountPercent) : null,
      amcDiscountPercent: editForm.amcDiscountPercent ? Number(editForm.amcDiscountPercent) : null,
      reorderLevel: editForm.reorderLevel ? Number(editForm.reorderLevel) : null,
      storageLocation: editForm.storageLocation || null, hsnCode: editForm.hsnCode || null, isActive: editForm.isActive, variablePrice: editForm.variablePrice, isBranded: editForm.isBranded,
      modelIds: editModelIds,
    };
    if (!canViewCost) delete body.costPrice;
    const res = await api.patch(`/admin/inventory/items/${editItem.id}`, body);
    setEditSaving(false);
    if (res.success) { setEditItem(null); load(); }
  };

  const openStock = (item: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStockItem(item);
    setStockForm({ type: 'STOCK_IN', quantity: '', reason: '', costPrice: '', sellingPrice: '', mrp: '', supplierId: '', purchaseRef: '', expiryDate: '' });
    setItemMenuOpen(null);
  };

  const deleteItem = async (item: any) => {
    if (!confirm(`Delete "${item.itemName}"? Items with stock history will be deactivated instead.`)) return;
    setItemMenuOpen(null);
    const res = await api.delete<any>(`/admin/inventory/items/${item.id}`);
    if (res.success) {
      if (res.data?.message?.includes('deactivated')) alert('Item deactivated (has stock movement history). It will no longer appear in the list.');
      load();
    }
    else alert(res.error?.message || 'Failed to delete item');
  };

  const hardDeleteItem = async (item: any) => {
    if (!confirm(`⚠️ PERMANENTLY DELETE "${item.itemName}" (${item.sku})?\n\nThis will remove the item AND all related stock movements, job card parts, and model associations.\n\nThis action is IRREVERSIBLE.`)) return;
    if (!confirm(`Are you absolutely sure? Type OK to confirm you want to permanently erase "${item.itemName}" and all its history.`)) return;
    setItemMenuOpen(null);
    const res = await api.post<any>(`/admin/inventory/items/${item.id}/hard-delete`, {});
    if (res.success) {
      load();
    } else {
      alert(res.error?.message || 'Failed to hard-delete item');
    }
  };

  const submitStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockItem || !stockForm.quantity) return;
    setStockSaving(true);
    const payload: any = { type: stockForm.type, quantity: Number(stockForm.quantity), reason: stockForm.reason || undefined };
    if (stockForm.type === 'STOCK_IN') {
      if (stockForm.costPrice) payload.costPrice = Number(stockForm.costPrice);
      if (stockForm.sellingPrice) payload.sellingPrice = Number(stockForm.sellingPrice);
      if (stockForm.mrp) payload.mrp = Number(stockForm.mrp);
      if (stockForm.supplierId) payload.supplierId = stockForm.supplierId;
      if (stockForm.purchaseRef) payload.purchaseRef = stockForm.purchaseRef;
      if (stockForm.expiryDate) payload.expiryDate = new Date(stockForm.expiryDate).toISOString();
    }
    const res = await api.post(`/admin/inventory/items/${stockItem.id}/stock`, payload);
    setStockSaving(false);
    if (res.success) { setStockItem(null); load(); }
  };

  const openBatches = async (item: any) => {
    setBatchesItem(item);
    setBatchesLoading(true);
    const res = await api.get<any>(`/admin/inventory/items/${item.id}/batches?includeExhausted=true`);
    setBatchesLoading(false);
    if (res.success) setBatchesData(res.data);
  };

  const columns = [
    { key: 'sku', header: 'SKU' },
    { key: 'itemName', header: 'Item', render: (r: any) => <span title={r.itemName}>{r.itemName}</span> },
    { key: 'brand', header: 'Company', render: (r: any) => r.brand || '—' },
    { key: 'category', header: 'Category', render: (r: any) => r.category?.categoryName || '—' },
    { key: 'hsnCode', header: 'GST', nowrap: true, render: (r: any) => r.hsnCode ? <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-900/20 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">{r.hsnCode}</span> : <span className="text-xs text-gray-300">No GST</span> },
    { key: 'quantityInStock', header: 'Stock', render: (r: any) => {
      const qty = Number(r.quantityInStock);
      const low = r.reorderLevel && qty <= Number(r.reorderLevel);
      return <span className={qty <= 0 ? 'text-red-600 font-medium' : low ? 'text-amber-600 font-medium' : ''}>{qty}</span>;
    }},
    { key: 'storageLocation', header: 'Location', render: (r: any) => r.storageLocation || '—' },
    ...(canViewCost ? [{ key: 'costPrice', header: 'Purchase (₹)', render: (r: any) => `₹${Number(r.costPrice)}` }] : []),
    { key: 'sellingPrice', header: 'Selling (₹)', render: (r: any) => {
      const mrp = Number(r.mrp) || 0;
      const price = Number(r.sellingPrice);
      const amcDisc = Number(r.amcDiscountPercent) || 0;
      const amcPrice = mrp && amcDisc ? (mrp * (1 - amcDisc / 100)).toFixed(0) : null;
      return <div>{mrp && mrp > price ? <span>₹{price} <span className="text-xs text-gray-400 line-through">₹{mrp}</span></span> : <span>₹{price}</span>}{amcPrice && <div className="text-[10px] text-purple-600">AMC ₹{amcPrice}</div>}</div>;
    }},
    { key: 'actions', header: '', render: (r: any) => (
      <div className="relative" onClick={e => e.stopPropagation()}>
        <button onClick={(e) => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenuPos({ top: rect.bottom + 4, left: rect.left - 140 }); setItemMenuOpen(itemMenuOpen === r.id ? null : r.id); }} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"><MoreVertical size={16} /></button>
        {itemMenuOpen === r.id && (
          <>
          <div className="fixed inset-0 z-40" onClick={() => setItemMenuOpen(null)} />
          <div className="fixed z-50 w-44 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1" style={{ top: menuPos.top, left: menuPos.left }}>
            <button onClick={() => { setItemMenuOpen(null); openEdit(r); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">✏️ Edit</button>
            <button onClick={() => openStock(r)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">📦 Adjust Stock</button>
            <button onClick={() => { setItemMenuOpen(null); openBatches(r); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">📊 View Batches</button>
            <button onClick={() => { setItemMenuOpen(null); navigator.clipboard.writeText(r.sku); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">📋 Copy SKU</button>
            <button onClick={() => deleteItem(r)} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">🗑️ Delete</button>
            {canHardDelete && <button onClick={() => hardDeleteItem(r)} className="w-full text-left px-4 py-2 text-sm text-red-700 font-medium hover:bg-red-50 dark:hover:bg-red-900/20">⛔ Hard Delete</button>}
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
      <ListToolbar searchPlaceholder="Search items..." onSearch={onSearch} onCreateClick={() => { loadLookups(); setShowCreate(true); }} createLabel="Create Item" />

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
        <InventoryItemForm
          mode="create"
          form={form}
          onChange={setForm}
          modelIds={selectedModelIds}
          onModelIdsChange={setSelectedModelIds}
          categories={categories}
          suppliers={suppliers}
          hsnRates={hsnRates}
          brandSuggestions={[...new Set(data.map((i: any) => i.brand).filter(Boolean))].sort() as string[]}
          showCostPrice={canViewCost}
          submitting={creating}
          error={createError}
          onSubmit={onSubmit}
        />
      </Modal>
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`Edit: ${editItem?.sku || ''}`}>
        <InventoryItemForm
          mode="edit"
          form={editForm}
          onChange={setEditForm}
          modelIds={editModelIds}
          onModelIdsChange={setEditModelIds}
          categories={categories}
          suppliers={suppliers}
          hsnRates={hsnRates}
          brandSuggestions={[...new Set(data.map((i: any) => i.brand).filter(Boolean))].sort() as string[]}
          showCostPrice={canViewCost}
          submitting={editSaving}
          onSubmit={saveEdit}
        />
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
          {stockForm.type === 'STOCK_IN' && (
            <div className="space-y-3 border-t pt-3 mt-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Batch Details</p>
              <div className="grid grid-cols-3 gap-2">
                <div><label className={labelCls}>Cost Price (₹)</label><input className={inputCls} type="number" min="0.01" step="0.01" placeholder={stockItem ? `₹${Number(stockItem.costPrice)}` : ''} value={stockForm.costPrice} onChange={(e) => setStockForm({ ...stockForm, costPrice: e.target.value })} /></div>
                <div><label className={labelCls}>MRP (₹)</label><input className={inputCls} type="number" min="0.01" step="0.01" placeholder={stockItem?.mrp ? `₹${Number(stockItem.mrp)}` : 'MRP'} value={stockForm.mrp} onChange={(e) => setStockForm({ ...stockForm, mrp: e.target.value })} /></div>
                <div><label className={labelCls}>Selling Price (₹)</label><input className={inputCls} type="number" min="0.01" step="0.01" placeholder={stockItem ? `₹${Number(stockItem.sellingPrice)}` : ''} value={stockForm.sellingPrice} onChange={(e) => setStockForm({ ...stockForm, sellingPrice: e.target.value })} /></div>
              </div>
              <p className="text-xs text-gray-400">Prices apply to this batch only. Old stock keeps its original prices.</p>
              <div><label className={labelCls}>Supplier</label>
                <select className={inputCls} value={stockForm.supplierId} onChange={(e) => setStockForm({ ...stockForm, supplierId: e.target.value })}>
                  <option value="">— Same as item / None —</option>
                  {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.supplierName}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Purchase Ref / Invoice No.</label><input className={inputCls} placeholder="e.g. INV-2026-456" value={stockForm.purchaseRef} onChange={(e) => setStockForm({ ...stockForm, purchaseRef: e.target.value })} /></div>
              <div><label className={labelCls}>Expiry Date (optional)</label><input className={inputCls} type="date" value={stockForm.expiryDate} onChange={(e) => setStockForm({ ...stockForm, expiryDate: e.target.value })} /></div>
            </div>
          )}
          <div><label className={labelCls}>Reason / Reference</label><input className={inputCls} placeholder="e.g. PO #123 from ABC Supplier, or damage report" value={stockForm.reason} onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })} /></div>
          <button type="submit" disabled={stockSaving} className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {stockSaving ? 'Saving...' : 'Record Movement'}
          </button>
        </form>
      </Modal>
      <Modal open={!!batchesItem} onClose={() => { setBatchesItem(null); setBatchesData(null); }} title={`Stock Batches: ${batchesItem?.itemName ?? ''}`}>
        {batchesLoading && <p className="text-sm text-gray-500">Loading batches...</p>}
        {batchesData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <p className="text-xs text-gray-500">Total Remaining</p>
                <p className="font-semibold text-lg">{batchesData.summary.totalRemaining}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                <p className="text-xs text-gray-500">Stock Value</p>
                <p className="font-semibold text-lg">₹{batchesData.summary.totalValue.toLocaleString()}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                <p className="text-xs text-gray-500">Avg Cost</p>
                <p className="font-semibold text-lg">₹{batchesData.summary.weightedAvgCost}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">Total Batches</p>
                <p className="font-semibold text-lg">{batchesData.summary.totalBatches}</p>
              </div>
            </div>
            {batchesData.summary.expiredBatches > 0 && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
                <AlertTriangle size={14} /> {batchesData.summary.expiredBatches} expired batch(es)
              </div>
            )}
            {batchesData.summary.nearExpiryBatches > 0 && (
              <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2">
                <AlertTriangle size={14} /> {batchesData.summary.nearExpiryBatches} batch(es) expiring within 30 days
              </div>
            )}
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Batch Breakdown (oldest first)</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {batchesData.batches.length === 0 && <p className="text-sm text-gray-400">No batches found. Run migration or add stock.</p>}
                {batchesData.batches.map((b: any) => (
                  <div key={b.id} className={`text-sm border rounded-lg p-3 ${b.remainingQty === 0 ? 'opacity-50' : ''} ${b.isExpired ? 'border-red-300 bg-red-50/50 dark:bg-red-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium">{b.batchNumber}</span>
                        {b.supplier && <span className="text-xs text-gray-500 ml-2">({b.supplier.supplierName})</span>}
                      </div>
                      <span className="text-xs text-gray-400">{b.ageDays}d old</span>
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-gray-600 dark:text-gray-400">
                      <span>Cost: <span className="font-medium">₹{b.costPrice}</span> | Sell: <span className="font-medium">₹{b.sellingPrice}</span> | MRP: <span className="font-medium">{b.mrp || '—'}</span></span>
                      <span>Remaining: <span className="font-medium">{b.remainingQty}</span>/{b.initialQty}</span>
                      {b.expiryDate && <span className={b.isExpired ? 'text-red-600' : b.isNearExpiry ? 'text-yellow-600' : ''}>Exp: {formatIST(b.expiryDate)}</span>}
                    </div>
                    {b.purchaseRef && <p className="text-xs text-gray-400 mt-1">Ref: {b.purchaseRef}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
