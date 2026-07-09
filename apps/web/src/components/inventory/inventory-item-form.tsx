'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api/client';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { ModelPicker } from './model-picker';

export interface InventoryItemFormData {
  sku: string;
  itemName: string;
  brand: string;
  categoryId: string;
  supplierId: string;
  unit: string;
  costPrice: string;
  mrp: string;
  sellingPrice: string;
  discountPercent: string;
  amcDiscountPercent: string;
  quantityInStock: string;
  reorderLevel: string;
  storageLocation: string;
  hsnCode: string;
  variablePrice: boolean;
  isBranded: boolean;
  isActive: boolean;
}

export const EMPTY_FORM: InventoryItemFormData = {
  sku: '',
  itemName: '',
  brand: '',
  categoryId: '',
  supplierId: '',
  unit: '',
  costPrice: '',
  mrp: '',
  sellingPrice: '',
  discountPercent: '',
  amcDiscountPercent: '3',
  quantityInStock: '',
  reorderLevel: '',
  storageLocation: '',
  hsnCode: '',
  variablePrice: false,
  isBranded: true,
  isActive: true,
};

interface InventoryItemFormProps {
  mode: 'create' | 'edit';
  form: InventoryItemFormData;
  onChange: (form: InventoryItemFormData) => void;
  modelIds: string[];
  onModelIdsChange: (ids: string[]) => void;
  /** Pre-loaded categories. If empty, component fetches its own. */
  categories?: { id: string; categoryName: string }[];
  /** Pre-loaded suppliers. If empty, component fetches its own. */
  suppliers?: { id: string; supplierName: string; phone?: string }[];
  /** Pre-loaded HSN rates. If empty, component fetches its own. */
  hsnRates?: { hsnCode: string; rate: number; description: string | null }[];
  /** Existing brand values for autocomplete */
  brandSuggestions?: string[];
  /** Submit button label */
  submitLabel?: string;
  /** Whether submission is in progress */
  submitting?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Called on form submit */
  onSubmit: (e: React.FormEvent) => void;
}

export function InventoryItemForm({
  mode,
  form,
  onChange,
  modelIds,
  onModelIdsChange,
  categories: externalCategories,
  suppliers: externalSuppliers,
  hsnRates: externalHsnRates,
  brandSuggestions = [],
  submitLabel,
  submitting = false,
  error,
  onSubmit,
}: InventoryItemFormProps) {
  const [categories, setCategories] = useState<{ id: string; categoryName: string }[]>(externalCategories || []);
  const [suppliers, setSuppliers] = useState<{ id: string; supplierName: string; phone?: string }[]>(externalSuppliers || []);
  const [hsnRates, setHsnRates] = useState<{ hsnCode: string; rate: number; description: string | null }[]>(externalHsnRates || []);

  // Fetch lookups if not provided externally
  useEffect(() => {
    if (!externalCategories?.length) {
      api.get<any>('/admin/inventory/categories').then(r => { if (r.success) setCategories(r.data ?? []); });
    }
  }, [externalCategories]);

  useEffect(() => {
    if (!externalSuppliers?.length) {
      api.get<any>('/admin/inventory/suppliers').then(r => { if (r.success) setSuppliers(r.data ?? []); });
    }
  }, [externalSuppliers]);

  useEffect(() => {
    if (!externalHsnRates?.length) {
      api.get<any>('/admin/hsn-rates').then(r => { if (r.success) setHsnRates(r.data ?? []); });
    }
  }, [externalHsnRates]);

  // Sync external data when provided
  useEffect(() => { if (externalCategories?.length) setCategories(externalCategories); }, [externalCategories]);
  useEffect(() => { if (externalSuppliers?.length) setSuppliers(externalSuppliers); }, [externalSuppliers]);
  useEffect(() => { if (externalHsnRates?.length) setHsnRates(externalHsnRates); }, [externalHsnRates]);

  const set = (partial: Partial<InventoryItemFormData>) => onChange({ ...form, ...partial });

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

  const handleMrpChange = (mrp: string) => {
    const m = Number(mrp);
    if (form.discountPercent) {
      const dp = Number(form.discountPercent) || 0;
      const sp = mrp ? String((m * (1 - dp / 100)).toFixed(2)) : form.sellingPrice;
      set({ mrp, sellingPrice: sp });
    } else if (m && Number(form.sellingPrice)) {
      const dp = Math.max(0, (1 - Number(form.sellingPrice) / m) * 100).toFixed(1);
      set({ mrp, discountPercent: dp });
    } else {
      set({ mrp });
    }
  };

  const handleSellingPriceChange = (sp: string) => {
    const mrp = Number(form.mrp);
    const dp = mrp && Number(sp) ? Math.max(0, (1 - Number(sp) / mrp) * 100).toFixed(1) : form.discountPercent;
    set({ sellingPrice: sp, discountPercent: dp });
  };

  const handleDiscountChange = (dp: string) => {
    const mrp = Number(form.mrp);
    const sp = mrp ? String((mrp * (1 - Number(dp) / 100)).toFixed(2)) : form.sellingPrice;
    set({ discountPercent: dp, sellingPrice: sp });
  };

  const defaultLabel = mode === 'create' ? 'Create' : 'Save';

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* SKU */}
      <div>
        <label className={labelCls}>SKU {mode === 'create' && <span className="text-red-500">*</span>}</label>
        <input className={inputCls} placeholder="SKU" required={mode === 'create'} value={form.sku} onChange={e => set({ sku: e.target.value })} />
      </div>

      {/* HSN Code */}
      <div>
        <label className={labelCls}>HSN Code</label>
        <select
          className={inputCls}
          value={hsnRates.some(h => h.hsnCode === form.hsnCode) || !form.hsnCode ? form.hsnCode : '__custom'}
          onChange={e => { if (e.target.value === '__custom') { set({ hsnCode: '' }); } else { set({ hsnCode: e.target.value }); } }}
        >
          <option value="">No HSN (No GST)</option>
          {hsnRates.map(h => <option key={h.hsnCode} value={h.hsnCode}>{h.hsnCode} — {h.description} ({Number(h.rate)}%)</option>)}
          <option value="__custom">Custom HSN...</option>
        </select>
        {form.hsnCode && !hsnRates.some(h => h.hsnCode === form.hsnCode) && (
          <input className={inputCls + ' mt-1'} placeholder="Enter custom HSN code" value={form.hsnCode} onChange={e => set({ hsnCode: e.target.value })} />
        )}
      </div>

      {/* Item Name */}
      <div>
        <label className={labelCls}>Item Name <span className="text-red-500">*</span></label>
        <input className={inputCls} placeholder="Item Name" required value={form.itemName} onChange={e => set({ itemName: e.target.value })} />
      </div>

      {/* Brand */}
      <div>
        <label className={labelCls}>Company / Brand</label>
        <input
          className={inputCls}
          list="brand-options-form"
          placeholder="e.g. Hero, Honda, Bajaj"
          value={form.brand}
          onChange={e => set({ brand: e.target.value })}
        />
        <datalist id="brand-options-form">
          {(brandSuggestions.length
            ? brandSuggestions
            : ['Hero', 'Honda', 'Bajaj', 'TVS', 'Yamaha', 'Royal Enfield', 'KTM', 'Suzuki', 'Motul', 'Castrol', 'Mahindra']
          ).map(b => <option key={b} value={b} />)}
        </datalist>
      </div>

      {/* Vehicle Model Picker */}
      <ModelPicker selectedIds={modelIds} onChange={onModelIdsChange} />

      {/* Category + Supplier */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Category {mode === 'create' && <span className="text-red-500">*</span>}</label>
          <SearchableSelect
            options={categories.map(c => ({ value: c.id, label: c.categoryName }))}
            value={form.categoryId}
            onChange={v => set({ categoryId: v })}
            placeholder="Select category…"
          />
        </div>
        <div>
          <label className={labelCls}>Supplier</label>
          <SearchableSelect
            options={[{ value: '', label: 'None' }, ...suppliers.map(s => ({ value: s.id, label: s.supplierName, sublabel: s.phone }))]}
            value={form.supplierId}
            onChange={v => set({ supplierId: v })}
            placeholder="Select supplier…"
          />
        </div>
      </div>

      {/* Stock + Unit */}
      <div className="grid grid-cols-2 gap-3">
        {mode === 'create' ? (
          <div>
            <label className={labelCls}>Initial Stock <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="0" type="number" required value={form.quantityInStock} onChange={e => set({ quantityInStock: e.target.value })} />
          </div>
        ) : (
          <div>
            <label className={labelCls}>Reorder Level</label>
            <input className={inputCls} type="number" placeholder="Alert when stock falls below" value={form.reorderLevel} onChange={e => set({ reorderLevel: e.target.value })} />
          </div>
        )}
        <div>
          <label className={labelCls}>Unit {mode === 'create' && <span className="text-red-500">*</span>}</label>
          <select className={inputCls} required={mode === 'create'} value={form.unit} onChange={e => set({ unit: e.target.value })}>
            <option value="">Select...</option>
            <option value="PCS">PCS</option>
            <option value="LITRE">Litre</option>
            <option value="ML">ML</option>
            <option value="SET">Set</option>
            <option value="KIT">Kit</option>
            <option value="PAIR">Pair</option>
            <option value="BOTTLE">Bottle</option>
          </select>
        </div>
      </div>

      {/* Storage Location (edit only — also available in create for completeness) */}
      {mode === 'edit' && (
        <div>
          <label className={labelCls}>Storage Location</label>
          <input className={inputCls} placeholder="e.g. Rack A, Shelf 3" value={form.storageLocation} onChange={e => set({ storageLocation: e.target.value })} />
        </div>
      )}

      {/* Pricing: Cost + MRP */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Cost Price {mode === 'create' && <span className="text-red-500">*</span>}</label>
          <input className={inputCls} placeholder="0" type="number" step="0.01" required={mode === 'create'} value={form.costPrice} onChange={e => set({ costPrice: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>MRP</label>
          <input className={inputCls} placeholder="0" type="number" step="0.01" value={form.mrp} onChange={e => handleMrpChange(e.target.value)} />
        </div>
      </div>

      {/* Pricing: Selling + Discount */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Selling Price {mode === 'create' && <span className="text-red-500">*</span>}</label>
          <input className={inputCls} placeholder="0" type="number" step="0.01" required={mode === 'create'} value={form.sellingPrice} onChange={e => handleSellingPriceChange(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Discount %</label>
          <input className={inputCls} placeholder="0" type="number" step="0.01" min="0" max="100" value={form.discountPercent} onChange={e => handleDiscountChange(e.target.value)} />
        </div>
      </div>

      {/* AMC Pricing */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>AMC Discount %</label>
          <input className={inputCls} placeholder="0" type="number" step="0.01" min="0" max="100" value={form.amcDiscountPercent} onChange={e => set({ amcDiscountPercent: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>AMC Price</label>
          <input className={inputCls} readOnly value={form.mrp && form.amcDiscountPercent ? `₹${(Number(form.mrp) * (1 - Number(form.amcDiscountPercent) / 100)).toFixed(2)}` : '—'} />
        </div>
      </div>

      {/* Reorder Level (in create mode, since edit already has it above) */}
      {mode === 'create' && (
        <div>
          <label className={labelCls}>Reorder Level</label>
          <input className={inputCls} type="number" placeholder="Alert when stock falls below" value={form.reorderLevel} onChange={e => set({ reorderLevel: e.target.value })} />
        </div>
      )}

      {/* Checkboxes */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.variablePrice} onChange={e => set({ variablePrice: e.target.checked })} className="rounded" />
          <span>Variable price</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isBranded} onChange={e => set({ isBranded: e.target.checked })} className="rounded" />
          <span>Branded product</span>
        </label>
        {mode === 'edit' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={e => set({ isActive: e.target.checked })} className="rounded" />
            <span>Active</span>
          </label>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !form.itemName}
        className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? (mode === 'create' ? 'Creating...' : 'Saving...') : (submitLabel || defaultLabel)}
      </button>
    </form>
  );
}
