'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Key, User, Shield } from 'lucide-react';
import { authApi, responderApi } from '@/lib/services';
import { useAuth } from '@/store/auth.store';
import { RoleBadge, StatusBadge } from '@/components/ui';
import { ROLE_CONFIG, formatDateTime } from '@/lib/utils';
import type { Role, ResponderType } from '@/types';

const SERVICE_ADMIN_TYPES: Record<string, ResponderType> = {
  HOSPITAL_ADMIN:     'AMBULANCE',
  POLICE_ADMIN:       'POLICE',
  FIRE_SERVICE_ADMIN: 'FIRE_TRUCK',
};

export default function ProfilePage() {
  const { user, setAuth, accessToken, refreshToken } = useAuth();
  const qc = useQueryClient();

  const [name, setName]           = useState(user?.name ?? '');
  const [currPw, setCurrPw]       = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [pwMsg, setPwMsg]           = useState('');

  const roleConf = user ? ROLE_CONFIG[user.role as Role] : null;
  const respType = user ? SERVICE_ADMIN_TYPES[user.role] : undefined;

  const { data: profile } = useQuery({
    queryKey: ['my-profile'],
    queryFn:  authApi.getProfile,
  });

  const { data: myUnits = [] } = useQuery({
    queryKey: ['responders', respType, 'own'],
    queryFn:  () => responderApi.list({ type: respType, ownOnly: true }),
    enabled:  !!respType,
  });

  const updateProfileMut = useMutation({
    mutationFn: () => authApi.updateProfile({ name }),
    onSuccess: (updated) => {
      setProfileMsg('Name updated successfully');
      if (user && accessToken && refreshToken) {
        setAuth({ ...user, name: updated.name }, { accessToken, refreshToken });
      }
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      setTimeout(() => setProfileMsg(''), 3000);
    },
    onError: () => setProfileMsg('Failed to update profile'),
  });

  const updatePwMut = useMutation({
    mutationFn: () => authApi.updateProfile({ currentPassword: currPw, newPassword: newPw }),
    onSuccess: () => {
      setPwMsg('Password changed successfully');
      setCurrPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => setPwMsg(''), 3000);
    },
    onError: (e: unknown) => {
      setPwMsg((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to change password');
    },
  });

  const pwValid = newPw.length >= 8 && newPw === confirmPw && currPw.length > 0;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Identity card */}
      <div className="card p-5" style={{ borderLeft: `2px solid ${roleConf?.color ?? '#E8442A'}` }}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0"
            style={{ background: `${roleConf?.color ?? '#E8442A'}18`, color: roleConf?.color ?? '#E8442A', fontFamily: 'Syne, sans-serif' }}>
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base" style={{ fontFamily: 'Syne, sans-serif' }}>{profile?.name ?? user?.name}</p>
            <p className="text-xs mb-1" style={{ color: 'var(--text-faint)' }}>{profile?.email ?? user?.email}</p>
            <RoleBadge role={(profile?.role ?? user?.role) as Role} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t text-xs" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="label mb-0.5">Member Since</p>
            <p className="font-mono" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
              {profile?.createdAt ? formatDateTime(profile.createdAt) : '—'}
            </p>
          </div>
          <div>
            <p className="label mb-0.5">Role Description</p>
            <p style={{ color: 'var(--text-muted)' }}>{roleConf?.description}</p>
          </div>
        </div>
      </div>

      {/* Edit name */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <User size={15} style={{ color: 'var(--text-faint)' }} />
          <p className="font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>Edit Profile</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label block mb-1.5">Display Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-base" />
          </div>
          <div>
            <label className="label block mb-1.5">Email Address</label>
            <input value={profile?.email ?? user?.email ?? ''} disabled className="input-base opacity-50 cursor-not-allowed" />
            <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Email changes are managed by a System Administrator</p>
          </div>
          {profileMsg && <p className="text-xs" style={{ color: profileMsg.includes('success') ? '#7CB518' : '#E8442A' }}>{profileMsg}</p>}
          <button onClick={() => updateProfileMut.mutate()} disabled={updateProfileMut.isPending || name === user?.name}
            className="btn btn-primary gap-1.5">
            {updateProfileMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
          </button>
        </div>
      </div>

      {/* Change password */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Key size={15} style={{ color: 'var(--text-faint)' }} />
          <p className="font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>Change Password</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label block mb-1.5">Current Password</label>
            <input type="password" value={currPw} onChange={(e) => setCurrPw(e.target.value)} className="input-base" placeholder="Your current password" />
          </div>
          <div>
            <label className="label block mb-1.5">New Password</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="input-base" placeholder="Min 8 characters" />
          </div>
          <div>
            <label className="label block mb-1.5">Confirm New Password</label>
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="input-base"
              style={{ borderColor: confirmPw && newPw !== confirmPw ? '#E8442A' : undefined }} placeholder="Repeat new password" />
            {confirmPw && newPw !== confirmPw && <p className="text-xs mt-1" style={{ color: '#E8442A' }}>Passwords do not match</p>}
          </div>
          {pwMsg && <p className="text-xs" style={{ color: pwMsg.includes('success') ? '#7CB518' : '#E8442A' }}>{pwMsg}</p>}
          <button onClick={() => updatePwMut.mutate()} disabled={!pwValid || updatePwMut.isPending}
            className="btn btn-primary gap-1.5">
            {updatePwMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />} Update Password
          </button>
        </div>
      </div>

      {/* My Resources — service admins only */}
      {respType && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={15} style={{ color: roleConf?.color }} />
            <p className="font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>My Units</p>
          </div>
          {myUnits.length === 0
            ? <p className="text-xs py-4 text-center" style={{ color: 'var(--text-faint)' }}>No units registered yet. Use the Dashboard to register units.</p>
            : myUnits.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{r.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{r.stationName}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))
          }
        </div>
      )}

      {/* System Admin danger zone */}
      {user?.role === 'SYSTEM_ADMIN' && (
        <div className="card p-5" style={{ border: '1px solid rgba(232,68,42,0.2)' }}>
          <p className="font-bold text-sm mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#E8442A' }}>System Administrator</p>
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Major account changes, role assignments, and user deactivation are managed from the User Management section. Your account cannot be deactivated from this interface.</p>
        </div>
      )}
    </div>
  );
}
