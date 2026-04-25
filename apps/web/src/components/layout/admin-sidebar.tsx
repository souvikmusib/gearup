'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import {
  LayoutDashboard, FileText, Calendar, Wrench, Users, Bike, UserCog,
  Package, Receipt, CreditCard, DollarSign, Bell, BarChart3, ScrollText,
  Settings, LogOut, Menu, X, ChevronDown,
} from 'lucide-react';

const NAV = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Service Requests', href: '/admin/service-requests', icon: FileText },
  { label: 'Appointments', href: '/admin/appointments', icon: Calendar },
  { label: 'Job Cards', href: '/admin/job-cards', icon: Wrench },
  { label: 'Customers', href: '/admin/customers', icon: Users },
  { label: 'Vehicles', href: '/admin/vehicles', icon: Bike },
  { label: 'Workers', href: '/admin/workers', icon: UserCog },
  {
    label: 'Calendar', icon: Calendar, children: [
      { label: 'Overview', href: '/admin/calendar' },
      { label: 'Appointments', href: '/admin/appointments/calendar' },
      { label: 'Workers', href: '/admin/workers/calendar' },
    ],
  },
  {
    label: 'Inventory', icon: Package, children: [
      { label: 'Items', href: '/admin/inventory/items' },
      { label: 'Categories', href: '/admin/inventory/categories' },
      { label: 'Suppliers', href: '/admin/inventory/suppliers' },
      { label: 'Movements', href: '/admin/inventory/movements' },
      { label: 'Low Stock', href: '/admin/inventory/low-stock' },
    ],
  },
  { label: 'Invoices', href: '/admin/invoices', icon: Receipt },
  { label: 'Payments', href: '/admin/payments', icon: CreditCard },
  { label: 'Expenses', href: '/admin/expenses', icon: DollarSign },
  { label: 'Notifications', href: '/admin/notifications', icon: Bell },
  {
    label: 'Reports', icon: BarChart3, children: [
      { label: 'Overview', href: '/admin/reports' },
      { label: 'Revenue', href: '/admin/reports/revenue' },
      { label: 'Appointments', href: '/admin/reports/appointments' },
      { label: 'Jobs', href: '/admin/reports/jobs' },
      { label: 'Inventory', href: '/admin/reports/inventory' },
      { label: 'Workers', href: '/admin/reports/workers' },
      { label: 'Expenses', href: '/admin/reports/expenses' },
    ],
  },
  { label: 'Activity Logs', href: '/admin/logs', icon: ScrollText },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());

  const toggleSub = (label: string) => {
    const next = new Set(openSubs);
    next.has(label) ? next.delete(label) : next.add(label);
    setOpenSubs(next);
  };

  const linkCls = (href: string) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
      pathname === href || pathname.startsWith(href + '/')
        ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-300'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
    }`;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800">
        <Link prefetch={false} href="/admin/dashboard" className="text-lg font-bold text-gray-900 dark:text-white">⚙️ GearUp</Link>
        <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:block text-gray-400 hover:text-gray-600"><Menu size={18} /></button>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-gray-400"><X size={18} /></button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV.map((item) => {
          if ('children' in item && item.children) {
            const Icon = item.icon;
            const isOpen = openSubs.has(item.label);
            const isActive = item.children.some((c) => pathname.startsWith(c.href));
            return (
              <div key={item.label}>
                <button onClick={() => toggleSub(item.label)} className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400'} hover:bg-gray-100 dark:hover:bg-gray-800`}>
                  <span className="flex items-center gap-3"><Icon size={18} />{item.label}</span>
                  <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="ml-8 mt-1 space-y-1">
                    {item.children.map((child) => (
                      <Link prefetch={false} key={child.href} href={child.href} className={linkCls(child.href)} onClick={() => setMobileOpen(false)}>
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          const Icon = item.icon;
          return (
            <Link prefetch={false} key={item.href} href={item.href!} className={linkCls(item.href!)} onClick={() => setMobileOpen(false)}>
              <Icon size={18} />{item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <p className="font-medium text-gray-900 dark:text-white">{user?.fullName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{user?.roles.join(', ')}</p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button onClick={logout} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Logout"><LogOut size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button onClick={() => setMobileOpen(true)} className="fixed left-4 top-4 z-40 rounded-lg bg-white p-2 shadow-md lg:hidden dark:bg-gray-800">
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 dark:bg-gray-950 dark:border-gray-800 transform transition-transform lg:translate-x-0 lg:static lg:z-auto ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebar}
      </aside>
    </>
  );
}
