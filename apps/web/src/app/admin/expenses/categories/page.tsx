'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
export default function ExpenseCategoriesPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { api.get<any>('/admin/expenses/categories').then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); }); }, []);
  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Expense Categories" /><DataTable columns={[{ key: 'categoryName', header: 'Category' }, { key: 'count', header: 'Expenses', render: (r: any) => r._count?.expenses ?? 0 }]} data={data} keyField="id" /></div>);
}
