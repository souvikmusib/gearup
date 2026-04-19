'use client';
import { PageHeader } from '@gearup/ui';
export default function AdminUsersPage() {
  return (<div><PageHeader title="Admin Users" description="Manage admin accounts and roles" />
    <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center text-gray-500">Admin user management — SUPER_ADMIN only</div>
  </div>);
}
