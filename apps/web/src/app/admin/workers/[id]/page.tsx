'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
export default function WorkerDetailPage() {
  const { id } = useParams(); const [data, setData] = useState<any>(null);
  useEffect(() => { api.get<any>(`/admin/workers/${id}`).then((r) => r.success && setData(r.data)); }, [id]);
  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div className="space-y-6"><PageHeader title={data.fullName} description={data.workerCode} />
      <StatusBadge status={data.status} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
          <h3 className="font-semibold text-gray-900 dark:text-white">Info</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Designation: {data.designation ?? '—'}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Shift: {data.shiftStart ?? '—'} - {data.shiftEnd ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
          <h3 className="font-semibold text-gray-900 dark:text-white">Assignments ({data.assignments?.length ?? 0})</h3>
          {data.assignments?.slice(0, 5).map((a: any) => <p key={a.id} className="text-sm text-gray-600 dark:text-gray-400">{a.jobCard?.jobCardNumber} — {a.jobCard?.status}</p>)}
        </div>
      </div>
    </div>
  );
}
