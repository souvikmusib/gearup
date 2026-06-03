'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
import { DashboardSkeleton } from '@/components/shared/skeletons';
import { Calendar, FileText, Wrench, AlertTriangle, Receipt, DollarSign, Users, Bike, ClipboardList, Plus, ArrowRight, Clock } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardData {
  todayAppointments: number;
  pendingRequests: number;
  activeJobs: number;
  unpaidInvoices: number;
  todayRevenue: number;
  totalCustomers: number;
  totalVehicles: number;
  activeWorkers: number;
}

interface RecentLog {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
  adminUser?: { fullName: string };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [logs, setLogs] = useState<RecentLog[]>([]);
  const [revenueChart, setRevenueChart] = useState<any[]>([]);
  const [jobStats, setJobStats] = useState<any[]>([]);
  const [workerLoad, setWorkerLoad] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    const dashboard = api.getSWR<DashboardData>('/admin/reports?type=dashboard');
    if (dashboard.cached?.success && dashboard.cached.data) setData(dashboard.cached.data);
    dashboard.promise.then((res) => {
      if (res.success && res.data) setData(res.data);
    });
    const logsReq = api.getSWR<any>('/admin/logs?pageSize=8');
    if (logsReq.cached?.success) setLogs(logsReq.cached.data ?? []);
    logsReq.promise.then((res) => {
      if (res.success && res.data) setLogs(res.data);
    });
    // Charts
    const from = new Date(); from.setDate(from.getDate() - 7);
    api.get<any>(`/admin/reports?type=revenue&from=${from.toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`).then((r) => {
      if (r.success) setRevenueChart(r.data?.daily ?? []);
    });
    api.get<any>('/admin/reports?type=jobs').then((r) => {
      if (r.success) setJobStats(r.data ?? []);
    });
    api.get<any>('/admin/reports?type=workers').then((r) => {
      if (r.success) setWorkerLoad(r.data ?? []);
    });
  }, []);

  if (!data) return <DashboardSkeleton />;

  const kpis = [
    { label: "Today's Appointments", value: data.todayAppointments, icon: Calendar, color: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400', href: '/admin/appointments' },
    { label: 'Pending Requests', value: data.pendingRequests, icon: ClipboardList, color: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400', href: '/admin/service-requests' },
    { label: 'Active Jobs', value: data.activeJobs, icon: Wrench, color: 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400', href: '/admin/job-cards' },
    { label: 'Unpaid Invoices', value: data.unpaidInvoices, icon: Receipt, color: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400', href: '/admin/invoices' },
    { label: "Today's Revenue", value: `₹${data.todayRevenue.toLocaleString()}`, icon: DollarSign, color: 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400', href: '/admin/reports/revenue' },
  ];

  const quickActions = [
    { label: 'New Customer', icon: Users, href: '/admin/customers', color: 'text-blue-600' },
    { label: 'New Appointment', icon: Calendar, href: '/admin/appointments', color: 'text-purple-600' },
    { label: 'New Job Card', icon: Wrench, href: '/admin/job-cards', color: 'text-amber-600' },
    { label: 'New Invoice', icon: FileText, href: '/admin/invoices', color: 'text-green-600' },
  ];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  };

  const formatAction = (action: string) => action.replace(/\./g, ' ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={`Welcome back! Here's what's happening today.`} />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            onClick={() => router.push(kpi.href)}
            className="cursor-pointer rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 transition-all hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <div className={`rounded-lg p-2.5 ${kpi.color}`}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpi.value}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Trend (last 7 days) */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Revenue (Last 7 Days)</h3>
            <button onClick={() => router.push('/admin/reports/revenue')} className="text-sm text-blue-600 hover:text-blue-700 font-medium">Details →</button>
          </div>
          {revenueChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revenueChart}>
                <defs><linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Revenue']} />
                <Area type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} fill="url(#dashGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-500 text-center py-8">No revenue data this week</p>}
        </div>

        {/* Job Status Pie */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Job Cards</h3>
            <button onClick={() => router.push('/admin/job-cards')} className="text-sm text-blue-600 hover:text-blue-700 font-medium">View →</button>
          </div>
          {jobStats.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={jobStats} dataKey="_count" nameKey="status" cx="50%" cy="50%" outerRadius={70} label={({ status, _count }) => `${status.replace(/_/g, ' ')} (${_count})`} labelLine={false}>
                  {jobStats.map((_: any, i: number) => <Cell key={i} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'][i % 8]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-500 text-center py-8">No job cards</p>}
        </div>
      </div>

      {/* Worker Load */}
      {workerLoad.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Worker Load</h3>
            <button onClick={() => router.push('/admin/workers')} className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all →</button>
          </div>
          <div className="flex flex-wrap gap-3">
            {workerLoad.filter((w: any) => w.totalAssignments > 0).map((w: any) => (
              <div key={w.id} className="flex items-center gap-2 rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{w.fullName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${w.activeAssignments >= 3 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : w.activeAssignments >= 2 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : w.activeAssignments >= 1 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                  {w.activeAssignments} ({w.totalAssignments})
                </span>
              </div>
            ))}
            {workerLoad.every((w: any) => w.totalAssignments === 0) && <p className="text-sm text-gray-500">No assignments yet</p>}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => router.push(action.href)}
                className="flex flex-col items-center gap-2 rounded-lg border border-gray-100 dark:border-gray-800 p-4 transition-all hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-200"
              >
                <div className={`rounded-full bg-gray-50 dark:bg-gray-800 p-2 ${action.color}`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{action.label}</span>
              </button>
            ))}
          </div>

          {/* Summary Stats */}
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 py-1 rounded" onClick={() => router.push('/admin/customers')}>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Customers</span>
              </div>
              <span className="text-sm font-semibold">{data.totalCustomers}</span>
            </div>
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 py-1 rounded" onClick={() => router.push('/admin/vehicles')}>
              <div className="flex items-center gap-2">
                <Bike className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Vehicles</span>
              </div>
              <span className="text-sm font-semibold">{data.totalVehicles}</span>
            </div>
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 py-1 rounded" onClick={() => router.push('/admin/workers')}>
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Active Workers</span>
              </div>
              <span className="text-sm font-semibold">{data.activeWorkers}</span>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
            <button onClick={() => router.push('/admin/logs')} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              View all →
            </button>
          </div>
          <div className="space-y-1">
            {logs.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No recent activity</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                  onClick={() => {
                    const routes: Record<string, string> = { Customer: '/admin/customers', Vehicle: '/admin/vehicles', Worker: '/admin/workers', JobCard: '/admin/job-cards', Invoice: '/admin/invoices', Appointment: '/admin/appointments', Expense: '/admin/expenses', ServiceRequest: '/admin/service-requests' };
                    const base = routes[log.entityType] || '/admin/logs';
                    router.push(log.entityId ? `${base}/${log.entityId}` : base);
                  }}
                >
                  <div className="flex-shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 p-1.5">
                    <Clock className="h-3.5 w-3.5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                      <span className="font-medium">{formatAction(log.action)}</span>
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {log.entityType}{log.entityId ? ` • ${log.entityId.slice(0, 8)}...` : ''} • {log.adminUser?.fullName || 'System'}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(log.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
