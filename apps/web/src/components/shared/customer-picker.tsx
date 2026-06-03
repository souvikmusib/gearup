'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api/client';

interface CustomerPickerProps {
  value: string;
  onChange: (customerId: string) => void;
  className?: string;
}

export function CustomerPicker({ value, onChange, className }: CustomerPickerProps) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ fullName: '', phoneNumber: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get<any>('/admin/customers?pageSize=200').then((r) => { if (r.success) setCustomers(r.data?.items ?? r.data ?? []); });
  }, []);

  const createCustomer = async () => {
    if (!newCustomer.fullName || !newCustomer.phoneNumber) return;
    setCreating(true);
    const res = await api.post<any>('/admin/customers', newCustomer);
    setCreating(false);
    if (res.success) {
      setCustomers((prev) => [res.data, ...prev]);
      onChange(res.data.id);
      setShowNew(false);
      setNewCustomer({ fullName: '', phoneNumber: '' });
    }
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div className={`space-y-2 ${className || ''}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Customer <span className="text-red-500">*</span></label>
        <button type="button" onClick={() => setShowNew(!showNew)} className="text-xs text-blue-600 hover:underline">
          {showNew ? '← Select existing' : '+ New customer'}
        </button>
      </div>
      {showNew ? (
        <div className="flex gap-2">
          <input className={inputCls} placeholder="Full Name *" value={newCustomer.fullName} onChange={(e) => setNewCustomer({ ...newCustomer, fullName: e.target.value })} />
          <input className={inputCls} placeholder="Phone *" value={newCustomer.phoneNumber} onChange={(e) => setNewCustomer({ ...newCustomer, phoneNumber: e.target.value })} />
          <button type="button" onClick={createCustomer} disabled={creating || !newCustomer.fullName || !newCustomer.phoneNumber} className="shrink-0 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {creating ? '...' : 'Add'}
          </button>
        </div>
      ) : (
        <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select customer...</option>
          {customers.map((c: any) => <option key={c.id} value={c.id}>{c.fullName} — {c.phoneNumber}</option>)}
        </select>
      )}
    </div>
  );
}
