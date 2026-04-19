'use client';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { CheckCircle } from 'lucide-react';

type Step = 'form' | 'success';

export default function BookServicePage() {
  const [step, setStep] = useState<Step>('form');
  const [result, setResult] = useState<{ referenceId: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    fullName: '', phoneNumber: '', email: '', vehicleType: 'CAR' as const,
    brand: '', model: '', registrationNumber: '', serviceCategory: '',
    issueDescription: '', preferredDate: '', pickupDropRequired: false, notes: '',
  });

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await api.post<{ referenceId: string }>('/public/service-requests', form);
    setLoading(false);
    if (res.success && res.data) { setResult(res.data); setStep('success'); }
    else setError(res.error?.message || 'Something went wrong');
  };

  if (step === 'success' && result) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <CheckCircle className="mx-auto mb-4 text-green-600" size={48} />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Request Submitted!</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Your reference ID is:</p>
        <p className="mt-2 text-3xl font-mono font-bold text-blue-600">{result.referenceId}</p>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Save this ID to track your service request. We&apos;ll notify you via WhatsApp/email.</p>
      </div>
    );
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white';
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Book a Service</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Fill in your details below. No account needed.</p>

      {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      <form onSubmit={submit} className="mt-8 space-y-6">
        {/* Customer */}
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-gray-900 dark:text-white">Your Details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={labelCls}>Full Name *</label><input className={inputCls} required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></div>
            <div><label className={labelCls}>Phone Number *</label><input className={inputCls} required value={form.phoneNumber} onChange={(e) => set('phoneNumber', e.target.value)} /></div>
            <div className="sm:col-span-2"><label className={labelCls}>Email</label><input type="email" className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          </div>
        </fieldset>

        {/* Vehicle */}
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-gray-900 dark:text-white">Vehicle Details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Vehicle Type *</label>
              <select className={inputCls} value={form.vehicleType} onChange={(e) => set('vehicleType', e.target.value)}>
                <option value="CAR">Car</option><option value="BIKE">Bike</option><option value="OTHER">Other</option>
              </select>
            </div>
            <div><label className={labelCls}>Registration Number *</label><input className={inputCls} required value={form.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value)} /></div>
            <div><label className={labelCls}>Brand *</label><input className={inputCls} required value={form.brand} onChange={(e) => set('brand', e.target.value)} /></div>
            <div><label className={labelCls}>Model *</label><input className={inputCls} required value={form.model} onChange={(e) => set('model', e.target.value)} /></div>
          </div>
        </fieldset>

        {/* Service */}
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-gray-900 dark:text-white">Service Details</legend>
          <div>
            <label className={labelCls}>Service Category *</label>
            <select className={inputCls} required value={form.serviceCategory} onChange={(e) => set('serviceCategory', e.target.value)}>
              <option value="">Select...</option>
              {['General Service', 'Engine Repair', 'Brake & Suspension', 'Electrical', 'AC Service', 'Body & Paint', 'Tyre & Alignment', 'Diagnostics', 'Other'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Describe the Issue *</label><textarea className={inputCls} rows={3} required value={form.issueDescription} onChange={(e) => set('issueDescription', e.target.value)} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={labelCls}>Preferred Date</label><input type="date" className={inputCls} value={form.preferredDate} onChange={(e) => set('preferredDate', e.target.value)} /></div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={form.pickupDropRequired} onChange={(e) => set('pickupDropRequired', e.target.checked)} className="rounded" />
                Pickup / Drop required
              </label>
            </div>
          </div>
          <div><label className={labelCls}>Additional Notes</label><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
        </fieldset>

        <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Submitting...' : 'Submit Service Request'}
        </button>
      </form>
    </div>
  );
}
