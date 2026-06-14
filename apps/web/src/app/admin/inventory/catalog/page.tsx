'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api/client';
import { toTitleCase } from '@/lib/title-case';
import { ProcessLoader } from '@/components/shared/process-loader';
import { Pagination } from '@/components/shared/pagination';
import { ChevronRight, Package, Search, ArrowLeft, MoreVertical, X } from 'lucide-react';
import Link from 'next/link';

type Brand = { id: string; name: string; logoUrl: string | null; modelCount: number; itemCount: number };
type Model = { id: string; name: string; engineCC: number | null; itemCount: number };
type Category = { id: string; categoryName: string; itemCount: number };
type Item = { id: string; sku: string; itemName: string; sellingPrice: number; mrp: number | null; quantityInStock: number; reorderLevel: number | null; category: { categoryName: string } };

export default function CatalogPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');

  // Kebab menu & actions
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [viewModelsFor, setViewModelsFor] = useState<{ id: string; name: string; models: string[] } | null>(null);
  const [stockItem, setStockItem] = useState<{ id: string; name: string } | null>(null);
  const [stockForm, setStockForm] = useState({ type: 'STOCK_IN', quantity: '', reason: '' });
  const [stockSaving, setStockSaving] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ itemName: '', brand: '', costPrice: '', mrp: '', sellingPrice: '', discountPercent: '' });
  const [editSaving, setEditSaving] = useState(false);

  // Navigation state
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const level = selectedCategory ? 'items' : selectedModel ? 'categories' : selectedBrand ? 'models' : 'brands';

  const loadBrands = useCallback(async () => {
    setLoading(true);
    const res = await api.get<any>('/admin/inventory/catalog?level=brands');
    if (res.success) setBrands(res.data);
    setLoading(false);
  }, []);

  const loadModels = useCallback(async (brandId: string) => {
    setLoading(true);
    const res = await api.get<any>(`/admin/inventory/catalog?level=models&brandId=${brandId}`);
    if (res.success) setModels(res.data);
    setLoading(false);
  }, []);

  const loadCategories = useCallback(async (modelId: string) => {
    setLoading(true);
    const res = await api.get<any>(`/admin/inventory/catalog?level=categories&modelId=${modelId}`);
    if (res.success) setCategories(res.data);
    setLoading(false);
  }, []);

  const loadItems = useCallback(async (p = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '25' });
    if (selectedBrand) params.set('brandId', selectedBrand.id);
    if (selectedModel) params.set('modelId', selectedModel.id);
    if (selectedCategory) params.set('categoryId', selectedCategory.id);
    if (search) params.set('search', search);
    const res = await api.get<any>(`/admin/inventory/items?${params}`);
    if (res.success) {
      setItems(res.data);
      setTotalPages(res.meta?.totalPages || 1);
      setTotal(res.meta?.total || 0);
    }
    setLoading(false);
  }, [selectedBrand, selectedModel, selectedCategory, search]);

  useEffect(() => { loadBrands(); }, [loadBrands]);

  const selectBrand = (b: Brand) => { setSelectedBrand(b); setSelectedModel(null); setSelectedCategory(null); loadModels(b.id); };
  const selectModel = (m: Model) => { setSelectedModel(m); setSelectedCategory(null); loadCategories(m.id); };
  const selectCategory = (c: Category) => { setSelectedCategory(c); setPage(1); };
  useEffect(() => { if (selectedCategory) loadItems(1); }, [selectedCategory, loadItems]);

  const goBack = () => {
    if (selectedCategory) { setSelectedCategory(null); }
    else if (selectedModel) { setSelectedModel(null); }
    else if (selectedBrand) { setSelectedBrand(null); setModels([]); }
  };

  const stockColor = (qty: number, reorder: number | null) => {
    if (qty <= 0) return 'text-red-600';
    if (reorder && qty <= reorder) return 'text-amber-600';
    return 'text-green-600';
  };
  const stockDot = (qty: number, reorder: number | null) => {
    if (qty <= 0) return '🔴';
    if (reorder && qty <= reorder) return '🟡';
    return '🟢';
  };

  const openEdit = async (itemId: string) => {
    setMenuOpen(null);
    const res = await api.get<any>(`/admin/inventory/items/${itemId}`);
    if (res.success) {
      const d = res.data;
      setEditItem(d);
      setEditForm({ itemName: d.itemName || '', brand: d.brand || '', costPrice: String(Number(d.costPrice) || ''), mrp: String(Number(d.mrp) || ''), sellingPrice: String(Number(d.sellingPrice) || ''), discountPercent: String(Number(d.discountPercent) || '') });
    }
  };

  const saveEdit = async () => {
    if (!editItem) return;
    setEditSaving(true);
    await api.patch(`/admin/inventory/items/${editItem.id}`, {
      itemName: editForm.itemName, brand: editForm.brand || null,
      costPrice: Number(editForm.costPrice) || 0, mrp: editForm.mrp ? Number(editForm.mrp) : null,
      sellingPrice: Number(editForm.sellingPrice) || 0, discountPercent: editForm.discountPercent ? Number(editForm.discountPercent) : null,
    });
    setEditSaving(false);
    setEditItem(null);
    loadItems(page);
  };

  const removeFromModel = async (itemId: string) => {
    if (!selectedModel) return;
    // Get current model links, remove this one
    const res = await api.get<any>(`/admin/inventory/items/${itemId}`);
    if (!res.success) return;
    const currentIds = (res.data.vehicleModels || []).map((vm: any) => vm.vehicleModelId).filter((id: string) => id !== selectedModel.id);
    await api.patch(`/admin/inventory/items/${itemId}`, { modelIds: currentIds });
    setConfirmRemove(null);
    setMenuOpen(null);
    loadItems(page);
  };

  const viewCompatibleModels = async (itemId: string, itemName: string) => {
    const res = await api.get<any>(`/admin/inventory/items/${itemId}`);
    if (res.success && res.data.vehicleModels) {
      const models = res.data.vehicleModels.map((vm: any) => `${vm.vehicleModel.brand.name} ${vm.vehicleModel.name}`);
      setViewModelsFor({ id: itemId, name: itemName, models });
    }
    setMenuOpen(null);
  };

  const submitRestock = async () => {
    if (!stockItem || !stockForm.quantity) return;
    setStockSaving(true);
    await api.post(`/admin/inventory/items/${stockItem.id}/stock`, { type: stockForm.type, quantity: Number(stockForm.quantity), reason: stockForm.reason || undefined });
    setStockSaving(false);
    setStockItem(null);
    setStockForm({ type: 'STOCK_IN', quantity: '', reason: '' });
    loadItems(page);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inventory Catalog</h1>
          <p className="text-sm text-gray-500 mt-1">Browse parts by vehicle brand and model</p>
        </div>
        <Link href="/admin/inventory/items" className="text-sm text-blue-600 hover:underline">← All Items (flat list)</Link>
      </div>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm">
        <button onClick={() => { setSelectedBrand(null); setSelectedModel(null); setSelectedCategory(null); }} className="text-blue-600 hover:underline font-medium">All Brands</button>
        {selectedBrand && (
          <><ChevronRight size={14} className="text-gray-400" /><button onClick={() => { setSelectedModel(null); setSelectedCategory(null); loadModels(selectedBrand.id); }} className="text-blue-600 hover:underline">{selectedBrand.name}</button></>
        )}
        {selectedModel && (
          <><ChevronRight size={14} className="text-gray-400" /><button onClick={() => { setSelectedCategory(null); loadCategories(selectedModel.id); }} className="text-blue-600 hover:underline">{selectedModel.name}</button></>
        )}
        {selectedCategory && (
          <><ChevronRight size={14} className="text-gray-400" /><span className="text-gray-700 dark:text-gray-300">{selectedCategory.categoryName}</span></>
        )}
      </nav>

      {/* Search (visible at items level) */}
      {level === 'items' && (
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
            placeholder="Search parts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            onKeyDown={(e) => { if (e.key === 'Enter') loadItems(1); }}
          />
        </div>
      )}

      {loading && <ProcessLoader title="Loading..." />}

      {/* Brand Cards */}
      {!loading && level === 'brands' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {brands.map(b => (
            <button key={b.id} onClick={() => selectBrand(b)} className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-400 hover:shadow-md transition group">
              <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold text-lg group-hover:scale-110 transition">{b.name.charAt(0)}</div>
              <span className="font-semibold text-sm text-gray-900 dark:text-white">{b.name}</span>
              <span className="text-xs text-gray-500">{b.modelCount} models · {b.itemCount} parts</span>
            </button>
          ))}
        </div>
      )}

      {/* Model Cards */}
      {!loading && level === 'models' && (
        <div>
          <button onClick={goBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft size={14} /> Back to brands</button>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {models.map(m => (
              <button key={m.id} onClick={() => selectModel(m)} className="flex flex-col items-start gap-1 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-400 hover:shadow-md transition text-left">
                <span className="font-semibold text-sm text-gray-900 dark:text-white">{m.name}</span>
                {m.engineCC && <span className="text-xs text-gray-400">{m.engineCC}cc</span>}
                <span className="text-xs text-gray-500 mt-1">{m.itemCount} parts</span>
              </button>
            ))}
            {models.length === 0 && <p className="col-span-full text-sm text-gray-500">No models found for this brand.</p>}
          </div>
        </div>
      )}

      {/* Category Cards */}
      {!loading && level === 'categories' && (
        <div>
          <button onClick={goBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft size={14} /> Back to models</button>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {/* All parts for this model */}
            <button onClick={() => selectCategory({ id: '', categoryName: 'All Parts', itemCount: categories.reduce((s, c) => s + c.itemCount, 0) })} className="flex flex-col items-start gap-1 p-4 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:shadow-md transition text-left">
              <Package size={18} className="text-blue-600" />
              <span className="font-semibold text-sm text-gray-900 dark:text-white">All Parts</span>
              <span className="text-xs text-gray-500">{categories.reduce((s, c) => s + c.itemCount, 0)} items</span>
            </button>
            {categories.map(c => (
              <button key={c.id} onClick={() => selectCategory(c)} className="flex flex-col items-start gap-1 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-400 hover:shadow-md transition text-left">
                <span className="font-semibold text-sm text-gray-900 dark:text-white">{c.categoryName}</span>
                <span className="text-xs text-gray-500">{c.itemCount} items</span>
              </button>
            ))}
            {categories.length === 0 && <p className="col-span-full text-sm text-gray-500">No parts linked to this model yet.</p>}
          </div>
        </div>
      )}

      {/* Product Grid */}
      {!loading && level === 'items' && (
        <div>
          <button onClick={goBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft size={14} /> Back to categories</button>
          <div className="text-xs text-gray-500 mb-3">{total} items</div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr className="text-left text-xs uppercase text-gray-500 tracking-wide">
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Item Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">MRP</th>
                  <th className="px-4 py-3 text-right">Selling</th>
                  <th className="px-4 py-3 text-center">Stock</th>
                  <th className="px-4 py-3 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{item.sku}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{toTitleCase(item.itemName)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{item.category?.categoryName}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">₹{Number(item.mrp || item.sellingPrice).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-medium">₹{Number(item.sellingPrice).toLocaleString()}</td>
                    <td className={`px-4 py-2.5 text-center font-medium ${stockColor(Number(item.quantityInStock), item.reorderLevel ? Number(item.reorderLevel) : null)}`}>
                      {stockDot(Number(item.quantityInStock), item.reorderLevel ? Number(item.reorderLevel) : null)} {Number(item.quantityInStock)}
                    </td>
                    <td className="px-4 py-2.5 text-center relative">
                      <button onClick={() => setMenuOpen(menuOpen === item.id ? null : item.id)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"><MoreVertical size={16} /></button>
                      {menuOpen === item.id && (
                        <>
                        <div className="fixed inset-0 z-40" onClick={() => { setMenuOpen(null); setConfirmRemove(null); }} />
                        <div className="absolute right-4 top-10 z-50 w-48 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
                          <button onClick={() => openEdit(item.id)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">✏️ Edit</button>
                          <button onClick={() => viewCompatibleModels(item.id, item.itemName)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">🔗 View compatible models</button>
                          {selectedModel && (
                            confirmRemove === item.id ? (
                              <div className="px-4 py-2 space-y-1">
                                <p className="text-xs text-red-600">Remove from {selectedModel.name}?</p>
                                <div className="flex gap-2">
                                  <button onClick={() => removeFromModel(item.id)} className="text-xs bg-red-600 text-white px-2 py-0.5 rounded">Yes</button>
                                  <button onClick={() => setConfirmRemove(null)} className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">No</button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmRemove(item.id)} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">❌ Remove from {selectedModel.name}</button>
                            )
                          )}
                          <button onClick={() => { setStockItem({ id: item.id, name: item.itemName }); setMenuOpen(null); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">📦 Restock</button>
                        </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No parts found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && <div className="mt-4"><Pagination page={page} totalPages={totalPages} onPageChange={(p) => { setPage(p); loadItems(p); }} /></div>}
        </div>
      )}

      {/* View Compatible Models Popover */}
      {viewModelsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setViewModelsFor(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Compatible Models</h3>
              <button onClick={() => setViewModelsFor(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-2">{toTitleCase(viewModelsFor.name)}</p>
            {viewModelsFor.models.length > 0 ? (
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {viewModelsFor.models.map((m, i) => <li key={i} className="text-sm text-gray-700 dark:text-gray-300">• {m}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No models linked</p>
            )}
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {stockItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setStockItem(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Restock: {toTitleCase(stockItem.name)}</h3>
              <button onClick={() => setStockItem(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <select className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800" value={stockForm.type} onChange={e => setStockForm({ ...stockForm, type: e.target.value })}>
                <option value="STOCK_IN">Stock In</option>
                <option value="STOCK_OUT">Stock Out</option>
              </select>
              <input type="number" min="1" placeholder="Quantity" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800" value={stockForm.quantity} onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })} />
              <input placeholder="Reason (optional)" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800" value={stockForm.reason} onChange={e => setStockForm({ ...stockForm, reason: e.target.value })} />
              <button onClick={submitRestock} disabled={stockSaving || !stockForm.quantity} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{stockSaving ? 'Saving...' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setEditItem(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Edit: {editItem.sku}</h3>
              <button onClick={() => setEditItem(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Item Name</label><input className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800" value={editForm.itemName} onChange={e => setEditForm({ ...editForm, itemName: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Brand</label><input className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800" value={editForm.brand} onChange={e => setEditForm({ ...editForm, brand: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Cost Price</label><input type="number" step="0.01" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800" value={editForm.costPrice} onChange={e => setEditForm({ ...editForm, costPrice: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">MRP</label><input type="number" step="0.01" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800" value={editForm.mrp} onChange={e => setEditForm({ ...editForm, mrp: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Selling Price</label><input type="number" step="0.01" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800" value={editForm.sellingPrice} onChange={e => setEditForm({ ...editForm, sellingPrice: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Discount %</label><input type="number" step="0.01" min="0" max="100" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800" value={editForm.discountPercent} onChange={e => setEditForm({ ...editForm, discountPercent: e.target.value })} /></div>
              </div>
              <button onClick={saveEdit} disabled={editSaving || !editForm.itemName} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{editSaving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
