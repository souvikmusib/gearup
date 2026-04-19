'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';

export default function AppointmentsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => { api.get<any>('/admin/appointments').then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); }); }, []);

  const columns = [
    { key: 'referenceId', header: 'Reference' },
    { key: 'customer', header: 'Customer', render: (r: any) => r.customer?.fullName },
    { key: 'vehicle', header: 'Vehicle', render: (r: any) => r.vehicle?.registrationNumber },
    { key: 'appointmentDate', header: 'Date', render: (r: any) => new Date(r.appointmentDate).toLocaleDateString() },
    { key: 'slot', header: 'Slot', render: (r: any) => `${new Date(r.slotStart).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} - ${new Date(r.slotEnd).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'worker', header: 'Worker', render: (r: any) => r.worker?.fullName ?? '—' },
  ];

  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Appointments" description="Manage appointment schedule" /><DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/appointments/${r.id}`)} /></div>);
}
