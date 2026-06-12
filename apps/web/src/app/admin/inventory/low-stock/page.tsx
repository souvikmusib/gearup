'use client';
import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
import { Pagination } from '@/components/shared/pagination';

export default function LowStockPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    const { cached, promise } = api.getSWR<any>('/admin/inventory/low-stock');
    if (cached?.success) { setData(cached.data ?? []); setLoading(false); }
    promise.then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((r: any) =>
      (r.sku ?? '').toLowerCase().includes(q) ||
      (r.itemName ?? '').toLowerCase().includes(q) ||
      (r.brand ?? '').toLowerCase().includes(q)
    );
  }, [data, search]);
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div>
      <PageHeader title="Low Stock Alerts" />
      <input
        className={`${inputCls} mb-3 max-w-md`}
        placeholder="Search by SKU, item, or brand…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
      />
      <DataTable columns={[
        { key: 'sku', header: 'SKU', nowrap: true },
        { key: 'itemName', header: 'Item' },
        { key: 'quantityInStock', header: 'Stock', nowrap: true, render: (r: any) => Number(r.quantityInStock) },
        { key: 'reorderLevel', header: 'Reorder At', nowrap: true, render: (r: any) => Number(r.reorderLevel) },
      ]} data={paged} keyField="id" />
      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))}
        onPageChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        total={filtered.length}
      />
    </div>
  );
}
