'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api/client';
import { toTitleCase } from '@/lib/title-case';
import { ProcessLoader } from '@/components/shared/process-loader';
import { Pagination } from '@/components/shared/pagination';
import { ChevronRight, Package, Search, ArrowLeft } from 'lucide-react';
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
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No parts found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && <div className="mt-4"><Pagination page={page} totalPages={totalPages} onPageChange={(p) => { setPage(p); loadItems(p); }} /></div>}
        </div>
      )}
    </div>
  );
}
