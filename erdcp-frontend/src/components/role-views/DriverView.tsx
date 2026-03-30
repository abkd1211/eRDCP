'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Gauge, MapPin, Battery, Navigation, CheckCircle, Clock, Phone, User, FileText } from 'lucide-react';
import { incidentApi } from '@/lib/services';
import { StatCard, StatusBadge, IncidentTypeBadge } from '@/components/ui';
import { formatSec, formatEta, formatRelative, priorityLabel, priorityColor } from '@/lib/utils';
import { useSocket } from '@/store/socket.store';
import { useAuth } from '@/store/auth.store';
import { useState, useEffect } from 'react';

export default function DriverView() {
  const { user } = useAuth();
  const { vehicles } = useSocket();
  const qc = useQueryClient();

  // Find the vehicle assigned to this driver
  const myVehicle = Object.values(vehicles).find(v => v.driverUserId === user?.id);

  // Fetch incident details if assigned
  const { data: incident, isLoading: incLoading } = useQuery({
    queryKey: ['incident', myVehicle?.incidentId],
    queryFn: () => incidentApi.getById(myVehicle!.incidentId!),
    enabled: !!myVehicle?.incidentId,
    refetchInterval: 10_000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: any; note?: string }) => 
      incidentApi.updateStatus(id, status, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incident'] }),
  });

  if (!myVehicle) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] p-6 opacity-60">
        <Navigation size={48} className="mb-4 text-blue-500 animate-pulse" />
        <h2 className="text-xl font-bold mb-2">No Vehicle Linked</h2>
        <p className="text-sm text-center max-w-xs text-slate-400">
          You are currently not linked to an active emergency vehicle. 
          Please contact dispatch if this is an error.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Driver Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
            <User size={20} className="text-blue-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{user?.name}</h1>
            <p className="text-xs text-slate-400 font-mono">{myVehicle.vehicleCode} • {myVehicle.type}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={myVehicle.status} />
        </div>
      </div>

      {/* Telemetry Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Live Speed" value={`${Math.round(myVehicle.speedKmh)} km/h`} icon={<Gauge size={16}/>} accentColor="#1AB8C8" />
        <StatCard label="Battery" value={myVehicle.batteryPct !== null ? `${myVehicle.batteryPct}%` : '--'} icon={<Battery size={16}/>} accentColor={myVehicle.batteryPct !== null && myVehicle.batteryPct < 20 ? '#E8442A' : '#7CB518'} />
        <StatCard label="Heading" value={myVehicle.heading} icon={<Navigation size={16}/>} accentColor="#9AA3AF" />
        <StatCard label="Est. Arrival" value={formatEta(myVehicle.etaSec)} icon={<Clock size={16}/>} accentColor="#E8442A" />
      </div>

      {/* Main Mission Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assignment Ticket */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card overflow-hidden" style={{ borderTop: `4px solid ${incident ? priorityColor(incident.priority) : '#2e353f'}` }}>
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-bold">Current Mission</p>
                  <h3 className="text-xl font-bold flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif' }}>
                    {incident ? incident.incidentType : 'Waiting for dispatch...'}
                    {incident && <IncidentTypeBadge type={incident.incidentType} />}
                  </h3>
                </div>
                {incident && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-bold">Priority</p>
                    <p className="text-sm font-bold" style={{ color: priorityColor(incident.priority) }}>
                      {priorityLabel(incident.priority)}
                    </p>
                  </div>
                )}
              </div>

              {!incident ? (
                <div className="py-12 text-center opacity-40">
                  <MapPin size={32} className="mx-auto mb-3" />
                  <p className="text-sm italic">Standing by for next assignment</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Incident Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <User size={16} className="text-slate-500 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Citizen</p>
                          <p className="text-sm font-medium">{incident.citizenName}</p>
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <Phone size={10} /> {incident.citizenPhone || 'No phone provided'}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <MapPin size={16} className="text-slate-500 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Location</p>
                          <p className="text-sm font-medium">{incident.address || 'GPS Coordinates Provided'}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <FileText size={16} className="text-slate-500 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Notes</p>
                          <p className="text-sm text-slate-300 leading-relaxed italic">
                            "{incident.notes || 'No specific notes provided'}"
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 border-t border-white/5 flex flex-wrap gap-3">
                    {incident.status === 'DISPATCHED' && (
                      <button 
                        onClick={() => updateStatus.mutate({ id: incident.id, status: 'IN_PROGRESS', note: 'Driver acknowledged and en-route' })}
                        disabled={updateStatus.isPending}
                        className="btn btn-primary flex-1 py-3 h-auto flex flex-col items-center gap-1"
                      >
                        <Navigation size={18} />
                        <span>Acknowledge & En-Route</span>
                      </button>
                    )}
                    {incident.status === 'IN_PROGRESS' && (
                      <button 
                        onClick={() => updateStatus.mutate({ id: incident.id, status: 'IN_PROGRESS', note: 'Arrived at scene' })} 
                        disabled={updateStatus.isPending}
                        className="btn bg-[#7CB518] text-[#0A0C0F] hover:bg-[#8dcc1c] flex-1 py-3 h-auto flex flex-col items-center gap-1"
                      >
                        <MapPin size={18} />
                        <span>Arrived at Scene</span>
                      </button>
                    )}
                    {(incident.status === 'IN_PROGRESS' || incident.status === 'DISPATCHED') && (
                      <button 
                        onClick={() => updateStatus.mutate({ id: incident.id, status: 'RESOLVED', note: 'Incident resolved by responder' })}
                        disabled={updateStatus.isPending}
                        className="btn btn-secondary flex-1 py-3 h-auto flex flex-col items-center gap-1"
                      >
                        <CheckCircle size={18} />
                        <span>Resolve Incident</span>
                      </button>
                    )}
                    {myVehicle.status === 'RETURNING' && (
                      <div className="flex-1 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
                        <Navigation size={24} className="mx-auto mb-2 text-blue-500 animate-bounce" />
                        <p className="text-sm font-bold text-blue-500">MISSION COMPLETE</p>
                        <p className="text-[10px] text-blue-500/70 uppercase">Returning to station base...</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          <div className="card p-5">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Mission History</h4>
            <div className="space-y-4">
              {incident?.statusHistory?.slice(0, 3).map((h, i) => (
                <div key={i} className="flex gap-3 relative">
                  {i < 2 && <div className="absolute left-1.5 top-5 bottom-0 w-[1px] bg-white/5" />}
                  <CheckCircle size={12} className="mt-1 text-slate-500" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-tight">{h.newStatus}</p>
                    <p className="text-[10px] text-slate-500">{formatRelative(h.changedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
