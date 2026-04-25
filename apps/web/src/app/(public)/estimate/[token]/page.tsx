'use client';
import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { api } from '@/lib/api/client';

type Estimate = {
  jobCardNumber: string;
  customerName: string;
  vehicle: string;
  issueSummary: string;
  estimateNotes: string | null;
  customerVisibleNotes: string | null;
  approvalStatus: string;
  estimatedPartsCost: number;
  estimatedLaborCost: number;
  estimatedTotal: number;
};

export default function EstimateApprovalPage({ params }: { params: { token: string } }) {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'expired' | 'loading' | 'submitting'>('loading');
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get<Estimate>(`/public/estimate/${params.token}`).then((res) => {
      if (!active) return;
      if (!res.success || !res.data) {
        setError(res.error?.message ?? 'This estimate link is invalid or expired.');
        setStatus('expired');
        return;
      }
      setEstimate(res.data);
      if (res.data.approvalStatus === 'APPROVED') setStatus('approved');
      else if (res.data.approvalStatus === 'REJECTED') setStatus('rejected');
      else setStatus('pending');
    });
    return () => {
      active = false;
    };
  }, [params.token]);

  const handleAction = async (action: 'approved' | 'rejected') => {
    setStatus('submitting');
    setError('');
    const res = await api.post<{ approvalStatus: string; status: string }>(`/public/estimate/${params.token}`, {
      action,
      comment: comment.trim() || undefined,
    });
    if (!res.success) {
      setError(res.error?.message ?? 'Could not submit your response. Please try again.');
      setStatus('pending');
      return;
    }
    setStatus(action);
  };

  if (status === 'loading') return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <Loader2 className="mb-4 animate-spin text-blue-600" size={40} />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Loading Estimate</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">Checking your estimate link...</p>
    </div>
  );

  if (status === 'expired') return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <XCircle className="mx-auto mb-4 text-red-600" size={48} />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Estimate Not Available</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">{error || 'This estimate link is invalid or expired.'}</p>
    </div>
  );

  if (status === 'approved') return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <CheckCircle className="mx-auto mb-4 text-green-600" size={48} />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Estimate Approved</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">Thank you! We&apos;ll proceed with the work.</p>
    </div>
  );

  if (status === 'rejected') return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <XCircle className="mx-auto mb-4 text-red-600" size={48} />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Estimate Declined</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">We&apos;ll contact you to discuss alternatives.</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Estimate Approval</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Review the estimate for your vehicle service.</p>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Job Card</p>
            <p className="font-semibold text-gray-900 dark:text-white">{estimate?.jobCardNumber}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Customer</p>
              <p className="font-medium text-gray-900 dark:text-white">{estimate?.customerName}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Vehicle</p>
              <p className="font-medium text-gray-900 dark:text-white">{estimate?.vehicle}</p>
            </div>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Issue</p>
            <p className="text-sm text-gray-800 dark:text-gray-200">{estimate?.issueSummary}</p>
          </div>
          {(estimate?.customerVisibleNotes || estimate?.estimateNotes) && (
            <div>
              <p className="text-gray-500 dark:text-gray-400">Notes</p>
              <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{estimate.customerVisibleNotes || estimate.estimateNotes}</p>
            </div>
          )}
          <div className="rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-900/40">
            <div className="flex justify-between"><span>Parts</span><span>₹{Number(estimate?.estimatedPartsCost ?? 0).toFixed(2)}</span></div>
            <div className="mt-1 flex justify-between"><span>Labor</span><span>₹{Number(estimate?.estimatedLaborCost ?? 0).toFixed(2)}</span></div>
            <div className="mt-3 flex justify-between border-t border-gray-200 pt-3 font-bold dark:border-gray-700"><span>Total</span><span>₹{Number(estimate?.estimatedTotal ?? 0).toFixed(2)}</span></div>
          </div>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">{error}</p>}

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comment (optional)</label>
        <textarea className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} disabled={status === 'submitting'} />
      </div>

      <div className="mt-4 flex gap-3">
        <button onClick={() => handleAction('approved')} disabled={status === 'submitting'} className="flex-1 rounded-lg bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
          {status === 'submitting' ? 'Submitting...' : 'Approve'}
        </button>
        <button onClick={() => handleAction('rejected')} disabled={status === 'submitting'} className="flex-1 rounded-lg bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          Decline
        </button>
      </div>
    </div>
  );
}
