'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';

// Simplified statuses (what the UI shows and allows)
const SIMPLE_STATUSES = ['OPEN', 'ESTIMATE_READY', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED'] as const;

// Map old DB statuses to simplified ones for display
function toSimpleStatus(dbStatus: string): string {
  switch (dbStatus) {
    case 'CREATED': case 'UNDER_INSPECTION': return 'OPEN';
    case 'ESTIMATE_PREPARED': case 'AWAITING_CUSTOMER_APPROVAL': return 'ESTIMATE_READY';
    case 'APPROVED': case 'PARTS_PENDING': case 'WORK_IN_PROGRESS': case 'QUALITY_CHECK': return 'IN_PROGRESS';
    case 'READY_FOR_DELIVERY': return 'READY';
    case 'DELIVERED': case 'CLOSED': return 'DELIVERED';
    case 'CANCELLED': case 'REJECTED': return 'CANCELLED';
    default: return dbStatus;
  }
}

// Map simplified status back to DB value for PATCH
function toDbStatus(simple: string): string {
  switch (simple) {
    case 'OPEN': return 'CREATED';
    case 'ESTIMATE_READY': return 'ESTIMATE_PREPARED';
    case 'IN_PROGRESS': return 'WORK_IN_PROGRESS';
    case 'READY': return 'READY_FOR_DELIVERY';
    case 'DELIVERED': return 'DELIVERED';
    case 'CANCELLED': return 'CANCELLED';
    default: return simple;
  }
}

// Next status button config
const NEXT_STATUS: Record<string, { label: string; next: string; color: string }> = {
  OPEN: { label: 'Estimate Ready', next: 'ESTIMATE_READY', color: 'bg-blue-600 hover:bg-blue-700' },
  ESTIMATE_READY: { label: 'Start Work', next: 'IN_PROGRESS', color: 'bg-blue-600 hover:bg-blue-700' },
  IN_PROGRESS: { label: 'Mark Ready', next: 'READY', color: 'bg-green-600 hover:bg-green-700' },
  READY: { label: 'Mark Delivered', next: 'DELIVERED', color: 'bg-green-600 hover:bg-green-700' },
};

// Status-based section visibility
function canEditWorkers(s: string) { return ['OPEN', 'ESTIMATE_READY', 'IN_PROGRESS'].includes(s); }
function canEditParts(s: string) { return ['OPEN', 'ESTIMATE_READY'].includes(s); }
function canEditTasks(s: string) { return ['ESTIMATE_READY', 'IN_PROGRESS'].includes(s); }
function canUpdateTaskStatus(s: string) { return s === 'IN_PROGRESS'; }
function canEditCosts(s: string) { return ['OPEN', 'ESTIMATE_READY'].includes(s); }
function canCreateInvoice(s: string) { return ['READY', 'DELIVERED'].includes(s); }
function isLocked(s: string) { return ['DELIVERED', 'CANCELLED'].includes(s); }

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

  const updateStatus = async (simpleStatus: string) => {
    const dbStatus = toDbStatus(simpleStatus);
    setLoading(simpleStatus);
    const res = await api.patch<any>(`/admin/job-cards/${id}`, { status: dbStatus });
    setLoading('');
    if (res.success) setData(res.data);
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

  const goToInvoice = async () => {
    if (data.invoices?.length > 0) {
      router.push(`/admin/invoices/${data.invoices[0].id}`);
      return;
    }
    setCreatingInvoice(true);
    const lineItems: any[] = [];
    data.parts?.forEach((p: any) => lineItems.push({ lineType: 'PART', description: p.inventoryItem?.itemName || 'Part', quantity: Number(p.requiredQty), unitPrice: Number(p.unitPrice), taxRate: 0 }));
    const laborCost = Number(data.estimatedLaborCost);
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
  const status = toSimpleStatus(data.status);
  const locked = isLocked(status);
  const next = NEXT_STATUS[status];

  return (
    <div className="space-y-6">
      <PageHeader title={`Job Card ${data.jobCardNumber}`} />

      {/* Status badge */}
      <div className="flex flex-wrap gap-2 items-center">
        <StatusBadge status={status} />
      </div>

      {/* Status controls */}
      <div className="flex flex-wrap items-center gap-3">
        {next && !locked && (
          <button onClick={() => updateStatus(next.next)} disabled={!!loading}
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow ${next.color} disabled:opacity-50`}>
            {loading === next.next ? 'Updating...' : `→ ${next.label}`}
          </button>
        )}
        {!locked && status !== 'CANCELLED' && (
          <button onClick={() => updateStatus('CANCELLED')} disabled={!!loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 border border-red-300 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900/20 disabled:opacity-50">
            Cancel Job
          </button>
        )}
        {status === 'OPEN' && (
          <button onClick={async () => { if (!confirm('Delete this job card permanently?')) return; const res = await api.delete(`/admin/job-cards/${id}`); if (res.success) router.push('/admin/job-cards'); }} className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 border border-red-300 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900/20">
            Delete
          </button>
        )}
        {!locked && (
          <select className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" value={status} onChange={(e) => updateStatus(e.target.value)}>
            {SIMPLE_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        )}
        {loading && <span className="text-sm text-gray-500">Updating...</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {/* Details */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">Details</h3>
            <div className="space-y-2 text-sm">
              <div><label className="text-xs font-medium text-gray-500">Issue Summary</label>
                {locked ? <p className="text-gray-600 dark:text-gray-400">{data.issueSummary}</p> : <input className={inputCls} defaultValue={data.issueSummary} onBlur={(e) => e.target.value !== data.issueSummary && api.patch(`/admin/job-cards/${id}`, { issueSummary: e.target.value }).then(load)} />}
              </div>
              <div><label className="text-xs font-medium text-gray-500">Customer Complaints</label>
                {locked ? <p className="text-gray-600 dark:text-gray-400">{data.customerComplaints || '—'}</p> : <input className={inputCls} defaultValue={data.customerComplaints || ''} onBlur={(e) => api.patch(`/admin/job-cards/${id}`, { customerVisibleNotes: e.target.value }).then(load)} />}
              </div>
              <div className="flex gap-4">
                <div className="flex-1"><label className="text-xs font-medium text-gray-500">Odometer (km)</label>
                  {locked ? <p className="text-gray-600 dark:text-gray-400">{data.odometerAtIntake?.toLocaleString() || '—'}</p> : <input type="number" className={inputCls} defaultValue={data.odometerAtIntake || ''} onBlur={(e) => { const v = Number(e.target.value); if (v > 0) api.patch(`/admin/job-cards/${id}`, { odometerAtIntake: v }).then(load); }} />}
                </div>
                <div className="flex-1"><label className="text-xs font-medium text-gray-500">Priority</label>
                  {locked ? <p className="text-gray-600 dark:text-gray-400">{data.priority || 'Normal'}</p> : <select className={inputCls} defaultValue={data.priority || ''} onChange={(e) => api.patch(`/admin/job-cards/${id}`, { priority: e.target.value || null }).then(load)}><option value="">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select>}
                </div>
              </div>
            </div>
            <div className="pt-2 border-t dark:border-gray-600 mt-3 space-y-1">
              <p className="text-sm text-gray-600 dark:text-gray-400">Customer: {data.customer?.fullName} · {data.customer?.phoneNumber}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Vehicle: {data.vehicle?.registrationNumber} — {data.vehicle?.brand} {data.vehicle?.model}</p>
              <p className="text-sm text-gray-500">Intake: {new Date(data.intakeDate).toLocaleDateString()}</p>
              {data.actualDeliveryAt && <p className="text-sm text-green-600">Delivered: {new Date(data.actualDeliveryAt).toLocaleDateString()}</p>}
            </div>
          </div>

          {/* Cost Summary */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">Cost Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-sm items-center">
              <span className="text-gray-500">Parts:</span><span>₹{Number(data.estimatedPartsCost).toFixed(2)}</span>
              <span className="text-gray-500">Labor:</span>
              {canEditCosts(status) ? (
                <input type="number" step="0.01" className="w-28 rounded border border-gray-300 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(data.estimatedLaborCost)} onBlur={(e) => saveCost('estimatedLaborCost', e.target.value)} />
              ) : (
                <span>₹{Number(data.estimatedLaborCost).toFixed(2)}</span>
              )}
              <span className="text-gray-500 font-semibold">Total:</span><span className="font-bold">₹{Number(data.estimatedTotal).toFixed(2)}</span>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Notes</h3>
            <div><label className="block text-xs font-medium mb-1">Diagnosis Notes</label><textarea className={inputCls} rows={2} value={notes.diagnosisNotes} onChange={(e) => setNotes((n) => ({ ...n, diagnosisNotes: e.target.value }))} disabled={locked} /></div>
            <div><label className="block text-xs font-medium mb-1">Internal Notes</label><textarea className={inputCls} rows={2} value={notes.internalNotes} onChange={(e) => setNotes((n) => ({ ...n, internalNotes: e.target.value }))} disabled={locked} /></div>
            {!locked && <button onClick={saveNotes} disabled={savingNotes} className="rounded-lg bg-gray-600 px-4 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">{savingNotes ? 'Saving...' : 'Save Notes'}</button>}
          </div>
        </div>

        <div className="space-y-4">
          {/* Workers */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Workers</h3>
            {data.assignments?.length ? data.assignments.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between text-sm mt-1">
                <span className="text-gray-600 dark:text-gray-400">{a.worker?.fullName}{a.assignmentRole ? <span className="text-xs text-gray-400"> ({a.assignmentRole})</span> : ''}</span>
                {canEditWorkers(status) && <button onClick={() => unassignWorker(a.id)} className="text-red-500 hover:text-red-700 text-xs">✕</button>}
              </div>
            )) : <p className="text-sm text-gray-400">No workers assigned</p>}
            {canEditWorkers(status) && (
              <div className="mt-3 border-t pt-3 dark:border-gray-600 flex gap-2">
                <select className={inputCls} value={workerForm.workerId} onFocus={loadWorkers} onChange={(e) => { const w = workers.find((w: any) => w.id === e.target.value); setWorkerForm({ workerId: e.target.value, assignmentRole: w?.designation || '' }); }}>
                  <option value="">Assign worker...</option>
                  {workers.map((w: any) => <option key={w.id} value={w.id}>{w.fullName} ({w.designation || w.specialization || 'General'})</option>)}
                </select>
                {workerForm.workerId && <button onClick={assignWorker} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 whitespace-nowrap">Assign</button>}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Tasks</h3>
            {data.tasks?.length ? data.tasks.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between text-sm mt-1">
                <span className="text-gray-600 dark:text-gray-400">{t.taskName}</span>
                <span className="flex items-center gap-2">
                  {canUpdateTaskStatus(status) ? (
                    <select className="rounded border border-gray-300 px-1.5 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white" value={t.status} onChange={(e) => updateTaskStatus(t.id, e.target.value)}>
                      <option value="PENDING">Pending</option><option value="IN_PROGRESS">In Progress</option><option value="DONE">Done</option>
                    </select>
                  ) : (
                    <StatusBadge status={t.status} />
                  )}
                  {canEditTasks(status) && <button onClick={() => removeTask(t.id)} className="text-red-500 hover:text-red-700 text-xs">✕</button>}
                </span>
              </div>
            )) : <p className="text-sm text-gray-400">No tasks</p>}
            {canEditTasks(status) && (
              <div className="mt-3 border-t pt-3 dark:border-gray-600 flex gap-2">
                <input className={inputCls} placeholder="Task name..." value={taskForm.taskName} onChange={(e) => setTaskForm({ ...taskForm, taskName: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
                {taskForm.taskName && <button onClick={addTask} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 whitespace-nowrap">Add</button>}
              </div>
            )}
          </div>

          {/* Parts */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Parts</h3>
            {data.parts?.length ? data.parts.map((p: any) => (
              <div key={p.id} className="flex items-center gap-2 text-sm mt-1">
                <span className="flex-1 text-gray-600 dark:text-gray-400 truncate">{p.inventoryItem?.itemName}</span>
                {canEditParts(status) ? (
                  <>
                    <input type="number" className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(p.requiredQty)} onBlur={(e) => updatePart(p.id, 'requiredQty', e.target.value)} title="Qty" />
                    <span className="text-xs text-gray-400">×</span>
                    <input type="number" className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue={Number(p.unitPrice)} step="0.01" onBlur={(e) => updatePart(p.id, 'unitPrice', e.target.value)} title="Price" />
                  </>
                ) : (
                  <span className="text-xs text-gray-500">{Number(p.requiredQty)} × ₹{Number(p.unitPrice)}</span>
                )}
                <span className="text-xs text-gray-500 w-16 text-right">₹{(Number(p.requiredQty) * Number(p.unitPrice)).toFixed(0)}</span>
                {canEditParts(status) && <button onClick={() => removePart(p.id)} className="text-red-500 hover:text-red-700 text-xs">✕</button>}
              </div>
            )) : <p className="text-sm text-gray-400">No parts</p>}
            {canEditParts(status) && (
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
            )}
          </div>

          {/* Invoice */}
          {canCreateInvoice(status) && (
            <button onClick={goToInvoice} disabled={creatingInvoice} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {creatingInvoice ? 'Creating...' : data.invoices?.length > 0 ? `View Invoice ${data.invoices[0].invoiceNumber}` : '+ Create Invoice'}
            </button>
          )}

          {/* Links */}
          <div className="flex gap-4">
            {data.serviceRequest && <button onClick={() => router.push(`/admin/service-requests/${data.serviceRequest.id}`)} className="text-sm text-blue-600 hover:underline">View Service Request →</button>}
            {data.appointment && <button onClick={() => router.push(`/admin/appointments/${data.appointment.id}`)} className="text-sm text-blue-600 hover:underline">View Appointment →</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
