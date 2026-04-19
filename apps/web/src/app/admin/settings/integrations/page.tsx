'use client';
import { PageHeader } from '@gearup/ui';
export default function IntegrationsPage() {
  return (<div><PageHeader title="Integrations" description="WhatsApp, Email, and Sentry configuration" />
    <div className="space-y-4">
      {['WhatsApp Provider', 'Email Provider', 'Sentry'].map((name) => (
        <div key={name} className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">{name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Configure via environment variables</p>
        </div>
      ))}
    </div>
  </div>);
}
