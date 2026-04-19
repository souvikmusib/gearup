'use client';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, ArrowLeft } from 'lucide-react';

const labels: Record<string, string> = {
  admin: 'Admin',
  dashboard: 'Dashboard',
  customers: 'Customers',
  vehicles: 'Vehicles',
  workers: 'Workers',
  appointments: 'Appointments',
  'job-cards': 'Job Cards',
  inventory: 'Inventory',
  items: 'Items',
  categories: 'Categories',
  suppliers: 'Suppliers',
  movements: 'Movements',
  'low-stock': 'Low Stock',
  invoices: 'Invoices',
  payments: 'Payments',
  expenses: 'Expenses',
  'service-requests': 'Service Requests',
  notifications: 'Notifications',
  templates: 'Templates',
  settings: 'Settings',
  admins: 'Admin Users',
  'business-hours': 'Business Hours',
  integrations: 'Integrations',
  reports: 'Reports',
  revenue: 'Revenue',
  jobs: 'Jobs',
  logs: 'Activity Logs',
  calendar: 'Calendar',
  login: 'Login',
  history: 'History',
  finalize: 'Finalize',
  pdf: 'PDF',
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const router = useRouter();

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length <= 1 || pathname === '/admin/login') return null;

  const crumbs = segments.map((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/');
    const isId = /^[a-z0-9]{20,}$/.test(seg) || seg.startsWith('cm');
    const label = isId ? `#${seg.slice(0, 8)}...` : labels[seg] || seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const isLast = i === segments.length - 1;
    return { href, label, isLast, isId };
  });

  // Skip 'admin' prefix in display
  const displayCrumbs = crumbs.filter(c => c.label !== 'Admin');
  const canGoBack = segments.length > 2;

  return (
    <div className="flex items-center gap-2 mb-4 -mt-2">
      {canGoBack && (
        <button
          onClick={() => router.back()}
          className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
          title="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}
      <nav className="flex items-center gap-1 text-sm">
        {displayCrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />}
            {crumb.isLast ? (
              <span className="font-medium text-gray-900 dark:text-white">{crumb.label}</span>
            ) : (
              <button
                onClick={() => router.push(crumb.href)}
                className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {crumb.label}
              </button>
            )}
          </span>
        ))}
      </nav>
    </div>
  );
}
