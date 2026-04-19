'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
export default function PaymentsPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { api.get<any>('/admin/payments').then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); }); }, []);
  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Payments" /><DataTable columns={[
    { key: 'paymentDate', header: 'Date', render: (r: any) => new Date(r.paymentDate).toLocaleDateString() },
    { key: 'invoice', header: 'Invoice', render: (r: any) => r.invoice?.invoiceNumber },
    { key: 'customer', header: 'Customer', render: (r: any) => r.invoice?.customer?.fullName },
    { key: 'amount', header: 'Amount', render: (r: any) => `₹${Number(r.amount)}` },
    { key: 'paymentMode', header: 'Mode' }, { key: 'referenceNumber', header: 'Ref #' },
  ]} data={data} keyField="id" /></div>);
}
