'use client';
import { formatIST, formatTimeIST } from '@/lib/time';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { PageHeader, StatusBadge } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function AmcContractDetailPage() {
  const { id } = useParams();
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showUse, setShowUse] = useState(false);
  const [useForm, setUseForm] = useState({ jobCardId: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [jobCardOptions, setJobCardOptions] = useState<any[]>([]);
  const [jobCardsLoading, setJobCardsLoading] = useState(false);

  const load = () => {
    api.get<any>(`/admin/amc/contracts/${id}`).then((r) => { if (r.success) setContract(r.data); setLoading(false); });
  };
  useEffect(() => { load(); }, [id]);

  // Load eligible job cards (same customer + vehicle, active statuses) when opening the modal
  useEffect(() => {
    if (!showUse || !contract) return;
    setJobCardsLoading(true);
    api.get<any>(`/admin/job-cards?pageSize=100`).then((r) => {
      if (r.success) {
        const eligibleStatuses = new Set(['IN_PROGRESS', 'COMPLETED', 'INTAKE', 'DIAGNOSIS', 'AWAITING_APPROVAL', 'AWAITING_PARTS', 'READY_FOR_DELIVERY']);
        const filtered = (r.data || []).filter((jc: any) =>
          jc.customerId === contract.customerId &&
          jc.vehicleId === contract.vehicleId &&
          eligibleStatuses.has(jc.status),
        );
        setJobCardOptions(filtered);
      }
      setJobCardsLoading(false);
    });
  }, [showUse, contract]);

  const handleUseService = async () => {
    setSaving(true); setError('');
    const res = await api.post<any>(`/admin/amc/contracts/${id}`, useForm);
    setSaving(false);
    if (res.success) { setShowUse(false); setUseForm({ jobCardId: '', notes: '' }); load(); }
    else setError(res.error?.message || 'Failed');
  };

  const handleCancel = async () => {
    if (contract?.status !== 'ACTIVE') {
      alert(`Cannot cancel a contract in ${contract?.status} state.`);
      return;
    }
    const remaining = contract?.servicesRemaining ?? 0;
    const msg = remaining > 0
      ? `Cancel this contract? ${remaining} service${remaining === 1 ? '' : 's'} remaining will be forfeited.`
      : 'Cancel this contract?';
    if (!confirm(msg)) return;
    const res = await api.patch<any>(`/admin/amc/contracts/${id}`, { status: 'CANCELLED' });
    if (!res.success) {
      alert(res.error?.message || 'Failed to cancel contract');
      return;
    }
    load();
  };

  const handleDeleteUsage = async (usageId: string) => {
    if (!confirm('Remove this service usage? This will restore 1 service to the contract.')) return;
    await api.delete(`/admin/amc/contracts/${id}/usages/${usageId}`);
    load();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this contract and all its usage history? This cannot be undone.')) return;
    const res = await api.delete<any>(`/admin/amc/contracts/${id}`);
    if (res.success) window.location.href = '/admin/amc/contracts';
    else alert(res.error?.message || 'Failed to delete');
  };

  if (loading) return <ProcessLoader title="Loading contract..." />;
  if (!contract) return <p>Contract not found</p>;

  const canUse = contract.status === 'ACTIVE' && contract.servicesRemaining > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={`Contract ${contract.contractNumber}`} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg border p-4 space-y-2">
          <h3 className="font-semibold text-gray-500 text-xs uppercase">Contract Info</h3>
          <p><span className="text-gray-500">Status:</span> <StatusBadge status={contract.status} /></p>
          <p><span className="text-gray-500">Plan:</span> {contract.plan?.planName}</p>
          <p><span className="text-gray-500">Start:</span> {formatIST(contract.startDate)}</p>
          <p><span className="text-gray-500">End:</span> {formatIST(contract.endDate)}</p>
          <p><span className="text-gray-500">Paid:</span> ₹{Number(contract.amountPaid).toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg border p-4 space-y-2">
          <h3 className="font-semibold text-gray-500 text-xs uppercase">Customer & Vehicle</h3>
          <p><span className="text-gray-500">Customer:</span> <Link href={`/admin/customers/${contract.customerId}`} className="text-blue-600 hover:underline">{contract.customer?.fullName}</Link></p>
          <p><span className="text-gray-500">Phone:</span> {contract.customer?.phoneNumber}</p>
          <p><span className="text-gray-500">Vehicle:</span> <Link href={`/admin/vehicles/${contract.vehicleId}`} className="text-blue-600 hover:underline">{contract.vehicle?.registrationNumber}</Link></p>
          <p><span className="text-gray-500">Model:</span> {contract.vehicle?.brand} {contract.vehicle?.model}</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg border p-4 space-y-2">
          <h3 className="font-semibold text-gray-500 text-xs uppercase">Service Usage</h3>
          <p className="text-3xl font-bold">{contract.servicesUsed} / {contract.totalServices}</p>
          <p className="text-gray-500 text-sm">{contract.servicesRemaining} remaining</p>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
            <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${(contract.servicesUsed / contract.totalServices) * 100}%` }} />
          </div>
          <div className="flex gap-2 mt-3">
            {canUse && <button onClick={() => setShowUse(true)} className="bg-blue-600 text-white rounded px-3 py-1 text-sm">Use Service</button>}
            {contract.status === 'ACTIVE' && <button onClick={handleCancel} className="bg-red-100 text-red-700 rounded px-3 py-1 text-sm">Cancel</button>}
            <button onClick={handleDelete} className="bg-red-600 text-white rounded px-3 py-1 text-sm">Delete</button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg border p-4">
        <h3 className="font-semibold mb-3">Service History</h3>
        {contract.usages?.length === 0 ? (
          <p className="text-gray-500 text-sm">No services used yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b"><th className="pb-2">#</th><th className="pb-2">Date</th><th className="pb-2">Job Card</th><th className="pb-2">Notes</th><th className="pb-2"></th></tr></thead>
            <tbody>
              {contract.usages?.map((u: any) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2">{u.serviceNumber}</td>
                  <td className="py-2">{formatIST(u.serviceDate)}</td>
                  <td className="py-2"><Link href={`/admin/job-cards/${u.jobCard?.id}`} className="text-blue-600 hover:underline">{u.jobCard?.jobCardNumber}</Link></td>
                  <td className="py-2 text-gray-500">{u.notes || '—'}</td>
                  <td className="py-2"><button onClick={() => handleDeleteUsage(u.id)} className="text-red-600 text-xs hover:underline">Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showUse} onClose={() => setShowUse(false)} title="Use AMC Service">
        <div className="space-y-3">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Job Card</label>
            <select
              className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700"
              value={useForm.jobCardId}
              onChange={(e) => setUseForm({ ...useForm, jobCardId: e.target.value })}
              disabled={jobCardsLoading}
            >
              <option value="">
                {jobCardsLoading
                  ? 'Loading job cards...'
                  : jobCardOptions.length === 0
                    ? 'No eligible job cards for this customer/vehicle'
                    : 'Select a job card'}
              </option>
              {jobCardOptions.map((jc) => (
                <option key={jc.id} value={jc.id}>
                  {jc.jobCardNumber} — {jc.status} — {formatIST(jc.intakeDate || jc.createdAt)}
                </option>
              ))}
            </select>
            {!jobCardsLoading && jobCardOptions.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">Create a job card for this vehicle first, then record AMC usage against it.</p>
            )}
          </div>
          <textarea className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700" placeholder="Notes (optional)" value={useForm.notes} onChange={(e) => setUseForm({ ...useForm, notes: e.target.value })} />
          <button disabled={saving || !useForm.jobCardId} onClick={handleUseService} className="w-full bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">
            {saving ? 'Recording...' : 'Record Service Usage'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
