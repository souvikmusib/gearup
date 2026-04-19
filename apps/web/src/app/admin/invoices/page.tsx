'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';

const PAYMENT_STATUSES = ['UNPAID','PARTIALLY_PAID','PAID'].map(s => ({ label: s.replace(/_/g, ' '), value: s }));
const INVOICE_STATUSES = ['DRAFT','SENT','OVERDUE','CANCELLED'].map(s => ({ label: s, value: s }));

export default function InvoicesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const router = useRouter();
  const timer = useRef<NodeJS.Timeout>();

  const load = useCallback((s = search, f = filters, p = page) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (s) params.set('search', s);
    if (f.paymentStatus) params.set('paymentStatus', f.paymentStatus);
    if (f.invoiceStatus) params.set('invoiceStatus', f.invoiceStatus);
    params.set('page', String(p));
    api.get<any>(`/admin/invoices?${params}`).then((res) => {
      if (res.success) { setData(res.data?.items ?? res.data ?? []); setTotalPages(res.data?.totalPages ?? 1); }
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
    { key: 'invoiceNumber', header: 'Invoice #' }, { key: 'customer', header: 'Customer', render: (r: any) => r.customer?.fullName },
    { key: 'invoiceDate', header: 'Date', render: (r: any) => new Date(r.invoiceDate).toLocaleDateString() },
    { key: 'grandTotal', header: 'Total', render: (r: any) => `₹${Number(r.grandTotal)}` },
    { key: 'amountDue', header: 'Due', render: (r: any) => `₹${Number(r.amountDue)}` },
    { key: 'paymentStatus', header: 'Payment', render: (r: any) => <StatusBadge status={r.paymentStatus} /> },
    { key: 'invoiceStatus', header: 'Status', render: (r: any) => <StatusBadge status={r.invoiceStatus} /> },
  ];

  return (
    <div>
      <PageHeader title="Invoices" />
      <ListToolbar
        searchPlaceholder="Search invoices..."
        onSearch={onSearch}
        filters={[
          { label: 'Payment Status', value: 'paymentStatus', options: PAYMENT_STATUSES },
          { label: 'Invoice Status', value: 'invoiceStatus', options: INVOICE_STATUSES },
        ]}
        onFilterChange={(k, v) => { setFilters(prev => ({ ...prev, [k]: v })); setPage(1); }}
      />
      {loading ? <p className="py-8 text-center text-gray-500">Loading...</p> :
        <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/invoices/${r.id}`)} />}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
