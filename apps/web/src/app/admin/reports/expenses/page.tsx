'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, StatCard, DataTable } from '@gearup/ui';

export default function ExpensesReportPage() {
  const [data, setData] = useState<any>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    const endpoint = `/admin/reports?type=expenses${qs ? `&${qs}` : ''}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) setData(cached.data);
    promise.then((r) => r.success && setData(r.data));
  }, [from, to]);

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  return (
    <div>
      <PageHeader title="Expenses Report" />
      <div className="mb-4 flex gap-3">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
      </div>
      <StatCard label="Total Expenses" value={`₹${Number(data.totalExpenses ?? 0).toLocaleString()}`} />
      <div className="mt-4">
        <DataTable
          keyField="categoryId"
          columns={[
            { key: 'category', header: 'Category' },
            { key: '_count', header: 'Count' },
            { key: '_sum', header: 'Total', render: (r: any) => `₹${Number(r._sum ?? 0).toLocaleString()}` },
          ]}
          data={data.byCategory ?? []}
        />
      </div>
    </div>
  );
}
