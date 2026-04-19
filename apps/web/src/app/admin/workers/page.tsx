'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { Modal } from '@/components/shared/modal';

const STATUSES = ['ACTIVE','INACTIVE','ON_LEAVE'].map(s => ({ label: s.replace(/_/g, ' '), value: s }));

export default function WorkersPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ fullName: '', designation: '', specialization: '', shiftStart: '', shiftEnd: '' });
  const router = useRouter();
  const timer = useRef<NodeJS.Timeout>();

  const load = useCallback((s = search, st = status, p = page) => {
    const params = new URLSearchParams();
    if (s) params.set('search', s);
    if (st) params.set('status', st);
    params.set('page', String(p));
    const endpoint = `/admin/workers?${params}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) {
      setData(cached.data?.items ?? cached.data ?? []);
      setTotalPages(cached.data?.totalPages ?? 1);
      setLoading(false);
    } else {
      setLoading(true);
    }
    promise.then((res) => {
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post('/admin/workers', form);
    if (res.success) { setShowCreate(false); setForm({ fullName: '', designation: '', specialization: '', shiftStart: '', shiftEnd: '' }); load(); }
  };

  const columns = [
    { key: 'workerCode', header: 'Code' }, { key: 'fullName', header: 'Name' }, { key: 'designation', header: 'Designation' },
    { key: 'specialization', header: 'Specialization' }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'jobs', header: 'Active Jobs', render: (r: any) => r._count?.assignments ?? 0 },
  ];

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white";

  return (
    <div>
      <PageHeader title="Workers" />
      <ListToolbar
        searchPlaceholder="Search workers..."
        onSearch={onSearch}
        onCreateClick={() => setShowCreate(true)}
        createLabel="Create Worker"
        filters={[{ label: 'All Statuses', value: 'status', options: STATUSES }]}
        onFilterChange={(_, v) => { setStatus(v); setPage(1); }}
      />
      {loading ? <p className="py-8 text-center text-gray-500">Loading...</p> :
        <DataTable columns={columns} data={data} keyField="id" onRowClick={(r: any) => router.push(`/admin/workers/${r.id}`)} />}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Worker">
        <form onSubmit={onSubmit} className="space-y-3">
          <input className={inputCls} placeholder="Full Name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input className={inputCls} placeholder="Designation" required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <input className={inputCls} placeholder="Specialization" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
          <input className={inputCls} placeholder="Shift Start (e.g. 09:00)" type="time" value={form.shiftStart} onChange={(e) => setForm({ ...form, shiftStart: e.target.value })} />
          <input className={inputCls} placeholder="Shift End (e.g. 18:00)" type="time" value={form.shiftEnd} onChange={(e) => setForm({ ...form, shiftEnd: e.target.value })} />
          <button type="submit" className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">Create</button>
        </form>
      </Modal>
    </div>
  );
}
