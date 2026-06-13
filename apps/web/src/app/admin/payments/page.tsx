'use client';
import { formatIST } from '@/lib/time';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable } from '@gearup/ui';
import { Pagination } from '@/components/shared/pagination';

export default function PaymentsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [total, setTotal] = useState(0);

  const load = (f = from, t = to, pg = page) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (f) params.set('from', f);
    if (t) params.set('to', t);
    params.set('page', String(pg));
    api.get<any>(`/admin/payments?${params}`).then((r) => {
      if (r.success) {
        const items = r.data?.items ?? r.data ?? [];
        setData(items);
        setTotalPages(r.meta?.totalPages ?? 1);
        setTotal(items.reduce((s: number, p: any) => s + Number(p.amount), 0));
      }
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [page]);

  const inputCls = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div>
      <PageHeader title="Payments" />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={() => { setPage(1); load(from, to, 1); }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Load</button>
        <button onClick={() => { setFrom(today); setTo(today); setPage(1); load(today, today, 1); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">Today</button>
        {total > 0 && <span className="ml-auto text-sm font-semibold text-green-600">Total: ₹{total.toLocaleString()}</span>}
      </div>
      {loading ? <ProcessLoader title="Loading payments" steps={['Fetching payment records']} /> :
        <DataTable columns={[
          { key: 'paymentDate', header: 'Date', render: (r: any) => formatIST(r.paymentDate) },
          { key: 'invoice', header: 'Invoice', render: (r: any) => r.invoice?.invoiceNumber },
          { key: 'customer', header: 'Customer', render: (r: any) => r.invoice?.customer?.fullName },
          { key: 'amount', header: 'Amount', render: (r: any) => `₹${Number(r.amount).toLocaleString()}` },
          { key: 'paymentMode', header: 'Mode' },
          { key: 'referenceNumber', header: 'Ref #', render: (r: any) => r.referenceNumber || '—' },
        ]} data={data} keyField="id" />}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
