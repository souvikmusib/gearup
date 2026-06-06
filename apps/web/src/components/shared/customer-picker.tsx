'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api/client';

interface CustomerPickerProps {
  value: string;
  onChange: (customerId: string) => void;
  onCustomerCreated?: (customer: any) => void;
}

export function CustomerPicker({ value, onChange, onCustomerCreated }: CustomerPickerProps) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ fullName: '', phoneNumber: '' });
  const [creating, setCreating] = useState(false);
  const [selectedName, setSelectedName] = useState('');

  useEffect(() => {
    api.get<any>('/admin/customers?pageSize=500').then((r) => { if (r.success) setCustomers(r.data?.items ?? r.data ?? []); });
  }, []);

  // Set display name when value changes externally
  useEffect(() => {
    if (value && customers.length) {
      const c = customers.find((c) => c.id === value);
      if (c) setSelectedName(`${c.fullName} — ${c.phoneNumber}`);
    }
  }, [value, customers]);

  const createCustomer = async () => {
    if (!newForm.fullName || !newForm.phoneNumber) return;
    setCreating(true);
    const res = await api.post<any>('/admin/customers', newForm);
    setCreating(false);
    if (res.success) {
      setCustomers((prev) => [res.data, ...prev]);
      onChange(res.data.id);
      setSelectedName(`${res.data.fullName} — ${res.data.phoneNumber}`);
      setShowNew(false);
      setNewForm({ fullName: '', phoneNumber: '' });
      setSearch('');
      onCustomerCreated?.(res.data);
    }
  };

  const selectCustomer = (c: any) => {
    onChange(c.id);
    setSelectedName(`${c.fullName} — ${c.phoneNumber}`);
    setSearch('');
  };

  const filtered = customers.filter((c) =>
    !search || c.fullName.toLowerCase().includes(search.toLowerCase()) || c.phoneNumber.includes(search)
  ).slice(0, 10);

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">Customer <span className="text-red-500">*</span></label>
        <button type="button" onClick={() => { setShowNew(!showNew); setSearch(''); }} className="text-xs text-blue-600 hover:underline">
          {showNew ? '← Select existing' : '+ New customer'}
        </button>
      </div>
      {showNew ? (
        <div className="flex gap-2">
          <input className={inputCls} placeholder="Full Name *" value={newForm.fullName} onChange={(e) => setNewForm({ ...newForm, fullName: e.target.value })} />
          <input className={inputCls} placeholder="Phone *" value={newForm.phoneNumber} onChange={(e) => setNewForm({ ...newForm, phoneNumber: e.target.value })} />
          <button type="button" onClick={createCustomer} disabled={creating || !newForm.fullName || !newForm.phoneNumber} className="shrink-0 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {creating ? '...' : 'Add'}
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            className={inputCls}
            placeholder="Search customer by name or phone..."
            value={search || (value ? selectedName : '')}
            onChange={(e) => { setSearch(e.target.value); if (value) { onChange(''); setSelectedName(''); } }}
            onFocus={() => { if (value) { setSearch(selectedName); onChange(''); setSelectedName(''); } }}
          />
          {(search || !value) && !value && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
              {filtered.map((c) => (
                <button key={c.id} type="button" onClick={() => selectCustomer(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700 last:border-0">
                  <span className="font-medium">{c.fullName}</span> <span className="text-xs text-gray-400">{c.phoneNumber}</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No matches</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
