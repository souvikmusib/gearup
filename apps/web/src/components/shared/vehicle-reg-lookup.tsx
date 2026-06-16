'use client';
import { useState, useRef } from 'react';
import { api } from '@/lib/api/client';
import { Search } from 'lucide-react';

interface VehicleRegLookupProps {
  onResolved: (data: { customerId: string; vehicleId: string; customerName: string; vehicleLabel: string }) => void;
}

export function VehicleRegLookup({ onResolved }: VehicleRegLookupProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<NodeJS.Timeout>();

  const search = (q: string) => {
    setQuery(q);
    clearTimeout(timer.current);
    if (q.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      // Normalize: strip hyphens/spaces for flexible matching
      const normalized = q.replace(/[-\s]/g, '');
      const res = await api.get<any>(`/admin/vehicles?search=${encodeURIComponent(normalized)}&pageSize=5`);
      if (res.success) setResults(res.data || []);
      setSearching(false);
    }, 300);
  };

  const select = (v: any) => {
    onResolved({
      customerId: v.customerId,
      vehicleId: v.id,
      customerName: v.customer?.fullName || '',
      vehicleLabel: `${v.registrationNumber} — ${v.brand || ''} ${v.model || ''}`,
    });
    setQuery('');
    setResults([]);
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1">Quick Lookup (Reg Number)</label>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800"
          placeholder="Type vehicle number... (e.g. WB26AB1234)"
          value={query}
          onChange={e => search(e.target.value)}
        />
        {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">...</span>}
      </div>
      {results.length > 0 && (
        <div className="mt-1 border rounded-lg overflow-hidden bg-white dark:bg-gray-900 shadow-lg max-h-40 overflow-y-auto">
          {results.map((v: any) => (
            <button key={v.id} type="button" onClick={() => select(v)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 border-b last:border-0">
              <span className="font-semibold">{v.registrationNumber}</span>
              <span className="text-gray-500 ml-2">{v.brand} {v.model}</span>
              {v.customer && <span className="text-gray-400 ml-2">— {v.customer.fullName}</span>}
            </button>
          ))}
        </div>
      )}
      {query.length >= 2 && !searching && results.length === 0 && (
        <p className="text-xs text-gray-400 mt-1">No vehicle found. Use customer picker below.</p>
      )}
    </div>
  );
}
