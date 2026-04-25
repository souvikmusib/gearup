'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: '#f59e0b', PENDING_REVIEW: '#f59e0b', CONFIRMED: '#3b82f6',
  RESCHEDULED: '#8b5cf6', CHECKED_IN: '#10b981', COMPLETED: '#6b7280',
  CANCELLED: '#ef4444', NO_SHOW: '#ef4444',
};

export default function AppointmentCalendarPage() {
  const [events, setEvents] = useState<any[]>([]);
  const router = useRouter();
  const calRef = useRef<any>(null);

  useEffect(() => {
    api.get<any>('/admin/appointments?pageSize=500').then((res) => {
      if (!res.success) return;
      const items = res.data?.items ?? res.data ?? [];
      setEvents(items.map((a: any) => ({
        id: a.id,
        title: `${a.customer?.fullName || 'Customer'} — ${a.vehicle?.registrationNumber || ''}`,
        start: a.slotStart, end: a.slotEnd,
        backgroundColor: STATUS_COLORS[a.status] || '#6b7280',
        borderColor: STATUS_COLORS[a.status] || '#6b7280',
      })));
    });
  }, []);

  return (
    <div>
      <PageHeader title="Shop Calendar" description="Appointments overview" />
      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 [&_.fc]:text-sm [&_.fc-toolbar-title]:text-lg [&_.fc-toolbar-title]:font-semibold [&_.fc-button]:!rounded-lg [&_.fc-button]:!text-xs [&_.fc-button]:!px-3 [&_.fc-button]:!py-1.5 [&_.fc-button-primary]:!bg-blue-600 [&_.fc-button-primary]:!border-blue-600 [&_.fc-button-primary.fc-button-active]:!bg-blue-700 [&_.fc-event]:!rounded [&_.fc-event]:!px-1 [&_.fc-event]:!text-xs [&_.fc-event]:cursor-pointer">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          events={events}
          eventClick={(info) => router.push(`/admin/appointments/${info.event.id}`)}
          slotMinTime="07:00:00" slotMaxTime="21:00:00" allDaySlot={false}
          height="auto" nowIndicator slotDuration="00:30:00"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: color }} />
            {status.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
    </div>
  );
}
