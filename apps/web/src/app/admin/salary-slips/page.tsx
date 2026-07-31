'use client';
import { formatIST } from '@/lib/time';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';
import { Pagination } from '@/components/shared/pagination';

interface LineItem {
  label: string;
  amount: string;
}

export default function SalarySlipsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [workers, setWorkers] = useState<any[]>([]);

  // Create flow
  const [showCreate, setShowCreate] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const now = new Date();
  const [form, setForm] = useState({
    workerId: '',
    workerName: '',
    designation: '',
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    paymentMode: 'CASH',
    notes: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ label: 'Salary', amount: '' }]);

  // Edit flow
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ workerName: '', designation: '', month: '', year: '', paymentMode: 'CASH', notes: '' });
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const load = (pg = page) => {
    const p = new URLSearchParams();
    p.set('page', String(pg));
    const endpoint = `/admin/salary-slips?${p.toString()}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) {
      setData(cached.data?.items ?? cached.data ?? []);
      setTotalPages(cached.meta?.totalPages ?? 1);
      setLoading(false);
    } else {
      setLoading(true);
    }
    promise.then((r) => {
      if (r.success) {
        setData(r.data?.items ?? r.data ?? []);
        setTotalPages(r.meta?.totalPages ?? 1);
      }
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadWorkers = async () => {
    if (workers.length > 0) return;
    const res = await api.get<any>('/admin/workers?pageSize=100');
    if (res.success) setWorkers(res.data ?? []);
  };

  // ─── Create ──────────────────────────────────────────────────────────────

  const openCreate = () => {
    setShowCreate(true);
    setError('');
    loadWorkers();
  };

  const onWorkerSelect = (workerId: string) => {
    if (!workerId) return;
    const w = workers.find((w: any) => w.id === workerId);
    setForm({ ...form, workerId, workerName: w?.fullName || '', designation: w?.designation || '' });
  };

  const addLineItem = () => setLineItems([...lineItems, { label: '', amount: '' }]);
  const removeLineItem = (i: number) => setLineItems(lineItems.filter((_, idx) => idx !== i));
  const updateLineItem = (i: number, field: keyof LineItem, value: string) => {
    const updated = [...lineItems];
    updated[i] = { ...updated[i], [field]: value };
    setLineItems(updated);
  };

  const totalAmount = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);

  const handleFormSubmit = () => {
    if (!form.workerName.trim()) { setError('Worker name is required'); return; }
    const invalid = lineItems.some((li) => !li.label.trim() || !li.amount || Number(li.amount) <= 0);
    if (invalid) { setError('Each line item needs a label and an amount greater than 0'); return; }
    if (totalAmount <= 0) { setError('Total must be greater than 0'); return; }
    setError('');
    setShowCreate(false);
    setShowConfirm(true);
  };

  const confirmAndCreate = async () => {
    setSaving(true);
    setError('');
    const res = await api.post<any>('/admin/salary-slips', {
      workerId: form.workerId || undefined,
      workerName: form.workerName.trim(),
      designation: form.designation.trim() || undefined,
      lineItems: lineItems.map((li) => ({ label: li.label.trim(), amount: Number(li.amount) })),
      month: Number(form.month),
      year: Number(form.year),
      paymentMode: form.paymentMode || undefined,
      notes: form.notes.trim() || undefined,
    });
    setSaving(false);
    if (res.success) {
      setShowConfirm(false);
      setForm({ workerId: '', workerName: '', designation: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()), paymentMode: 'CASH', notes: '' });
      setLineItems([{ label: 'Salary', amount: '' }]);
      load();
      if (res.data?.slipUrl) window.open(res.data.slipUrl, '_blank');
    } else {
      setError(res.error?.message || 'Failed to create salary slip');
      setShowConfirm(false);
      setShowCreate(true);
    }
  };

  const goBackToForm = () => { setShowConfirm(false); setShowCreate(true); };

  // ─── Edit ────────────────────────────────────────────────────────────────

  const openEdit = (item: any) => {
    if (!item.editable) {
      window.open(`/api/admin/salary-slips/${item.id}/pdf`, '_blank');
      return;
    }
    let metadata: any = {};
    try { metadata = JSON.parse(item.notes || '{}'); } catch { /* fallback */ }
    setEditItem(item);
    setEditError('');
    setEditForm({
      workerName: metadata.workerName || item.vendorName || '',
      designation: metadata.designation || '',
      month: String(metadata.month || (new Date(item.expenseDate).getMonth() + 1)),
      year: String(metadata.year || new Date(item.expenseDate).getFullYear()),
      paymentMode: item.paymentMode || 'CASH',
      notes: metadata.userNotes || '',
    });
    setEditLineItems(
      (metadata.lineItems || [{ label: 'Salary', amount: Number(item.amount) }]).map((li: any) => ({
        label: li.label, amount: String(li.amount),
      })),
    );
  };

  const saveEdit = async () => {
    if (!editItem) return;
    if (!editForm.workerName.trim()) { setEditError('Worker name is required'); return; }
    const invalid = editLineItems.some((li) => !li.label.trim() || !li.amount || Number(li.amount) <= 0);
    if (invalid) { setEditError('Each line item needs a label and amount > 0'); return; }
    setEditSaving(true); setEditError('');
    const res = await api.patch<any>(`/admin/salary-slips/${editItem.id}`, {
      workerName: editForm.workerName.trim(),
      designation: editForm.designation.trim() || undefined,
      lineItems: editLineItems.map((li) => ({ label: li.label.trim(), amount: Number(li.amount) })),
      month: Number(editForm.month),
      year: Number(editForm.year),
      paymentMode: editForm.paymentMode || undefined,
      notes: editForm.notes.trim() || undefined,
    });
    setEditSaving(false);
    if (res.success) { setEditItem(null); load(); }
    else setEditError(res.error?.message || 'Failed to save');
  };

  // ─── Delete ──────────────────────────────────────────────────────────────

  const deleteSlip = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this salary slip? It will also be removed from expenses.')) return;
    const res = await api.delete<any>(`/admin/salary-slips/${id}`);
    if (res.success) load();
  };

  // ─── Render helpers ──────────────────────────────────────────────────────

  const inputCls = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:focus:border-blue-400';
  const labelCls = 'block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1';
  const months = [
    { value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' },
    { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' },
    { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' },
    { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' },
  ];

  if (loading) return <ProcessLoader title="Loading salary slips" steps={['Fetching records']} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Salary Slips" />
        <button onClick={openCreate} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors">
          + Create Salary Slip
        </button>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          <div className="text-4xl mb-3">📄</div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">No salary slips yet</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Create your first salary slip to get started.</p>
          <button onClick={openCreate} className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium">
            + Create Salary Slip
          </button>
        </div>
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'expenseDate', header: 'Date', render: (r: any) => formatIST(r.expenseDate) },
              { key: 'vendorName', header: 'Worker' },
              { key: 'amount', header: 'Amount', render: (r: any) => (
                <span className="font-medium">₹{Number(r.amount).toLocaleString('en-IN')}</span>
              )},
              { key: 'paymentMode', header: 'Mode', render: (r: any) => (
                <span className="text-gray-600 dark:text-gray-400">{r.paymentMode?.replace('_', ' ') || '—'}</span>
              )},
              { key: 'createdBy', header: 'Created By', render: (r: any) => r.createdBy?.fullName || '—' },
              { key: 'status', header: '', render: (r: any) => r.editable ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Editable
                </span>
              ) : null },
              { key: 'actions', header: '', render: (r: any) => (
                <div className="flex gap-3 items-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => window.open(`/api/admin/salary-slips/${r.id}/pdf`, '_blank')}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    View
                  </button>
                  <button
                    onClick={(e) => deleteSlip(r.id, e)}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )},
            ]}
            data={data}
            keyField="id"
            onRowClick={openEdit}
          />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {/* ── Create Modal ────────────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Salary Slip">
        <div className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Worker Selection */}
          <div>
            <label className={labelCls}>Worker</label>
            <select className={inputCls} value={form.workerId} onChange={(e) => onWorkerSelect(e.target.value)}>
              <option value="">Select a worker or type manually below</option>
              {workers.map((w: any) => (
                <option key={w.id} value={w.id}>{w.fullName}{w.designation ? ` · ${w.designation}` : ''}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.workerName} onChange={(e) => setForm({ ...form, workerName: e.target.value })} placeholder="Worker name" />
            </div>
            <div>
              <label className={labelCls}>Designation</label>
              <input className={inputCls} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Mechanic" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Month <span className="text-red-500">*</span></label>
              <select className={inputCls} value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}>
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Year <span className="text-red-500">*</span></label>
              <input type="number" className={inputCls} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Payment Mode</label>
              <select className={inputCls} value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CARD">Card</option>
              </select>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>Earnings</label>
              <button
                onClick={addLineItem}
                type="button"
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                + Add line
              </button>
            </div>
            <div className="space-y-2 rounded-md border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50">
              {lineItems.map((li, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="e.g. Salary, Incentive, Overtime"
                    value={li.label}
                    onChange={(e) => updateLineItem(i, 'label', e.target.value)}
                  />
                  <div className="relative w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
                    <input
                      type="number"
                      className={`${inputCls} pl-7`}
                      placeholder="0"
                      value={li.amount}
                      onChange={(e) => updateLineItem(i, 'amount', e.target.value)}
                    />
                  </div>
                  {lineItems.length > 1 && (
                    <button
                      onClick={() => removeLineItem(i)}
                      type="button"
                      className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      aria-label="Remove line item"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  Total: ₹{totalAmount.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes" />
          </div>

          <button
            onClick={handleFormSubmit}
            type="button"
            className="w-full rounded-md bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            Review & Confirm
          </button>
        </div>
      </Modal>

      {/* ── Confirm Modal ───────────────────────────────────────────────── */}
      <Modal open={showConfirm} onClose={goBackToForm} title="Confirm Salary Slip">
        <div className="space-y-4">
          <div className="rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{form.workerName}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {form.designation && `${form.designation} · `}
                {months.find((m) => m.value === form.month)?.label} {form.year} · {form.paymentMode.replace('_', ' ')}
              </p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {lineItems.map((li, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{li.label}</span>
                  <span className="font-medium text-gray-900 dark:text-white">₹{Number(li.amount).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 flex justify-between bg-gray-50 dark:bg-gray-800/50">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Net Pay</span>
              <span className="text-sm font-bold text-blue-600">₹{totalAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            This creates an expense entry and opens the salary slip in a new tab.
          </p>

          <div className="flex gap-3">
            <button
              onClick={goBackToForm}
              type="button"
              className="flex-1 rounded-md py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={confirmAndCreate}
              disabled={saving}
              type="button"
              className="flex-1 rounded-md bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating...' : 'Confirm & Generate'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Modal ──────────────────────────────────────────────────── */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Salary Slip">
        <div className="space-y-4">
          {editError && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
              <p className="text-sm text-red-700 dark:text-red-400">{editError}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name <span className="text-red-500">*</span></label>
              <input className={inputCls} value={editForm.workerName} onChange={(e) => setEditForm({ ...editForm, workerName: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Designation</label>
              <input className={inputCls} value={editForm.designation} onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Month</label>
              <select className={inputCls} value={editForm.month} onChange={(e) => setEditForm({ ...editForm, month: e.target.value })}>
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Year</label>
              <input type="number" className={inputCls} value={editForm.year} onChange={(e) => setEditForm({ ...editForm, year: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Payment Mode</label>
              <select className={inputCls} value={editForm.paymentMode} onChange={(e) => setEditForm({ ...editForm, paymentMode: e.target.value })}>
                <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CARD">Card</option>
              </select>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>Earnings</label>
              <button onClick={() => setEditLineItems([...editLineItems, { label: '', amount: '' }])} type="button" className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add line</button>
            </div>
            <div className="space-y-2 rounded-md border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50">
              {editLineItems.map((li, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className={`${inputCls} flex-1`} value={li.label} onChange={(e) => { const u = [...editLineItems]; u[i] = { ...u[i], label: e.target.value }; setEditLineItems(u); }} />
                  <div className="relative w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
                    <input type="number" className={`${inputCls} pl-7`} value={li.amount} onChange={(e) => { const u = [...editLineItems]; u[i] = { ...u[i], amount: e.target.value }; setEditLineItems(u); }} />
                  </div>
                  {editLineItems.length > 1 && (
                    <button onClick={() => setEditLineItems(editLineItems.filter((_, idx) => idx !== i))} type="button" className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" aria-label="Remove">×</button>
                  )}
                </div>
              ))}
              <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  Total: ₹{editLineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <input className={inputCls} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </div>

          <button onClick={saveEdit} disabled={editSaving} type="button" className="w-full rounded-md bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {editSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
