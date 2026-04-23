'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function VehicleDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = () => api.get<any>(`/admin/vehicles/${id}`).then((r) => { if (r.success) { setData(r.data); setForm(r.data); } });
  useEffect(() => { load(); }, [id]);

  const save = async () => {
    setSaving(true);
    const { brand, model, variant, odometerReading, notes } = form;
    const res = await api.patch<any>(`/admin/vehicles/${id}`, { brand, model, variant, odometerReading: odometerReading ? Number(odometerReading) : undefined, notes });
    setSaving(false);
    if (res.success) { setData(res.data); setShowEdit(false); }
  };

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={data.registrationNumber} description={`${data.brand} ${data.model}`} />
        <button onClick={() => setShowEdit(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Edit Vehicle</button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">Type: {data.vehicleType}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Owner: <button onClick={() => router.push(`/admin/customers/${data.customer?.id}`)} className="text-blue-600 hover:underline">{data.customer?.fullName}</button></p>
          {data.variant && <p className="text-sm text-gray-600 dark:text-gray-400">Variant: {data.variant}</p>}
          {data.fuelType && <p className="text-sm text-gray-600 dark:text-gray-400">Fuel: {data.fuelType}</p>}
          {data.odometerReading && <p className="text-sm text-gray-600 dark:text-gray-400">Odometer: {data.odometerReading} km</p>}
          {data.notes && <p className="text-sm text-gray-500">Notes: {data.notes}</p>}
        </div>
        <div className="space-y-4">
          {data.serviceRequests?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Service Requests</h3>
              {data.serviceRequests.map((sr: any) => <div key={sr.id} className="flex justify-between text-sm py-1"><button onClick={() => router.push(`/admin/service-requests/${sr.id}`)} className="text-blue-600 hover:underline">{sr.referenceId}</button><StatusBadge status={sr.status} /></div>)}
            </div>
          )}
          {data.jobCards?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Job Cards</h3>
              {data.jobCards.map((jc: any) => <div key={jc.id} className="flex justify-between text-sm py-1"><button onClick={() => router.push(`/admin/job-cards/${jc.id}`)} className="text-blue-600 hover:underline">{jc.jobCardNumber}</button><StatusBadge status={jc.status} /></div>)}
            </div>
          )}
        </div>
      </div>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Vehicle">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Brand</label><input className={inputCls} value={form.brand || ''} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Model</label><input className={inputCls} value={form.model || ''} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Variant</label><input className={inputCls} value={form.variant || ''} onChange={(e) => setForm({ ...form, variant: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Odometer (km)</label><input type="number" className={inputCls} value={form.odometerReading || ''} onChange={(e) => setForm({ ...form, odometerReading: e.target.value })} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Notes</label><textarea className={inputCls} rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button onClick={save} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </Modal>
    </div>
  );
}
