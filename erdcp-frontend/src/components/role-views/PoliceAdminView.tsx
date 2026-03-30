'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Flame, Gauge, MapPin, Battery } from 'lucide-react';
import { responderApi, incidentApi, analyticsApi } from '@/lib/services';
import { StatCard, StatusBadge, IncidentTypeBadge } from '@/components/ui';
import { formatSec, formatRelative, formatEta } from '@/lib/utils';
import { useSocket } from '@/store/socket.store';
import type { Responder, ResponderStatus } from '@/types';

// ─── Police Admin ─────────────────────────────────────────────────────────────
export function PoliceAdminView() {
  const qc = useQueryClient();
  const { data: units = [] } = useQuery({ queryKey: ['responders','POLICE','own'], queryFn: () => responderApi.list({ type: 'POLICE', ownOnly: true }) });
  const { data: incidents = [] } = useQuery({ queryKey: ['incidents-open'], queryFn: incidentApi.listOpen, refetchInterval: 20_000 });
  const updateAvail = useMutation({ mutationFn: ({ id, status }: { id: string; status: ResponderStatus }) => responderApi.updateAvailability(id, status), onSuccess: () => qc.invalidateQueries({ queryKey: ['responders'] }) });

  const myInc = incidents.filter((i) => i.incidentType === 'CRIME' || i.incidentType === 'ACCIDENT');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(26,184,200,0.1)', border: '1px solid rgba(26,184,200,0.2)' }}>
        <Shield size={14} style={{ color: '#1AB8C8' }} />
        <p className="text-xs font-semibold" style={{ color: '#1AB8C8', fontFamily: 'Syne, sans-serif' }}>Police Administrator — Crime &amp; Accident incidents</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Crime Incidents"     value={incidents.filter(i => i.incidentType==='CRIME').length}    accentColor="#1AB8C8" />
        <StatCard label="Accident Incidents"  value={incidents.filter(i => i.incidentType==='ACCIDENT').length} accentColor="#C97B1A" />
        <StatCard label="Units Available"     value={units.filter(u => u.status==='AVAILABLE').length}          accentColor="#1AB8C8" />
        <StatCard label="Total Units"         value={units.length}                                              accentColor="#9AA3AF" />
      </div>
      <div className="card">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}><p className="label">Police Units</p></div>
        {units.length === 0 ? <p className="px-4 py-8 text-center text-xs" style={{ color: 'var(--text-faint)' }}>No units registered</p>
          : units.map((r: Responder) => (
            <div key={r.id} className="px-4 py-3 border-b last:border-b-0 flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--border)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{r.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{r.stationName}</p>
              </div>
              <StatusBadge status={r.status} />
              {r.status !== 'BUSY' && (
                <button 
                  onClick={() => {
                    console.log('Toggling police unit status:', r.id, r.status);
                    updateAvail.mutate({ id: r.id, status: r.status === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE' });
                  }}
                  disabled={updateAvail.isPending}
                  className="btn btn-secondary text-xs px-3 py-1.5 active:scale-95 transition-all"
                >
                  {updateAvail.isPending && updateAvail.variables?.id === r.id ? '...' : (r.status === 'AVAILABLE' ? 'Set Offline' : 'Set Available')}
                </button>
              )}
            </div>
          ))
        }
      </div>
      <div className="card">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}><p className="label">Active Incidents</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Type','Caller','Status','Time'].map(h => <th key={h} className="px-4 py-2 text-left label">{h}</th>)}
            </tr></thead>
            <tbody>
              {myInc.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: 'var(--text-faint)' }}>No active incidents</td></tr>
                : myInc.map(i => (
                  <tr key={i.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-2"><IncidentTypeBadge type={i.incidentType} /></td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{i.citizenName}</td>
                    <td className="px-4 py-2"><StatusBadge status={i.status} /></td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-faint)' }}>{formatRelative(i.createdAt)}</td>
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

export default PoliceAdminView;
