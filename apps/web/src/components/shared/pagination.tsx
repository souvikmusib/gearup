'use client';

const DEFAULT_SIZES = [10, 25, 50, 100, 200];

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  total?: number;
  sizes?: number[];
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  total,
  sizes = DEFAULT_SIZES,
}: PaginationProps) {
  const showControls = totalPages > 1 || (onPageSizeChange != null && total != null && total > 0);
  if (!showControls) return null;

  const start = pageSize && total != null ? Math.min((page - 1) * pageSize + 1, total) : null;
  const end = pageSize && total != null ? Math.min(page * pageSize, total) : null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-gray-500 dark:text-gray-400">
        {total != null && start != null && end != null
          ? `${start}-${end} of ${total}`
          : `Page ${page}${totalPages > 0 ? ` of ${totalPages}` : ''}`}
      </span>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            <span className="hidden sm:inline">Per page</span>
            <select
              value={pageSize ?? sizes[1]}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border px-3 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          Previous
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border px-3 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          Next
        </button>
      </div>
    </div>
  );
}
