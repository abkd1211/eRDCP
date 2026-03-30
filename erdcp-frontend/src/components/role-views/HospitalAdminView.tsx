'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ambulance, Edit2, Loader2 } from 'lucide-react';
import { responderApi, analyticsApi, incidentApi } from '@/lib/services';
import { StatCard, StatusBadge } from '@/components/ui';
import { formatSec, formatRelative } from '@/lib/utils';
import type { Responder, ResponderStatus } from '@/types';

export default function HospitalAdminView() {
  const qc = useQueryClient();
  const { data: responders = [], isLoading: rLoading } = useQuery({
    queryKey: ['responders', 'AMBULANCE', 'own'],
    queryFn: () => responderApi.list({ type: 'AMBULANCE', ownOnly: true }),
  });
  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents-open'],
    queryFn: incidentApi.listOpen,
    refetchInterval: 20_000,
  });
  const { data: dash } = useQuery({ queryKey: ['analytics-dashboard'], queryFn: analyticsApi.getDashboard });

  const [editId, setEditId]     = useState<string | null>(null);
  const [beds, setBeds]         = useState({ total: 0, available: 0 });

  const updateAvail = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ResponderStatus }) =>
      responderApi.updateAvailability(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['responders'] }),
  });
  const updateCap = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      responderApi.updateCapacity(id, beds.total, beds.available),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['responders'] }); setEditId(null); },
  });

  const medInc = incidents.filter((i) => i.incidentType === 'MEDICAL');
  const available = responders.filter((r) => r.status === 'AVAILABLE').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(124,181,24,0.1)', border: '1px solid rgba(124,181,24,0.2)' }}>
        <Ambulance size={14} style={{ color: '#7CB518' }} />
        <p className="text-xs font-semibold" style={{ color: '#7CB518', fontFamily: 'Syne, sans-serif' }}>Hospital Administrator — Medical incidents only</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Medical Incidents" value={medInc.length} accentColor="#7CB518" />
        <StatCard label="Ambulances Available" value={available} accentColor="#7CB518" />
        <StatCard label="Total Units" value={responders.length} accentColor="#1AB8C8" loading={rLoading} />
        <StatCard label="Avg Response" value={formatSec(dash?.avgResponseSec ?? 0)} accentColor="#7CB518" />
      </div>

      {/* Fleet panel */}
      <div className="card">
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <p className="label">Ambulance Fleet</p>
        </div>
        {responders.length === 0
          ? <p className="px-4 py-8 text-center text-xs" style={{ color: 'var(--text-faint)' }}>No units registered yet</p>
          : responders.map((r: Responder) => (
            <div key={r.id} className="px-4 py-3 border-b last:border-b-0 flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--border)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{r.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{r.stationName}</p>
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {r.capacity} beds available
                </p>
              </div>
              <StatusBadge status={r.status} />
              {r.status !== 'BUSY' && (
                <button 
                  onClick={() => {
                    console.log('Toggling hospital responder status:', r.id, r.status);
                    updateAvail.mutate({ id: r.id, status: r.status === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE' });
                  }}
                  disabled={updateAvail.isPending}
                  className="btn btn-secondary text-xs px-3 py-1.5 active:scale-95 transition-all"
                >
                  {updateAvail.isPending && updateAvail.variables?.id === r.id ? '...' : (r.status === 'AVAILABLE' ? 'Set Offline' : 'Set Available')}
                </button>
              )}
              <button onClick={() => { setEditId(r.id); setBeds({ total: r.capacity, available: r.capacity }); }}
                className="btn btn-ghost p-2"><Edit2 size={13} /></button>
            </div>
          ))
        }
      </div>

      {/* Bed capacity editor modal */}
      {editId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="card p-5 w-72" style={{ borderTop: '2px solid #7CB518' }}>
            <p className="font-bold text-sm mb-4" style={{ fontFamily: 'Syne, sans-serif' }}>Update Bed Capacity</p>
            <div className="space-y-3">
              <div>
                <label className="label block mb-1.5">Total Beds</label>
                <input type="number" value={beds.total} onChange={(e) => setBeds((b) => ({ ...b, total: +e.target.value }))} className="input-base" />
              </div>
              <div>
                <label className="label block mb-1.5">Available Beds</label>
                <input type="number" value={beds.available} onChange={(e) => setBeds((b) => ({ ...b, available: +e.target.value }))} className="input-base" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditId(null)} className="btn btn-ghost flex-1">Cancel</button>
              <button onClick={() => updateCap.mutate({ id: editId })} disabled={updateCap.isPending} className="btn btn-primary flex-1">
                {updateCap.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent medical incidents */}
      <div className="card">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <p className="label">Medical Incidents</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Caller','Status','Time','Responder'].map((h) => <th key={h} className="px-4 py-2 text-left label">{h}</th>)}
            </tr></thead>
            <tbody>
              {medInc.length === 0
                ? <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: 'var(--text-faint)' }}>No active medical incidents</td></tr>
                : medInc.map((i) => (
                  <tr key={i.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{i.citizenName}</td>
                    <td className="px-4 py-2"><StatusBadge status={i.status} /></td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-faint)' }}>{formatRelative(i.createdAt)}</td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{i.responder?.name ?? '—'}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
