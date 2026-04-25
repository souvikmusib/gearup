'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

const APPT_COLORS: Record<string, string> = {
  REQUESTED: '#f59e0b', PENDING_REVIEW: '#f59e0b', CONFIRMED: '#3b82f6',
  RESCHEDULED: '#8b5cf6', CHECKED_IN: '#10b981', COMPLETED: '#6b7280',
  CANCELLED: '#ef4444', NO_SHOW: '#ef4444',
};

const calendarCls = "rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 [&_.fc]:text-sm [&_.fc-toolbar-title]:text-lg [&_.fc-toolbar-title]:font-semibold [&_.fc-button]:!rounded-lg [&_.fc-button]:!text-xs [&_.fc-button]:!px-3 [&_.fc-button]:!py-1.5 [&_.fc-button-primary]:!bg-blue-600 [&_.fc-button-primary]:!border-blue-600 [&_.fc-button-primary.fc-button-active]:!bg-blue-700 [&_.fc-event]:!rounded [&_.fc-event]:!px-1 [&_.fc-event]:!text-xs [&_.fc-event]:cursor-pointer";

export default function CalendarPage() {
  const [tab, setTab] = useState<'shop' | 'worker'>('shop');
  const [apptEvents, setApptEvents] = useState<any[]>([]);
  const [workerEvents, setWorkerEvents] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [selectedWorker, setSelectedWorker] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Load appointments
    api.get<any>('/admin/appointments?pageSize=500').then((res) => {
      if (!res.success) return;
      const items = res.data?.items ?? res.data ?? [];
      setApptEvents(items.map((a: any) => ({
        id: a.id, title: `${a.customer?.fullName || 'Customer'} — ${a.vehicle?.registrationNumber || ''}`,
        start: a.slotStart, end: a.slotEnd,
        backgroundColor: APPT_COLORS[a.status] || '#6b7280', borderColor: APPT_COLORS[a.status] || '#6b7280',
      })));
    });
    // Load worker data
    api.get<any>('/admin/workers/calendar').then((res) => {
      if (!res.success) return;
      const { workers: w, leaves, assignments } = res.data;
      setWorkers(w);
      const evts: any[] = [];
      leaves.forEach((l: any) => {
        const worker = w.find((wr: any) => wr.id === l.workerId);
        evts.push({
          id: `leave-${l.id}`, title: `🏖 ${worker?.fullName || 'Worker'} — ${l.leaveType}`,
          start: l.startDate, end: l.endDate, allDay: true,
          backgroundColor: l.status === 'APPROVED' ? '#f59e0b' : '#d1d5db', borderColor: l.status === 'APPROVED' ? '#f59e0b' : '#d1d5db', textColor: '#1f2937',
          extendedProps: { type: 'leave', workerId: l.workerId },
        });
      });
      assignments.forEach((a: any) => {
        const jc = a.jobCard; if (!jc) return;
        const color = jc.status === 'DELIVERED' || jc.status === 'CLOSED' ? '#6b7280' : jc.status === 'WORK_IN_PROGRESS' ? '#3b82f6' : '#10b981';
        evts.push({
          id: `assign-${a.id}`, title: `🔧 ${a.worker?.fullName} — ${jc.jobCardNumber}`,
          start: jc.intakeDate, end: jc.estimatedDeliveryAt || jc.intakeDate, allDay: true,
          backgroundColor: color, borderColor: color,
          extendedProps: { type: 'assignment', jobCardId: a.jobCardId, workerId: a.workerId },
        });
      });
      setWorkerEvents(evts);
    });
  }, []);

  const filteredWorkerEvents = selectedWorker ? workerEvents.filter((e) => e.extendedProps?.workerId === selectedWorker) : workerEvents;
  const tabCls = (t: string) => `px-4 py-2 text-sm font-medium rounded-lg ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'}`;

  return (
    <div>
      <PageHeader title="Calendar" description="Shop appointments & worker schedules" />
      <div className="mt-4 flex items-center gap-2 mb-4">
        <button onClick={() => setTab('shop')} className={tabCls('shop')}>Shop Calendar</button>
        <button onClick={() => setTab('worker')} className={tabCls('worker')}>Worker Calendar</button>
        {tab === 'worker' && (
          <select className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" value={selectedWorker} onChange={(e) => setSelectedWorker(e.target.value)}>
            <option value="">All Workers</option>
            {workers.map((w: any) => <option key={w.id} value={w.id}>{w.fullName}</option>)}
          </select>
        )}
      </div>

      {tab === 'shop' && (
        <div className={calendarCls}>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
            events={apptEvents}
            eventClick={(info) => router.push(`/admin/appointments/${info.event.id}`)}
            slotMinTime="07:00:00" slotMaxTime="21:00:00" allDaySlot={false}
            height="auto" nowIndicator slotDuration="00:30:00"
          />
        </div>
      )}

      {tab === 'worker' && (
        <div className={calendarCls}>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
            events={filteredWorkerEvents}
            eventClick={(info) => {
              const props = info.event.extendedProps;
              if (props?.workerId) router.push(`/admin/workers/${props.workerId}`);
            }}
            height="auto" nowIndicator
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {tab === 'shop' ? (
          <>
            {Object.entries(APPT_COLORS).map(([s, c]) => (
              <span key={s} className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: c }} />{s.replace(/_/g, ' ')}</span>
            ))}
          </>
        ) : (
          <>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-blue-500" /> Work In Progress</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-green-500" /> Assigned</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-gray-500" /> Completed</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-amber-500" /> On Leave</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-gray-300" /> Leave Pending</span>
          </>
        )}
      </div>
    </div>
  );
}
