'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
export default function StockMovementsPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { api.get<any>('/admin/inventory/movements').then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); }); }, []);
  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Stock Movements" /><DataTable columns={[
    { key: 'createdAt', header: 'Date', render: (r: any) => new Date(r.createdAt).toLocaleDateString() },
    { key: 'item', header: 'Item', render: (r: any) => r.inventoryItem?.itemName },
    { key: 'movementType', header: 'Type', render: (r: any) => <StatusBadge status={r.movementType} /> },
    { key: 'quantity', header: 'Qty', render: (r: any) => Number(r.quantity) },
    { key: 'previousQuantity', header: 'Prev', render: (r: any) => Number(r.previousQuantity) },
    { key: 'newQuantity', header: 'New', render: (r: any) => Number(r.newQuantity) },
    { key: 'reason', header: 'Reason' },
  ]} data={data} keyField="id" /></div>);
}
