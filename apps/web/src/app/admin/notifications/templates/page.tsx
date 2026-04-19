'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
export default function NotificationTemplatesPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => {
    const { cached, promise } = api.getSWR<any>('/admin/notifications/templates');
    if (cached?.success) { setData(cached.data ?? []); setLoading(false); }
    promise.then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
  }, []);
  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Notification Templates" /><DataTable columns={[
    { key: 'templateKey', header: 'Key' }, { key: 'channel', header: 'Channel' }, { key: 'eventType', header: 'Event' },
    { key: 'subject', header: 'Subject' }, { key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✓' : '✗' },
  ]} data={data} keyField="id" /></div>);
}
