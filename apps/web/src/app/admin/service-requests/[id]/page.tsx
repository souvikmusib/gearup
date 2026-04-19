'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';

export default function ServiceRequestDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => { api.get<any>(`/admin/service-requests/${id}`).then((r) => r.success && setData(r.data)); }, [id]);

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  return (
    <div>
      <PageHeader title={`Request ${data.referenceId}`} description={data.serviceCategory} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Request Details</h3>
          <div className="flex gap-2"><StatusBadge status={data.status} /></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{data.issueDescription}</p>
          {data.notes && <p className="text-sm text-gray-500 dark:text-gray-400">Notes: {data.notes}</p>}
          <p className="text-xs text-gray-400">Created: {new Date(data.createdAt).toLocaleString()}</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Customer</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{data.customer?.fullName} · {data.customer?.phoneNumber}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Vehicle</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{data.vehicle?.registrationNumber} · {data.vehicle?.brand} {data.vehicle?.model}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
