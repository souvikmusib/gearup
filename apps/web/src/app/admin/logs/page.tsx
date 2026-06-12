'use client';
import { formatIST, formatTimeIST } from '@/lib/time';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable } from '@gearup/ui';
import { Pagination } from '@/components/shared/pagination';

type LogRow = {
  id: string;
  createdAt: string;
  actorType: string;
  actorId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  previousValueJson?: unknown;
  newValueJson?: unknown;
  adminUser?: { fullName?: string; adminUserId?: string } | null;
  [key: string]: unknown;
};

const ENTITY_TYPES = ['Invoice', 'Customer', 'Vehicle', 'AdminUser', 'Booking', 'InventoryItem', 'StockMovement', 'Payment', 'Service', 'Part'];
const ACTOR_TYPES = ['ADMIN', 'WORKER', 'SYSTEM', 'PUBLIC'];

export default function ActivityLogsPage() {
  const [data, setData] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [actorType, setActorType] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const buildParams = (pg: number) => {
    const params = new URLSearchParams();
    if (entityType) params.set('entityType', entityType);
    if (actorType) params.set('actorType', actorType);
    if (action && action.length >= 2) params.set('action', action);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('page', String(pg));
    return params;
  };

  const load = (pg = page) => {
    setLoading(true);
    api.get<LogRow[]>(`/admin/logs?${buildParams(pg)}`).then((r) => {
      if (r.success) {
        setData(r.data ?? []);
        setTotalPages(r.meta?.totalPages ?? 1);
      }
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [page]);

  const onApply = () => { setPage(1); load(1); };
  const onReset = () => {
    setEntityType(''); setActorType(''); setAction(''); setFrom(''); setTo(''); setPage(1);
    setTimeout(() => load(1), 0);
  };
  const onExport = () => {
    const params = buildParams(1);
    params.delete('page');
    window.open(`/api/admin/logs/export?${params}`, '_blank');
  };

  const inputCls = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div>
      <PageHeader title="Activity Logs" />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Entity</label>
          <select className={inputCls} value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">All</option>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Actor</label>
          <select className={inputCls} value={actorType} onChange={(e) => setActorType(e.target.value)}>
            <option value="">All</option>
            {ACTOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Action (min 2 chars)</label>
          <input className={inputCls} value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. update" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={onApply} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Apply</button>
        <button onClick={onReset} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">Reset</button>
        <button onClick={onExport} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">Export CSV</button>
      </div>
      {loading ? <ProcessLoader title="Loading activity" steps={['Fetching activity logs', 'Preparing list']} /> :
        <>
          <DataTable<LogRow> columns={[
            { key: 'createdAt', header: 'Time', render: (r) => formatIST(r.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) },
            { key: 'actorType', header: 'Actor' },
            { key: 'actor', header: 'User', render: (r) => r.adminUser?.fullName ?? r.actorId ?? '—' },
            { key: 'entityType', header: 'Entity' },
            { key: 'entityId', header: 'ID', render: (r) => r.entityId?.slice(0, 8) ?? '—' },
            { key: 'action', header: 'Action' },
            { key: 'details', header: '', render: (r) => (
              <button
                onClick={() => setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))}
                className="text-xs text-blue-600 hover:underline"
              >
                {expanded[r.id] ? 'Hide' : 'Details'}
              </button>
            ) },
          ]} data={data} keyField="id" />
          {data.filter((r) => expanded[r.id]).map((r) => (
            <div key={`exp-${r.id}`} className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-2 font-semibold text-gray-700 dark:text-gray-300">
                {r.entityType} · {r.action} · {formatIST(r.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-gray-500">Previous</div>
                  <pre className="overflow-auto rounded bg-white p-2 dark:bg-gray-900">{JSON.stringify(r.previousValueJson ?? null, null, 2)}</pre>
                </div>
                <div>
                  <div className="mb-1 text-gray-500">New</div>
                  <pre className="overflow-auto rounded bg-white p-2 dark:bg-gray-900">{JSON.stringify(r.newValueJson ?? null, null, 2)}</pre>
                </div>
              </div>
            </div>
          ))}
        </>}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
