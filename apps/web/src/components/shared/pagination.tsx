'use client';
export function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border px-3 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">Previous</button>
        <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="rounded-lg border px-3 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">Next</button>
      </div>
    </div>
  );
}
