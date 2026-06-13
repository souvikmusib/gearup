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
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState('');

  useEffect(() => {
    if (showNew) return;
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ pageSize: '50' });
      if (search.trim()) params.set('search', search.trim());
      api.get<any>(`/admin/customers?${params.toString()}`).then((r) => {
        if (!active) return;
        if (r.success) setCustomers(r.data?.items ?? r.data ?? []);
        setLoading(false);
      });
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search, showNew]);

  // Set display name when value changes externally
  useEffect(() => {
    if (!value) {
      setSelectedName('');
      return;
    }

    const existing = customers.find((c) => c.id === value);
    if (existing) {
      setSelectedName(`${existing.fullName} — ${existing.phoneNumber}`);
      return;
    }

    let active = true;
    api.get<any>(`/admin/customers/${value}`).then((r) => {
      if (!active || !r.success) return;
      const customer = r.data;
      setSelectedName(`${customer.fullName} — ${customer.phoneNumber}`);
      setCustomers((prev) => prev.some((entry) => entry.id === customer.id) ? prev : [customer, ...prev]);
    });

    return () => {
      active = false;
    };
  }, [value, customers]);

  const [duplicateCustomer, setDuplicateCustomer] = useState<any>(null);

  const checkAndCreateCustomer = async () => {
    if (!newForm.fullName || !/^[6-9]\d{9}$/.test(newForm.phoneNumber)) return;
    // Check if phone already exists
    setCreating(true);
    const check = await api.get<any>(`/admin/customers?search=${newForm.phoneNumber}&pageSize=1`);
    const existing = (check.data?.items ?? check.data ?? []).find((c: any) => c.phoneNumber === newForm.phoneNumber);
    if (existing) {
      setDuplicateCustomer(existing);
      setCreating(false);
      return;
    }
    setDuplicateCustomer(null);
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
        <>
        <div className="flex gap-2">
          <input className={inputCls} placeholder="Full Name *" value={newForm.fullName} onChange={(e) => setNewForm({ ...newForm, fullName: e.target.value })} />
          <input className={inputCls} placeholder="Phone * (10 digits)" pattern="[6-9][0-9]{9}" maxLength={10} value={newForm.phoneNumber} onChange={(e) => setNewForm({ ...newForm, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          <button type="button" onClick={checkAndCreateCustomer} disabled={creating || !newForm.fullName || !/^[6-9]\d{9}$/.test(newForm.phoneNumber)} className="shrink-0 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {creating ? '...' : 'Add'}
          </button>
        </div>
        {duplicateCustomer && (
          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-300">This phone number already exists:</p>
            <p className="mt-1 text-amber-700 dark:text-amber-400">{duplicateCustomer.fullName} — {duplicateCustomer.phoneNumber}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { onChange(duplicateCustomer.id); setSelectedName(`${duplicateCustomer.fullName} — ${duplicateCustomer.phoneNumber}`); setShowNew(false); setDuplicateCustomer(null); }} className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700">Use this customer</button>
              <button type="button" onClick={() => setDuplicateCustomer(null)} className="rounded border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-100">Create anyway</button>
            </div>
          </div>
        )}
        </>
      ) : (
        <div className="relative">
          <input
            className={inputCls}
            placeholder="Search customer by name or phone..."
            value={search || (value ? selectedName : '')}
            onChange={(e) => {
              const next = e.target.value;
              if (value) {
                onChange('');
                setSelectedName('');
              }
              setSearch(next);
            }}
            onFocus={() => {
              if (value && !search) {
                setSearch('');
              }
            }}
          />
          {(search || !value) && !value && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
              {loading && <p className="px-3 py-2 text-xs text-gray-400">Searching...</p>}
              {filtered.map((c) => (
                <button key={c.id} type="button" onClick={() => selectCustomer(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700 last:border-0">
                  <span className="font-medium">{c.fullName}</span> <span className="text-xs text-gray-400">{c.phoneNumber}</span>
                </button>
              ))}
              {!loading && filtered.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No matches</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
