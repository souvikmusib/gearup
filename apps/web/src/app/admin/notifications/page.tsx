'use client';
import { formatIST } from '@/lib/time';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';

const CHANNELS = [
  { label: 'WhatsApp', value: 'WHATSAPP' },
  { label: 'Email', value: 'EMAIL' },
];
const STATUSES = ['QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'DEAD_LETTER'].map((s) => ({ label: s.replace(/_/g, ' '), value: s }));

export default function NotificationsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [channel, setChannel] = useState('');
  const [sendStatus, setSendStatus] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (channel) params.set('channel', channel);
    if (sendStatus) params.set('sendStatus', sendStatus);
    params.set('page', String(page));
    const endpoint = `/admin/notifications?${params}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) {
      setData(cached.data?.items ?? cached.data ?? []);
      setTotalPages(cached.meta?.totalPages ?? 1);
      setLoading(false);
    } else {
      setLoading(true);
    }
    promise.then((r) => {
      if (r.success) {
        setData(r.data?.items ?? r.data ?? []);
        setTotalPages(r.meta?.totalPages ?? 1);
      }
      setLoading(false);
    });
  }, [page, channel, sendStatus]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader title="Notifications" />
      <ListToolbar
        searchPlaceholder="Search notifications…"
        onSearch={() => { /* search not wired server-side yet */ }}
        filters={[
          { label: 'All Channels', value: 'channel', options: CHANNELS },
          { label: 'All Statuses', value: 'sendStatus', options: STATUSES },
        ]}
        onFilterChange={(key, v) => {
          if (key === 'channel') setChannel(v);
          else if (key === 'sendStatus') setSendStatus(v);
          setPage(1);
        }}
      />
      {loading ? <ProcessLoader title="Loading notifications" steps={['Fetching notification log', 'Preparing list']} /> :
        <DataTable
          columns={[
            { key: 'createdAt', header: 'Date', render: (r: any) => formatIST(r.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) },
            { key: 'channel', header: 'Channel' },
            { key: 'eventType', header: 'Event' },
            { key: 'recipient', header: 'To', render: (r: any) => r.recipientPhone || r.recipientEmail || '—' },
            { key: 'sendStatus', header: 'Status', render: (r: any) => <StatusBadge status={r.sendStatus} /> },
            { key: 'retryCount', header: 'Retries' },
          ]}
          data={data}
          keyField="id"
        />}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
