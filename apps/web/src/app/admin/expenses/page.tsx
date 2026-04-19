'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
export default function ExpensesPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { api.get<any>('/admin/expenses').then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); }); }, []);
  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Expenses" /><DataTable columns={[
    { key: 'expenseDate', header: 'Date', render: (r: any) => new Date(r.expenseDate).toLocaleDateString() },
    { key: 'title', header: 'Title' }, { key: 'category', header: 'Category', render: (r: any) => r.category?.categoryName },
    { key: 'amount', header: 'Amount', render: (r: any) => `₹${Number(r.amount)}` },
    { key: 'vendorName', header: 'Vendor' }, { key: 'createdBy', header: 'By', render: (r: any) => r.createdBy?.fullName },
  ]} data={data} keyField="id" /></div>);
}
