'use client';
import { useAuth } from '@/lib/auth/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { api } from '@/lib/api/client';

const PREFETCH_ENDPOINTS = [
  '/admin/reports?type=dashboard',
  '/admin/logs?pageSize=8',
  '/admin/logs',
  '/admin/service-requests?page=1',
  '/admin/job-cards?page=1',
  '/admin/appointments?page=1',
  '/admin/appointments?pageSize=200',
  '/admin/customers?page=1',
  '/admin/customers?pageSize=200',
  '/admin/vehicles',
  '/admin/workers?page=1',
  '/admin/workers?pageSize=200',
  '/admin/invoices?page=1',
  '/admin/payments',
  '/admin/notifications',
  '/admin/notifications/templates',
  '/admin/expenses',
  '/admin/expenses/categories',
  '/admin/inventory/items?page=1',
  '/admin/inventory/categories',
  '/admin/inventory/low-stock',
  '/admin/inventory/movements',
  '/admin/inventory/suppliers',
  '/admin/settings',
  '/admin/settings/admins',
  '/admin/settings/business-hours',
  '/admin/settings/holidays',
  '/admin/reports?type=revenue',
  '/admin/reports?type=expenses',
  '/admin/reports?type=jobs',
  '/admin/reports?type=appointments',
  '/admin/reports?type=inventory',
  '/admin/reports?type=workers',
  '/admin/workers/calendar',
];

function LoadingSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar skeleton */}
      <div className="hidden lg:flex w-64 flex-col bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 p-4">
        <div className="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-6" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 w-full bg-gray-100 dark:bg-gray-900 rounded animate-pulse mb-2" />
        ))}
      </div>
      {/* Content skeleton */}
      <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-6 lg:p-8">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-2" />
        <div className="h-4 w-64 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-6" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 animate-pulse" />
          ))}
        </div>
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (!loading && !user && !isLoginPage) router.replace('/admin/login');
  }, [loading, user, isLoginPage, router]);

  useEffect(() => {
    if (loading || !user || isLoginPage) return;
    let cancelled = false;
    const timers: number[] = [];
    const w = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const runDataPrefetch = async () => {
      for (const endpoint of PREFETCH_ENDPOINTS) {
        if (cancelled || document.hidden) return;
        await api.prefetch(endpoint);
        if (cancelled) return;
        await new Promise<void>((resolve) => {
          timers.push(window.setTimeout(resolve, 900));
        });
      }
    };

    const runWarmup = () => {
      timers.push(window.setTimeout(() => { void runDataPrefetch(); }, 1200));
    };

    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(runWarmup, { timeout: 1500 });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
        timers.forEach(clearTimeout);
      };
    }

    const t = window.setTimeout(runWarmup, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
      timers.forEach(clearTimeout);
    };
  }, [loading, user, isLoginPage, router]);

  if (isLoginPage) return <>{children}</>;
  if (loading) return <LoadingSkeleton />;
  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6 lg:p-8">
        <Breadcrumbs />
        {children}
      </main>
    </div>
  );
}
