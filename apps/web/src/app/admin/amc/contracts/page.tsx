'use client';
import { formatIST } from '@/lib/time';
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
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [showNewCust, setShowNewCust] = useState(false);
  const [custForm, setCustForm] = useState({ fullName: '', phoneNumber: '' });
  const [form, setForm] = useState({ customerId: '', vehicleId: '', amcPlanId: '', startDate: '', amountPaid: '', paymentMode: 'CASH', notes: '' });

  const load = (status = statusFilter) => {
    const qs = status ? `?status=${status}` : '';
    api.get<any>(`/admin/amc/contracts${qs}`).then((r) => { if (r.success) setData(r.data ?? []); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setShowCreate(true); setError('');
    api.get<any>('/admin/amc/plans').then((r) => { if (r.success) setPlans((r.data ?? []).filter((p: any) => p.isActive)); });
    api.get<any>('/admin/customers?pageSize=200').then((r) => { if (r.success) setCustomers(r.data?.items ?? r.data ?? []); });
  };

  const onCustomerChange = (customerId: string) => {
    setForm({ ...form, customerId, vehicleId: '' });
    if (customerId) {
      api.get<any>(`/admin/vehicles?customerId=${customerId}&pageSize=100`).then((r) => { if (r.success) setVehicles(r.data?.items ?? r.data ?? []); });
    } else {
      setVehicles([]);
    }
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
          { key: 'endDate', header: 'Expires', render: (row: any) => formatIST(row.endDate) },
          { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
        ]}
        data={data}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create AMC Contract">
        <div className="space-y-3">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div><div className="flex items-center justify-between"><label className="text-xs text-gray-500">Customer</label><button type="button" onClick={() => setShowNewCust(!showNewCust)} className="text-xs text-blue-600 hover:underline">{showNewCust ? '← Select existing' : '+ New customer'}</button></div>
          {showNewCust ? (
            <div className="flex gap-2 mt-1">
              <input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700 text-sm" placeholder="Full Name *" value={custForm.fullName} onChange={(e) => setCustForm({ ...custForm, fullName: e.target.value })} />
              <input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700 text-sm" placeholder="Phone *" value={custForm.phoneNumber} onChange={(e) => setCustForm({ ...custForm, phoneNumber: e.target.value })} />
              <button type="button" onClick={async () => {
                if (!custForm.fullName || !custForm.phoneNumber) return;
                setSaving(true);
                const res = await api.post<any>('/admin/customers', custForm);
                setSaving(false);
                if (res.success) { setCustomers((p) => [res.data, ...p]); onCustomerChange(res.data.id); setShowNewCust(false); setCustForm({ fullName: '', phoneNumber: '' }); }
                else setError(res.error?.message || 'Failed');
              }} disabled={saving || !custForm.fullName || !custForm.phoneNumber} className="shrink-0 rounded bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">Add</button>
            </div>
          ) : (
            <select className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" value={form.customerId} onChange={(e) => onCustomerChange(e.target.value)}>
              <option value="">Select Customer</option>
              {customers.map((c: any) => <option key={c.id} value={c.id}>{c.fullName} — {c.phoneNumber}</option>)}
            </select>
          )}</div>
          <div><label className="text-xs text-gray-500">Vehicle</label>
          <select className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} disabled={!form.customerId}>
            <option value="">{form.customerId ? 'Select Vehicle' : 'Select customer first'}</option>
            {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.registrationNumber} — {v.brand} {v.model}</option>)}
          </select></div>
          <div><label className="text-xs text-gray-500">Plan</label>
          <select className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" value={form.amcPlanId} onChange={(e) => { const plan = plans.find((p: any) => p.id === e.target.value); setForm({ ...form, amcPlanId: e.target.value, amountPaid: plan ? String(Number(plan.price)) : '' }); }}>
            <option value="">Select Plan</option>
            {plans.map((p: any) => <option key={p.id} value={p.id}>{p.planName} ({p.ccRange || p.vehicleType}) — ₹{Number(p.price).toLocaleString()}</option>)}
          </select></div>
          <div><label className="text-xs text-gray-500">Start Date</label>
          <input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-gray-500">Amount Paid (₹)</label>
            <input className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" type="number" value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: e.target.value })} /></div>
            <div><label className="text-xs text-gray-500">Payment Mode</label>
            <select className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
              <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank Transfer</option>
            </select></div>
          </div>
          <textarea className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button disabled={saving || !form.customerId || !form.vehicleId || !form.amcPlanId || !form.startDate || !form.amountPaid} onClick={handleCreate} className="w-full bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Contract'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
