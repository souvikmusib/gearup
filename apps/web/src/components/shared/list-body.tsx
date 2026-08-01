'use client';
import type { ReactNode } from 'react';
import { ProcessLoader } from './process-loader';

interface ListBodyProps {
  /** True only while the first page of data is being fetched (nothing to show yet). */
  loading: boolean;
  /** True while a background re-fetch (search / filter / page change) is in flight. */
  refreshing?: boolean;
  title: string;
  steps?: string[];
  children: ReactNode;
}

/**
 * Renders the body of a list page.
 *
 * Keep this component *below* the search toolbar so the toolbar never unmounts:
 * unmounting the search input mid-typing destroys the DOM node and drops focus,
 * which makes the page look like it reloads on every keystroke.
 *
 * First load shows the full ProcessLoader. Subsequent re-fetches keep the
 * existing rows on screen and just dim them, so searching feels continuous.
 */
export function ListBody({ loading, refreshing = false, title, steps, children }: ListBodyProps) {
  if (loading) return <ProcessLoader title={title} steps={steps} />;
  return (
    <div
      aria-busy={refreshing}
      className={`transition-opacity duration-150 ${refreshing ? 'pointer-events-none opacity-50' : 'opacity-100'}`}
    >
      {children}
    </div>
  );
}
