'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
export default function SettingsPage() {
  const [data, setData] = useState<Record<string, any>>({});
  useEffect(() => {
    const { cached, promise } = api.getSWR<any>('/admin/settings');
    if (cached?.success) setData(cached.data ?? {});
    promise.then((r) => r.success && setData(r.data ?? {}));
  }, []);
  return (<div><PageHeader title="Settings" description="Business configuration" />
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-3">
      {Object.entries(data).map(([k, v]) => <div key={k} className="flex justify-between text-sm"><span className="text-gray-500">{k}</span><span className="text-gray-900 dark:text-white">{JSON.stringify(v)}</span></div>)}
    </div>
  </div>);
}
