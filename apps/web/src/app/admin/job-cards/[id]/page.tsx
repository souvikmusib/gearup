'use client';
import { formatIST } from '@/lib/time';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
import { WhatsAppButton } from '@/components/shared/whatsapp-button';
import { Modal } from '@/components/shared/modal';

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

const PREV_STATUS: Record<string, { label: string; prev: string }> = {
  ESTIMATE_READY: { label: 'Back to Open', prev: 'OPEN' },
  IN_PROGRESS: { label: 'Back to Estimate', prev: 'ESTIMATE_READY' },
  READY: { label: 'Back to In Progress', prev: 'IN_PROGRESS' },
  DELIVERED: { label: 'Back to Ready', prev: 'READY' },
};

// Status-based section visibility
function canEditWorkers(s: string) { return ['OPEN', 'ESTIMATE_READY', 'IN_PROGRESS'].includes(s); }
function canEditParts(s: string) { return ['OPEN', 'ESTIMATE_READY', 'IN_PROGRESS'].includes(s); }
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
  const [partForm, setPartForm] = useState<any>({ inventoryItemId: '', requiredQty: '1', unitPrice: '', search: '', _open: false });
  const [showNewPart, setShowNewPart] = useState(false);
  const [newPartForm, setNewPartForm] = useState({ sku: '', itemName: '', unit: 'PCS', costPrice: '', sellingPrice: '', quantityInStock: '' });
  const [addingPart, setAddingPart] = useState(false);
  const [workers, setWorkers] = useState<any[]>([]);
  const [workerForm, setWorkerForm] = useState({ workerId: '', assignmentRole: '' });
  const [taskForm, setTaskForm] = useState({ taskName: '', estimatedMinutes: '' });
  const [assigningWorker, setAssigningWorker] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [updatingPartId, setUpdatingPartId] = useState<string | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const inventoryQueryRef = useRef('');

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
    if (res.success) load();
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    const res = await api.patch<any>(`/admin/job-cards/${id}`, notes);
    setSavingNotes(false);
    if (res.success) load();
  };

  const saveCost = async (field: string, value: string) => {
    const num = Number(value);
    if (isNaN(num) || num < 0) return;
    const patch: Record<string, number> = { [field]: num };
    if (field === 'estimatedLaborCost') patch.estimatedTotal = Number(data.estimatedPartsCost) + num + Number(data.estimatedOtherCost);
    const res = await api.patch<any>(`/admin/job-cards/${id}`, patch);
    if (res.success) load();
  };

  const loadInventory = async (search = '') => {
    const normalized = search.trim();
    inventoryQueryRef.current = normalized;
    const params = new URLSearchParams({ pageSize: '25' });
    if (normalized) params.set('search', normalized);
    const res = await api.get<any>(`/admin/inventory/items?${params.toString()}`);
    if (inventoryQueryRef.current !== normalized) return;
    if (res.success) setInventoryItems(res.data?.items ?? res.data ?? []);
  };

  const onItemSelect = (itemId: string) => {
    const item = inventoryItems.find((i: any) => i.id === itemId);
    setPartForm({ inventoryItemId: itemId, requiredQty: '1', unitPrice: item ? String(Number(item.sellingPrice)) : '', search: item?.itemName || '' });
  };

  const addPart = async () => {
    if (!partForm.inventoryItemId || !partForm.requiredQty) return;
    setAddingPart(true);
    const res = await api.post<any>(`/admin/job-cards/${id}/parts`, {
      inventoryItemId: partForm.inventoryItemId, requiredQty: Number(partForm.requiredQty),
      unitPrice: partForm.unitPrice ? Number(partForm.unitPrice) : undefined,
    });
    setAddingPart(false);
    if (res.success) { setPartForm({ inventoryItemId: '', requiredQty: '1', unitPrice: '', search: '' }); load(); }
  };

  const removePart = async (partId: string) => {
    const res = await api.delete<any>(`/admin/job-cards/${id}/parts?partId=${partId}`);
    if (res.success) load();
  };

  const updatePart = async (partId: string, field: string, value: string, prevValue?: number) => {
    const num = Number(value);
    if (isNaN(num) || num < 0) return;
    if (prevValue !== undefined && num === prevValue) return; // skip if unchanged
    if (updatingPartId === partId) return;
    setUpdatingPartId(partId);
    await api.patch<any>(`/admin/job-cards/${id}/parts`, { partId, [field]: num });
    setUpdatingPartId(null);
    load();
  };

  const loadWorkers = async () => {
    if (workers.length) return;
    const res = await api.get<any>('/admin/workers?status=ACTIVE&pageSize=100');
    if (res.success) setWorkers(res.data?.items ?? res.data ?? []);
  };
  const assignWorker = async () => {
    if (!workerForm.workerId || assigningWorker) return;
    setAssigningWorker(true);
    const res = await api.post<any>(`/admin/job-cards/${id}/workers`, workerForm);
    setAssigningWorker(false);
    if (res.success) { setWorkerForm({ workerId: '', assignmentRole: '' }); load(); }
  };
  const unassignWorker = async (assignmentId: string) => {
    const res = await api.delete<any>(`/admin/job-cards/${id}/workers?assignmentId=${assignmentId}`);
    if (res.success) load();
  };

  const addTask = async () => {
    if (!taskForm.taskName || addingTask) return;
    setAddingTask(true);
    const res = await api.post<any>(`/admin/job-cards/${id}/tasks`, { taskName: taskForm.taskName, estimatedMinutes: taskForm.estimatedMinutes ? Number(taskForm.estimatedMinutes) : undefined });
    setAddingTask(false);
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
    data.parts?.forEach((p: any) => lineItems.push({ lineType: 'PART', description: p.inventoryItem?.itemName || 'Part', quantity: Number(p.requiredQty), unitPrice: Number(p.unitPrice), discountPercent: Number(p.inventoryItem?.discountPercent || 0), taxRate: 0 }));
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
  const prev = PREV_STATUS[status];

  return (
    <div className="space-y-6">
      <PageHeader title={`Job Card ${data.jobCardNumber}`} />

      {/* Status badge */}
      <div className="flex flex-wrap gap-2 items-center">
        <StatusBadge status={status} />
      </div>

      {/* Status controls */}
      <div className="flex flex-wrap items-center gap-3">
        {prev && !locked && (
          <button onClick={() => updateStatus(prev.prev)} disabled={!!loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-800 disabled:opacity-50">
            {loading === prev.prev ? 'Updating...' : `← ${prev.label}`}
          </button>
        )}
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
        {!locked && (
          <button onClick={() => { setDeleteConfirmText(''); setShowDeleteModal(true); }} className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 border border-red-300 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900/20">
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
                {locked ? <p className="text-gray-600 dark:text-gray-400">{data.customerComplaints || '—'}</p> : <input className={inputCls} defaultValue={data.customerComplaints || ''} onBlur={(e) => api.patch(`/admin/job-cards/${id}`, { customerComplaints: e.target.value }).then(load)} />}
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
              <p className="text-sm text-gray-500">Intake: {formatIST(data.intakeDate, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</p>
              {data.actualDeliveryAt && <p className="text-sm text-green-600">Delivered: {formatIST(data.actualDeliveryAt, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</p>}
              {status === 'READY' && data.customer?.phoneNumber && (
                <div className="mt-2"><WhatsAppButton phone={data.customer.phoneNumber} message={`Hi ${data.customer.fullName}, your ${data.vehicle?.brand} ${data.vehicle?.model} (${data.vehicle?.registrationNumber}) is ready for pickup! Job Card: ${data.jobCardNumber}. - GearUp Servicing, 9242519099`} /></div>
              )}
            </div>
          </div>

          {/* Cost Summary */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Billing</h3>
              {data.invoices?.[0] && <button onClick={() => router.push(`/admin/invoices/${data.invoices[0].id}`)} className="text-xs text-blue-600 hover:underline">Edit on Invoice →</button>}
            </div>
            {data.invoices?.[0]?.lineItems?.length > 0 ? (
              <div className="space-y-1">
                {data.invoices[0].lineItems.map((li: any, i: number) => (
                  <div key={li.id || i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 truncate flex-1">{li.description}</span>
                    <span className="text-xs text-gray-400 mx-2">{Number(li.quantity)} × ₹{Number(li.unitPrice)}</span>
                    <span className="text-sm font-medium w-16 text-right">₹{Number(li.lineTotal).toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 dark:border-gray-600 flex justify-between font-semibold text-sm">
                  <span>Total</span>
                  <span>₹{Number(data.invoices[0].grandTotal).toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No items yet — <button onClick={() => data.invoices?.[0] && router.push(`/admin/invoices/${data.invoices[0].id}`)} className="text-blue-600 hover:underline">add on invoice</button></p>
            )}
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
                {workerForm.workerId && <button onClick={assignWorker} disabled={assigningWorker} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">{assigningWorker ? 'Assigning...' : 'Assign'}</button>}
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
                {taskForm.taskName && <button onClick={addTask} disabled={addingTask} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">{addingTask ? 'Adding...' : 'Add'}</button>}
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
                    <input type="number" className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white disabled:opacity-50" defaultValue={Number(p.requiredQty)} disabled={updatingPartId === p.id} onBlur={(e) => updatePart(p.id, 'requiredQty', e.target.value, Number(p.requiredQty))} title="Qty" />
                    <span className="text-xs text-gray-400">×</span>
                    <input type="number" className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white disabled:opacity-50" defaultValue={Number(p.unitPrice)} step="0.01" disabled={updatingPartId === p.id} onBlur={(e) => updatePart(p.id, 'unitPrice', e.target.value, Number(p.unitPrice))} title="Price" />
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
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400">Search Part</span>
                  <button type="button" onClick={() => setShowNewPart(true)} className="text-[10px] text-blue-600 hover:underline">+ New Part</button>
                </div>
                <div className="relative">
                  <input className={inputCls} placeholder="Type to search parts..." value={partForm.search || ''} onFocus={() => { void loadInventory(partForm.search || ''); setPartForm({ ...partForm, _open: true }); }} onChange={(e) => { const search = e.target.value; setPartForm({ ...partForm, search, inventoryItemId: '', _open: true }); if (!search || search.length >= 2) void loadInventory(search); }} onBlur={() => setTimeout(() => setPartForm((f: any) => ({ ...f, _open: false })), 150)} autoComplete="off" />
                  {partForm._open && !partForm.inventoryItemId && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
                      {inventoryItems.filter((i: any) => !partForm.search || i.itemName.toLowerCase().includes((partForm.search || '').toLowerCase()) || i.sku.toLowerCase().includes((partForm.search || '').toLowerCase())).map((i: any) => (
                        <button key={i.id} type="button" onClick={() => { onItemSelect(i.id); setPartForm((f: any) => ({ ...f, search: i.itemName })); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700 last:border-0">
                          <span className="font-medium">{i.itemName}</span> <span className="text-xs text-gray-400">({i.sku})</span> <span className="text-xs text-gray-500">₹{Number(i.sellingPrice)}</span>
                        </button>
                      ))}
                      {inventoryItems.filter((i: any) => !partForm.search || i.itemName.toLowerCase().includes((partForm.search || '').toLowerCase()) || i.sku.toLowerCase().includes((partForm.search || '').toLowerCase())).length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No matches</p>}
                    </div>
                  )}
                </div>
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
          {data.invoices?.length > 0 && (
            <button onClick={() => router.push(`/admin/invoices/${data.invoices[0].id}`)} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              View Invoice {data.invoices[0].invoiceNumber}
            </button>
          )}

          {/* Links */}
          <div className="flex gap-4">
            {data.serviceRequest && <button onClick={() => router.push(`/admin/service-requests/${data.serviceRequest.id}`)} className="text-sm text-blue-600 hover:underline">View Service Request →</button>}
            {data.appointment && <button onClick={() => router.push(`/admin/appointments/${data.appointment.id}`)} className="text-sm text-blue-600 hover:underline">View Appointment →</button>}
          </div>
        </div>
      </div>
      {/* Delete Confirmation Modal */}
      <Modal open={showDeleteModal} onClose={() => { if (!deleting) setShowDeleteModal(false); }} title="Delete Job Card">
        {(() => {
          const invoice = data.invoices?.[0];
          const totalPayments = (invoice?.payments || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
          const requiresTyped = totalPayments > 0;
          const canDelete = !requiresTyped || deleteConfirmText === 'DELETE';
          return (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
                <p className="font-semibold">This action is permanent and cannot be undone.</p>
                <ul className="mt-2 list-disc list-inside space-y-1 text-xs">
                  <li>Job Card <span className="font-mono">{data.jobCardNumber}</span> will be deleted.</li>
                  {invoice && (
                    <li>
                      Invoice <span className="font-mono">{invoice.invoiceNumber}</span> will be deleted
                      {invoice.payments?.length ? ` along with ${invoice.payments.length} payment(s) totaling ₹${totalPayments.toLocaleString()}` : ''}.
                    </li>
                  )}
                  {data.parts?.length > 0 && <li>{data.parts.length} part allocation(s) will be removed.</li>}
                  {data.assignments?.length > 0 && <li>{data.assignments.length} worker assignment(s) will be removed.</li>}
                  {data.tasks?.length > 0 && <li>{data.tasks.length} task(s) will be removed.</li>}
                </ul>
              </div>
              {requiresTyped && (
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Type <span className="font-mono font-bold">DELETE</span> to confirm
                  </label>
                  <input
                    autoFocus
                    className={inputCls}
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setShowDeleteModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canDelete || deleting}
                  onClick={async () => {
                    setDeleting(true);
                    const res = await api.delete<any>(`/admin/job-cards/${id}`);
                    setDeleting(false);
                    if (res.success) {
                      setShowDeleteModal(false);
                      router.push('/admin/job-cards');
                    } else {
                      alert(res.error?.message || 'Failed to delete job card');
                    }
                  }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* New Part Modal */}
      <Modal open={showNewPart} onClose={() => setShowNewPart(false)} title="Add New Part to Inventory">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">SKU <span className="text-red-500">*</span></label><input className={inputCls} value={newPartForm.sku} onChange={(e) => setNewPartForm({ ...newPartForm, sku: e.target.value })} placeholder="e.g. OIL-20W40" /></div>
            <div><label className="block text-xs font-medium mb-1">Unit</label><input className={inputCls} value={newPartForm.unit} onChange={(e) => setNewPartForm({ ...newPartForm, unit: e.target.value })} placeholder="PCS / LTR / SET" /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Item Name <span className="text-red-500">*</span></label><input className={inputCls} value={newPartForm.itemName} onChange={(e) => setNewPartForm({ ...newPartForm, itemName: e.target.value })} placeholder="e.g. Engine Oil 20W40 1L" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium mb-1">Cost Price</label><input type="number" step="0.01" className={inputCls} value={newPartForm.costPrice} onChange={(e) => setNewPartForm({ ...newPartForm, costPrice: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Selling Price <span className="text-red-500">*</span></label><input type="number" step="0.01" className={inputCls} value={newPartForm.sellingPrice} onChange={(e) => setNewPartForm({ ...newPartForm, sellingPrice: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Stock Qty</label><input type="number" className={inputCls} value={newPartForm.quantityInStock} onChange={(e) => setNewPartForm({ ...newPartForm, quantityInStock: e.target.value })} /></div>
          </div>
          <button type="button" disabled={!newPartForm.sku || !newPartForm.itemName || !newPartForm.sellingPrice} onClick={async () => {
            const res = await api.post<any>('/admin/inventory/items', { ...newPartForm, costPrice: Number(newPartForm.costPrice) || 0, sellingPrice: Number(newPartForm.sellingPrice), quantityInStock: Number(newPartForm.quantityInStock) || 0 });
            if (res.success) {
              setInventoryItems((prev: any) => [res.data, ...prev]);
              onItemSelect(res.data.id);
              setPartForm((f: any) => ({ ...f, search: res.data.itemName }));
              setShowNewPart(false);
              setNewPartForm({ sku: '', itemName: '', unit: 'PCS', costPrice: '', sellingPrice: '', quantityInStock: '' });
            } else { alert(res.error?.message || 'Failed to create part'); }
          }} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            Create & Select Part
          </button>
        </div>
      </Modal>
    </div>
  );
}
