'use client';
import { useState } from 'react';
import { Search, Plus, Filter } from 'lucide-react';

interface ListToolbarProps {
  searchPlaceholder?: string;
  onSearch: (q: string) => void;
  onCreateClick?: () => void;
  createLabel?: string;
  filters?: { label: string; value: string; options: { label: string; value: string }[] }[];
  onFilterChange?: (key: string, value: string) => void;
}

export function ListToolbar({ searchPlaceholder = 'Search...', onSearch, onCreateClick, createLabel = 'Create', filters, onFilterChange }: ListToolbarProps) {
  const [search, setSearch] = useState('');
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
        <input className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" placeholder={searchPlaceholder} value={search} onChange={(e) => { setSearch(e.target.value); onSearch(e.target.value); }} />
      </div>
      {filters?.map((f) => (
        <select key={f.value} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" onChange={(e) => onFilterChange?.(f.value, e.target.value)}>
          <option value="">{f.label}</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      {onCreateClick && (
        <button onClick={onCreateClick} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus size={16} />{createLabel}
        </button>
      )}
    </div>
  );
}
