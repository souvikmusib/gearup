'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api/client';
import { Search } from 'lucide-react';

type Brand = { id: string; name: string };
type Model = { id: string; name: string; brandId: string; brandName: string };

interface ModelPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function ModelPicker({ selectedIds, onChange }: ModelPickerProps) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [filter, setFilter] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (loaded) return;
    (async () => {
      const bRes = await api.get<any>('/admin/inventory/catalog?level=brands');
      if (!bRes.success) return;
      setBrands(bRes.data);
      const allModels: Model[] = [];
      for (const b of bRes.data) {
        const mRes = await api.get<any>(`/admin/inventory/catalog?level=models&brandId=${b.id}`);
        if (mRes.success) allModels.push(...mRes.data.map((m: any) => ({ id: m.id, name: m.name, brandId: b.id, brandName: b.name })));
      }
      setModels(allModels);
      setLoaded(true);
    })();
  }, [loaded]);

  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  const toggleBrand = (brandId: string) => {
    const bIds = models.filter(m => m.brandId === brandId).map(m => m.id);
    const allChecked = bIds.every(id => selectedIds.includes(id));
    onChange(allChecked ? selectedIds.filter(id => !bIds.includes(id)) : [...new Set([...selectedIds, ...bIds])]);
  };

  const q = filter.toLowerCase();
  const filteredBrands = brands.filter(b => {
    if (!q) return true;
    if (b.name.toLowerCase().includes(q)) return true;
    return models.some(m => m.brandId === b.id && m.name.toLowerCase().includes(q));
  });

  const addModel = async (brandId: string) => {
    const name = filter.trim();
    if (!name) return;
    const res = await api.post<any>('/admin/inventory/catalog/models', { brandId, name });
    if (res.success) {
      const brand = brands.find(b => b.id === brandId);
      setModels([...models, { id: res.data.id, name: res.data.name, brandId, brandName: brand?.name || '' }]);
      onChange([...selectedIds, res.data.id]);
      setFilter('');
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        Compatible Models {selectedIds.length > 0 && <span className="text-blue-600">({selectedIds.length})</span>}
      </label>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs bg-white dark:bg-gray-800"
          placeholder="Search models... (e.g. Activa, Splendor, RayZR)"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>
      <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-2 bg-gray-50 dark:bg-gray-800 text-xs">
        {!loaded && <span className="text-gray-400">Loading models...</span>}
        {filteredBrands.map(b => {
          const bModels = models.filter(m => m.brandId === b.id && (!q || m.name.toLowerCase().includes(q) || b.name.toLowerCase().includes(q)));
          if (!bModels.length) return null;
          const allChecked = bModels.every(m => selectedIds.includes(m.id));
          const selectedCount = bModels.filter(m => selectedIds.includes(m.id)).length;
          const isExpanded = expanded.has(b.id) || !!q;
          const toggleExpand = () => setExpanded(prev => { const next = new Set(prev); next.has(b.id) ? next.delete(b.id) : next.add(b.id); return next; });
          return (
            <div key={b.id}>
              <div className="flex items-center justify-between sticky top-0 bg-gray-50 dark:bg-gray-800 py-0.5 cursor-pointer" onClick={toggleExpand}>
                <span className="font-semibold text-gray-600 dark:text-gray-400">
                  <span className="inline-block w-3 text-[10px] text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                  {b.name}
                  {selectedCount > 0 && <span className="ml-1 text-[10px] text-blue-600">({selectedCount})</span>}
                </span>
                <button type="button" onClick={(e) => { e.stopPropagation(); toggleBrand(b.id); }} className="text-[10px] text-blue-600 hover:underline">
                  {allChecked ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              {isExpanded && (
                <div className="grid grid-cols-2 gap-x-2 ml-3">
                  {bModels.map(m => (
                    <label key={m.id} className="flex items-center gap-1.5 cursor-pointer hover:bg-white dark:hover:bg-gray-700 px-1 py-0.5 rounded">
                      <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggle(m.id)} className="rounded" />
                      <span className="truncate">{m.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {loaded && filteredBrands.length === 0 && filter && (
          <div className="text-center py-2">
            <p className="text-gray-400 mb-2">No model found for &quot;{filter}&quot;</p>
            <div className="flex gap-1 justify-center flex-wrap">
              {brands.slice(0, 4).map(b => (
                <button key={b.id} type="button" onClick={() => addModel(b.id)} className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700">
                  + Add to {b.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
