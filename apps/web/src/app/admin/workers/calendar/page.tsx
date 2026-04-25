'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';

function fmtTime(value?: string | null) {
  if (!value) return 'Not set';
  return value;
}

export default function WorkerCalendarPage() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<any>('/admin/workers?pageSize=200'),
      api.get<any>('/admin/appointments?pageSize=200'),
    ]).then(([workerRes, appointmentRes]) => {
      if (workerRes.success) setWorkers(workerRes.data?.items ?? workerRes.data ?? []);
      if (appointmentRes.success) setAppointments(appointmentRes.data?.items ?? appointmentRes.data ?? []);
      setLoading(false);
    });
  }, []);

  const byWorker = useMemo(() => {
    return appointments.reduce<Record<string, any[]>>((acc, appointment) => {
      if (!appointment.assignedWorkerId) return acc;
      acc[appointment.assignedWorkerId] = [...(acc[appointment.assignedWorkerId] ?? []), appointment];
      return acc;
    }, {});
  }, [appointments]);

  return (
    <div className="space-y-6">
      <PageHeader title="Worker Calendar" description="View shifts, assigned appointments, and active load" />
      {loading ? <p className="py-8 text-center text-gray-500">Loading...</p> : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {workers.map((worker) => {
            const assigned = byWorker[worker.id] ?? [];
            return (
              <section key={worker.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/admin/workers/${worker.id}`} className="font-semibold text-gray-900 hover:text-blue-600 dark:text-white">{worker.fullName}</Link>
                    <p className="text-sm text-gray-500">{worker.workerCode} - {worker.designation ?? 'Worker'}</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">{worker.status}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                    <p className="text-xs text-gray-500">Shift</p>
                    <p className="font-medium text-gray-900 dark:text-white">{fmtTime(worker.shiftStart)} - {fmtTime(worker.shiftEnd)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                    <p className="text-xs text-gray-500">Assigned Slots</p>
                    <p className="font-medium text-gray-900 dark:text-white">{assigned.length}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {assigned.slice(0, 4).map((appointment) => (
                    <Link key={appointment.id} href={`/admin/appointments/${appointment.id}`} className="block rounded-lg border border-gray-100 p-2 text-sm hover:border-blue-300 dark:border-gray-700">
                      <span className="font-medium text-gray-900 dark:text-white">{new Date(appointment.slotStart).toLocaleString()}</span>
                      <span className="ml-2 text-gray-500">{appointment.customer?.fullName ?? appointment.referenceId}</span>
                    </Link>
                  ))}
                  {assigned.length === 0 && <p className="text-sm text-gray-500">No assigned appointments.</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
