'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
export default function CustomerDetailPage() {
  const { id } = useParams(); const [data, setData] = useState<any>(null);
  useEffect(() => {
    const endpoint = `/admin/customers/${id}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) setData(cached.data);
    promise.then((r) => r.success && setData(r.data));
  }, [id]);
  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div className="space-y-6">
      <PageHeader title={data.fullName} description={data.phoneNumber} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
          <h3 className="font-semibold text-gray-900 dark:text-white">Contact</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Phone: {data.phoneNumber}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Email: {data.email ?? '—'}</p>
          {data.addressLine1 && <p className="text-sm text-gray-600 dark:text-gray-400">Address: {data.addressLine1}</p>}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
          <h3 className="font-semibold text-gray-900 dark:text-white">Vehicles ({data.vehicles?.length ?? 0})</h3>
          {data.vehicles?.map((v: any) => <p key={v.id} className="text-sm text-gray-600 dark:text-gray-400">{v.registrationNumber} — {v.brand} {v.model}</p>)}
        </div>
      </div>
    </div>
  );
}
