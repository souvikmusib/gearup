'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

const STATUS_ACTIONS: Record<string, { label: string; status: string; color: string }[]> = {
  REQUESTED: [
    { label: 'Confirm', status: 'CONFIRMED', color: 'bg-green-600 hover:bg-green-700' },
    { label: 'Cancel', status: 'CANCELLED', color: 'bg-red-600 hover:bg-red-700' },
  ],
  PENDING_REVIEW: [
    { label: 'Confirm', status: 'CONFIRMED', color: 'bg-green-600 hover:bg-green-700' },
    { label: 'Cancel', status: 'CANCELLED', color: 'bg-red-600 hover:bg-red-700' },
  ],
  CONFIRMED: [
    { label: 'Check In', status: 'CHECKED_IN', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Reschedule', status: 'RESCHEDULED', color: 'bg-yellow-600 hover:bg-yellow-700' },
    { label: 'Cancel', status: 'CANCELLED', color: 'bg-red-600 hover:bg-red-700' },
  ],
  RESCHEDULED: [
    { label: 'Confirm', status: 'CONFIRMED', color: 'bg-green-600 hover:bg-green-700' },
    { label: 'Cancel', status: 'CANCELLED', color: 'bg-red-600 hover:bg-red-700' },
  ],
  CHECKED_IN: [
    { label: 'Complete', status: 'COMPLETED', color: 'bg-green-600 hover:bg-green-700' },
    { label: 'No Show', status: 'NO_SHOW', color: 'bg-gray-600 hover:bg-gray-700' },
  ],
};

export default function AppointmentDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState('');
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');

  const load = () => api.get<any>(`/admin/appointments/${id}`).then((r) => r.success && setData(r.data));
  useEffect(() => {
    load();
    api.get<any>('/admin/workers?pageSize=100').then((r) => r.success && setWorkers(r.data?.items ?? r.data ?? []));
  }, [id]);

  const updateStatus = async (status: string) => {
    if (status === 'RESCHEDULED') { setShowReschedule(true); return; }
    setLoading(status);
    const res = await api.patch<any>(`/admin/appointments/${id}`, { status });
    setLoading('');
    if (res.success) setData(res.data);
  };

  const submitReschedule = async () => {
    if (!rescheduleDate) return;
    setLoading('RESCHEDULED');
    const dt = new Date(rescheduleDate);
    const res = await api.patch<any>(`/admin/appointments/${id}`, {
      status: 'RESCHEDULED', appointmentDate: dt.toISOString(),
      slotStart: dt.toISOString(), slotEnd: new Date(dt.getTime() + 30 * 60000).toISOString(),
      rescheduleReason,
    });
    setLoading('');
    setShowReschedule(false);
    if (res.success) setData(res.data);
  };

  const assignWorker = async (workerId: string) => {
    const res = await api.patch<any>(`/admin/appointments/${id}`, { assignedWorkerId: workerId || null });
    if (res.success) setData(res.data);
  };

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  const actions = STATUS_ACTIONS[data.status] || [];
  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div>
      <PageHeader title={`Appointment ${data.referenceId}`} />

      {actions.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button key={a.status} disabled={!!loading} onClick={() => updateStatus(a.status)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow ${a.color} disabled:opacity-50`}>
              {loading === a.status ? 'Updating...' : a.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Appointment Details</h3>
          <StatusBadge status={data.status} />
          <p className="text-sm text-gray-600 dark:text-gray-400">Date: {new Date(data.appointmentDate).toLocaleDateString()}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Slot: {new Date(data.slotStart).toLocaleTimeString()} – {new Date(data.slotEnd).toLocaleTimeString()}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Source: {data.bookingSource}</p>
          {data.rescheduleReason && <p className="text-sm text-yellow-600">Reschedule reason: {data.rescheduleReason}</p>}
          {data.cancellationReason && <p className="text-sm text-red-600">Cancellation reason: {data.cancellationReason}</p>}
          {data.confirmedBy && <p className="text-sm text-gray-500">Confirmed by: {data.confirmedBy.fullName}</p>}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Customer</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{data.customer?.fullName} · {data.customer?.phoneNumber}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Vehicle</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{data.vehicle?.registrationNumber} · {data.vehicle?.brand} {data.vehicle?.model}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Assigned Worker</h3>
            <select className={inputCls} value={data.assignedWorkerId || ''} onChange={(e) => assignWorker(e.target.value)}>
              <option value="">Unassigned</option>
              {workers.map((w: any) => <option key={w.id} value={w.id}>{w.fullName} ({w.workerCode})</option>)}
            </select>
          </div>
          {data.serviceRequest && (
            <button onClick={() => router.push(`/admin/service-requests/${data.serviceRequest.id}`)} className="text-sm text-blue-600 hover:underline">View Service Request →</button>
          )}
        </div>
      </div>

      <Modal open={showReschedule} onClose={() => setShowReschedule(false)} title="Reschedule Appointment">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">New Date & Time *</label><input type="datetime-local" className={inputCls} value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Reason</label><input className={inputCls} value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)} /></div>
          <button onClick={submitReschedule} disabled={!rescheduleDate || !!loading} className="w-full rounded-lg bg-yellow-600 py-2 text-sm font-semibold text-white hover:bg-yellow-700 disabled:opacity-50">
            {loading ? 'Saving...' : 'Reschedule'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
