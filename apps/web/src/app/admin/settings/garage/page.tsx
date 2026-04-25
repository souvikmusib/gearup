'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
import { ProcessLoader } from '@/components/shared/process-loader';

export default function GarageConfigPage() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [hours, setHours] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const workersReq = api.getSWR<any>('/admin/workers?pageSize=200');
    const hoursReq = api.getSWR<any>('/admin/settings/business-hours');
    if (workersReq.cached?.success) setWorkers(workersReq.cached.data?.items ?? workersReq.cached.data ?? []);
    if (hoursReq.cached?.success) setHours(hoursReq.cached.data ?? []);
    if (workersReq.cached?.success && hoursReq.cached?.success) setLoading(false);
    Promise.all([workersReq.promise, hoursReq.promise]).then(([workerRes, hoursRes]) => {
      if (workerRes.success) setWorkers(workerRes.data?.items ?? workerRes.data ?? []);
      if (hoursRes.success) setHours(hoursRes.data ?? []);
      setLoading(false);
    });
  }, []);

  const roleCounts = useMemo(() => {
    return workers.reduce<Record<string, number>>((acc, worker) => {
      const key = worker.designation || 'Unassigned role';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }, [workers]);

  if (loading) return <ProcessLoader title="Loading garage configuration" steps={['Reading worker roster', 'Checking role coverage', 'Loading business-hour rules']} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Garage Config" description="Worker roles, availability rules, and operational setup" />
        <div className="flex gap-2">
          <Link prefetch={false} href="/admin/workers" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Manage Workers</Link>
          <Link prefetch={false} href="/admin/settings/business-hours" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Business Hours</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Total workers" value={workers.length} />
        <Metric label="Active workers" value={workers.filter((worker) => worker.status === 'ACTIVE').length} />
        <Metric label="Configured roles" value={Object.keys(roleCounts).length} />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="font-semibold text-gray-900 dark:text-white">Role Coverage</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(roleCounts).map(([role, count]) => (
            <div key={role} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{role}</p>
              <p className="text-xs text-gray-500">{count} worker{count === 1 ? '' : 's'}</p>
            </div>
          ))}
          {Object.keys(roleCounts).length === 0 && <p className="text-sm text-gray-500">No workers configured yet.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="font-semibold text-gray-900 dark:text-white">Workers</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-2">Code</th><th>Name</th><th>Role</th><th>Specialization</th><th>Status</th><th>Shift</th></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {workers.map((worker) => (
                <tr key={worker.id}>
                  <td className="py-2 font-mono">{worker.workerCode}</td>
                  <td><Link prefetch={false} href={`/admin/workers/${worker.id}`} className="font-medium text-blue-600 hover:underline">{worker.fullName}</Link></td>
                  <td>{worker.designation || 'Not set'}</td>
                  <td>{worker.specialization || 'General'}</td>
                  <td><StatusBadge status={worker.status} /></td>
                  <td>{worker.shiftStart || 'Not set'} - {worker.shiftEnd || 'Not set'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="font-semibold text-gray-900 dark:text-white">Business Rules</h2>
        <p className="mt-2 text-sm text-gray-500">{hours.length} active slot rule{hours.length === 1 ? '' : 's'} configured. Use Business Hours for slot duration and capacity, and Holidays for closures.</p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
