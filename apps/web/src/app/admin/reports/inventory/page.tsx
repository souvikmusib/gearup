'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, StatCard } from '@gearup/ui';

export default function InventoryReportPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get<any>('/admin/reports/inventory').then((r) => r.success && setData(r.data));
  }, []);

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  return (
    <div>
      <PageHeader title="Inventory Report" />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total Items" value={data.totalItems ?? 0} />
        <StatCard label="Total Stock Units" value={data.totalStockUnits ?? 0} />
      </div>
    </div>
  );
}
