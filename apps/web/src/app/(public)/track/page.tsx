'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { ProcessLoader } from '@/components/shared/process-loader';
import { copyText } from '@/lib/clipboard';
import { StatusBadge } from '@gearup/ui';
import { Copy } from 'lucide-react';

type LookupType = 'reference' | 'vehicle';

type TrackRequest = {
  id: string;
  referenceId: string;
  serviceCategory: string;
  issueDescription: string;
  serviceRequestStatus: string;
  bookingDate: string;
  updatedAt: string;
  preferredDate: string | null;
  preferredSlotLabel: string | null;
  customer: { fullName: string; phoneNumber: string };
  vehicle: { registrationNumber: string; vehicleType: string; brand: string; model: string };
  appointment: { referenceId: string; status: string; appointmentDate: string; slotStart: string; slotEnd: string } | null;
  jobCard: { jobCardNumber: string; status: string; intakeDate: string; estimatedDeliveryAt: string | null; actualDeliveryAt: string | null } | null;
  invoice: { invoiceNumber: string; invoiceStatus: string; paymentStatus: string; grandTotal: string | number; amountDue: string | number } | null;
};

type TrackPayload = { lookupType: 'reference'; request: TrackRequest } | { lookupType: 'vehicle'; requests: TrackRequest[] };

function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not scheduled yet';
}

function fmtDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not scheduled yet';
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 10);
}

export default function TrackPage() {
  const [lookupType, setLookupType] = useState<LookupType>('reference');
  const [referenceId, setReferenceId] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selected, setSelected] = useState<TrackRequest | null>(null);
  const [matches, setMatches] = useState<TrackRequest[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('referenceId');
    if (ref) setReferenceId(ref.toUpperCase());
  }, []);

  const canSubmit = useMemo(() => {
    if (phoneNumber.replace(/\D/g, '').length !== 10) return false;
    return lookupType === 'reference' ? referenceId.trim().length > 0 : vehicleNumber.trim().length > 0;
  }, [lookupType, phoneNumber, referenceId, vehicleNumber]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setError('Enter your 10-digit phone number and either a reference ID or vehicle number.');
      return;
    }
    setError(''); setSelected(null); setMatches([]); setLoading(true);
    const res = await api.post<TrackPayload>('/public/track', {
      lookupType,
      phoneNumber: normalizePhone(phoneNumber),
      referenceId: referenceId.trim().toUpperCase(),
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
    });
    setLoading(false);
    if (!res.success || !res.data) {
      setError(res.error?.message || 'No matching request found.');
      return;
    }
    if (res.data.lookupType === 'vehicle') {
      setMatches(res.data.requests);
      setSelected(res.data.requests[0] ?? null);
    } else {
      setSelected(res.data.request);
    }
  };

  const copyReference = async (ref: string) => {
    setCopied(await copyText(ref));
    window.setTimeout(() => setCopied(false), 1400);
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white';

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Track Your Request</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Phone number is required. Then search by reference ID or by vehicle number.</p>

      {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div><label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number *</label><input className={inputCls} required value={phoneNumber} onChange={(e) => setPhoneNumber(normalizePhone(e.target.value))} placeholder="10-digit phone number" /></div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Search using</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[{ key: 'reference', label: 'Reference ID', desc: 'Fastest if you saved the ID' }, { key: 'vehicle', label: 'Vehicle number', desc: 'Shows all references for that vehicle' }].map((option) => (
              <button key={option.key} type="button" onClick={() => setLookupType(option.key as LookupType)} className={`rounded-lg border p-3 text-left ${lookupType === option.key ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40' : 'border-gray-200 hover:border-blue-300 dark:border-gray-700'}`}>
                <span className="block text-sm font-semibold text-gray-900 dark:text-white">{option.label}</span>
                <span className="text-xs text-gray-500">{option.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {lookupType === 'reference' ? (
          <div><label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Reference ID *</label><input className={inputCls} placeholder="GU-XXXXXXXX" value={referenceId} onChange={(e) => setReferenceId(e.target.value.toUpperCase())} /></div>
        ) : (
          <div><label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Vehicle Number *</label><input className={inputCls} placeholder="WB-41-R-6817 or WB41R6817" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} /></div>
        )}

        {loading && <ProcessLoader title="Finding your latest service status" steps={['Matching phone number securely', lookupType === 'vehicle' ? 'Finding references for this vehicle' : 'Finding the saved reference', 'Checking appointment and job card updates', 'Checking invoice and payment state']} />}

        <button type="submit" disabled={loading || !canSubmit} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Checking status...' : 'Track Request'}
        </button>
      </form>

      {matches.length > 1 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">References for this vehicle, latest first</h2>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
            {matches.map((request) => (
              <button key={request.id} onClick={() => setSelected(request)} className={`min-w-[220px] rounded-xl border p-4 text-left ${selected?.id === request.id ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'}`}>
                <span className="block font-mono text-sm font-bold text-blue-600">{request.referenceId}</span>
                <span className="mt-1 block text-xs text-gray-500">Booked {fmtDate(request.bookingDate)}</span>
                <span className="mt-2 inline-block"><StatusBadge status={request.serviceRequestStatus} /></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="mt-8 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Reference</p>
                <p className="text-lg font-bold font-mono text-blue-600">{selected.referenceId}</p>
              </div>
              <button onClick={() => copyReference(selected.referenceId)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"><Copy size={16} /> Copy</button>
            </div>
            {copied && <p className="mt-2 text-sm text-green-600">Copied.</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge status={selected.serviceRequestStatus} />
              {selected.appointment?.status && <StatusBadge status={selected.appointment.status} />}
              {selected.jobCard?.status && <StatusBadge status={selected.jobCard.status} />}
              {selected.invoice?.paymentStatus && <StatusBadge status={selected.invoice.paymentStatus} />}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <InfoCard title="Vehicle" rows={[['Number', selected.vehicle.registrationNumber], ['Vehicle', `${selected.vehicle.brand} ${selected.vehicle.model}`], ['Type', selected.vehicle.vehicleType]]} />
            <InfoCard title="Booking" rows={[['Booked on', fmtDateTime(selected.bookingDate)], ['Preferred date', fmtDate(selected.preferredDate)], ['Service', selected.serviceCategory]]} />
            <InfoCard title="Appointment" rows={[['Status', selected.appointment?.status ?? 'Not confirmed yet'], ['Service date', fmtDateTime(selected.appointment?.slotStart)], ['Appointment ref', selected.appointment?.referenceId ?? 'Not assigned yet']]} />
            <InfoCard title="Workshop progress" rows={[['Job card', selected.jobCard?.jobCardNumber ?? 'Not created yet'], ['Job status', selected.jobCard?.status ?? 'Waiting for inspection'], ['Delivery ETA', fmtDateTime(selected.jobCard?.estimatedDeliveryAt)]]} />
            <InfoCard title="Invoice" rows={[['Invoice', selected.invoice?.invoiceNumber ?? 'Not generated yet'], ['Invoice status', selected.invoice?.invoiceStatus ?? 'Pending'], ['Payment', selected.invoice?.paymentStatus ?? 'Pending']]} />
            <InfoCard title="Issue" rows={[['Description', selected.issueDescription]]} />
          </div>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            Need help? <a href="/contact" className="text-blue-600 hover:underline">Contact us</a>
          </p>
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
            <dd className="text-right font-medium text-gray-900 dark:text-white">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
