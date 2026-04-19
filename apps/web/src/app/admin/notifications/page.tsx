'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
export default function NotificationsPage() {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { api.get<any>('/admin/notifications').then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); }); }, []);
  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (<div><PageHeader title="Notifications" /><DataTable columns={[
    { key: 'createdAt', header: 'Date', render: (r: any) => new Date(r.createdAt).toLocaleString() },
    { key: 'channel', header: 'Channel' }, { key: 'eventType', header: 'Event' },
    { key: 'recipient', header: 'To', render: (r: any) => r.recipientPhone || r.recipientEmail || '—' },
    { key: 'sendStatus', header: 'Status', render: (r: any) => <StatusBadge status={r.sendStatus} /> },
    { key: 'retryCount', header: 'Retries' },
  ]} data={data} keyField="id" /></div>);
}
