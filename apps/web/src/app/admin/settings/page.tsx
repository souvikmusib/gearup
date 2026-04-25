'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get<any>('/admin/settings').then((r) => { if (r.success) { setSettings(r.data ?? {}); setEdited(r.data ?? {}); } setLoading(false); });
  }, []);

  const save = async () => {
    setSaving(true); setMsg('');
    const changed: Record<string, any> = {};
    Object.keys(edited).forEach((k) => { if (JSON.stringify(edited[k]) !== JSON.stringify(settings[k])) changed[k] = edited[k]; });
    if (Object.keys(changed).length === 0) { setMsg('No changes'); setSaving(false); return; }
    const res = await api.patch<any>('/admin/settings', changed);
    setSaving(false);
    if (res.success) { setSettings({ ...settings, ...changed }); setMsg('Saved!'); }
    else setMsg(res.error?.message || 'Failed');
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  const groups: Record<string, string[]> = {};
  Object.keys(edited).sort().forEach((k) => {
    const prefix = k.split('.')[0];
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(k);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Settings" description="Application configuration" />
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-gray-500">{msg}</span>}
          <button onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Shop Holidays', href: '/admin/settings/holidays', desc: 'Manage holidays & closures' },
          { label: 'Business Hours', href: '/admin/settings/business-hours', desc: 'Slot rules & capacity' },
          { label: 'Admin Users', href: '/admin/settings/admins', desc: 'Manage admin accounts' },
          { label: 'Notifications', href: '/admin/settings/notifications', desc: 'Templates & channels' },
        ].map((item) => (
          <a key={item.href} href={item.href} className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700">
            <p className="font-semibold text-gray-900 dark:text-white text-sm">{item.label}</p>
            <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
          </a>
        ))}
      </div>

      {Object.keys(groups).length === 0 && <p className="text-sm text-gray-500">No settings configured yet.</p>}

      {Object.entries(groups).map(([prefix, keys]) => (
        <div key={prefix} className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 capitalize">{prefix}</h3>
          <div className="space-y-3">
            {keys.map((k) => (
              <div key={k} className="grid grid-cols-3 gap-3 items-center">
                <label className="text-sm text-gray-600 dark:text-gray-400 font-mono">{k}</label>
                <input className={`${inputCls} col-span-2`} value={typeof edited[k] === 'string' ? edited[k] : JSON.stringify(edited[k])}
                  onChange={(e) => { try { setEdited({ ...edited, [k]: JSON.parse(e.target.value) }); } catch { setEdited({ ...edited, [k]: e.target.value }); } }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
