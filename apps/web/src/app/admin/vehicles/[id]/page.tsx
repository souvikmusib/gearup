'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
export default function VehicleDetailPage() {
  const { id } = useParams(); const [data, setData] = useState<any>(null);
  useEffect(() => { api.get<any>(`/admin/vehicles/${id}`).then((r) => r.success && setData(r.data)); }, [id]);
  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div><PageHeader title={data.registrationNumber} description={`${data.brand} ${data.model}`} />
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">Type: {data.vehicleType}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">Owner: {data.customer?.fullName}</p>
        {data.fuelType && <p className="text-sm text-gray-600 dark:text-gray-400">Fuel: {data.fuelType}</p>}
      </div>
    </div>
  );
}
