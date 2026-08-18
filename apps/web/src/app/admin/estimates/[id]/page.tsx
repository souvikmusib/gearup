'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
import { ProcessLoader } from '@/components/shared/process-loader';
import { formatIST } from '@/lib/time';
import { toTitleCase } from '@/lib/title-case';

export default function EstimateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const load = async () => {
    setLoading(true);
    const res = await api.get<any>(`/admin/estimates/${id}`);
    if (res.success) setData(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

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

  if (loading) return <ProcessLoader title="Loading estimate" steps={['Fetching estimate details']} />;
  if (!data) return <p className="text-center text-gray-500 py-8">Estimate not found</p>;

  const grandTotal = Number(data.grandTotal);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => router.push('/admin/estimates')} className="text-sm text-blue-600 hover:underline mb-1">← Back to Estimates</button>
          <PageHeader title={`Estimate ${data.estimateNumber}`} />
        </div>
        <StatusBadge status={data.status} />
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

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

      {/* Items table */}
      <div className="border rounded-lg overflow-hidden mb-6 print:border-black">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">#</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Part</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">SKU</th>
              <th className="text-center px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Qty</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Price</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item: any, i: number) => (
              <tr key={item.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2">{item.description}</td>
                <td className="px-4 py-2 text-gray-500">{item.inventoryItem?.sku || '—'}</td>
                <td className="px-4 py-2 text-center">{Number(item.quantity)}</td>
                <td className="px-4 py-2 text-right">₹{Number(item.unitPrice)}</td>
                <td className="px-4 py-2 text-right font-medium">₹{Math.round(Number(item.quantity) * Number(item.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-amber-50 dark:bg-amber-900/20">
              <td colSpan={5} className="px-4 py-3 text-right font-semibold">Estimate Total</td>
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
      <div className="flex gap-3 print:hidden">
        {data.status === 'DRAFT' && (
          <button onClick={convert} disabled={converting} className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {converting ? 'Converting...' : 'Convert to Job Card'}
          </button>
        )}
        <button onClick={printEstimate} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          🖨️ Print
        </button>
        <button onClick={whatsappShare} className="rounded-lg border border-green-300 dark:border-green-700 px-4 py-2.5 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20">
          💬 WhatsApp
        </button>
      </div>
    </div>
  );
}
