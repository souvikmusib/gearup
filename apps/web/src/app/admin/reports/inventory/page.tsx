'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, StatCard, DataTable } from '@gearup/ui';

export default function InventoryReportPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get<any>('/admin/reports/inventory').then((r) => { if (r.success) setData(r.data); });
  }, []);

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <PageHeader title="Inventory Report" />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Items" value={data.totalItems} />
        <StatCard label="Low Stock Items" value={data.lowStock} />
        <StatCard label="Total Stock Units" value={data.totalStock} />
      </div>
      <DataTable keyField="name" columns={[
        { key: 'name', header: 'Category' },
        { key: 'items', header: 'Items Count' },
      ]} data={data.categories ?? []} />
    </div>
  );
}
