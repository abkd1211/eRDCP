'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Loader2, Shield } from 'lucide-react';
import { authApi } from '@/lib/services';
import { RoleBadge, Skeleton } from '@/components/ui';
import { useAuth } from '@/store/auth.store';
import { ROLE_CONFIG, formatRelative } from '@/lib/utils';
import type { Role, User } from '@/types';

const ROLES: Role[] = ['SYSTEM_ADMIN','HOSPITAL_ADMIN','POLICE_ADMIN','FIRE_SERVICE_ADMIN','AMBULANCE_DRIVER'];

export default function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setCreate] = useState(false);
  const [newUser, setNew]       = useState({ name: '', email: '', password: '', role: 'HOSPITAL_ADMIN' as Role });
  const [createErr, setErr]     = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => authApi.listUsers(1, 50),
  });

  const updateRoleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => authApi.updateRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => authApi.deactivateUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const createMut = useMutation({
    mutationFn: () => authApi.register(newUser),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setCreate(false);
      setNew({ name: '', email: '', password: '', role: 'HOSPITAL_ADMIN' });
      setErr('');
    },
    onError: (e: unknown) => {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create user');
    },
  });

  const users: User[] = data?.users ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-faint)' }}>
          <Shield size={13} style={{ color: '#E8442A' }} />
          <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{users.length} registered users</span>
        </div>
        <button onClick={() => setCreate(true)} className="btn btn-primary gap-1.5">
          <Plus size={15} /> New User
        </button>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {ROLES.map((role) => {
          const conf  = ROLE_CONFIG[role];
          const count = users.filter((u) => u.role === role).length;
          return (
            <div key={role} className="card p-3" style={{ borderLeft: `2px solid ${conf.color}` }}>
              <p className="text-lg font-bold font-mono" style={{ fontFamily: 'JetBrains Mono, monospace', color: conf.color }}>{count}</p>
              <p className="text-xs mt-0.5" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text-muted)', fontWeight: 600 }}>{conf.label}</p>
            </div>
          );
        })}
      </div>

      {/* Users table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-hi)' }}>
                {['Name','Email','Role','Status','Joined','Actions'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                : users.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-10 text-center" style={{ color: 'var(--text-faint)' }}>No users found</td></tr>
                  : users.map((u) => {
                      const isMe = u.id === me?.id;
                      return (
                        <tr key={u.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                                style={{ background: `${ROLE_CONFIG[u.role as Role]?.color ?? '#9AA3AF'}20`, color: ROLE_CONFIG[u.role as Role]?.color ?? '#9AA3AF', fontFamily: 'Syne, sans-serif' }}>
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{u.name}{isMe && <span className="ml-1 text-xs" style={{ color: '#7CB518' }}>(you)</span>}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-faint)' }}>{u.email}</td>
                          <td className="px-4 py-3">
                            {isMe
                              ? <RoleBadge role={u.role as Role} />
                              : <select value={u.role} disabled={updateRoleMut.isPending}
                                  onChange={(e) => updateRoleMut.mutate({ id: u.id, role: e.target.value })}
                                  className="input-base py-1 text-xs">
                                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>)}
                                </select>
                            }
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-semibold" style={{ color: u.isActive ? '#7CB518' : '#5A6370', fontFamily: 'Syne, sans-serif' }}>
                              {u.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-faint)' }}>{formatRelative(u.createdAt)}</td>
                          <td className="px-4 py-3">
                            {!isMe && (
                              <button
                                onClick={() => deactivateMut.mutate(u.id)}
                                disabled={deactivateMut.isPending}
                                className="btn btn-ghost text-xs px-2 py-1"
                                style={{ color: u.isActive ? '#E8442A' : '#7CB518' }}>
                                {u.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Create user modal */}
      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setCreate(false); }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="card p-6 w-full max-w-sm"
              style={{ borderTop: '2px solid #E8442A' }}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>Create User</h3>
                <button onClick={() => setCreate(false)} className="btn-ghost p-1 rounded"><X size={15} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="label block mb-1.5">Full Name</label>
                  <input value={newUser.name} onChange={(e) => setNew((n) => ({ ...n, name: e.target.value }))} className="input-base" placeholder="Kofi Mensah" />
                </div>
                <div>
                  <label className="label block mb-1.5">Email</label>
                  <input type="email" value={newUser.email} onChange={(e) => setNew((n) => ({ ...n, email: e.target.value }))} className="input-base" placeholder="kofi@erdcp.gov.gh" />
                </div>
                <div>
                  <label className="label block mb-1.5">Password</label>
                  <input type="password" value={newUser.password} onChange={(e) => setNew((n) => ({ ...n, password: e.target.value }))} className="input-base" placeholder="Min 8 characters" />
                </div>
                <div>
                  <label className="label block mb-2">Role</label>
                  <div className="space-y-2">
                    {ROLES.filter((r) => r !== 'SYSTEM_ADMIN').map((r) => {
                      const conf = ROLE_CONFIG[r];
                      return (
                        <label key={r} className="flex items-start gap-2 cursor-pointer p-2 rounded-lg transition-all"
                          style={{ background: newUser.role === r ? `${conf.color}10` : 'transparent', border: `1px solid ${newUser.role === r ? conf.color + '40' : 'var(--border)'}` }}>
                          <input type="radio" name="role" value={r} checked={newUser.role === r}
                            onChange={() => setNew((n) => ({ ...n, role: r }))} className="mt-0.5" />
                          <div>
                            <p className="text-xs font-bold" style={{ fontFamily: 'Syne, sans-serif', color: conf.color }}>{conf.label}</p>
                            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{conf.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {createErr && <p className="text-xs p-2 rounded" style={{ color: '#E8442A', background: 'rgba(232,68,42,0.1)' }}>{createErr}</p>}
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setCreate(false)} className="btn btn-ghost flex-1">Cancel</button>
                  <button onClick={() => createMut.mutate()} disabled={createMut.isPending || !newUser.name || !newUser.email || !newUser.password}
                    className="btn btn-primary flex-1">
                    {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
