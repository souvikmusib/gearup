'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function AppointmentCalendarPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/admin/appointments?pageSize=200').then((res) => {
      if (res.success) setItems(res.data?.items ?? res.data ?? []);
      setLoading(false);
    });
  }, []);

  const grouped = useMemo(() => {
    return items.reduce<Record<string, any[]>>((acc, item) => {
      const key = new Date(item.appointmentDate).toISOString().slice(0, 10);
      acc[key] = [...(acc[key] ?? []), item];
      return acc;
    }, {});
  }, [items]);

  return (
    <div className="space-y-6">
      <PageHeader title="Appointment Calendar" description="Visual calendar view of booked service slots" />
      {loading ? <p className="py-8 text-center text-gray-500">Loading...</p> : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Object.keys(grouped).length === 0 && <p className="text-sm text-gray-500">No appointments scheduled.</p>}
          {Object.entries(grouped).map(([date, dayItems]) => (
            <section key={date} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-white">{fmtDate(date)}</h3>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{dayItems.length} slots</span>
              </div>
              <div className="space-y-3">
                {dayItems.map((appt) => (
                  <Link key={appt.id} href={`/admin/appointments/${appt.id}`} className="block rounded-lg border border-gray-100 p-3 hover:border-blue-300 hover:bg-blue-50/40 dark:border-gray-700 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900 dark:text-white">{fmtTime(appt.slotStart)} - {fmtTime(appt.slotEnd)}</span>
                      <span className="text-xs text-gray-500">{appt.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{appt.customer?.fullName ?? 'Customer'}</p>
                    <p className="text-xs text-gray-500">{appt.vehicle?.registrationNumber ?? 'Vehicle'} {appt.worker?.fullName ? `- ${appt.worker.fullName}` : ''}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
