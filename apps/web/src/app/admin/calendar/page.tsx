'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';

const statusTone: Record<string, string> = {
  REQUESTED: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
  PENDING_REVIEW: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
  CONFIRMED: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200',
  RESCHEDULED: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200',
  CHECKED_IN: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
  COMPLETED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  CANCELLED: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200',
  NO_SHOW: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200',
};

function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function CalendarPage() {
  const [tab, setTab] = useState<'shop' | 'worker'>('shop');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [loadingShop, setLoadingShop] = useState(true);
  const [loadingWorkers, setLoadingWorkers] = useState(true);

  useEffect(() => {
    const apptReq = api.getSWR<any>('/admin/appointments?pageSize=500');
    const holReq = api.getSWR<any>('/admin/settings/holidays');
    const applyShop = (apptRes: any, holRes: any) => {
      if (apptRes.success) setAppointments(apptRes.data?.items ?? apptRes.data ?? []);
      if (holRes.success) setHolidays(holRes.data ?? []);
      setLoadingShop(false);
    };
    if (apptReq.cached?.success && holReq.cached?.success) applyShop(apptReq.cached, holReq.cached);
    Promise.all([apptReq.promise, holReq.promise]).then(([apptRes, holRes]) => applyShop(apptRes, holRes));

    const workerReq = api.getSWR<any>('/admin/workers/calendar');
    const applyWorkers = (res: any) => {
      if (res.success) {
        setWorkers(res.data?.workers ?? []);
        setLeaves(res.data?.leaves ?? []);
        setAssignments(res.data?.assignments ?? []);
      }
      setLoadingWorkers(false);
    };
    if (workerReq.cached?.success) applyWorkers(workerReq.cached);
    workerReq.promise.then(applyWorkers);
  }, []);

  const shopDays = useMemo(() => {
    const grouped: Record<string, { appointments: any[]; holidays: any[] }> = {};
    appointments.forEach((appointment) => {
      const key = dayKey(appointment.appointmentDate);
      grouped[key] ??= { appointments: [], holidays: [] };
      grouped[key].appointments.push(appointment);
    });
    holidays.forEach((holiday) => {
      const key = dayKey(holiday.holidayDate);
      grouped[key] ??= { appointments: [], holidays: [] };
      grouped[key].holidays.push(holiday);
    });
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).slice(0, 21);
  }, [appointments, holidays]);

  const workerCards = useMemo(() => {
    const visibleWorkers = selectedWorker ? workers.filter((worker) => worker.id === selectedWorker) : workers;
    return visibleWorkers.map((worker) => {
      const workerLeaves = leaves.filter((leave) => leave.workerId === worker.id);
      const workerAssignments = assignments.filter((assignment) => assignment.workerId === worker.id);
      return { worker, workerLeaves, workerAssignments };
    });
  }, [assignments, leaves, selectedWorker, workers]);

  const tabCls = (value: 'shop' | 'worker') =>
    `px-4 py-2 text-sm font-medium rounded-lg ${tab === value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" description="Shop appointments and worker schedules" />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setTab('shop')} className={tabCls('shop')}>Shop Calendar</button>
        <button onClick={() => setTab('worker')} className={tabCls('worker')}>Worker Calendar</button>
        <div className="ml-auto flex gap-2">
          <Link href="/admin/appointments/calendar" className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">Appointments Card View</Link>
          <Link href="/admin/workers/calendar" className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">Workers Card View</Link>
        </div>
        {tab === 'worker' && (
          <select className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" value={selectedWorker} onChange={(e) => setSelectedWorker(e.target.value)}>
            <option value="">All Workers</option>
            {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.fullName}</option>)}
          </select>
        )}
      </div>

      {tab === 'shop' && (
        loadingShop ? <p className="py-8 text-center text-gray-500">Loading...</p> : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {shopDays.length === 0 && <p className="text-sm text-gray-500">No calendar entries yet.</p>}
            {shopDays.map(([date, day]) => (
              <section key={date} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">{fmtDate(date)}</h3>
                <div className="space-y-3">
                  {day.holidays.map((holiday) => (
                    <div key={holiday.id} className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                      Closed: {holiday.holidayName}
                    </div>
                  ))}
                  {day.appointments.map((appointment) => (
                    <Link key={appointment.id} href={`/admin/appointments/${appointment.id}`} className="block rounded-lg border border-gray-100 p-3 hover:border-blue-300 hover:bg-blue-50/40 dark:border-gray-700 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{fmtTime(appointment.slotStart)} - {fmtTime(appointment.slotEnd)}</span>
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusTone[appointment.status] ?? statusTone.COMPLETED}`}>{appointment.status.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{appointment.customer?.fullName ?? 'Customer'}</p>
                      <p className="text-xs text-gray-500">{appointment.vehicle?.registrationNumber ?? 'Vehicle'} {appointment.worker?.fullName ? `- ${appointment.worker.fullName}` : ''}</p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      )}

      {tab === 'worker' && (
        loadingWorkers ? <p className="py-8 text-center text-gray-500">Loading...</p> : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {workerCards.map(({ worker, workerLeaves, workerAssignments }) => (
              <section key={worker.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <Link href={`/admin/workers/${worker.id}`} className="font-semibold text-gray-900 hover:text-blue-600 dark:text-white">{worker.fullName}</Link>
                <p className="text-sm text-gray-500">{worker.workerCode} - {worker.designation ?? 'Worker'}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                    <p className="text-xs text-gray-500">Assignments</p>
                    <p className="font-medium text-gray-900 dark:text-white">{workerAssignments.length}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                    <p className="text-xs text-gray-500">Leaves</p>
                    <p className="font-medium text-gray-900 dark:text-white">{workerLeaves.length}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {workerAssignments.slice(0, 4).map((assignment) => (
                    <Link key={assignment.id} href={`/admin/job-cards/${assignment.jobCardId}`} className="block rounded-lg border border-gray-100 p-2 text-sm hover:border-blue-300 dark:border-gray-700">
                      <span className="font-medium text-gray-900 dark:text-white">{assignment.jobCard?.jobCardNumber ?? 'Job Card'}</span>
                      <span className="ml-2 text-gray-500">{assignment.jobCard?.status?.replace(/_/g, ' ')}</span>
                    </Link>
                  ))}
                  {workerLeaves.slice(0, 3).map((leave) => (
                    <div key={leave.id} className="rounded-lg border border-amber-100 bg-amber-50 p-2 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                      {leave.leaveType} leave: {fmtDate(leave.startDate)} - {fmtDate(leave.endDate)}
                    </div>
                  ))}
                  {workerAssignments.length === 0 && workerLeaves.length === 0 && <p className="text-sm text-gray-500">No assignments or leave records.</p>}
                </div>
              </section>
            ))}
          </div>
        )
      )}
    </div>
  );
}
