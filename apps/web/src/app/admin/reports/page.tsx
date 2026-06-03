'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
import { DollarSign, Calendar, Wrench, Package, Users, Receipt, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const reports = [
  { label: 'Revenue', href: '/admin/reports/revenue', icon: DollarSign, desc: 'Payment and revenue analytics', color: 'text-green-600 bg-green-50 dark:bg-green-950' },
  { label: 'Appointments', href: '/admin/reports/appointments', icon: Calendar, desc: 'Booking and attendance metrics', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950' },
  { label: 'Jobs', href: '/admin/reports/jobs', icon: Wrench, desc: 'Job card status and turnaround', color: 'text-purple-600 bg-purple-50 dark:bg-purple-950' },
  { label: 'Inventory', href: '/admin/reports/inventory', icon: Package, desc: 'Stock levels and consumption', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950' },
  { label: 'Workers', href: '/admin/reports/workers', icon: Users, desc: 'Workload and utilization', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950' },
  { label: 'Expenses', href: '/admin/reports/expenses', icon: Receipt, desc: 'Expense breakdown and trends', color: 'text-red-600 bg-red-50 dark:bg-red-950' },
];

export default function ReportsPage() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.get<any>('/admin/reports?type=dashboard').then((r) => { if (r.success) setStats(r.data); });
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Business analytics and insights" />

      {/* Quick Summary */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">Today's Revenue</p>
            <p className="text-2xl font-bold text-green-600 mt-1">₹{(stats.todayRevenue ?? 0).toLocaleString()}</p>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">Active Jobs</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{stats.activeJobs ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">Unpaid Invoices</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{stats.unpaidInvoices ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">Today's Appointments</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{stats.todayAppointments ?? 0}</p>
          </div>
        </div>
      )}

      {/* Report Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Link prefetch={false} key={r.href} href={r.href} className="group rounded-xl border border-gray-200 bg-white p-6 transition-all hover:shadow-lg hover:border-gray-300 hover:-translate-y-0.5 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600">
            <div className={`inline-flex rounded-lg p-3 ${r.color}`}>
              <r.icon className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-gray-900 dark:text-white text-lg">{r.label}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{r.desc}</p>
            <div className="mt-4 text-sm font-medium text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
              View report →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
