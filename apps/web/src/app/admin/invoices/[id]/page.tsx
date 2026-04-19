'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
export default function InvoiceDetailPage() {
  const { id } = useParams(); const [data, setData] = useState<any>(null);
  useEffect(() => { api.get<any>(`/admin/invoices/${id}`).then((r) => r.success && setData(r.data)); }, [id]);
  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div className="space-y-6"><PageHeader title={`Invoice ${data.invoiceNumber}`} />
      <div className="flex gap-2"><StatusBadge status={data.invoiceStatus} /><StatusBadge status={data.paymentStatus} /></div>
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full text-sm"><thead><tr className="border-b"><th className="py-2 text-left">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Total</th></tr></thead>
          <tbody>{data.lineItems?.map((li: any) => <tr key={li.id} className="border-b border-gray-100 dark:border-gray-700"><td className="py-2">{li.description}</td><td className="py-2 text-right">{Number(li.quantity)}</td><td className="py-2 text-right">₹{Number(li.unitPrice)}</td><td className="py-2 text-right">₹{Number(li.lineTotal)}</td></tr>)}</tbody>
          <tfoot><tr className="font-bold"><td colSpan={3} className="py-2 text-right">Grand Total</td><td className="py-2 text-right">₹{Number(data.grandTotal)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}
