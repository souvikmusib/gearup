'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
export default function LowStockPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { api.get<any>('/admin/inventory/low-stock').then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); }); }, []);
  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Low Stock Alerts" /><DataTable columns={[
    { key: 'sku', header: 'SKU' }, { key: 'itemName', header: 'Item' },
    { key: 'quantityInStock', header: 'Stock', render: (r: any) => Number(r.quantityInStock) },
    { key: 'reorderLevel', header: 'Reorder At', render: (r: any) => Number(r.reorderLevel) },
  ]} data={data} keyField="id" /></div>);
}
