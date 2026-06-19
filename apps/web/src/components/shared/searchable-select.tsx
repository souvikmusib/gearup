'use client';
import { useState, useRef, useEffect } from 'react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  meta?: Record<string, any>;
}

interface Props {
  options: SearchableSelectOption[];
  value?: string;
  onChange: (value: string, option?: SearchableSelectOption) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowCreate?: boolean;
  onCreateClick?: () => void;
  createLabel?: string;
}

/**
 * Keyword-any-order search: "chain kit" matches "KIT CHAIN SPROCKET"
 */
function matchesSearch(query: string, text: string): boolean {
  if (!query) return true;
  const keywords = query.toLowerCase().replace(/\s+/g, ' ').trim().split(' ');
  const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
  return keywords.every(k => normalizedText.includes(k));
}

/**
 * Levenshtein distance for fuzzy fallback. Used when exact-substring keyword
 * search returns nothing — surfaces "closest" name matches so a typo like
 * "Sagnk" still finds "Sagnik".
 */
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function fuzzyClosest(query: string, options: SearchableSelectOption[], max = 5): SearchableSelectOption[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  const scored = options.map((o) => {
    const text = `${o.label} ${o.sublabel || ''}`.toLowerCase();
    let best = Infinity;
    for (const token of text.split(/\s+/)) {
      const d = lev(q, token);
      if (d < best) best = d;
    }
    return { opt: o, score: best };
  });
  return scored
    .filter((s) => s.score <= Math.max(1, Math.floor(q.length / 3)))
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .map((s) => s.opt);
}

export function SearchableSelect({ options, value, onChange, placeholder = 'Search...', className, disabled, allowCreate, onCreateClick, createLabel = '+ Create New' }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o => matchesSearch(query, `${o.label} ${o.sublabel || ''}`));
  const fuzzy = filtered.length === 0 ? fuzzyClosest(query, options) : [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className={`relative ${className || ''}`}>
      <input
        ref={inputRef}
        type="text"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : (selected?.label || '')}
        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        disabled={disabled}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          {allowCreate && onCreateClick && (
            <button type="button" onClick={() => { onCreateClick(); setOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-100 dark:border-gray-700 font-medium">
              {createLabel}
            </button>
          )}
          {filtered.length === 0 && fuzzy.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400 text-center">No matches</p>
          ) : (
            <>
              {filtered.map(opt => (
                <button key={opt.value} type="button" onClick={() => { onChange(opt.value, opt); setOpen(false); setQuery(''); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700 last:border-0 ${opt.value === value ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                  <span className="font-medium">{opt.label}</span>
                  {opt.sublabel && <span className="text-xs text-gray-400 ml-2">{opt.sublabel}</span>}
                </button>
              ))}
              {fuzzy.length > 0 && (
                <>
                  <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-400 bg-gray-50 dark:bg-gray-900/50">Did you mean…</p>
                  {fuzzy.map(opt => (
                    <button key={`fz-${opt.value}`} type="button" onClick={() => { onChange(opt.value, opt); setOpen(false); setQuery(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700 last:border-0">
                      <span className="font-medium text-amber-700 dark:text-amber-300">{opt.label}</span>
                      {opt.sublabel && <span className="text-xs text-gray-400 ml-2">{opt.sublabel}</span>}
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
