'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

const TYPES = ['PUBLIC_HOLIDAY', 'WEEKLY_OFF', 'BUSINESS_CLOSURE', 'MAINTENANCE_SHUTDOWN', 'CUSTOM_BLOCK'];

export default function HolidaysPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ holidayName: '', holidayDate: '', holidayType: 'PUBLIC_HOLIDAY', isFullDay: true, startTime: '', endTime: '', notes: '' });

  const load = () => api.get<any>('/admin/settings/holidays').then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const body = { ...form, startTime: form.isFullDay ? undefined : form.startTime, endTime: form.isFullDay ? undefined : form.endTime };
    const res = await api.post('/admin/settings/holidays', body);
    setSaving(false);
    if (res.success) { setShowCreate(false); setForm({ holidayName: '', holidayDate: '', holidayType: 'PUBLIC_HOLIDAY', isFullDay: true, startTime: '', endTime: '', notes: '' }); load(); }
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this holiday?')) return;
    await api.delete<any>(`/admin/settings/holidays?id=${id}`);
    load();
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';
  const today = new Date().toISOString().split('T')[0];
  const upcoming = data.filter((h) => h.holidayDate >= today);
  const past = data.filter((h) => h.holidayDate < today);

  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Shop Holidays" description="Manage holidays, closures, and weekly offs" />
        <button onClick={() => setShowCreate(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ Add Holiday</button>
      </div>

      {upcoming.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Upcoming</h3>
          <DataTable keyField="id" columns={[
            { key: 'holidayDate', header: 'Date', render: (r: any) => new Date(r.holidayDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) },
            { key: 'holidayName', header: 'Name' },
            { key: 'holidayType', header: 'Type', render: (r: any) => r.holidayType.replace(/_/g, ' ') },
            { key: 'time', header: 'Time', render: (r: any) => r.isFullDay ? 'Full Day' : `${r.startTime} – ${r.endTime}` },
            { key: 'actions', header: '', render: (r: any) => <button onClick={(e) => remove(r.id, e)} className="text-xs text-red-500 hover:underline">Delete</button> },
          ]} data={upcoming} />
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-2">Past</h3>
          <DataTable keyField="id" columns={[
            { key: 'holidayDate', header: 'Date', render: (r: any) => new Date(r.holidayDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
            { key: 'holidayName', header: 'Name' },
            { key: 'holidayType', header: 'Type', render: (r: any) => r.holidayType.replace(/_/g, ' ') },
          ]} data={past} />
        </div>
      )}

      {data.length === 0 && <p className="py-8 text-center text-gray-500">No holidays configured</p>}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Holiday">
        <form onSubmit={submit} className="space-y-3">
          <div><label className="block text-xs font-medium mb-1">Holiday Name *</label><input className={inputCls} required value={form.holidayName} onChange={(e) => setForm({ ...form, holidayName: e.target.value })} placeholder="e.g. Diwali, Sunday Off" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Date *</label><input type="date" className={inputCls} required value={form.holidayDate} onChange={(e) => setForm({ ...form, holidayDate: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Type</label>
              <select className={inputCls} value={form.holidayType} onChange={(e) => setForm({ ...form, holidayType: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isFullDay} onChange={(e) => setForm({ ...form, isFullDay: e.target.checked })} className="rounded" />
            Full Day
          </label>
          {!form.isFullDay && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium mb-1">Start Time</label><input type="time" className={inputCls} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
              <div><label className="block text-xs font-medium mb-1">End Time</label><input type="time" className={inputCls} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
            </div>
          )}
          <div><label className="block text-xs font-medium mb-1">Notes</label><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button type="submit" disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Creating...' : 'Add Holiday'}</button>
        </form>
      </Modal>
    </div>
  );
}
