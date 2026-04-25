'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';

const DEFAULTS = {
  'notification.whatsapp.enabled': true,
  'notification.email.enabled': true,
  'notification.reminders.enabled': true,
  'notification.reminderHours': 24,
  'notification.maxRetries': 3,
};

export default function NotificationSettingsPage() {
  const [initial, setInitial] = useState<Record<string, any>>({});
  const [form, setForm] = useState<Record<string, any>>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get<any>('/admin/settings').then((res) => {
      const settings = res.success ? res.data ?? {} : {};
      const merged = { ...DEFAULTS, ...Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, settings[key] ?? DEFAULTS[key as keyof typeof DEFAULTS]])) };
      setInitial(merged);
      setForm(merged);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true); setMessage('');
    const changed = Object.fromEntries(Object.entries(form).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(initial[key])));
    if (Object.keys(changed).length === 0) {
      setMessage('No changes');
      setSaving(false);
      return;
    }
    const res = await api.patch('/admin/settings', changed);
    setSaving(false);
    if (res.success) {
      setInitial(form);
      setMessage('Saved');
    } else {
      setMessage(res.error?.message ?? 'Failed to save');
    }
  };

  const boolField = (key: keyof typeof DEFAULTS, label: string, description: string) => (
    <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <span>
        <span className="block font-medium text-gray-900 dark:text-white">{label}</span>
        <span className="text-sm text-gray-500">{description}</span>
      </span>
      <input type="checkbox" checked={Boolean(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} className="h-5 w-5 rounded border-gray-300" />
    </label>
  );

  if (loading) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Notification Settings" description="Configure notification preferences" />
        <div className="flex items-center gap-3">
          {message && <span className="text-sm text-gray-500">{message}</span>}
          <button onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="space-y-3">
          {boolField('notification.whatsapp.enabled', 'WhatsApp notifications', 'Allow WhatsApp sends for appointment, job, and invoice events.')}
          {boolField('notification.email.enabled', 'Email notifications', 'Allow email sends for supported templates.')}
          {boolField('notification.reminders.enabled', 'Appointment reminders', 'Schedule reminder notifications before upcoming appointments.')}
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Reminder lead time (hours)
              <input type="number" min={1} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white" value={form['notification.reminderHours']} onChange={(e) => setForm({ ...form, 'notification.reminderHours': Number(e.target.value) })} />
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Max send retries
              <input type="number" min={0} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white" value={form['notification.maxRetries']} onChange={(e) => setForm({ ...form, 'notification.maxRetries': Number(e.target.value) })} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
