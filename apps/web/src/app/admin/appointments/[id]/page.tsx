'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';

export default function AppointmentDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get<any>(`/admin/appointments/${id}`).then((r) => r.success && setData(r.data)); }, [id]);
  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div>
      <PageHeader title={`Appointment ${data.referenceId}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-3">
          <StatusBadge status={data.status} />
          <p className="text-sm text-gray-600 dark:text-gray-400">Date: {new Date(data.appointmentDate).toLocaleDateString()}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Customer: {data.customer?.fullName}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Vehicle: {data.vehicle?.registrationNumber}</p>
        </div>
      </div>
    </div>
  );
}
