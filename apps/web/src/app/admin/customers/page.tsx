'use client';
import { toTitleCase } from '@/lib/title-case';
import { formatIST } from '@/lib/time';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable } from '@gearup/ui';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { Modal } from '@/components/shared/modal';

export default function CustomersPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ fullName: '', phoneNumber: '', email: '' });
  const router = useRouter();
  const timer = useRef<NodeJS.Timeout>();

  const load = useCallback((s = search, p = page) => {
    const params = new URLSearchParams();
    if (s) params.set('search', s);
    params.set('page', String(p));
    const endpoint = `/admin/customers?${params}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) {
      setData(cached.data?.items ?? cached.data ?? []);
      setTotalPages(cached.meta?.totalPages ?? 1);
      setLoading(false);
    } else {
      setLoading(true);
    }
    promise.then((res) => {
      if (res.success) { setData(res.data?.items ?? res.data ?? []); setTotalPages(res.meta?.totalPages ?? 1); }
      setLoading(false);
    });
  }, [search, page]);

  useEffect(() => { load(); }, [page]);

  const onSearch = useCallback((q: string) => {
    setSearch(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPage(1); load(q, 1); }, 300);
  }, [load]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post('/admin/customers', form);
    if (res.success) { setShowCreate(false); setForm({ fullName: '', phoneNumber: '', email: '' }); load(); }
  };

  const columns = [
    { key: 'fullName', header: 'Name' }, { key: 'phoneNumber', header: 'Phone' }, { key: 'email', header: 'Email', render: (r: any) => r.email ?? '—' },
    { key: 'vehicles', header: 'Vehicles', render: (r: any) => r._count?.vehicles ?? 0 }, { key: 'jobs', header: 'Jobs', render: (r: any) => r._count?.jobCards ?? 0 },
    { key: 'createdAt', header: 'Since', render: (r: any) => formatIST(r.createdAt) },
  ];

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white";

  return (
    <div>
      <PageHeader title="Customers" />
      <ListToolbar searchPlaceholder="Search customers..." onSearch={onSearch} onCreateClick={() => setShowCreate(true)} createLabel="Create Customer" />
      {loading ? <ProcessLoader title="Loading customers" steps={['Fetching customer records', 'Preparing list']} /> :
        <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/customers/${r.id}`)} />}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Customer">
        <form onSubmit={onSubmit} className="space-y-3">
          <div><label className="block text-xs font-medium mb-1">Full Name <span className="text-red-500">*</span></label><input className={inputCls} placeholder="Full Name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
          <div><label className="block text-xs font-medium mb-1">Phone Number <span className="text-red-500">*</span></label><input className={inputCls} placeholder="Phone Number" required value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} /></div>
          <input className={inputCls} placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <button type="submit" className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">Create</button>
        </form>
      </Modal>
    </div>
  );
}
