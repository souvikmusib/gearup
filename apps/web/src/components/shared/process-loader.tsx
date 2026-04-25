'use client';
import { useEffect, useMemo, useState } from 'react';

const DEFAULT_TIPS = [
  'Checking vehicle and customer records',
  'Looking for appointment and job-card updates',
  'Preparing the latest garage status',
  'Verifying invoice and payment information',
];

export function ProcessLoader({
  title,
  steps = DEFAULT_TIPS,
  etaAfterMs = 6500,
}: {
  title: string;
  steps?: string[];
  etaAfterMs?: number;
}) {
  const [tick, setTick] = useState(0);
  const [showEta, setShowEta] = useState(false);
  const safeSteps = useMemo(() => steps.length ? steps : DEFAULT_TIPS, [steps]);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 1200);
    const etaTimer = window.setTimeout(() => setShowEta(true), etaAfterMs);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(etaTimer);
    };
  }, [etaAfterMs]);

  const active = tick % safeSteps.length;

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-left shadow-sm dark:border-blue-900/40 dark:bg-blue-950/30">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-blue-900 dark:text-blue-100">{title}</p>
          <div className="mt-3 space-y-2">
            {safeSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${index === active ? 'bg-blue-600' : index < active ? 'bg-green-500' : 'bg-blue-200 dark:bg-blue-800'}`} />
                <span className={index === active ? 'text-blue-800 dark:text-blue-100' : 'text-blue-600/70 dark:text-blue-200/60'}>{step}</span>
              </div>
            ))}
          </div>
          {showEta && <p className="mt-3 text-xs text-blue-700 dark:text-blue-200">Still working. Cold starts can take 6-7 seconds, but the request is active.</p>}
        </div>
      </div>
    </div>
  );
}
