'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';

const STATUSES = ['SUBMITTED','UNDER_REVIEW','APPOINTMENT_PENDING','APPOINTMENT_SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED'].map(s => ({ label: s.replace(/_/g, ' '), value: s }));

export default function ServiceRequestsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const router = useRouter();
  const timer = useRef<NodeJS.Timeout>();

  const load = useCallback((s = search, st = status, p = page) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (s) params.set('search', s);
    if (st) params.set('status', st);
    params.set('page', String(p));
    api.get<any>(`/admin/service-requests?${params}`).then((res) => {
      if (res.success) { setData(res.data?.items ?? res.data ?? []); setTotalPages(res.data?.totalPages ?? 1); }
      setLoading(false);
    });
  }, [search, status, page]);

  useEffect(() => { load(); }, [page, status]);

  const onSearch = useCallback((q: string) => {
    setSearch(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPage(1); load(q, status, 1); }, 300);
  }, [status, load]);

  const columns = [
    { key: 'referenceId', header: 'Reference ID' },
    { key: 'customer', header: 'Customer', render: (r: any) => r.customer?.fullName },
    { key: 'phone', header: 'Phone', render: (r: any) => r.customer?.phoneNumber },
    { key: 'vehicle', header: 'Vehicle', render: (r: any) => `${r.vehicle?.brand} ${r.vehicle?.model}` },
    { key: 'serviceCategory', header: 'Category' },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'createdAt', header: 'Created', render: (r: any) => new Date(r.createdAt).toLocaleDateString() },
  ];

  return (
    <div>
      <PageHeader title="Service Requests" description="Manage incoming service requests" />
      <ListToolbar
        searchPlaceholder="Search requests..."
        onSearch={onSearch}
        filters={[{ label: 'All Statuses', value: 'status', options: STATUSES }]}
        onFilterChange={(_, v) => { setStatus(v); setPage(1); }}
      />
      {loading ? <p className="py-8 text-center text-gray-500">Loading...</p> :
        <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/service-requests/${r.id}`)} />}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
