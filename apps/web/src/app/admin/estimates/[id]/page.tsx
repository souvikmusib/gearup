'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
import { ProcessLoader } from '@/components/shared/process-loader';
import { formatIST } from '@/lib/time';
import { toTitleCase } from '@/lib/title-case';

const LINE_TYPES = [
  { value: 'PART', label: 'Part' },
  { value: 'LABOR', label: 'Labor' },
  { value: 'SERVICE_CHARGE', label: 'Service Charge' },
  { value: 'CUSTOM_CHARGE', label: 'Custom Charge' },
  { value: 'DISCOUNT_ADJUSTMENT', label: 'Discount' },
];

type EditItem = {
  lineType: string;
  inventoryItemId: string | null;
  description: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  sortOrder: number;
};

export default function EstimateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Part search for adding items
  const [partSearch, setPartSearch] = useState('');
  const [partResults, setPartResults] = useState<any[]>([]);
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout>();

  const load = async () => {
    setLoading(true);
    const res = await api.get<any>(`/admin/estimates/${id}`);
    if (res.success) setData(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const startEditing = () => {
    if (!data) return;
    setEditItems(data.items.map((item: any, i: number) => ({
      lineType: item.lineType || 'PART',
      inventoryItemId: item.inventoryItemId || null,
      description: item.description,
      hsnCode: item.hsnCode || item.inventoryItem?.hsnCode || '',
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountPercent: Number(item.discountPercent || 0),
      taxRate: Number(item.taxRate || 0),
      sortOrder: item.sortOrder ?? i,
    })));
    setEditNotes(data.notes || '');
    setEditing(true);
    setError('');
  };

  const cancelEditing = () => {
    setEditing(false);
    setError('');
  };

  const saveEdits = async () => {
    if (editItems.length === 0) { setError('At least one item is required'); return; }
    setSaving(true); setError('');
    const res = await api.patch<any>(`/admin/estimates/${id}`, {
      notes: editNotes || undefined,
      items: editItems.map((item, i) => ({ ...item, sortOrder: i })),
    });
    setSaving(false);
    if (res.success) {
      setData(res.data);
      setEditing(false);
    } else {
      setError(res.error?.message || 'Failed to save');
    }
  };

  const updateItem = (index: number, field: keyof EditItem, value: any) => {
    setEditItems(items => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removeItem = (index: number) => {
    setEditItems(items => items.filter((_, i) => i !== index));
  };

  const addCustomLine = (lineType: string) => {
    setEditItems(items => [...items, {
      lineType,
      inventoryItemId: null,
      description: '',
      hsnCode: '',
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      taxRate: 0,
      sortOrder: items.length,
    }]);
  };

  const searchParts = useCallback((query: string) => {
    setPartSearch(query);
    clearTimeout(searchTimer.current);
    if (!query.trim()) { setPartResults([]); setShowPartDropdown(false); return; }
    searchTimer.current = setTimeout(async () => {
      const res = await api.get<any>(`/admin/inventory/items?search=${encodeURIComponent(query)}&pageSize=10`);
      if (res.success) {
        setPartResults(res.data?.items ?? res.data ?? []);
        setShowPartDropdown(true);
      }
    }, 250);
  }, []);

  const addPartFromInventory = (item: any) => {
    setEditItems(items => [...items, {
      lineType: 'PART',
      inventoryItemId: item.id,
      description: item.itemName,
      hsnCode: item.hsnCode || '',
      quantity: 1,
      unitPrice: Number(item.mrp || item.sellingPrice || 0),
      discountPercent: 0,
      taxRate: Number(item.taxRate || 0),
      sortOrder: items.length,
    }]);
    setPartSearch('');
    setPartResults([]);
    setShowPartDropdown(false);
  };

  const convert = async () => {
    if (!confirm('Convert this estimate to a Job Card + Invoice? This cannot be undone.')) return;
    setConverting(true); setError('');
    const res = await api.post<any>(`/admin/estimates/${id}/convert`, {});
    setConverting(false);
    if (res.success) {
      router.push(`/admin/job-cards/${res.data.jobCardId}`);
    } else {
      setError(res.error?.message || 'Conversion failed');
    }
  };

  const printEstimate = () => {
    window.open(`/admin/estimates/${id}/print`, '_blank');
  };

  const whatsappShare = () => {
    if (!data) return;
    const total = Number(data.grandTotal).toLocaleString('en-IN');
    const text = encodeURIComponent(
      `Hi ${data.customer?.fullName},\n\nHere is your estimate from GearUp Servicing:\n` +
      `Estimate #: ${data.estimateNumber}\n` +
      `Vehicle: ${data.vehicle?.registrationNumber || 'N/A'}\n` +
      `Total: ₹${total}\n\n` +
      `Items:\n` +
      data.items.map((item: any, i: number) => `${i + 1}. ${item.description} × ${Number(item.quantity)} = ₹${Math.round(Number(item.quantity) * Number(item.unitPrice))}`).join('\n') +
      `\n\nThank you!`
    );
    const phone = data.customer?.phoneNumber ? `91${data.customer.phoneNumber}` : '';
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  const deleteEstimate = async () => {
    if (!confirm('Delete this estimate? This cannot be undone.')) return;
    setError('');
    const res = await api.delete<any>(`/admin/estimates/${id}`);
    if (res.success) {
      router.push('/admin/estimates');
    } else {
      setError(res.error?.message || 'Failed to delete');
    }
  };

  if (loading) return <ProcessLoader title="Loading estimate" steps={['Fetching estimate details']} />;
  if (!data) return <p className="text-center text-gray-500 py-8">Estimate not found</p>;

  const grandTotal = Number(data.grandTotal);

  // Compute edit totals
  const editSubtotal = editItems.reduce((sum, item) => {
    const base = item.quantity * item.unitPrice;
    const disc = base * (item.discountPercent / 100);
    const afterDisc = base - disc;
    return item.lineType === 'DISCOUNT_ADJUSTMENT' ? sum : sum + afterDisc;
  }, 0);
  const editTax = editItems.reduce((sum, item) => {
    const base = item.quantity * item.unitPrice;
    const disc = base * (item.discountPercent / 100);
    const afterDisc = base - disc;
    return sum + afterDisc * (item.taxRate / 100);
  }, 0);
  const editGrandTotal = editItems.reduce((sum, item) => {
    const base = item.quantity * item.unitPrice;
    const disc = base * (item.discountPercent / 100);
    const afterDisc = base - disc;
    const tax = afterDisc * (item.taxRate / 100);
    const lineTotal = item.lineType === 'DISCOUNT_ADJUSTMENT' ? -(afterDisc + tax) : afterDisc + tax;
    return sum + lineTotal;
  }, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => router.push('/admin/estimates')} className="text-sm text-blue-600 hover:underline mb-1">← Back to Estimates</button>
          <PageHeader title={`Estimate ${data.estimateNumber}`} />
        </div>
        <StatusBadge status={data.status} />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg mb-4">{error}</p>}

      {/* Customer + Vehicle info */}
      <div className="grid grid-cols-2 gap-4 mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div>
          <p className="text-xs text-gray-500 uppercase">Customer</p>
          <p className="font-medium">{toTitleCase(data.customer?.fullName)}</p>
          <p className="text-sm text-gray-500">{data.customer?.phoneNumber}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">Vehicle</p>
          <p className="font-medium">{data.vehicle?.registrationNumber || '—'}</p>
          <p className="text-sm text-gray-500">{data.vehicle ? `${data.vehicle.brand} ${data.vehicle.model}` : ''}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">Created</p>
          <p className="text-sm">{formatIST(data.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">Created By</p>
          <p className="text-sm">{data.createdBy?.fullName || '—'}</p>
        </div>
      </div>

      {/* ─── EDIT MODE ─── */}
      {editing ? (
        <div className="mb-6">
          {/* Add items toolbar */}
          <div className="mb-4 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase mb-3">Add Items</p>
            
            {/* Part search */}
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Search inventory to add a part..."
                value={partSearch}
                onChange={(e) => searchParts(e.target.value)}
                onFocus={() => partResults.length > 0 && setShowPartDropdown(true)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              />
              {showPartDropdown && partResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                  {partResults.map((item) => (
                    <button key={item.id} onClick={() => addPartFromInventory(item)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <span className="font-medium">{item.itemName}</span>
                      <span className="text-gray-500 ml-2">{item.sku} · ₹{Number(item.mrp || item.sellingPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick add buttons for custom lines */}
            <div className="flex gap-2 flex-wrap">
              {LINE_TYPES.map((lt) => (
                <button key={lt.value} onClick={() => addCustomLine(lt.value)} className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-700">
                  + {lt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Editable items table */}
          <div className="border rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Description</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-400 w-16">Qty</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-400 w-24">Price</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-400 w-16">Tax%</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-400 w-24">Total</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {editItems.map((item, i) => {
                  const base = item.quantity * item.unitPrice;
                  const disc = base * (item.discountPercent / 100);
                  const afterDisc = base - disc;
                  const tax = afterDisc * (item.taxRate / 100);
                  const lineTotal = item.lineType === 'DISCOUNT_ADJUSTMENT' ? -(afterDisc + tax) : afterDisc + tax;
                  return (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-3 py-2">
                        <select value={item.lineType} onChange={(e) => updateItem(i, 'lineType', e.target.value)} className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1 py-1 text-xs">
                          {LINE_TYPES.map(lt => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" value={item.description} onChange={(e) => updateItem(i, 'description', e.target.value)} placeholder="Description" className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-center" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} step="0.01" value={item.unitPrice} onChange={(e) => updateItem(i, 'unitPrice', Number(e.target.value))} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-right" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} max={100} step="0.01" value={item.taxRate} onChange={(e) => updateItem(i, 'taxRate', Number(e.target.value))} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-right" />
                      </td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color: lineTotal < 0 ? '#dc2626' : undefined }}>
                        {lineTotal < 0 ? '−' : ''}₹{Math.abs(Math.round(lineTotal)).toLocaleString('en-IN')}
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700 text-lg" title="Remove">×</button>
                      </td>
                    </tr>
                  );
                })}
                {editItems.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No items. Add parts or custom lines above.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-amber-50 dark:bg-amber-900/20">
                  <td colSpan={5} className="px-4 py-3 text-right font-semibold">Total</td>
                  <td className="px-3 py-3 text-right text-lg font-bold">₹{Math.round(editGrandTotal).toLocaleString('en-IN')}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" placeholder="Optional notes..." />
          </div>

          {/* Edit actions */}
          <div className="flex gap-3">
            <button onClick={saveEdits} disabled={saving} className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={cancelEditing} className="rounded-lg border border-gray-300 dark:border-gray-600 px-6 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ─── VIEW MODE ─── */}
          <div className="border rounded-lg overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">#</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Item</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Type</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">SKU</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Qty</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Price</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item: any, i: number) => {
                  const lineType = item.lineType || 'PART';
                  const typeLabel = LINE_TYPES.find(lt => lt.value === lineType)?.label || lineType;
                  const amount = Number(item.quantity) * Number(item.unitPrice);
                  const isDiscount = lineType === 'DISCOUNT_ADJUSTMENT';
                  return (
                    <tr key={item.id} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2">{item.description}</td>
                      <td className="px-4 py-2"><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{typeLabel}</span></td>
                      <td className="px-4 py-2 text-gray-500">{item.inventoryItem?.sku || '—'}</td>
                      <td className="px-4 py-2 text-center">{Number(item.quantity)}</td>
                      <td className="px-4 py-2 text-right">₹{Number(item.unitPrice).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2 text-right font-medium" style={{ color: isDiscount ? '#dc2626' : undefined }}>
                        {isDiscount ? '−' : ''}₹{Math.round(Math.abs(amount)).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-amber-50 dark:bg-amber-900/20">
                  <td colSpan={6} className="px-4 py-3 text-right font-semibold">Estimate Total</td>
                  <td className="px-4 py-3 text-right text-lg font-bold">₹{grandTotal.toLocaleString('en-IN')}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {data.notes && (
            <div className="mb-6 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800">
              <p className="text-xs text-yellow-600 uppercase font-medium mb-1">Notes</p>
              <p className="text-sm">{data.notes}</p>
            </div>
          )}

          {/* Converted reference */}
          {data.status === 'CONVERTED' && (
            <div className="mb-6 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">✓ Converted</p>
              <div className="flex gap-4 mt-2">
                {data.convertedJobCardId && (
                  <button onClick={() => router.push(`/admin/job-cards/${data.convertedJobCardId}`)} className="text-sm text-blue-600 hover:underline">View Job Card →</button>
                )}
                {data.convertedInvoiceId && (
                  <button onClick={() => router.push(`/admin/invoices/${data.convertedInvoiceId}`)} className="text-sm text-blue-600 hover:underline">View Invoice →</button>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {data.status === 'DRAFT' && (
              <>
                <button onClick={startEditing} className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600">
                  ✏️ Edit
                </button>
                <button onClick={convert} disabled={converting} className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {converting ? 'Converting...' : 'Convert to Job Card'}
                </button>
              </>
            )}
            <button onClick={printEstimate} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
              🖨️ Print
            </button>
            <button onClick={whatsappShare} className="rounded-lg border border-green-300 dark:border-green-700 px-4 py-2.5 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20">
              💬 WhatsApp
            </button>
            {data.status !== 'CONVERTED' && (
              <button onClick={deleteEstimate} className="rounded-lg border border-red-300 dark:border-red-700 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                🗑️ Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
