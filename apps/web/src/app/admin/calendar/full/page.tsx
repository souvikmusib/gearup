'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
import { ProcessLoader } from '@/components/shared/process-loader';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

const APPT_COLORS: Record<string, string> = {
  REQUESTED: '#f59e0b', PENDING_REVIEW: '#f59e0b', CONFIRMED: '#3b82f6',
  RESCHEDULED: '#8b5cf6', CHECKED_IN: '#10b981', COMPLETED: '#6b7280',
  CANCELLED: '#ef4444', NO_SHOW: '#ef4444',
};

const calCls = "rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 [&_.fc]:text-sm [&_.fc-toolbar-title]:text-lg [&_.fc-toolbar-title]:font-semibold [&_.fc-button]:!rounded-lg [&_.fc-button]:!text-xs [&_.fc-button]:!px-3 [&_.fc-button]:!py-1.5 [&_.fc-button-primary]:!bg-blue-600 [&_.fc-button-primary]:!border-blue-600 [&_.fc-button-primary.fc-button-active]:!bg-blue-700 [&_.fc-event]:!rounded [&_.fc-event]:!px-1 [&_.fc-event]:!text-xs [&_.fc-event]:cursor-pointer";

type CalEvent = {
  id: string;
  title: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps?: { workerId?: string };
};

type AppointmentItem = {
  id: string;
  status: string;
  slotStart?: string;
  slotEnd?: string;
  customer?: { fullName?: string } | null;
  vehicle?: { registrationNumber?: string } | null;
};

type HolidayItem = { id: string; holidayName: string; holidayDate: string };

type WorkerItem = { id: string; fullName: string };

type LeaveItem = {
  id: string;
  workerId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
};

type AssignmentItem = {
  id: string;
  workerId: string;
  worker?: { fullName?: string } | null;
  jobCard?: {
    jobCardNumber: string;
    status: string;
    intakeDate: string;
    estimatedDeliveryAt?: string | null;
  } | null;
};

type WorkerCalendarResponse = {
  workers: WorkerItem[];
  leaves: LeaveItem[];
  assignments: AssignmentItem[];
};

export default function FullCalendarPage() {
  const [tab, setTab] = useState<'shop' | 'worker'>('shop');
  const [apptEvents, setApptEvents] = useState<CalEvent[]>([]);
  const [workerEvents, setWorkerEvents] = useState<CalEvent[]>([]);
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [loadingShop, setLoadingShop] = useState(true);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [workerLoaded, setWorkerLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fromDate = new Date();
    fromDate.setDate(1);
    fromDate.setHours(0, 0, 0, 0);
    fromDate.setDate(fromDate.getDate() - 7);
    const toDate = new Date(fromDate.getFullYear(), fromDate.getMonth() + 2, 0);
    toDate.setDate(toDate.getDate() + 7);
    const from = fromDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const to = toDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    Promise.all([
      api.get<{ items?: AppointmentItem[] } | AppointmentItem[]>(`/admin/appointments?pageSize=200&from=${from}&to=${to}`),
      api.get<HolidayItem[]>('/admin/settings/holidays'),
    ]).then(([apptRes, holRes]) => {
      const events: CalEvent[] = [];
      if (apptRes.success) {
        const data = apptRes.data;
        const items: AppointmentItem[] = Array.isArray(data)
          ? data
          : ((data as { items?: AppointmentItem[] } | null | undefined)?.items ?? []);
        items.forEach((a) => {
          events.push({ id: a.id, title: `${a.customer?.fullName || 'Customer'} — ${a.vehicle?.registrationNumber || ''}`, start: a.slotStart, end: a.slotEnd, backgroundColor: APPT_COLORS[a.status] || '#6b7280', borderColor: APPT_COLORS[a.status] || '#6b7280' });
        });
      }
      if (holRes.success) {
        (holRes.data ?? []).forEach((h) => {
          events.push({ id: `hol-${h.id}`, title: `🚫 ${h.holidayName}`, start: h.holidayDate, allDay: true, backgroundColor: '#ef4444', borderColor: '#ef4444' });
        });
      }
      setApptEvents(events);
      setLoadingShop(false);
    });
  }, []);

  useEffect(() => {
    if (tab !== 'worker' || workerLoaded) return;
    setLoadingWorkers(true);
    api.get<WorkerCalendarResponse>('/admin/workers/calendar').then((res) => {
      if (!res.success) {
        setLoadingWorkers(false);
        return;
      }
      const data = res.data ?? ({} as Partial<WorkerCalendarResponse>);
      const w: WorkerItem[] = data.workers ?? [];
      const leaves: LeaveItem[] = data.leaves ?? [];
      const assignments: AssignmentItem[] = data.assignments ?? [];
      setWorkers(w);
      const evts: CalEvent[] = [];
      leaves.forEach((l) => {
        const worker = w.find((wr) => wr.id === l.workerId);
        evts.push({ id: `leave-${l.id}`, title: `🏖 ${worker?.fullName || 'Worker'} — ${l.leaveType}`, start: l.startDate, end: l.endDate, allDay: true, backgroundColor: l.status === 'APPROVED' ? '#f59e0b' : '#d1d5db', borderColor: l.status === 'APPROVED' ? '#f59e0b' : '#d1d5db', textColor: '#1f2937', extendedProps: { workerId: l.workerId } });
      });
      assignments.forEach((a) => {
        const jc = a.jobCard; if (!jc) return;
        const color = jc.status === 'DELIVERED' || jc.status === 'CLOSED' ? '#6b7280' : jc.status === 'WORK_IN_PROGRESS' ? '#3b82f6' : '#10b981';
        evts.push({ id: `assign-${a.id}`, title: `🔧 ${a.worker?.fullName || 'Worker'} — ${jc.jobCardNumber}`, start: jc.intakeDate, end: jc.estimatedDeliveryAt || jc.intakeDate, allDay: true, backgroundColor: color, borderColor: color, extendedProps: { workerId: a.workerId } });
      });
      setWorkerEvents(evts);
      setWorkerLoaded(true);
      setLoadingWorkers(false);
    });
  }, [tab, workerLoaded]);

  const filteredWorkerEvents = selectedWorker ? workerEvents.filter((e) => e.extendedProps?.workerId === selectedWorker) : workerEvents;
  const tabCls = (t: string) => `px-4 py-2 text-sm font-medium rounded-lg ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'}`;

  return (
    <div>
      <PageHeader title="Full Calendar" description="Shop appointments & worker schedules" />
      <div className="mt-4 flex items-center gap-2 mb-4">
        <button onClick={() => setTab('shop')} className={tabCls('shop')}>Shop Calendar</button>
        <button onClick={() => setTab('worker')} className={tabCls('worker')}>Worker Calendar</button>
        {tab === 'worker' && (
          <select className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" value={selectedWorker} onChange={(e) => setSelectedWorker(e.target.value)}>
            <option value="">All Workers</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.fullName}</option>)}
          </select>
        )}
        <button onClick={() => router.push('/admin/calendar')} className="ml-auto rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">← Card View</button>
      </div>

      {tab === 'shop' && (
        <div className={calCls}>
          {loadingShop ? <ProcessLoader title="Loading full calendar" steps={['Fetching appointment window', 'Loading holidays', 'Building calendar events']} /> : (
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
              events={apptEvents}
              eventClick={(info) => { if (!info.event.id.startsWith('hol-')) router.push(`/admin/appointments/${info.event.id}`); }}
              slotMinTime="07:00:00" slotMaxTime="21:00:00" allDaySlot
              height="auto" nowIndicator slotDuration="00:30:00"
            />
          )}
        </div>
      )}

      {tab === 'worker' && (
        <div className={calCls}>
          {loadingWorkers ? <ProcessLoader title="Loading worker calendar" steps={['Fetching worker assignments', 'Loading leave windows', 'Building worker events']} /> : (
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
              events={filteredWorkerEvents}
              eventClick={(info) => { const wId = info.event.extendedProps?.workerId; if (wId) router.push(`/admin/workers/${wId}`); }}
              height="auto" nowIndicator
            />
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {tab === 'shop' ? (
          <>
            {Object.entries(APPT_COLORS).map(([s, c]) => (
              <span key={s} className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: c }} />{s.replace(/_/g, ' ')}</span>
            ))}
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-red-500" /> Holiday</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-blue-500" /> Work In Progress</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-green-500" /> Assigned</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-gray-500" /> Completed</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-amber-500" /> On Leave</span>
          </>
        )}
      </div>
    </div>
  );
}
