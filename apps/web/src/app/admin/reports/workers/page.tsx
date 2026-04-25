'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';

export default function WorkersReportPage() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    api.get<any>('/admin/reports/workers').then((r) => { if (r.success) setData(r.data ?? []); });
  }, []);

  return (
    <div>
      <PageHeader title="Workers Report" />
      <DataTable keyField="id" columns={[
        { key: 'fullName', header: 'Name' },
        { key: 'designation', header: 'Designation', render: (r: any) => r.designation || '—' },
        { key: 'activeAssignments', header: 'Assignments' },
        { key: 'totalTasks', header: 'Tasks' },
      ]} data={data} />
    </div>
  );
}
