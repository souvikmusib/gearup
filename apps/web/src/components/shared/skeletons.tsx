export function ListSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-7 w-40 bg-gray-200 dark:bg-gray-800 rounded" />
          <div className="h-4 w-56 bg-gray-100 dark:bg-gray-800 rounded mt-2" />
        </div>
        <div className="h-9 w-28 bg-gray-200 dark:bg-gray-800 rounded-lg" />
      </div>
      <div className="h-10 w-full bg-gray-100 dark:bg-gray-800 rounded-lg mb-4" />
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-4 flex-1 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 flex gap-4 border-t border-gray-100 dark:border-gray-800">
            {Array.from({ length: cols }).map((_, j) => (
              <div key={j} className="h-4 flex-1 bg-gray-100 dark:bg-gray-800 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="h-4 w-64 bg-gray-100 dark:bg-gray-800 rounded mt-2" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-64 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800" />
        <div className="lg:col-span-2 h-64 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800" />
      </div>
    </div>
  );
}
