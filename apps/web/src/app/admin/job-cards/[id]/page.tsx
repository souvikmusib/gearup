'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';

const STATUS_ACTIONS: Record<string, { label: string; status: string; color: string }[]> = {
  CREATED: [{ label: 'Start Inspection', status: 'UNDER_INSPECTION', color: 'bg-blue-600 hover:bg-blue-700' }, { label: 'Cancel', status: 'CANCELLED', color: 'bg-red-600 hover:bg-red-700' }],
  UNDER_INSPECTION: [{ label: 'Prepare Estimate', status: 'ESTIMATE_PREPARED', color: 'bg-blue-600 hover:bg-blue-700' }],
  ESTIMATE_PREPARED: [{ label: 'Await Approval', status: 'AWAITING_CUSTOMER_APPROVAL', color: 'bg-yellow-600 hover:bg-yellow-700' }],
  AWAITING_CUSTOMER_APPROVAL: [{ label: 'Approved', status: 'APPROVED', color: 'bg-green-600 hover:bg-green-700' }, { label: 'Rejected', status: 'REJECTED', color: 'bg-red-600 hover:bg-red-700' }],
  APPROVED: [{ label: 'Start Work', status: 'WORK_IN_PROGRESS', color: 'bg-blue-600 hover:bg-blue-700' }, { label: 'Parts Pending', status: 'PARTS_PENDING', color: 'bg-yellow-600 hover:bg-yellow-700' }],
  PARTS_PENDING: [{ label: 'Start Work', status: 'WORK_IN_PROGRESS', color: 'bg-blue-600 hover:bg-blue-700' }],
  WORK_IN_PROGRESS: [{ label: 'Quality Check', status: 'QUALITY_CHECK', color: 'bg-purple-600 hover:bg-purple-700' }],
  QUALITY_CHECK: [{ label: 'Ready for Delivery', status: 'READY_FOR_DELIVERY', color: 'bg-green-600 hover:bg-green-700' }, { label: 'Back to Work', status: 'WORK_IN_PROGRESS', color: 'bg-yellow-600 hover:bg-yellow-700' }],
  READY_FOR_DELIVERY: [{ label: 'Mark Delivered', status: 'DELIVERED', color: 'bg-green-600 hover:bg-green-700' }],
  DELIVERED: [{ label: 'Close', status: 'CLOSED', color: 'bg-gray-600 hover:bg-gray-700' }],
};

export default function JobCardDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState('');
  const [notes, setNotes] = useState({ diagnosisNotes: '', internalNotes: '' });
  const [savingNotes, setSavingNotes] = useState(false);

  const load = () => api.get<any>(`/admin/job-cards/${id}`).then((r) => {
    if (r.success) { setData(r.data); setNotes({ diagnosisNotes: r.data.diagnosisNotes || '', internalNotes: r.data.internalNotes || '' }); }
  });
  useEffect(() => { load(); }, [id]);

  const updateStatus = async (status: string) => {
    setLoading(status);
    const res = await api.patch<any>(`/admin/job-cards/${id}`, { status });
    setLoading('');
    if (res.success) { setData(res.data); }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    const res = await api.patch<any>(`/admin/job-cards/${id}`, notes);
    setSavingNotes(false);
    if (res.success) setData(res.data);
  };

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  const actions = STATUS_ACTIONS[data.status] || [];
  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div className="space-y-6">
      <PageHeader title={`Job Card ${data.jobCardNumber}`} />

      <div className="flex flex-wrap gap-2">
        <StatusBadge status={data.status} />
        <StatusBadge status={`Approval: ${data.approvalStatus}`} />
      </div>

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <button key={a.status} disabled={!!loading} onClick={() => updateStatus(a.status)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow ${a.color} disabled:opacity-50`}>
              {loading === a.status ? 'Updating...' : a.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">Details</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Issue: {data.issueSummary}</p>
            {data.customerComplaints && <p className="text-sm text-gray-500">Complaints: {data.customerComplaints}</p>}
            <p className="text-sm text-gray-600 dark:text-gray-400">Customer: {data.customer?.fullName} · {data.customer?.phoneNumber}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Vehicle: {data.vehicle?.registrationNumber} — {data.vehicle?.brand} {data.vehicle?.model}</p>
            <p className="text-sm text-gray-500">Intake: {new Date(data.intakeDate).toLocaleDateString()}</p>
            {data.estimatedDeliveryAt && <p className="text-sm text-gray-500">Est. Delivery: {new Date(data.estimatedDeliveryAt).toLocaleDateString()}</p>}
            {data.actualDeliveryAt && <p className="text-sm text-green-600">Delivered: {new Date(data.actualDeliveryAt).toLocaleDateString()}</p>}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">Cost Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-gray-500">Est. Parts:</span><span>₹{Number(data.estimatedPartsCost).toFixed(2)}</span>
              <span className="text-gray-500">Est. Labor:</span><span>₹{Number(data.estimatedLaborCost).toFixed(2)}</span>
              <span className="text-gray-500">Est. Total:</span><span className="font-semibold">₹{Number(data.estimatedTotal).toFixed(2)}</span>
              <span className="text-gray-500">Final Parts:</span><span>₹{Number(data.finalPartsCost).toFixed(2)}</span>
              <span className="text-gray-500">Final Labor:</span><span>₹{Number(data.finalLaborCost).toFixed(2)}</span>
              <span className="text-gray-500">Final Total:</span><span className="font-bold">₹{Number(data.finalTotal).toFixed(2)}</span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Notes</h3>
            <div><label className="block text-xs font-medium mb-1">Diagnosis Notes</label><textarea className={inputCls} rows={2} value={notes.diagnosisNotes} onChange={(e) => setNotes((n) => ({ ...n, diagnosisNotes: e.target.value }))} /></div>
            <div><label className="block text-xs font-medium mb-1">Internal Notes</label><textarea className={inputCls} rows={2} value={notes.internalNotes} onChange={(e) => setNotes((n) => ({ ...n, internalNotes: e.target.value }))} /></div>
            <button onClick={saveNotes} disabled={savingNotes} className="rounded-lg bg-gray-600 px-4 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">{savingNotes ? 'Saving...' : 'Save Notes'}</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Workers</h3>
            {data.assignments?.length ? data.assignments.map((a: any) => <p key={a.id} className="text-sm text-gray-600 dark:text-gray-400 mt-1">{a.worker?.fullName} ({a.assignmentRole ?? 'General'})</p>) : <p className="text-sm text-gray-400">No workers assigned</p>}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Tasks</h3>
            {data.tasks?.length ? data.tasks.map((t: any) => <div key={t.id} className="flex justify-between text-sm mt-1"><span className="text-gray-600 dark:text-gray-400">{t.taskName}</span><StatusBadge status={t.status} /></div>) : <p className="text-sm text-gray-400">No tasks</p>}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Parts</h3>
            {data.parts?.length ? data.parts.map((p: any) => <div key={p.id} className="flex justify-between text-sm mt-1"><span className="text-gray-600 dark:text-gray-400">{p.inventoryItem?.itemName}</span><span>Qty: {Number(p.requiredQty)} · ₹{Number(p.unitPrice)}</span></div>) : <p className="text-sm text-gray-400">No parts</p>}
          </div>
          {data.invoices?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">Invoices</h3>
              {data.invoices.map((inv: any) => (
                <div key={inv.id} className="mt-1"><button onClick={() => router.push(`/admin/invoices/${inv.id}`)} className="text-sm text-blue-600 hover:underline">{inv.invoiceNumber} · <StatusBadge status={inv.invoiceStatus} /></button></div>
              ))}
            </div>
          )}
          {data.serviceRequest && <button onClick={() => router.push(`/admin/service-requests/${data.serviceRequest.id}`)} className="text-sm text-blue-600 hover:underline">View Service Request →</button>}
          {data.appointment && <button onClick={() => router.push(`/admin/appointments/${data.appointment.id}`)} className="ml-4 text-sm text-blue-600 hover:underline">View Appointment →</button>}
        </div>
      </div>
    </div>
  );
}
