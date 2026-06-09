'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';

export default function AdminUsersPage() {
  const [data, setData] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ adminUserId: '', fullName: '', password: '', email: '', phone: '', roleId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editUser, setEditUser] = useState<any>(null);
  const [editForm, setEditForm] = useState({ fullName: '', password: '', phone: '', status: '', roleId: '' });

  const load = () => {
    api.get<any>('/admin/settings/admins').then((res) => {
      if (res.success) { setData(res.data?.admins ?? []); setRoles(res.data?.roles ?? []); }
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.adminUserId || !form.fullName || !form.password || !form.roleId) { setError('Fill all required fields'); return; }
    setSaving(true); setError('');
    const res = await api.post<any>('/admin/settings/admins', form);
    setSaving(false);
    if (res.success) { setShowCreate(false); setForm({ adminUserId: '', fullName: '', password: '', email: '', phone: '', roleId: '' }); load(); }
    else setError(res.error?.message || 'Failed to create user');
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Admin Users" description="Manage admin accounts and roles" />
        <button onClick={() => setShowCreate(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ Create User</button>
      </div>
      {loading ? <p className="py-8 text-center text-gray-500">Loading...</p> : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Admin</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Role</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.map((admin) => (
                  <tr key={admin.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{admin.fullName}</p>
                      <p className="text-xs text-gray-500">{admin.adminUserId}{admin.phone ? ` · ${admin.phone}` : ''}</p>
                    </td>
                    <td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{admin.roles.map((r: any) => r.name ?? r.key).join(', ') || '-'}</span></td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium ${admin.status === 'ACTIVE' ? 'text-green-600' : 'text-red-600'}`}>{admin.status}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleDateString('en-IN') : 'Never'}</td>
                    <td className="px-4 py-3"><button onClick={() => { setEditUser(admin); setEditForm({ fullName: admin.fullName, password: '', phone: admin.phone || '', status: admin.status, roleId: admin.roles[0]?.id || '' }); }} className="text-xs text-blue-600 hover:underline">Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Admin User">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div><label className="block text-xs font-medium mb-1">User ID <span className="text-red-500">*</span></label><input className={inputCls} value={form.adminUserId} onChange={(e) => setForm({ ...form, adminUserId: e.target.value })} placeholder="e.g. inventory_mgr" /></div>
          <div><label className="block text-xs font-medium mb-1">Full Name <span className="text-red-500">*</span></label><input className={inputCls} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="e.g. Ramesh Kumar" /></div>
          <div><label className="block text-xs font-medium mb-1">Password <span className="text-red-500">*</span></label><input type="password" className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Phone</label><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="block text-xs font-medium mb-1">Email</label><input className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1">Role <span className="text-red-500">*</span></label>
            <select className={inputCls} value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
              <option value="">Select role...</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name ?? r.key}</option>)}
            </select>
          </div>
          <button onClick={submit} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit ${editUser?.fullName}`}>
        <div className="space-y-3">
          <div><label className="block text-xs font-medium mb-1">Full Name</label><input className={inputCls} value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} /></div>
          <div><label className="block text-xs font-medium mb-1">New Password (leave blank to keep)</label><input type="password" className={inputCls} value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Min 6 characters" /></div>
          <div><label className="block text-xs font-medium mb-1">Phone</label><input className={inputCls} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1">Status</label>
              <select className={inputCls} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <div><label className="block text-xs font-medium mb-1">Role</label>
              <select className={inputCls} value={editForm.roleId} onChange={(e) => setEditForm({ ...editForm, roleId: e.target.value })}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name ?? r.key}</option>)}
              </select>
            </div>
          </div>
          <button onClick={async () => {
            setSaving(true); setError('');
            const payload: any = { id: editUser.id, fullName: editForm.fullName, phone: editForm.phone || undefined, status: editForm.status, roleId: editForm.roleId };
            if (editForm.password) payload.password = editForm.password;
            const res = await api.patch<any>('/admin/settings/admins', payload);
            setSaving(false);
            if (res.success) { setEditUser(null); load(); }
            else setError(res.error?.message || 'Failed to update');
          }} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
