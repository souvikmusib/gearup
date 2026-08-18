'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { ProcessLoader } from '@/components/shared/process-loader';
import { formatIST } from '@/lib/time';
import { toTitleCase } from '@/lib/title-case';

const STATUS_OPTIONS = ['DRAFT', 'CONVERTED', 'CANCELLED'].map(s => ({ label: s, value: s }));

export default function EstimatesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const router = useRouter();
  const timer = useRef<NodeJS.Timeout>();

  const load = useCallback((s = search, f = filters, p = page) => {
    const params = new URLSearchParams();
    if (s) params.set('search', s);
    if (f.status) params.set('status', f.status);
    params.set('page', String(p));
    setLoading(true);
    api.get<any>(`/admin/estimates?${params}`).then((res) => {
      if (res.success) {
        setData(res.data?.items ?? res.data ?? []);
        setTotalPages(res.meta?.totalPages ?? 1);
      }
      setLoading(false);
    });
  }, [search, filters, page]);

  useEffect(() => { load(); }, [page, filters]);

  const onSearch = useCallback((q: string) => {
    setSearch(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPage(1); load(q, filters, 1); }, 300);
  }, [filters, load]);

  const columns = [
    { key: 'estimateNumber', header: 'Estimate #' },
    { key: 'customer', header: 'Customer', render: (r: any) => toTitleCase(r.customer?.fullName) },
    { key: 'vehicle', header: 'Vehicle', render: (r: any) => r.vehicle?.registrationNumber || '—' },
    { key: 'createdAt', header: 'Date', render: (r: any) => formatIST(r.createdAt) },
    { key: 'grandTotal', header: 'Amount', render: (r: any) => `₹${Number(r.grandTotal).toLocaleString('en-IN')}` },
    { key: '_count', header: 'Items', render: (r: any) => r._count?.items ?? 0 },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Estimates" />
        <button onClick={() => router.push('/admin/invoices')} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
          + New Estimate
        </button>
      </div>
      <ListToolbar
        searchPlaceholder="Search estimates..."
        onSearch={onSearch}
        filters={[{ label: 'Status', value: 'status', options: STATUS_OPTIONS }]}
        filterValues={filters}
        onFilterChange={(k, v) => { setFilters((prev) => ({ ...prev, [k]: v })); setPage(1); }}
      />
      {loading ? (
        <ProcessLoader title="Loading estimates" steps={['Fetching estimates', 'Preparing list']} />
      ) : (
        <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/estimates/${r.id}`)} emptyMessage="No estimates yet" emptyDescription="Create an estimate from the Invoices page to get started." />
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
