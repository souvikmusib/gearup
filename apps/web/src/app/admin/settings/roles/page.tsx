'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
import { Modal } from '@/components/shared/modal';
import { Shield, Users } from 'lucide-react';

interface Permission { id: string; key: string; name: string; module: string; description: string | null }
interface RoleRow { id: string; key: string; name: string; description: string | null; adminCount: number; permissions: Permission[] }

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [allPerms, setAllPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<RoleRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', permissionIds: new Set<string>() });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ key: '', name: '', description: '', permissionIds: new Set<string>() });

  const load = () => {
    setLoading(true);
    api.get<any>('/admin/settings/roles').then((r) => {
      if (r.success) {
        setRoles(r.data?.roles ?? []);
        setAllPerms(r.data?.allPermissions ?? []);
      }
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

  const groupedPerms = useMemo(() => {
    const out: Record<string, Permission[]> = {};
    for (const p of allPerms) {
      if (!out[p.module]) out[p.module] = [];
      out[p.module].push(p);
    }
    return out;
  }, [allPerms]);

  const openEdit = (role: RoleRow) => {
    setEdit(role);
    setError('');
    setEditForm({
      name: role.name,
      description: role.description ?? '',
      permissionIds: new Set(role.permissions.map((p) => p.id)),
    });
  };

  const togglePerm = (setForm: (fn: any) => void, id: string) => {
    setForm((prev: any) => {
      const next = new Set(prev.permissionIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...prev, permissionIds: next };
    });
  };

  const saveEdit = async () => {
    if (!edit) return;
    setSaving(true); setError('');
    const res = await api.patch<any>(`/admin/settings/roles/${edit.id}`, {
      name: editForm.name,
      description: editForm.description || null,
      permissionIds: Array.from(editForm.permissionIds),
    });
    setSaving(false);
    if (res.success) { setEdit(null); load(); }
    else setError(res.error?.message || 'Failed to update role');
  };

  const submitCreate = async () => {
    if (!createForm.key || !createForm.name) { setError('Key and name are required'); return; }
    setSaving(true); setError('');
    const res = await api.post<any>('/admin/settings/roles', {
      key: createForm.key.trim().toUpperCase().replace(/\s+/g, '_'),
      name: createForm.name,
      description: createForm.description || undefined,
      permissionIds: Array.from(createForm.permissionIds),
    });
    setSaving(false);
    if (res.success) { setShowCreate(false); setCreateForm({ key: '', name: '', description: '', permissionIds: new Set() }); load(); }
    else setError(res.error?.message || 'Failed to create role');
  };

  const removeRole = async (role: RoleRow) => {
    if (role.adminCount > 0) { alert(`This role is assigned to ${role.adminCount} admin user(s). Reassign them first.`); return; }
    if (!confirm(`Delete role "${role.name}"?`)) return;
    const res = await api.delete<any>(`/admin/settings/roles/${role.id}`);
    if (res.success) load();
    else alert(res.error?.message || 'Failed to delete');
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Roles & Permissions" description="Define what each role can access" />
        <button onClick={() => setShowCreate(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ Create Role</button>
      </div>

      {loading ? <p className="py-8 text-center text-gray-500">Loading…</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <div key={role.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                    <Shield size={14} className="text-blue-600" /> {role.name}
                  </h3>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">{role.key}</p>
                  {role.description && <p className="text-xs text-gray-500 mt-1">{role.description}</p>}
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                  <Users size={10} /> {role.adminCount}
                </span>
              </div>
              <div className="mt-3 text-xs">
                <span className="font-medium text-gray-700 dark:text-gray-300">{role.permissions.length}</span>
                <span className="text-gray-500"> of {allPerms.length} permissions</span>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => openEdit(role)} className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300">Edit</button>
                <button onClick={() => removeRole(role)} className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 disabled:opacity-50" disabled={role.adminCount > 0}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Edit role: ${edit?.name ?? ''}`}>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Name</label><input className={inputCls} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div><label className={labelCls}>Key</label><input className={inputCls} value={edit?.key ?? ''} readOnly /></div>
          </div>
          <div><label className={labelCls}>Description</label><input className={inputCls} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>Permissions ({editForm.permissionIds.size}/{allPerms.length})</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditForm({ ...editForm, permissionIds: new Set(allPerms.map((p) => p.id)) })} className="text-xs text-blue-600 hover:underline">Select all</button>
                <button type="button" onClick={() => setEditForm({ ...editForm, permissionIds: new Set() })} className="text-xs text-gray-500 hover:underline">Clear</button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              {Object.entries(groupedPerms).map(([module, perms]) => (
                <div key={module} className="mb-3 last:mb-0">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{module}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {perms.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={editForm.permissionIds.has(p.id)}
                          onChange={() => togglePerm(setEditForm, p.id)}
                          className="rounded"
                        />
                        <span>{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={saveEdit} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create role">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Name <span className="text-red-500">*</span></label><input className={inputCls} value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="e.g. Senior Mechanic" /></div>
            <div><label className={labelCls}>Key <span className="text-red-500">*</span></label><input className={inputCls} value={createForm.key} onChange={(e) => setCreateForm({ ...createForm, key: e.target.value })} placeholder="e.g. SENIOR_MECHANIC" /></div>
          </div>
          <div><label className={labelCls}>Description</label><input className={inputCls} value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} /></div>
          <div>
            <label className={labelCls}>Permissions ({createForm.permissionIds.size})</label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              {Object.entries(groupedPerms).map(([module, perms]) => (
                <div key={module} className="mb-3 last:mb-0">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{module}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {perms.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={createForm.permissionIds.has(p.id)}
                          onChange={() => togglePerm(setCreateForm, p.id)}
                          className="rounded"
                        />
                        <span>{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={submitCreate} disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Role'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
