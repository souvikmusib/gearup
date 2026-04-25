'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
export default function ActivityLogsPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => {
    const { cached, promise } = api.getSWR<any>('/admin/logs');
    if (cached?.success) { setData(cached.data ?? []); setLoading(false); }
    promise.then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
  }, []);
  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Activity Logs" /><DataTable columns={[
    { key: 'createdAt', header: 'Time', render: (r: any) => new Date(r.createdAt).toLocaleString() },
    { key: 'actorType', header: 'Actor' }, { key: 'actor', header: 'User', render: (r: any) => r.adminUser?.fullName ?? r.actorId ?? '—' },
    { key: 'entityType', header: 'Entity' }, { key: 'entityId', header: 'ID', render: (r: any) => r.entityId?.slice(0, 8) ?? '—' },
    { key: 'action', header: 'Action' },
  ]} data={data} keyField="id" /></div>);
}
