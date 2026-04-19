'use client';
import React from 'react';

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  CONFIRMED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  COMPLETED: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  INACTIVE: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  LOCKED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  UNPAID: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  SENT: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  QUEUED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

const DEFAULT_COLOR = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? DEFAULT_COLOR;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
