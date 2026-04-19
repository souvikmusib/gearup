'use client';
import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

export default function EstimateApprovalPage({ params }: { params: { token: string } }) {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'expired' | 'loading'>('pending');
  const [comment, setComment] = useState('');

  const handleAction = async (action: 'approved' | 'rejected') => {
    setStatus('loading');
    // TODO: Call API with token + action + comment
    // For now simulate
    setTimeout(() => setStatus(action), 500);
  };

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
        <p className="text-sm text-gray-500 dark:text-gray-400">Estimate details will be loaded from token: <code className="text-xs">{params.token}</code></p>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comment (optional)</label>
        <textarea className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>

      <div className="mt-4 flex gap-3">
        <button onClick={() => handleAction('approved')} disabled={status === 'loading'} className="flex-1 rounded-lg bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
          Approve
        </button>
        <button onClick={() => handleAction('rejected')} disabled={status === 'loading'} className="flex-1 rounded-lg bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          Decline
        </button>
      </div>
    </div>
  );
}
