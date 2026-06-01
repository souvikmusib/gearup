'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, DataTable, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function AmcContractsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [plans, setPlans] = useState<any[]>([]);
  const [form, setForm] = useState({ customerId: '', vehicleId: '', amcPlanId: '', startDate: '', amountPaid: '', paymentMode: 'CASH', notes: '' });

  const load = (status = statusFilter) => {
    const qs = status ? `?status=${status}` : '';
    api.get<any>(`/admin/amc/contracts${qs}`).then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setShowCreate(true); setError('');
    api.get<any>('/admin/amc/plans').then((r) => { if (r.success) setPlans((r.data ?? []).filter((p: any) => p.isActive)); });
  };

  const handleCreate = async () => {
    setSaving(true); setError('');
    const res = await api.post<any>('/admin/amc/contracts', { ...form, amountPaid: Number(form.amountPaid) });
    setSaving(false);
    if (res.success) { setShowCreate(false); load(); }
    else setError(res.error?.message || 'Failed');
  };

  if (loading) return <ProcessLoader title="Loading AMC contracts..." />;

  return (
    <div className="space-y-6">
      <PageHeader title="AMC Contracts" actions={<button onClick={openCreate} className="bg-blue-600 text-white rounded px-4 py-2 text-sm">+ New Contract</button>} />

      <div className="flex gap-2">
        {['', 'ACTIVE', 'EXPIRED', 'CANCELLED'].map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); load(s); }} className={`px-3 py-1 rounded text-sm ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      <DataTable
        keyField="id"
        columns={[
          { key: 'contractNumber', header: 'Contract #', render: (row: any) => <Link href={`/admin/amc/contracts/${row.id}`} className="text-blue-600 hover:underline">{row.contractNumber}</Link> },
          { key: 'customer', header: 'Customer', render: (row: any) => row.customer?.fullName },
          { key: 'vehicle', header: 'Vehicle', render: (row: any) => row.vehicle?.registrationNumber },
          { key: 'plan', header: 'Plan', render: (row: any) => row.plan?.planName },
          { key: 'servicesRemaining', header: 'Remaining', render: (row: any) => `${row.servicesRemaining}/${row.totalServices}` },
          { key: 'endDate', header: 'Expires', render: (row: any) => new Date(row.endDate).toLocaleDateString('en-IN') },
          { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
        ]}
        data={data}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create AMC Contract">
        <div className="space-y-3">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" placeholder="Customer ID" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} />
          <input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" placeholder="Vehicle ID" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} />
          <select className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" value={form.amcPlanId} onChange={(e) => setForm({ ...form, amcPlanId: e.target.value })}>
            <option value="">Select Plan</option>
            {plans.map((p: any) => <option key={p.id} value={p.id}>{p.planName} — ₹{Number(p.price).toLocaleString()}</option>)}
          </select>
          <input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" type="number" placeholder="Amount Paid (₹)" value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: e.target.value })} />
          <select className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
          </select>
          <textarea className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button disabled={saving || !form.customerId || !form.vehicleId || !form.amcPlanId || !form.startDate || !form.amountPaid} onClick={handleCreate} className="w-full bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Contract'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
