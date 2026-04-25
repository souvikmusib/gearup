'use client';
import Link from 'next/link';
import { PageHeader } from '@gearup/ui';
import { DollarSign, Calendar, Wrench, Package, Users, Receipt } from 'lucide-react';
const reports = [
  { label: 'Revenue', href: '/admin/reports/revenue', icon: DollarSign, desc: 'Payment and revenue analytics' },
  { label: 'Appointments', href: '/admin/reports/appointments', icon: Calendar, desc: 'Booking and attendance metrics' },
  { label: 'Jobs', href: '/admin/reports/jobs', icon: Wrench, desc: 'Job card status and turnaround' },
  { label: 'Inventory', href: '/admin/reports/inventory', icon: Package, desc: 'Stock levels and consumption' },
  { label: 'Workers', href: '/admin/reports/workers', icon: Users, desc: 'Workload and utilization' },
  { label: 'Expenses', href: '/admin/reports/expenses', icon: Receipt, desc: 'Expense breakdown and trends' },
];
export default function ReportsPage() {
  return (<div><PageHeader title="Reports" description="Business analytics and insights" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {reports.map((r) => (<Link prefetch={false} key={r.href} href={r.href} className="rounded-lg border border-gray-200 bg-white p-5 hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
        <r.icon className="mb-2 text-blue-600" size={24} /><h3 className="font-semibold text-gray-900 dark:text-white">{r.label}</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{r.desc}</p>
      </Link>))}
    </div>
  </div>);
}
