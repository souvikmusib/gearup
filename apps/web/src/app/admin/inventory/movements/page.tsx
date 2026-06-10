'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { Pagination } from '@/components/shared/pagination';
export default function StockMovementsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  useEffect(() => {
    const { cached, promise } = api.getSWR<any>(`/admin/inventory/movements?page=${page}`);
    if (cached?.success) {
      setData(cached.data?.items ?? cached.data ?? []);
      setTotalPages(cached.meta?.totalPages ?? 1);
      setLoading(false);
    }
    promise.then((r) => {
      if (r.success) {
        setData(r.data?.items ?? r.data ?? []);
        setTotalPages(r.meta?.totalPages ?? 1);
      }
      setLoading(false);
    });
  }, [page]);
  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Stock Movements" /><DataTable columns={[
    { key: 'createdAt', header: 'Date', render: (r: any) => new Date(r.createdAt).toLocaleDateString() },
    { key: 'item', header: 'Item', render: (r: any) => r.inventoryItem?.itemName },
    { key: 'movementType', header: 'Type', render: (r: any) => <StatusBadge status={r.movementType} /> },
    { key: 'quantity', header: 'Qty', render: (r: any) => Number(r.quantity) },
    { key: 'previousQuantity', header: 'Prev', render: (r: any) => Number(r.previousQuantity) },
    { key: 'newQuantity', header: 'New', render: (r: any) => Number(r.newQuantity) },
    { key: 'reason', header: 'Reason' },
  ]} data={data} keyField="id" /><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>);
}
