'use client';
import { useState } from 'react';
import { Search, Plus, X } from 'lucide-react';

export interface FilterDef {
  /** Key sent back via onFilterChange. */
  value: string;
  /** Display label inside the dropdown placeholder. */
  label: string;
  options: { label: string; value: string }[];
}

interface ListToolbarProps {
  searchPlaceholder?: string;
  onSearch: (q: string) => void;
  onCreateClick?: () => void;
  createLabel?: string;
  filters?: FilterDef[];
  onFilterChange?: (key: string, value: string) => void;
  /** Currently-applied filter values, keyed by FilterDef.value. Drives chips + reset. */
  filterValues?: Record<string, string>;
  /** Optional from/to date pair rendered next to the dropdowns. */
  dateRange?: { fromKey: string; toKey: string; label?: string };
}

export function ListToolbar({
  searchPlaceholder = 'Search...',
  onSearch,
  onCreateClick,
  createLabel = 'Create',
  filters,
  onFilterChange,
  filterValues = {},
  dateRange,
}: ListToolbarProps) {
  const [search, setSearch] = useState('');

  const activeChips = Object.entries(filterValues).filter(([k, v]) => {
    if (!v) return false;
    if (dateRange && (k === dateRange.fromKey || k === dateRange.toKey)) return false;
    return true;
  });
  const hasActiveDate = dateRange && (filterValues[dateRange.fromKey] || filterValues[dateRange.toKey]);
  const hasActive = activeChips.length > 0 || hasActiveDate;

  const labelFor = (key: string, value: string): string => {
    const def = filters?.find((f) => f.value === key);
    const opt = def?.options.find((o) => o.value === value);
    return opt?.label ?? value;
  };

  const clearAll = () => {
    if (!onFilterChange) return;
    Object.keys(filterValues).forEach((k) => onFilterChange(k, ''));
    if (dateRange) {
      onFilterChange(dateRange.fromKey, '');
      onFilterChange(dateRange.toKey, '');
    }
  };

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
          <input
            className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); onSearch(e.target.value); }}
          />
        </div>
        {filters?.map((f) => (
          <select
            key={f.value}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            value={filterValues[f.value] ?? ''}
            onChange={(e) => onFilterChange?.(f.value, e.target.value)}
          >
            <option value="">{f.label}</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {dateRange && (
          <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800">
            <span className="text-gray-500 dark:text-gray-400">{dateRange.label ?? 'Date'}:</span>
            <input
              type="date"
              className="bg-transparent text-gray-900 dark:text-white outline-none"
              value={filterValues[dateRange.fromKey] ?? ''}
              onChange={(e) => onFilterChange?.(dateRange.fromKey, e.target.value)}
            />
            <span className="text-gray-400">–</span>
            <input
              type="date"
              className="bg-transparent text-gray-900 dark:text-white outline-none"
              value={filterValues[dateRange.toKey] ?? ''}
              onChange={(e) => onFilterChange?.(dateRange.toKey, e.target.value)}
            />
          </div>
        )}
        {hasActive && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <X size={12} /> Clear filters
          </button>
        )}
        {onCreateClick && (
          <button onClick={onCreateClick} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={16} />{createLabel}
          </button>
        )}
      </div>
      {hasActive && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {activeChips.map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {labelFor(k, v)}
              <button onClick={() => onFilterChange?.(k, '')} className="hover:text-blue-900 dark:hover:text-blue-100" aria-label="Remove filter">
                <X size={10} />
              </button>
            </span>
          ))}
          {hasActiveDate && dateRange && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {(filterValues[dateRange.fromKey] || '…')} – {(filterValues[dateRange.toKey] || '…')}
              <button onClick={() => { onFilterChange?.(dateRange.fromKey, ''); onFilterChange?.(dateRange.toKey, ''); }} className="hover:text-blue-900 dark:hover:text-blue-100" aria-label="Remove date range">
                <X size={10} />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
