'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';

const ALL_STATUSES = [
  'CREATED', 'UNDER_INSPECTION', 'ESTIMATE_PREPARED', 'AWAITING_CUSTOMER_APPROVAL',
  'APPROVED', 'REJECTED', 'PARTS_PENDING', 'WORK_IN_PROGRESS', 'QUALITY_CHECK',
  'READY_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'CLOSED',
];

export default function JobCardDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState('');
  const [notes, setNotes] = useState({ diagnosisNotes: '', internalNotes: '' });
  const [savingNotes, setSavingNotes] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [partForm, setPartForm] = useState({ inventoryItemId: '', requiredQty: '1', unitPrice: '' });
  const [addingPart, setAddingPart] = useState(false);
  const [workers, setWorkers] = useState<any[]>([]);
  const [workerForm, setWorkerForm] = useState({ workerId: '', assignmentRole: '' });
  const [taskForm, setTaskForm] = useState({ taskName: '', estimatedMinutes: '' });
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const load = () => {
    const apply = (r: any) => {
      if (r.success) { setData(r.data); setNotes({ diagnosisNotes: r.data.diagnosisNotes || '', internalNotes: r.data.internalNotes || '' }); }
    };
    const { cached, promise } = api.getSWR<any>(`/admin/job-cards/${id}`);
    if (cached) apply(cached);
    promise.then(apply);
  };
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

  const saveCost = async (field: string, value: string) => {
    const num = Number(value);
    if (isNaN(num) || num < 0) return;
    const patch: Record<string, number> = { [field]: num };
    if (field === 'estimatedLaborCost') patch.estimatedTotal = Number(data.estimatedPartsCost) + num;
    if (field === 'finalLaborCost') patch.finalTotal = Number(data.finalPartsCost) + num;
    const res = await api.patch<any>(`/admin/job-cards/${id}`, patch);
    if (res.success) setData(res.data);
  };

  const loadInventory = async () => {
    if (inventoryItems.length) return;
    const res = await api.get<any>('/admin/inventory/items?pageSize=500');
    if (res.success) setInventoryItems(res.data?.items ?? res.data ?? []);
  };

  const onItemSelect = (itemId: string) => {
    const item = inventoryItems.find((i: any) => i.id === itemId);
    setPartForm({ inventoryItemId: itemId, requiredQty: '1', unitPrice: item ? String(Number(item.sellingPrice)) : '' });
  };

  const addPart = async () => {
    if (!partForm.inventoryItemId || !partForm.requiredQty) return;
    setAddingPart(true);
    const res = await api.post<any>(`/admin/job-cards/${id}/parts`, {
      inventoryItemId: partForm.inventoryItemId, requiredQty: Number(partForm.requiredQty),
      unitPrice: partForm.unitPrice ? Number(partForm.unitPrice) : undefined,
    });
    setAddingPart(false);
    if (res.success) { setPartForm({ inventoryItemId: '', requiredQty: '1', unitPrice: '' }); load(); }
  };

  const removePart = async (partId: string) => {
    const res = await api.delete<any>(`/admin/job-cards/${id}/parts?partId=${partId}`);
    if (res.success) load();
  };

  const updatePart = async (partId: string, field: string, value: string) => {
    const num = Number(value);
    if (isNaN(num) || num < 0) return;
    await api.patch<any>(`/admin/job-cards/${id}/parts`, { partId, [field]: num });
    load();
  };

  // Workers
  const loadWorkers = async () => {
    if (workers.length) return;
    const res = await api.get<any>('/admin/workers?pageSize=200');
    if (res.success) setWorkers(res.data?.items ?? res.data ?? []);
  };
  const assignWorker = async () => {
    if (!workerForm.workerId) return;
    const res = await api.post<any>(`/admin/job-cards/${id}/workers`, workerForm);
    if (res.success) { setWorkerForm({ workerId: '', assignmentRole: '' }); load(); }
  };
  const unassignWorker = async (assignmentId: string) => {
    const res = await api.delete<any>(`/admin/job-cards/${id}/workers?assignmentId=${assignmentId}`);
    if (res.success) load();
  };

  // Tasks
  const addTask = async () => {
    if (!taskForm.taskName) return;
    const res = await api.post<any>(`/admin/job-cards/${id}/tasks`, { taskName: taskForm.taskName, estimatedMinutes: taskForm.estimatedMinutes ? Number(taskForm.estimatedMinutes) : undefined });
    if (res.success) { setTaskForm({ taskName: '', estimatedMinutes: '' }); load(); }
  };
  const updateTaskStatus = async (taskId: string, status: string) => {
    await api.patch<any>(`/admin/job-cards/${id}/tasks`, { taskId, status });
    load();
  };
  const removeTask = async (taskId: string) => {
    const res = await api.delete<any>(`/admin/job-cards/${id}/tasks?taskId=${taskId}`);
    if (res.success) load();
  };

  // Invoice
  const goToInvoice = async () => {
    // If invoice already exists, navigate to it
    if (data.invoices?.length > 0) {
      router.push(`/admin/invoices/${data.invoices[0].id}`);
      return;
    }
    // Otherwise create a draft
    setCreatingInvoice(true);
    const lineItems: any[] = [];
    data.parts?.forEach((p: any) => lineItems.push({ lineType: 'PART', description: p.inventoryItem?.itemName || 'Part', quantity: Number(p.requiredQty), unitPrice: Number(p.unitPrice), taxRate: 0 }));
    const laborCost = Number(data.finalLaborCost) || Number(data.estimatedLaborCost);
    if (laborCost > 0) {
      const workerNames = data.assignments?.map((a: any) => a.worker?.fullName).filter(Boolean).join(', ');
      lineItems.push({ lineType: 'LABOR', description: workerNames ? `Labor — ${workerNames}` : 'Labor charges', quantity: 1, unitPrice: laborCost, taxRate: 0 });
    }
    if (lineItems.length === 0) lineItems.push({ lineType: 'CUSTOM_CHARGE', description: 'Service charge', quantity: 1, unitPrice: 0, taxRate: 0 });
    const res = await api.post<any>('/admin/invoices', {
      customerId: data.customerId, vehicleId: data.vehicleId, jobCardId: data.id,
      invoiceDate: new Date().toISOString(), lineItems,
    });
    setCreatingInvoice(false);
    if (res.success) router.push(`/admin/invoices/${res.data.id}`);
  };

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div className="space-y-6">
      <PageHeader title={`Job Card ${data.jobCardNumber}`} />

      <div className="flex flex-wrap gap-2">
        <StatusBadge status={data.status} />
        <StatusBadge status={`Approval: ${data.approvalStatus}`} />
      </div>

      <div className="flex items-center gap-3">
        <select className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium dark:border-gray-600 dark:bg-gray-700 dark:text-white" value={data.status} onChange={(e) => updateStatus(e.target.value)}>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        {loading && <span className="text-sm text-gray-500">Updating...</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">Details</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Issue: {data.issueSummary}</p>
            {data.customerComplaints && <p className="text-sm text-gray-500">Complaints: {data.customerComplaints}</p>}
            <p className="text-sm text-gray-600 dark:text-gray-400">Customer: {data.customer?.fullName} · {data.customer?.phoneNumber}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Vehicle: {data.vehicle?.registrationNumber} — {data.vehicle?.brand} {data.vehicle?.model}</p>
            <p className="text-sm text-gray-500">Intake: {new Date(data.intakeDate).toLocaleDateString()}</p>
            {data.odometerAtIntake && <p className="text-sm text-gray-500">Odometer: {data.odometerAtIntake.toLocaleString()} km</p>}
            {data.estimatedDeliveryAt && <p className="text-sm text-gray-500">Est. Delivery: {new Date(data.estimatedDeliveryAt).toLocaleDateString()}</p>}
            {data.actualDeliveryAt && <p className="text-sm text-green-600">Delivered: {new Date(data.actualDeliveryAt).toLocaleDateString()}</p>}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">Cost Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-sm items-center">
              <span className="text-gray-500">Est. Parts:</span><span>₹{Number(data.estimatedPartsCost).toFixed(2)}</span>
              <span className="text-gray-500">Est. Labor:</span><input type="number" step="0.01" className="w-28 rounded border border-gray-300 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(data.estimatedLaborCost)} onBlur={(e) => saveCost('estimatedLaborCost', e.target.value)} />
              <span className="text-gray-500">Est. Total:</span><span className="font-semibold">₹{Number(data.estimatedTotal).toFixed(2)}</span>
              <span className="text-gray-500">Final Parts:</span><input type="number" step="0.01" className="w-28 rounded border border-gray-300 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(data.finalPartsCost)} onBlur={(e) => saveCost('finalPartsCost', e.target.value)} />
              <span className="text-gray-500">Final Labor:</span><input type="number" step="0.01" className="w-28 rounded border border-gray-300 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(data.finalLaborCost)} onBlur={(e) => saveCost('finalLaborCost', e.target.value)} />
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
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Workers</h3>
            {data.assignments?.length ? data.assignments.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between text-sm mt-1">
                <span className="text-gray-600 dark:text-gray-400">{a.worker?.fullName} <span className="text-xs text-gray-400">({a.assignmentRole ?? 'General'})</span></span>
                <button onClick={() => unassignWorker(a.id)} className="text-red-500 hover:text-red-700 text-xs">✕</button>
              </div>
            )) : <p className="text-sm text-gray-400">No workers assigned</p>}
            <div className="mt-3 border-t pt-3 dark:border-gray-600 flex gap-2">
              <select className={inputCls} value={workerForm.workerId} onFocus={loadWorkers} onChange={(e) => setWorkerForm({ ...workerForm, workerId: e.target.value })}>
                <option value="">Assign worker...</option>
                {workers.map((w: any) => <option key={w.id} value={w.id}>{w.fullName} ({w.designation || w.specialization || 'General'})</option>)}
              </select>
              {workerForm.workerId && <button onClick={assignWorker} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 whitespace-nowrap">Assign</button>}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Tasks</h3>
            {data.tasks?.length ? data.tasks.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between text-sm mt-1">
                <span className="text-gray-600 dark:text-gray-400">{t.taskName}</span>
                <span className="flex items-center gap-2">
                  <select className="rounded border border-gray-300 px-1.5 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white" value={t.status} onChange={(e) => updateTaskStatus(t.id, e.target.value)}>
                    <option value="PENDING">Pending</option><option value="IN_PROGRESS">In Progress</option><option value="DONE">Done</option>
                  </select>
                  <button onClick={() => removeTask(t.id)} className="text-red-500 hover:text-red-700 text-xs">✕</button>
                </span>
              </div>
            )) : <p className="text-sm text-gray-400">No tasks</p>}
            <div className="mt-3 border-t pt-3 dark:border-gray-600 flex gap-2">
              <input className={inputCls} placeholder="Task name..." value={taskForm.taskName} onChange={(e) => setTaskForm({ ...taskForm, taskName: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
              {taskForm.taskName && <button onClick={addTask} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 whitespace-nowrap">Add</button>}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Parts</h3>
            {data.parts?.length ? data.parts.map((p: any) => (
              <div key={p.id} className="flex items-center gap-2 text-sm mt-1">
                <span className="flex-1 text-gray-600 dark:text-gray-400 truncate">{p.inventoryItem?.itemName}</span>
                <input type="number" className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(p.requiredQty)} onBlur={(e) => updatePart(p.id, 'requiredQty', e.target.value)} title="Qty" />
                <span className="text-xs text-gray-400">×</span>
                <input type="number" className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(p.unitPrice)} step="0.01" onBlur={(e) => updatePart(p.id, 'unitPrice', e.target.value)} title="Price" />
                <span className="text-xs text-gray-500 w-16 text-right">₹{(Number(p.requiredQty) * Number(p.unitPrice)).toFixed(0)}</span>
                <button onClick={() => removePart(p.id)} className="text-red-500 hover:text-red-700 text-xs">✕</button>
              </div>
            )) : <p className="text-sm text-gray-400">No parts</p>}
            <div className="mt-3 border-t pt-3 dark:border-gray-600 space-y-2">
              <select className={inputCls} value={partForm.inventoryItemId} onFocus={loadInventory} onChange={(e) => onItemSelect(e.target.value)}>
                <option value="">Add a part...</option>
                {inventoryItems.map((i: any) => <option key={i.id} value={i.id}>{i.itemName} ({i.sku}) — ₹{Number(i.sellingPrice)}</option>)}
              </select>
              {partForm.inventoryItemId && (
                <div className="flex gap-2">
                  <input type="number" className={inputCls} placeholder="Qty" min="0.01" step="0.01" value={partForm.requiredQty} onChange={(e) => setPartForm({ ...partForm, requiredQty: e.target.value })} />
                  <input type="number" className={inputCls} placeholder="Unit Price" step="0.01" value={partForm.unitPrice} onChange={(e) => setPartForm({ ...partForm, unitPrice: e.target.value })} />
                  <button onClick={addPart} disabled={addingPart} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
                    {addingPart ? '...' : 'Add'}
                  </button>
                </div>
              )}
            </div>
          </div>
          <button onClick={goToInvoice} disabled={creatingInvoice} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {creatingInvoice ? 'Creating...' : data.invoices?.length > 0 ? `View Invoice ${data.invoices[0].invoiceNumber}` : '+ Create Invoice'}
          </button>
          {data.serviceRequest && <button onClick={() => router.push(`/admin/service-requests/${data.serviceRequest.id}`)} className="text-sm text-blue-600 hover:underline">View Service Request →</button>}
          {data.appointment && <button onClick={() => router.push(`/admin/appointments/${data.appointment.id}`)} className="ml-4 text-sm text-blue-600 hover:underline">View Appointment →</button>}
        </div>
      </div>
    </div>
  );
}
