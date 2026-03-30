'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Flame, Shield, Truck, AlertTriangle } from 'lucide-react';
import { responderApi, incidentApi } from '@/lib/services';
import { StatCard, StatusBadge, IncidentTypeBadge } from '@/components/ui';
import { formatRelative } from '@/lib/utils';
import type { Responder, ResponderStatus } from '@/types';

export default function FireAdminView() {
  const qc = useQueryClient();
  const { data: trucks = [], isLoading: tLoading } = useQuery({ 
    queryKey: ['responders','FIRE_TRUCK','own'], 
    queryFn: () => responderApi.list({ type: 'FIRE_TRUCK', ownOnly: true }) 
  });
  const { data: incidents = [] } = useQuery({ 
    queryKey: ['incidents-open'], 
    queryFn: incidentApi.listOpen, 
    refetchInterval: 20_000 
  });
  
  const updateAvail = useMutation({ 
    mutationFn: ({ id, status }: { id: string; status: ResponderStatus }) => 
      callUpdateAvail(id, status), 
    onSuccess: () => qc.invalidateQueries({ queryKey: ['responders'] }) 
  });

  async function callUpdateAvail(id: string, status: ResponderStatus) {
    return responderApi.updateAvailability(id, status);
  }

  const fireInc = incidents.filter((i) => i.incidentType === 'FIRE');
  const activeFires = fireInc.filter((i) => i.status !== 'RESOLVED' && i.status !== 'CANCELLED');

  return (
    <div className="p-6 space-y-6">
      {/* High priority alert if fires are active */}
      {activeFires.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border animate-pulse" 
          style={{ background: 'rgba(232,68,42,0.15)', borderColor: 'rgba(232,68,42,0.4)' }}>
          <div className="w-10 h-10 rounded-full bg-[#E8442A]/20 flex items-center justify-center">
            <Flame size={20} style={{ color: '#E8442A' }} />
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wide" style={{ color: '#E8442A', fontFamily: 'Syne, sans-serif' }}>
              {activeFires.length} CRITICAL FIRE EVENT{activeFires.length > 1 ? 'S' : ''}
            </p>
            <p className="text-xs text-[#E8442A]/80">Immediate intervention required. All fire trucks are being monitored.</p>
          </div>
        </div>
      )}

      {/* Hero Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Fire Incidents"  value={fireInc.length}       accentColor="#E8442A" icon={<Flame size={18}/>} />
        <StatCard label="Active Fires"    value={activeFires.length}  accentColor="#E8442A" icon={<AlertTriangle size={18}/>} />
        <StatCard label="Trucks Ready"   value={trucks.filter(t => t.status==='AVAILABLE').length} accentColor="#7CB518" icon={<Truck size={18}/>} />
        <StatCard label="Total Fleet"     value={trucks.length}       accentColor="#9AA3AF" loading={tLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fleet Management */}
        <div className="card">
          <div className="px-4 py-3 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
            <p className="label font-bold">Fire Truck Units</p>
            <span className="text-[10px] font-mono text-slate-500 uppercase">Station Management</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {trucks.length === 0 ? (
              <p className="px-4 py-12 text-center text-xs opacity-40">No fire trucks registered to your station</p>
            ) : (
              trucks.map((r: Responder) => (
                <div key={r.id} className="px-4 py-4 border-b last:border-b-0 flex items-center gap-4 hover:bg-white/[0.02] transition-colors" style={{ borderColor: 'var(--border)' }}>
                  <div className="w-8 h-8 rounded bg-[#E8442A]/10 flex items-center justify-center">
                    <Truck size={16} style={{ color: '#E8442A' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ fontFamily: 'Syne, sans-serif' }}>{r.name}</p>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">{r.stationName}</p>
                  </div>
                  <StatusBadge status={r.status} />
                  {r.status !== 'BUSY' && (
                    <button 
                      onClick={() => {
                        console.log('Toggling responder status:', r.id, r.status);
                        updateAvail.mutate({ id: r.id, status: r.status === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE' });
                      }} 
                      disabled={updateAvail.isPending}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-[#2e353f] hover:bg-[#2e353f] transition-all min-w-[80px] active:scale-95"
                    >
                      {updateAvail.isPending && updateAvail.variables?.id === r.id ? '...' : (r.status === 'AVAILABLE' ? 'TAKE OFFLINE' : 'SET AVAILABLE')}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Incidents Table */}
        <div className="card">
          <div className="px-4 py-3 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
            <p className="label font-bold">Active Fire Incidents</p>
            <Shield size={14} className="text-slate-500" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/[0.02]" style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Caller','Location','Status','Time'].map(h => (
                    <th key={h} className="px-4 py-3 text-left label font-bold text-[10px] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeFires.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center opacity-40">All fires resolved. Monitoring for new reports.</td></tr>
                ) : (
                  activeFires.map(i => (
                    <tr key={i.id} className="border-b last:border-b-0 hover:bg-white/[0.01] transition-colors" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-3 font-semibold">{i.citizenName}</td>
                      <td className="px-4 py-3">
                        <p className="truncate max-w-[120px]">{i.address || 'Coordinates provided'}</p>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                      <td className="px-4 py-3 text-slate-500 font-mono">{formatRelative(i.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
