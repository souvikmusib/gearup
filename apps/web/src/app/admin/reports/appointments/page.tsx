'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, StatCard } from '@gearup/ui';

export default function AppointmentsReportPage() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    api.get<any>('/admin/reports/appointments').then((r) => r.success && setData(r.data));
  }, []);

  if (!data.length) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  return (
    <div>
      <PageHeader title="Appointments Report" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((d: any) => (
          <StatCard key={d.status} label={d.status} value={d._count} />
        ))}
      </div>
    </div>
  );
}
