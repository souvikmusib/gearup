'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';

type HsnRate = { id: string; hsnCode: string; rate: number; description: string | null };

export default function HsnRatesPage() {
  const [rates, setRates] = useState<HsnRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHsn, setNewHsn] = useState({ hsnCode: '', rate: '18', description: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await api.get<any>('/admin/hsn-rates');
    if (res.success) setRates(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newHsn.hsnCode) return;
    setSaving(true);
    await api.post('/admin/hsn-rates', {
      hsnCode: newHsn.hsnCode.trim(),
      rate: Number(newHsn.rate),
      description: newHsn.description || undefined,
    });
    setNewHsn({ hsnCode: '', rate: '18', description: '' });
    setSaving(false);
    load();
  };

  const inputCls = 'w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700';

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="HSN / SAC Rates" />
      <p className="text-sm text-gray-500">GST rates by HSN (goods) or SAC (services) code. Items without HSN = No GST. Unknown HSN defaults to 18%.</p>

      {/* Add new */}
      <div className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
        <div className="col-span-3">
          <label className="text-xs text-gray-500">HSN/SAC Code</label>
          <input className={inputCls} value={newHsn.hsnCode} onChange={(e) => setNewHsn({ ...newHsn, hsnCode: e.target.value })} placeholder="87141090" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-500">GST Rate %</label>
          <input type="number" className={inputCls} value={newHsn.rate} onChange={(e) => setNewHsn({ ...newHsn, rate: e.target.value })} />
        </div>
        <div className="col-span-5">
          <label className="text-xs text-gray-500">Description</label>
          <input className={inputCls} value={newHsn.description} onChange={(e) => setNewHsn({ ...newHsn, description: e.target.value })} placeholder="Motorcycle parts" />
        </div>
        <div className="col-span-2">
          <button onClick={add} disabled={saving || !newHsn.hsnCode} className="w-full bg-blue-600 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
            {saving ? 'Saving...' : 'Add / Update'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs uppercase text-gray-500">
              <th className="px-4 py-2.5 text-left">HSN/SAC</th>
              <th className="px-4 py-2.5 text-right">GST %</th>
              <th className="px-4 py-2.5 text-right">CGST</th>
              <th className="px-4 py-2.5 text-right">SGST</th>
              <th className="px-4 py-2.5 text-left">Description</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-4 py-2 font-mono font-medium">{r.hsnCode}</td>
                <td className="px-4 py-2 text-right font-semibold">{Number(r.rate)}%</td>
                <td className="px-4 py-2 text-right text-gray-500">{Number(r.rate) / 2}%</td>
                <td className="px-4 py-2 text-right text-gray-500">{Number(r.rate) / 2}%</td>
                <td className="px-4 py-2 text-gray-500">{r.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-400 space-y-1">
        <p><strong>Rules:</strong></p>
        <p>• Item with HSN → GST rate from this table (or 18% if HSN not listed here)</p>
        <p>• Item without HSN → 0% (No GST)</p>
        <p>• Invoice showGst = OFF → all items 0% regardless of HSN</p>
      </div>
    </div>
  );
}
