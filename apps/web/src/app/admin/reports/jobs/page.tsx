'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, StatCard } from '@gearup/ui';

export default function JobsReportPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { cached, promise } = api.getSWR<any>('/admin/reports?type=jobs');
    if (cached?.success) { setData(cached.data ?? []); setLoading(false); }
    promise.then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
  }, []);

  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  return (
    <div>
      <PageHeader title="Jobs Report" />
      {data.length === 0 && <p className="text-sm text-gray-500">No job report data yet.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((d: any) => (
          <StatCard key={d.status} label={d.status} value={d._count} />
        ))}
      </div>
    </div>
  );
}
