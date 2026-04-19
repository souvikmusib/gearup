'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
export default function InventoryCategoriesPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => {
    const { cached, promise } = api.getSWR<any>('/admin/inventory/categories');
    if (cached?.success) { setData(cached.data ?? []); setLoading(false); }
    promise.then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
  }, []);
  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Inventory Categories" /><DataTable columns={[{ key: 'categoryName', header: 'Category' }, { key: 'items', header: 'Items', render: (r: any) => r._count?.items ?? 0 }]} data={data} keyField="id" /></div>);
}
