'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';

export default function WorkersReportPage() {
  const [data, setData] = useState<any[]>([]);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await api.get<any>(`/admin/reports/workers?${params}`);
    if (res.success) setData(res.data ?? []);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const inputCls = 'rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm bg-white dark:bg-gray-800';

  return (
    <div>
      <PageHeader title="Workers Report" />
      <div className="flex items-center gap-3 mb-4">
        <input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} />
        <span className="text-gray-400">to</span>
        <input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} />
      </div>
      <p className="text-xs text-gray-500 mb-3">* Labor (Direct) = matched from &quot;Labor — WorkerName&quot; line items. Total includes equal-split of remaining job revenue.</p>
      <DataTable
        keyField="id"
        columns={[
          { key: 'fullName', header: 'Name' },
          { key: 'designation', header: 'Role', render: (r: any) => r.designation || '—' },
          { key: 'assignmentsInPeriod', header: 'Jobs' },
          { key: 'laborDirect', header: 'Labor (Direct)', render: (r: any) => `₹${Number(r.laborDirect).toLocaleString('en-IN')}` },
          { key: 'revenueAttributed', header: 'Total Revenue', render: (r: any) => `₹${Number(r.revenueAttributed).toLocaleString('en-IN')}` },
        ]}
        data={data.sort((a, b) => b.revenueAttributed - a.revenueAttributed)}
      />
    </div>
  );
}
