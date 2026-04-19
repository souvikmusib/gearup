'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
export default function BusinessHoursPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get<any>('/admin/settings/business-hours').then((r) => r.success && setData(r.data)); }, []);
  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (<div><PageHeader title="Business Hours" />
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-2">
      {data.rules?.map((r: any) => <div key={r.id} className="flex justify-between text-sm"><span>{days[r.dayOfWeek]}</span><span>{r.openTime} - {r.closeTime} ({r.slotDurationMinutes}min slots, cap {r.maxCapacity})</span></div>)}
    </div>
  </div>);
}
