'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { PageHeader, StatusBadge } from '@gearup/ui';

export default function JobCardDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get<any>(`/admin/job-cards/${id}`).then((r) => r.success && setData(r.data)); }, [id]);
  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  return (
    <div className="space-y-6">
      <PageHeader title={`Job Card ${data.jobCardNumber}`} />
      <div className="flex gap-2"><StatusBadge status={data.status} /><StatusBadge status={data.approvalStatus} /></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
          <h3 className="font-semibold text-gray-900 dark:text-white">Details</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Issue: {data.issueSummary}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Customer: {data.customer?.fullName}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Vehicle: {data.vehicle?.registrationNumber} — {data.vehicle?.brand} {data.vehicle?.model}</p>
          {data.diagnosisNotes && <p className="text-sm text-gray-500">Diagnosis: {data.diagnosisNotes}</p>}
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Workers</h3>
            {data.assignments?.length ? data.assignments.map((a: any) => <p key={a.id} className="text-sm text-gray-600 dark:text-gray-400">{a.worker?.fullName} ({a.assignmentRole ?? 'General'})</p>) : <p className="text-sm text-gray-400">No workers assigned</p>}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Tasks</h3>
            {data.tasks?.length ? data.tasks.map((t: any) => <div key={t.id} className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-400">{t.taskName}</span><StatusBadge status={t.status} /></div>) : <p className="text-sm text-gray-400">No tasks</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
