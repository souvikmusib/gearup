'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';

const STATUS_ACTIONS: Record<string, { label: string; status: string; color: string }[]> = {
  SUBMITTED: [
    { label: 'Accept / Under Review', status: 'UNDER_REVIEW', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Cancel', status: 'CANCELLED', color: 'bg-red-600 hover:bg-red-700' },
  ],
  UNDER_REVIEW: [
    { label: 'Schedule Appointment', status: 'APPOINTMENT_PENDING', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Cancel', status: 'CANCELLED', color: 'bg-red-600 hover:bg-red-700' },
  ],
  APPOINTMENT_PENDING: [
    { label: 'Confirm Appointment', status: 'APPOINTMENT_CONFIRMED', color: 'bg-green-600 hover:bg-green-700' },
    { label: 'Cancel', status: 'CANCELLED', color: 'bg-red-600 hover:bg-red-700' },
  ],
  APPOINTMENT_CONFIRMED: [
    { label: 'Convert to Job', status: 'CONVERTED_TO_JOB', color: 'bg-purple-600 hover:bg-purple-700' },
    { label: 'Cancel', status: 'CANCELLED', color: 'bg-red-600 hover:bg-red-700' },
  ],
  CONVERTED_TO_JOB: [
    { label: 'Close', status: 'CLOSED', color: 'bg-gray-600 hover:bg-gray-700' },
  ],
};

export default function ServiceRequestDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState('');

  const load = () => api.get<any>(`/admin/service-requests/${id}`).then((r) => r.success && setData(r.data));
  useEffect(() => { load(); }, [id]);

  const updateStatus = async (status: string) => {
    setLoading(status);
    const res = await api.patch<any>(`/admin/service-requests/${id}`, { status });
    setLoading('');
    if (res.success) setData(res.data);
  };

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  const actions = STATUS_ACTIONS[data.status] || [];

  return (
    <div>
      <PageHeader title={`Request ${data.referenceId}`} description={data.serviceCategory} />

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
          <h3 className="font-semibold text-gray-900 dark:text-white">Request Details</h3>
          <div className="flex gap-2"><StatusBadge status={data.status} /></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{data.issueDescription}</p>
          {data.preferredDate && <p className="text-sm text-gray-500 dark:text-gray-400">Preferred Date: {new Date(data.preferredDate).toLocaleDateString()}</p>}
          {data.urgency && <p className="text-sm text-gray-500 dark:text-gray-400">Urgency: {data.urgency}</p>}
          {data.pickupDropRequired && <p className="text-sm text-gray-500 dark:text-gray-400">🚗 Pickup/Drop requested</p>}
          {data.notes && <p className="text-sm text-gray-500 dark:text-gray-400">Notes: {data.notes}</p>}
          <p className="text-xs text-gray-400">Created: {new Date(data.createdAt).toLocaleString()}</p>
          {data.closedAt && <p className="text-xs text-gray-400">Closed: {new Date(data.closedAt).toLocaleString()}</p>}
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Customer</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{data.customer?.fullName} · {data.customer?.phoneNumber}</p>
            {data.customer?.email && <p className="text-sm text-gray-500 dark:text-gray-400">{data.customer.email}</p>}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Vehicle</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{data.vehicle?.registrationNumber} · {data.vehicle?.brand} {data.vehicle?.model}</p>
          </div>
          {data.appointment && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">Appointment</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{new Date(data.appointment.appointmentDate).toLocaleDateString()} · <StatusBadge status={data.appointment.status} /></p>
              <button onClick={() => router.push(`/admin/appointments/${data.appointment.id}`)} className="mt-2 text-sm text-blue-600 hover:underline">View Appointment →</button>
            </div>
          )}
          {data.jobCards?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">Job Cards</h3>
              {data.jobCards.map((jc: any) => (
                <div key={jc.id} className="mt-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">{jc.jobCardNumber} · <StatusBadge status={jc.status} /></p>
                  <button onClick={() => router.push(`/admin/job-cards/${jc.id}`)} className="text-sm text-blue-600 hover:underline">View Job Card →</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
