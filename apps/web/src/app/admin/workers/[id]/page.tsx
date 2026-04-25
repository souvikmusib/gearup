'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function WorkerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'CASUAL', startDate: '', endDate: '', reason: '' });
  const [showLeave, setShowLeave] = useState(false);

  const load = () => api.get<any>(`/admin/workers/${id}`).then((r) => { if (r.success) { setData(r.data); setForm(r.data); } });
  useEffect(() => { load(); }, [id]);

  const save = async () => {
    setSaving(true);
    const { fullName, phoneNumber, email, designation, specialization, shiftStart, shiftEnd, notes } = form;
    const res = await api.patch<any>(`/admin/workers/${id}`, { fullName, phoneNumber: phoneNumber || null, email: email || null, designation: designation || null, specialization: specialization || null, shiftStart: shiftStart || null, shiftEnd: shiftEnd || null, notes: notes || null });
    setSaving(false);
    if (res.success) { setData(res.data); setShowEdit(false); }
  };

  const setStatus = async (status: string) => {
    const res = await api.patch<any>(`/admin/workers/${id}`, { status });
    if (res.success) load();
  };

  const submitLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate) return;
    setSaving(true);
    const res = await api.post<any>(`/admin/workers/${id}/leave`, leaveForm);
    setSaving(false);
    if (res.success) { setShowLeave(false); setLeaveForm({ leaveType: 'CASUAL', startDate: '', endDate: '', reason: '' }); load(); }
  };

  const updateLeave = async (leaveId: string, status: 'APPROVED' | 'REJECTED') => {
    await api.patch<any>(`/admin/workers/${id}/leave`, { leaveId, status });
    load();
  };

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={data.fullName} description={data.workerCode} />
        <button onClick={() => setShowEdit(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Edit Worker</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusBadge status={data.status} />
        {data.status === 'ACTIVE' && <button onClick={() => setStatus('INACTIVE')} className="rounded-lg bg-gray-600 px-3 py-1 text-xs text-white hover:bg-gray-700">Deactivate</button>}
        {data.status === 'ACTIVE' && <button onClick={() => setStatus('ON_LEAVE')} className="rounded-lg bg-yellow-600 px-3 py-1 text-xs text-white hover:bg-yellow-700">Mark On Leave</button>}
        {data.status !== 'ACTIVE' && <button onClick={() => setStatus('ACTIVE')} className="rounded-lg bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700">Activate</button>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
          <h3 className="font-semibold text-gray-900 dark:text-white">Info</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Phone: {data.phoneNumber ?? '—'}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Email: {data.email ?? '—'}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Designation: {data.designation ?? '—'}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Specialization: {data.specialization ?? '—'}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Shift: {data.shiftStart ?? '—'} – {data.shiftEnd ?? '—'}</p>
          {data.notes && <p className="text-sm text-gray-500">Notes: {data.notes}</p>}
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Assignments ({data.assignments?.length ?? 0})</h3>
            {data.assignments?.slice(0, 10).map((a: any) => (
              <div key={a.id} className="flex justify-between text-sm py-1">
                <button onClick={() => router.push(`/admin/job-cards/${a.jobCard?.id || a.jobCardId}`)} className="text-blue-600 hover:underline">{a.jobCard?.jobCardNumber}</button>
                <StatusBadge status={a.jobCard?.status} />
              </div>
            ))}
          </div>
          {data.leaves?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Leave History</h3>
              {data.leaves.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between text-sm py-1">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">{new Date(l.startDate).toLocaleDateString()} – {new Date(l.endDate).toLocaleDateString()}</span>
                    <span className="ml-2 text-gray-500">{l.leaveType}</span>
                    <span className="ml-2"><StatusBadge status={l.status} /></span>
                  </div>
                  {l.status === 'PENDING' && (
                    <div className="flex gap-1">
                      <button onClick={() => updateLeave(l.id, 'APPROVED')} className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700">Approve</button>
                      <button onClick={() => updateLeave(l.id, 'REJECTED')} className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700">Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setShowLeave(true)} className="w-full rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">+ Add Leave</button>
        </div>
      </div>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Worker">
        <div className="space-y-3">
          <div><label className="block text-xs font-medium mb-1">Full Name</label><input className={inputCls} value={form.fullName || ''} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Phone</label><input className={inputCls} value={form.phoneNumber || ''} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Email</label><input className={inputCls} value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Designation</label><input className={inputCls} value={form.designation || ''} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Specialization</label><input className={inputCls} value={form.specialization || ''} onChange={(e) => setForm({ ...form, specialization: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Shift Start</label><input type="time" className={inputCls} value={form.shiftStart || ''} onChange={(e) => setForm({ ...form, shiftStart: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Shift End</label><input type="time" className={inputCls} value={form.shiftEnd || ''} onChange={(e) => setForm({ ...form, shiftEnd: e.target.value })} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Notes</label><textarea className={inputCls} rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button onClick={save} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </Modal>
      <Modal open={showLeave} onClose={() => setShowLeave(false)} title="Add Leave">
        <div className="space-y-3">
          <div><label className="block text-xs font-medium mb-1">Leave Type</label>
            <select className={inputCls} value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}>
              <option value="CASUAL">Casual Leave</option><option value="SICK">Sick Leave</option><option value="EARNED">Earned Leave</option><option value="UNPAID">Unpaid Leave</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Start Date *</label><input type="date" className={inputCls} required value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">End Date *</label><input type="date" className={inputCls} required value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Reason</label><input className={inputCls} value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} /></div>
          <button onClick={submitLeave} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Submit Leave'}</button>
        </div>
      </Modal>
    </div>
  );
}
