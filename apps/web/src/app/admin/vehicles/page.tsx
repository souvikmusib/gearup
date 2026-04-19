'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
export default function VehiclesPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true); const router = useRouter();
  useEffect(() => { const { cached, promise } = api.getSWR<any>('/admin/vehicles'); if (cached?.success) { setData(cached.data ?? []); setLoading(false); } promise.then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); }); }, []);
  const columns = [
    { key: 'registrationNumber', header: 'Reg No' }, { key: 'customer', header: 'Customer', render: (r: any) => r.customer?.fullName },
    { key: 'vehicleType', header: 'Type' }, { key: 'brand', header: 'Brand' }, { key: 'model', header: 'Model' },
  ];
  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Vehicles" /><DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/vehicles/${r.id}`)} /></div>);
}
