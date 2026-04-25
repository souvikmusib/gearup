'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, StatCard } from '@gearup/ui';

export default function AppointmentsReportPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get<any>('/admin/reports/appointments').then((r) => { if (r.success) setData(r.data); });
  }, []);

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <PageHeader title="Appointments Report" />
      <StatCard label="Total Appointments" value={data.total} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(data.byStatus ?? []).map((s: any) => (
          <StatCard key={s.status} label={s.status.replace(/_/g, ' ')} value={s._count} />
        ))}
      </div>
    </div>
  );
}
