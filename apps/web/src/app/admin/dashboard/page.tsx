'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { StatCard, PageHeader } from '@gearup/ui';
import { Calendar, FileText, Wrench, Package, Receipt, DollarSign } from 'lucide-react';

interface DashboardData {
  todayAppointments: number;
  pendingRequests: number;
  activeJobs: number;
  lowStockCount: number;
  unpaidInvoices: number;
  todayRevenue: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.get<DashboardData>('/admin/reports?type=dashboard').then((res) => {
      if (res.success && res.data) setData(res.data);
    });
  }, []);

  if (!data) return <div className="py-12 text-center text-gray-500">Loading dashboard...</div>;

  return (
    <div>
      <PageHeader title="Dashboard" description="Today's overview" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Today's Appointments" value={data.todayAppointments} />
        <StatCard label="Pending Requests" value={data.pendingRequests} />
        <StatCard label="Active Jobs" value={data.activeJobs} />
        <StatCard label="Low Stock Items" value={data.lowStockCount} />
        <StatCard label="Unpaid Invoices" value={data.unpaidInvoices} />
        <StatCard label="Today's Revenue" value={`₹${data.todayRevenue.toLocaleString()}`} />
      </div>
    </div>
  );
}
