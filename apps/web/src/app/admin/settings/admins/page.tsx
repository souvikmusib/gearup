'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';

export default function AdminUsersPage() {
  const [data, setData] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/admin/settings/admins').then((res) => {
      if (res.success) {
        setData(res.data?.admins ?? []);
        setRoles(res.data?.roles ?? []);
      }
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Users" description="Manage admin accounts and roles" />
      {loading ? <p className="py-8 text-center text-gray-500">Loading...</p> : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Admin</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Roles</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.map((admin) => (
                  <tr key={admin.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{admin.fullName}</p>
                      <p className="text-xs text-gray-500">{admin.adminUserId} {admin.email ? `- ${admin.email}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{admin.roles.map((r: any) => r.name ?? r.key).join(', ') || '-'}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{admin.status}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">Available Roles</h3>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => <span key={role.id} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{role.name ?? role.key}</span>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
