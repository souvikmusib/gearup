'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { copyText } from '@/lib/clipboard';
import { CheckCircle, Copy } from 'lucide-react';

type Step = 'form' | 'success';
type FieldErrors = Partial<Record<string, string>>;
type VehicleType = 'CAR' | 'BIKE' | 'OTHER';
type LookupVehicle = { id: string; registrationNumber: string; vehicleType: 'CAR' | 'BIKE' | 'OTHER'; brand: string; model: string; variant?: string | null };

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRegNumber(raw: string) {
  // Strip everything except letters and digits, uppercase
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Indian format: AA-00-A(A)-0000
  // Part 1: 2 letters (state), Part 2: 2 digits (district), Part 3: 1-2 letters (series), Part 4: 1-4 digits (number)
  const parts: string[] = [];
  let i = 0;
  // State: first 2 letters
  const state = clean.slice(i).match(/^[A-Z]{0,2}/)?.[0] || '';
  if (state) { parts.push(state); i += state.length; }
  // District: next 2 digits
  const dist = clean.slice(i).match(/^[0-9]{0,2}/)?.[0] || '';
  if (dist) { parts.push(dist); i += dist.length; }
  // Series: next 1-2 letters
  const series = clean.slice(i).match(/^[A-Z]{0,2}/)?.[0] || '';
  if (series) { parts.push(series); i += series.length; }
  // Number: remaining up to 4 digits
  const num = clean.slice(i).match(/^[0-9]{0,4}/)?.[0] || '';
  if (num) { parts.push(num); i += num.length; }
  return parts.filter(Boolean).join('-');
}

function validate(form: Record<string, unknown>): FieldErrors {
  const e: FieldErrors = {};
  const s = (k: string) => ((form[k] as string) ?? '').trim();

  if (!s('fullName')) e.fullName = 'Full name is required';
  else if (s('fullName').length < 2) e.fullName = 'Name must be at least 2 characters';

  if (!s('phoneNumber')) e.phoneNumber = 'Phone number is required';
  else if (!/^\d{10}$/.test(s('phoneNumber').replace(/[\s-]/g, ''))) e.phoneNumber = 'Enter a valid 10-digit phone number';

  if (s('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s('email'))) e.email = 'Enter a valid email address';

  if (!s('registrationNumber')) e.registrationNumber = 'Registration number is required';
  else if (!/^[A-Z]{2}-\d{2}-[A-Z]{1,2}-\d{1,4}$/.test(s('registrationNumber'))) e.registrationNumber = 'Format: KA-01-AB-1234';

  if (!s('brand')) e.brand = 'Brand is required';
  if (!s('model')) e.model = 'Model is required';
  if (!s('serviceCategory')) e.serviceCategory = 'Select a service category';

  if (!s('issueDescription')) e.issueDescription = 'Describe the issue';
  else if (s('issueDescription').length < 10) e.issueDescription = 'Please provide at least 10 characters';

  if (s('preferredDate')) {
    const d = new Date(s('preferredDate'));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d < today) e.preferredDate = 'Date cannot be in the past';
  }

  return e;
}

export default function BookServicePage() {
  const [step, setStep] = useState<Step>('form');
  const [result, setResult] = useState<{ referenceId: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupVehicles, setLookupVehicles] = useState<LookupVehicle[]>([]);
  const [vehicleMode, setVehicleMode] = useState<'new' | 'existing'>('new');
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState<{
    fullName: string;
    phoneNumber: string;
    email: string;
    vehicleType: VehicleType;
    vehicleId: string;
    brand: string;
    model: string;
    registrationNumber: string;
    serviceCategory: string;
    issueDescription: string;
    preferredDate: string;
    pickupDropRequired: boolean;
    notes: string;
  }>({
    fullName: '', phoneNumber: '', email: '', vehicleType: 'BIKE' as const,
    vehicleId: '', brand: '', model: '', registrationNumber: '', serviceCategory: '',
    issueDescription: '', preferredDate: '', pickupDropRequired: false, notes: '',
  });

  const set = (k: string, v: unknown) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (touched[k]) {
      const updated = { ...form, [k]: v };
      const errs = validate(updated);
      setFieldErrors((prev) => ({ ...prev, [k]: errs[k] }));
    }
  };

  const onPhoneChange = (phone: string) => {
    set('phoneNumber', phone.replace(/\D/g, '').slice(0, 10));
  };

  useEffect(() => {
    const phone = form.phoneNumber.replace(/\D/g, '');
    if (phone.length !== 10) {
      setLookupVehicles([]);
      setVehicleMode('new');
      setForm((prev) => ({ ...prev, vehicleId: '' }));
      return;
    }

    const timer = window.setTimeout(async () => {
      setLookupLoading(true);
      const res = await api.get<{ customer: { fullName: string; email?: string | null } | null; vehicles: LookupVehicle[] }>(`/public/customer-lookup?phone=${phone}`);
      setLookupLoading(false);
      if (!res.success) return;
      const customer = res.data?.customer;
      const vehicles = res.data?.vehicles ?? [];
      if (customer) {
        setForm((prev) => ({
          ...prev,
          fullName: prev.fullName || customer.fullName,
          email: prev.email || customer.email || '',
        }));
      }
      setLookupVehicles(vehicles);
      if (vehicles.length) setVehicleMode('existing');
    }, 350);

    return () => window.clearTimeout(timer);
  }, [form.phoneNumber]);

  const selectVehicle = (vehicle: LookupVehicle) => {
    setVehicleMode('existing');
    setForm((prev) => ({
      ...prev,
      vehicleId: vehicle.id,
      vehicleType: vehicle.vehicleType,
      registrationNumber: vehicle.registrationNumber,
      brand: vehicle.brand,
      model: vehicle.model,
    }));
  };

  const useNewVehicle = () => {
    setVehicleMode('new');
    setForm((prev) => ({ ...prev, vehicleId: '', registrationNumber: '', brand: '', model: '' }));
  };

  const blur = (k: string) => {
    setTouched((p) => ({ ...p, [k]: true }));
    const errs = validate(form);
    setFieldErrors((prev) => ({ ...prev, [k]: errs[k] }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(form);
    setFieldErrors(errs);
    setTouched(Object.fromEntries(Object.keys(form).map((k) => [k, true])));
    if (Object.keys(errs).length > 0) return;

    setError('');
    setLoading(true);
    const res = await api.post<{ referenceId: string }>('/public/service-requests', { ...form, phoneNumber: form.phoneNumber.replace(/\D/g, '') });
    setLoading(false);
    if (res.success && res.data) { setResult(res.data); setStep('success'); }
    else setError(res.error?.message || 'Something went wrong');
  };

  const copyReference = async () => {
    if (!result?.referenceId) return;
    setCopied(await copyText(result.referenceId));
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (step === 'success' && result) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <CheckCircle className="mx-auto mb-4 text-green-600" size={48} />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Request Submitted!</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Your reference ID is:</p>
        <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-950/30">
          <p className="text-3xl font-mono font-bold text-blue-600">{result.referenceId}</p>
          <button onClick={copyReference} className="rounded-lg border border-blue-200 bg-white p-2 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300" title="Copy reference ID">
            <Copy size={18} />
          </button>
        </div>
        {copied && <p className="mt-2 text-sm text-green-600">Copied to clipboard.</p>}
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Save this ID to track your service request. We&apos;ll notify you via WhatsApp/email.</p>
        <a href={`/track?referenceId=${encodeURIComponent(result.referenceId)}`} className="mt-6 inline-flex rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Track this request</a>
      </div>
    );
  }

  const inputCls = (k: string) => `w-full rounded-lg border ${fieldErrors[k] && touched[k] ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'} bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 dark:border-gray-600 dark:bg-gray-800 dark:text-white`;
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
  const errCls = 'mt-1 text-xs text-red-600 dark:text-red-400';
  const err = (k: string) => touched[k] && fieldErrors[k] ? <p className={errCls}>{fieldErrors[k]}</p> : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Book a Service</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Fill in your details below. No account needed.</p>

      {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      <form onSubmit={submit} noValidate className="mt-8 space-y-6">
        {/* Customer */}
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-gray-900 dark:text-white">Your Details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={labelCls}>Full Name *</label><input className={inputCls('fullName')} value={form.fullName} onChange={(e) => set('fullName', titleCase(e.target.value))} onBlur={() => blur('fullName')} />{err('fullName')}</div>
            <div><label className={labelCls}>Phone Number *</label><input className={inputCls('phoneNumber')} value={form.phoneNumber} onChange={(e) => onPhoneChange(e.target.value)} onBlur={() => blur('phoneNumber')} />{err('phoneNumber')}</div>
            <div className="sm:col-span-2"><label className={labelCls}>Email</label><input type="email" className={inputCls('email')} value={form.email} onChange={(e) => set('email', e.target.value)} onBlur={() => blur('email')} />{err('email')}</div>
          </div>
          {lookupLoading && <p className="text-sm text-blue-600">Checking previous vehicles for this phone number...</p>}
        </fieldset>

        {/* Vehicle */}
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-gray-900 dark:text-white">Vehicle Details</legend>
          {lookupVehicles.length > 0 && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-950/30">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">We found vehicles linked to this phone number.</p>
                <button type="button" onClick={useNewVehicle} className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300">Add new vehicle</button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {lookupVehicles.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => selectVehicle(vehicle)}
                    className={`rounded-lg border p-3 text-left text-sm transition ${form.vehicleId === vehicle.id ? 'border-blue-600 bg-white shadow dark:bg-gray-900' : 'border-blue-100 bg-white/70 hover:border-blue-300 dark:border-blue-900 dark:bg-gray-900/60'}`}
                  >
                    <span className="block font-mono font-semibold text-gray-900 dark:text-white">{vehicle.registrationNumber}</span>
                    <span className="text-gray-600 dark:text-gray-300">{vehicle.brand} {vehicle.model}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Vehicle Type *</label>
              <select className={inputCls('vehicleType')} value={form.vehicleType} onChange={(e) => set('vehicleType', e.target.value)} disabled={vehicleMode === 'existing' && !!form.vehicleId}>
                <option value="BIKE">Motorcycle</option><option value="OTHER">Scooter / Other</option>
              </select>
            </div>
            <div><label className={labelCls}>Registration Number *</label><input className={inputCls('registrationNumber')} placeholder="AB-00-AB-1234" value={form.registrationNumber} onChange={(e) => set('registrationNumber', formatRegNumber(e.target.value))} onBlur={() => blur('registrationNumber')} disabled={vehicleMode === 'existing' && !!form.vehicleId} />{err('registrationNumber')}</div>
            <div><label className={labelCls}>Brand *</label><input className={inputCls('brand')} value={form.brand} onChange={(e) => set('brand', titleCase(e.target.value))} onBlur={() => blur('brand')} disabled={vehicleMode === 'existing' && !!form.vehicleId} />{err('brand')}</div>
            <div><label className={labelCls}>Model *</label><input className={inputCls('model')} value={form.model} onChange={(e) => set('model', titleCase(e.target.value))} onBlur={() => blur('model')} disabled={vehicleMode === 'existing' && !!form.vehicleId} />{err('model')}</div>
          </div>
        </fieldset>

        {/* Service */}
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-gray-900 dark:text-white">Service Details</legend>
          <div>
            <label className={labelCls}>Service Category *</label>
            <select className={inputCls('serviceCategory')} value={form.serviceCategory} onChange={(e) => set('serviceCategory', e.target.value)} onBlur={() => blur('serviceCategory')}>
              <option value="">Select...</option>
              {['General Service', 'Engine Repair', 'Brake & Clutch', 'Electrical & Wiring', 'Chain & Sprocket', 'Body & Paint', 'Tyre & Wheel Alignment', 'Diagnostics', 'Other'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {err('serviceCategory')}
          </div>
          <div><label className={labelCls}>Describe the Issue *</label><textarea className={inputCls('issueDescription')} rows={3} value={form.issueDescription} onChange={(e) => set('issueDescription', e.target.value)} onBlur={() => blur('issueDescription')} />{err('issueDescription')}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={labelCls}>Preferred Date</label><input type="date" className={inputCls('preferredDate')} value={form.preferredDate} onChange={(e) => set('preferredDate', e.target.value)} onBlur={() => blur('preferredDate')} />{err('preferredDate')}</div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={form.pickupDropRequired} onChange={(e) => set('pickupDropRequired', e.target.checked)} className="rounded" />
                Pickup / Drop required
              </label>
            </div>
          </div>
          <div><label className={labelCls}>Additional Notes</label><textarea className={inputCls('notes')} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
        </fieldset>

        {loading && <ProcessLoader title="Submitting your service request" steps={['Saving customer and vehicle details', 'Creating the service reference', 'Checking appointment preference', 'Preparing tracking information']} />}

        <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Submitting request...' : 'Submit Service Request'}
        </button>
      </form>
    </div>
  );
}
