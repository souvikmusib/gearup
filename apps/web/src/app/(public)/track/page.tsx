'use client';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { StatusBadge } from '@gearup/ui';

interface TrackResult {
  referenceId: string;
  serviceRequestStatus: string;
  appointmentStatus: string | null;
  jobCardStatus: string | null;
  invoiceStatus: string | null;
  paymentStatus: string | null;
  publicTimeline: { label: string; timestamp: string | null; status: string }[];
}

export default function TrackPage() {
  const [referenceId, setReferenceId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setResult(null); setLoading(true);
    const res = await api.post<TrackResult>('/public/track', { referenceId, phoneNumber });
    setLoading(false);
    if (res.success && res.data) setResult(res.data);
    else setError(res.error?.message || 'No matching request found.');
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white';

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Track Your Request</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Enter your reference ID and phone number to check status.</p>

      {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reference ID *</label><input className={inputCls} required placeholder="GU-XXXXXXXX" value={referenceId} onChange={(e) => setReferenceId(e.target.value)} /></div>
        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number *</label><input className={inputCls} required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} /></div>
        <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Checking...' : 'Track'}
        </button>
      </form>

      {result && (
        <div className="mt-8 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">Reference</p>
            <p className="text-lg font-bold font-mono text-blue-600">{result.referenceId}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status={result.serviceRequestStatus} />
              {result.appointmentStatus && <StatusBadge status={result.appointmentStatus} />}
              {result.jobCardStatus && <StatusBadge status={result.jobCardStatus} />}
              {result.paymentStatus && <StatusBadge status={result.paymentStatus} />}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Timeline</h3>
            <div className="space-y-3">
              {result.publicTimeline.map((t, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t.timestamp ? new Date(t.timestamp).toLocaleString() : '—'} · <StatusBadge status={t.status} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            Need help? <a href="/contact" className="text-blue-600 hover:underline">Contact us</a>
          </p>
        </div>
      )}
    </div>
  );
}
