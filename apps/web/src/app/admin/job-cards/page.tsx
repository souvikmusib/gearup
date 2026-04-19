'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';

export default function JobCardsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  useEffect(() => { api.get<any>('/admin/job-cards').then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); }); }, []);
  const columns = [
    { key: 'jobCardNumber', header: 'Job Card #' },
    { key: 'customer', header: 'Customer', render: (r: any) => r.customer?.fullName },
    { key: 'vehicle', header: 'Vehicle', render: (r: any) => r.vehicle?.registrationNumber },
    { key: 'issueSummary', header: 'Issue' },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'priority', header: 'Priority', render: (r: any) => r.priority ?? '—' },
    { key: 'workers', header: 'Workers', render: (r: any) => r.assignments?.map((a: any) => a.worker?.fullName).join(', ') || '—' },
  ];
  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Job Cards" description="Active and completed work orders" /><DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/job-cards/${r.id}`)} /></div>);
}
