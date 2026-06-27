'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api/client';
import { Modal } from '@/components/shared/modal';
import { ModelPicker } from './model-picker';

interface InventoryEditModalProps {
  itemId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function InventoryEditModal({ itemId, onClose, onSaved }: InventoryEditModalProps) {
  const [form, setForm] = useState({ itemName: '', brand: '', costPrice: '', mrp: '', sellingPrice: '', discountPercent: '', amcDiscountPercent: '', reorderLevel: '', hsnCode: '', isActive: true, variablePrice: false });
  const [modelIds, setModelIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [sku, setSku] = useState('');

  useEffect(() => {
    if (!itemId) return;
    (async () => {
      const res = await api.get<any>(`/admin/inventory/items/${itemId}`);
      if (res.success) {
        const d = res.data;
        setSku(d.sku);
        setForm({
          itemName: d.itemName || '', brand: d.brand || '',
          costPrice: String(Number(d.costPrice) || ''), mrp: String(Number(d.mrp) || ''),
          sellingPrice: String(Number(d.sellingPrice) || ''), discountPercent: String(Number(d.discountPercent) || ''),
          amcDiscountPercent: String(Number(d.amcDiscountPercent) || ''),
          reorderLevel: d.reorderLevel != null ? String(Number(d.reorderLevel)) : '',
          hsnCode: d.hsnCode || '',
          isActive: d.isActive ?? true, variablePrice: d.variablePrice ?? false,
        });
        setModelIds((d.vehicleModels || []).map((vm: any) => vm.vehicleModelId));
      }
    })();
  }, [itemId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemId) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      sku: sku || undefined,
      itemName: form.itemName, brand: form.brand || null,
      costPrice: Number(form.costPrice) || 0, mrp: form.mrp ? Number(form.mrp) : null,
      sellingPrice: Number(form.sellingPrice) || 0, discountPercent: form.discountPercent ? Number(form.discountPercent) : null,
      amcDiscountPercent: form.amcDiscountPercent ? Number(form.amcDiscountPercent) : null,
      reorderLevel: form.reorderLevel ? Number(form.reorderLevel) : null,
      isActive: form.isActive, variablePrice: form.variablePrice, hsnCode: form.hsnCode || null,
      modelIds,
    };
    const res = await api.patch(`/admin/inventory/items/${itemId}`, body);
    setSaving(false);
    if (res.success) { onSaved(); onClose(); }
  };

  const inputCls = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800';
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1';

  return (
    <Modal open={!!itemId} onClose={onClose} title={`Edit: ${sku}`}>
      <form onSubmit={save} className="space-y-3">
        <div><label className={labelCls}>SKU</label><input className={inputCls} value={sku} onChange={e => setSku(e.target.value)} /></div>
        <div><label className={labelCls}>Item Name</label><input className={inputCls} required value={form.itemName} onChange={e => setForm({ ...form, itemName: e.target.value })} /></div>
        <div><label className={labelCls}>Company / Brand</label><input className={inputCls} list="brand-options-edit" placeholder="e.g. Hero, Honda, Bajaj" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} /><datalist id="brand-options-edit"><option value="Hero"/><option value="Honda"/><option value="Bajaj"/><option value="TVS"/><option value="Yamaha"/><option value="Royal Enfield"/><option value="KTM"/><option value="Suzuki"/><option value="Motul"/><option value="Castrol"/><option value="Mahindra"/></datalist></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Cost Price</label><input type="number" step="0.01" className={inputCls} value={form.costPrice} onChange={e => setForm({ ...form, costPrice: e.target.value })} /></div>
          <div><label className={labelCls}>MRP</label><input type="number" step="0.01" className={inputCls} value={form.mrp} onChange={e => { const mrp = e.target.value; const m = Number(mrp); if (form.discountPercent) { const dp = Number(form.discountPercent) || 0; const sp = mrp ? String((m * (1 - dp / 100)).toFixed(2)) : form.sellingPrice; setForm({ ...form, mrp, sellingPrice: sp }); } else if (m && Number(form.sellingPrice)) { const dp = Math.max(0, (1 - Number(form.sellingPrice) / m) * 100).toFixed(1); setForm({ ...form, mrp, discountPercent: dp }); } else { setForm({ ...form, mrp }); } }} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Selling Price</label><input type="number" step="0.01" className={inputCls} value={form.sellingPrice} onChange={e => { const sp = e.target.value; const mrp = Number(form.mrp); const dp = mrp && Number(sp) ? Math.max(0, (1 - Number(sp) / mrp) * 100).toFixed(1) : form.discountPercent; setForm({ ...form, sellingPrice: sp, discountPercent: dp }); }} /></div>
          <div><label className={labelCls}>Discount %</label><input type="number" step="0.01" min="0" max="100" className={inputCls} value={form.discountPercent} onChange={e => { const dp = e.target.value; const mrp = Number(form.mrp); const sp = mrp ? String((mrp * (1 - Number(dp) / 100)).toFixed(2)) : form.sellingPrice; setForm({ ...form, discountPercent: dp, sellingPrice: sp }); }} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>AMC Discount %</label><input type="number" step="0.01" min="0" max="100" className={inputCls} value={form.amcDiscountPercent} onChange={e => setForm({ ...form, amcDiscountPercent: e.target.value })} /></div>
          <div><label className={labelCls}>AMC Price</label><input className={inputCls} readOnly value={form.mrp && form.amcDiscountPercent ? `₹${(Number(form.mrp) * (1 - Number(form.amcDiscountPercent) / 100)).toFixed(2)}` : '—'} /></div>
        </div>
        <div><label className={labelCls}>Reorder Level</label><input type="number" className={inputCls} placeholder="Alert when stock falls below" value={form.reorderLevel} onChange={e => setForm({ ...form, reorderLevel: e.target.value })} /></div>
        <div><label className={labelCls}>HSN Code</label><input className={inputCls} placeholder="e.g. 87141090" value={form.hsnCode} onChange={e => setForm({ ...form, hsnCode: e.target.value })} /></div>

        <ModelPicker selectedIds={modelIds} onChange={setModelIds} />

        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.variablePrice} onChange={e => setForm({ ...form, variablePrice: e.target.checked })} className="rounded" />Variable price</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="rounded" />Active</label>
        </div>

        <button type="submit" disabled={saving || !form.itemName} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
      </form>
    </Modal>
  );
}
