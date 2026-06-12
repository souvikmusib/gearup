'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';

export default function WorkersReportPage() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    const { cached, promise } = api.getSWR<any>('/admin/reports/workers');
    if (cached?.success) setData(cached.data ?? []);
    promise.then((r) => r.success && setData(r.data ?? []));
  }, []);

  return (
    <div>
      <PageHeader title="Workers Report" />
      <DataTable
        keyField="id"
        columns={[
          { key: 'fullName', header: 'Name' },
          { key: 'activeAssignments', header: 'Active Assignments' },
        ]}
        data={data}
      />
    </div>
  );
}
