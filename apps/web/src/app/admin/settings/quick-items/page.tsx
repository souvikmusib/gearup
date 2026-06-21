'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';

type QuickItem = { label: string; lineType: string; description: string; unitPrice: number; taxRate: number };

export default function QuickLineItemsPage() {
  const [items, setItems] = useState<QuickItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get<any>('/admin/settings').then((r) => {
      if (r.success) {
        try { setItems(JSON.parse(r.data['invoice.quickLineItems'] || '[]')); } catch { setItems([]); }
      }
      setLoaded(true);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    await api.patch('/admin/settings', { 'invoice.quickLineItems': JSON.stringify(items) });
    setSaving(false);
  };

  const add = () => setItems([...items, { label: '', lineType: 'SERVICE_CHARGE', description: '', unitPrice: 0, taxRate: 0 }]);
  const remove = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const update = (i: number, field: string, value: any) => setItems(items.map((it, idx) => idx === i ? { ...it, [field]: value } : it));

  const inputCls = 'w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700';

  if (!loaded) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Quick Line Items" actions={<button onClick={save} disabled={saving} className="bg-blue-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>} />
      <p className="text-sm text-gray-500">Pre-configured items that appear as quick-add buttons on the invoice page.</p>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="col-span-2"><label className="text-xs text-gray-500">Label</label><input className={inputCls} value={item.label} onChange={(e) => update(i, 'label', e.target.value)} placeholder="Foam Wash" /></div>
            <div className="col-span-2"><label className="text-xs text-gray-500">Type</label>
              <select className={inputCls} value={item.lineType} onChange={(e) => update(i, 'lineType', e.target.value)}>
                <option value="SERVICE_CHARGE">Service</option><option value="CUSTOM_CHARGE">Custom</option><option value="PART">Part</option><option value="LABOR">Labor</option>
              </select>
            </div>
            <div className="col-span-3"><label className="text-xs text-gray-500">Description</label><input className={inputCls} value={item.description} onChange={(e) => update(i, 'description', e.target.value)} placeholder="FOAM WASH" /></div>
            <div className="col-span-2"><label className="text-xs text-gray-500">Price (₹)</label><input type="number" className={inputCls} value={item.unitPrice} onChange={(e) => update(i, 'unitPrice', Number(e.target.value))} /></div>
            <div className="col-span-2"><label className="text-xs text-gray-500">Tax %</label><input type="number" className={inputCls} value={item.taxRate} onChange={(e) => update(i, 'taxRate', Number(e.target.value))} /></div>
            <div className="col-span-1"><button onClick={() => remove(i)} className="text-red-500 text-xs hover:underline mt-4">Remove</button></div>
          </div>
        ))}
      </div>
      <button onClick={add} className="text-blue-600 text-sm hover:underline">+ Add Item</button>
    </div>
  );
}
