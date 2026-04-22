'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = () => api.get<any>(`/admin/customers/${id}`).then((r) => { if (r.success) { setData(r.data); setForm(r.data); } });
  useEffect(() => { load(); }, [id]);

  const save = async () => {
    setSaving(true);
    const { fullName, phoneNumber, alternatePhone, email, addressLine1, addressLine2, city, state, postalCode, notes } = form;
    const res = await api.patch<any>(`/admin/customers/${id}`, { fullName, phoneNumber, alternatePhone, email, addressLine1, addressLine2, city, state, postalCode, notes });
    setSaving(false);
    if (res.success) { setData(res.data); setShowEdit(false); }
  };

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={data.fullName} description={data.phoneNumber} />
        <button onClick={() => setShowEdit(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Edit Customer</button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
          <h3 className="font-semibold text-gray-900 dark:text-white">Contact</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Phone: {data.phoneNumber}</p>
          {data.alternatePhone && <p className="text-sm text-gray-600 dark:text-gray-400">Alt Phone: {data.alternatePhone}</p>}
          <p className="text-sm text-gray-600 dark:text-gray-400">Email: {data.email ?? '—'}</p>
          {data.addressLine1 && <p className="text-sm text-gray-600 dark:text-gray-400">Address: {[data.addressLine1, data.addressLine2, data.city, data.state, data.postalCode].filter(Boolean).join(', ')}</p>}
          {data.notes && <p className="text-sm text-gray-500">Notes: {data.notes}</p>}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
          <h3 className="font-semibold text-gray-900 dark:text-white">Vehicles ({data.vehicles?.length ?? 0})</h3>
          {data.vehicles?.map((v: any) => (
            <button key={v.id} onClick={() => router.push(`/admin/vehicles/${v.id}`)} className="block text-sm text-blue-600 hover:underline">{v.registrationNumber} — {v.brand} {v.model}</button>
          ))}
        </div>
      </div>
      {data.serviceRequests?.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Recent Service Requests</h3>
          {data.serviceRequests.map((sr: any) => (
            <div key={sr.id} className="flex justify-between text-sm py-1">
              <button onClick={() => router.push(`/admin/service-requests/${sr.id}`)} className="text-blue-600 hover:underline">{sr.referenceId}</button>
              <StatusBadge status={sr.status} />
            </div>
          ))}
        </div>
      )}

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Customer">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Full Name</label><input className={inputCls} value={form.fullName || ''} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Phone</label><input className={inputCls} value={form.phoneNumber || ''} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Email</label><input className={inputCls} value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Alt Phone</label><input className={inputCls} value={form.alternatePhone || ''} onChange={(e) => setForm({ ...form, alternatePhone: e.target.value })} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Address</label><input className={inputCls} value={form.addressLine1 || ''} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium mb-1">City</label><input className={inputCls} value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">State</label><input className={inputCls} value={form.state || ''} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Postal Code</label><input className={inputCls} value={form.postalCode || ''} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Notes</label><textarea className={inputCls} rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button onClick={save} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </Modal>
    </div>
  );
}
