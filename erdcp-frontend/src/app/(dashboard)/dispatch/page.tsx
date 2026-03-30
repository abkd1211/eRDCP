'use client';
import { useState, lazy, Suspense } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Loader2, AlertTriangle, CheckCircle, Wifi, WifiOff } from 'lucide-react';
import { vehicleApi, incidentApi, simulationApi } from '@/lib/services';
import { useSocket } from '@/store/socket.store';
import { useAuth } from '@/store/auth.store';
import { IncidentTypeBadge, StatusBadge } from '@/components/ui';
import { formatEta, formatRelative, VEHICLE_TYPE_CONFIG, INCIDENT_CONFIG } from '@/lib/utils';
import type { VehicleLive, Incident } from '@/types';

const DispatchMap = lazy(() => import('@/components/map/DispatchMap'));

const TYPE_FILTERS = [
  { key: 'ALL',       label: 'All' },
  { key: 'AMBULANCE', label: 'Ambulance' },
  { key: 'POLICE',    label: 'Police' },
  { key: 'FIRE_TRUCK',label: 'Fire' },
];

export default function DispatchPage() {
  const { user } = useAuth();
  const { vehicles: liveVehicles, connected } = useSocket();
  const isAdmin = user?.role === 'SYSTEM_ADMIN';

  const [typeFilter, setTypeFilter]   = useState('ALL');
  const [showAll, setShowAll]         = useState(false);
  const [selectedVehicle, setSelV]    = useState<VehicleLive | null>(null);
  const [selectedIncident, setSelInc] = useState<Incident | null>(null);
  const [simSpeed, setSimSpeed]       = useState(1);
  const [blockageVehicleId, setBlockageId] = useState('');

  // Initial vehicle fetch (for position seeding — movement is all via socket after this)
  const { data: initialVehicles = [] } = useQuery({
    queryKey: ['vehicles-initial', user?.role],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (user?.role === 'HOSPITAL_ADMIN')     params.type = 'AMBULANCE';
      if (user?.role === 'POLICE_ADMIN')       params.type = 'POLICE';
      if (user?.role === 'FIRE_SERVICE_ADMIN') params.type = 'FIRE_TRUCK';
      return vehicleApi.list(params);
    },
    staleTime: Infinity, // never refetch — socket keeps it fresh
  });

  // Open incidents
  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents-open'],
    queryFn:  incidentApi.listOpen,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });

  // 1. Convert initial vehicles into the VehicleLive shape
  const baseVehicles: Record<string, VehicleLive> = {};
  initialVehicles.forEach((v) => {
    baseVehicles[v._id] = {
      vehicleId:   v._id,
      vehicleCode: v.vehicleCode,
      type:        v.type,
      driverName:  v.driverName,
      lat:         v.currentLocation.latitude,
      lng:         v.currentLocation.longitude,
      prevLat:     v.currentLocation.latitude,
      prevLng:     v.currentLocation.longitude,
      heading:     v.heading ?? 'N',
      headingDeg:  0,
      speedKmh:    v.speedKmh ?? 0,
      batteryPct:  v.batteryPct ?? null,
      etaSec:      null,
      deviation:   v.routeDeviation,
      arrived:     false,
      unresponsive:v.isUnresponsive,
      status:      v.status,
      incidentId:  v.currentIncidentId,
      lastUpdate:  Date.now(),
    };
  });

  // 2. Overlay live updates
  const mergedVehicles = { ...baseVehicles, ...liveVehicles };
  const allVehicles = Object.values(mergedVehicles);

  const MISSION_STATUSES = ['DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'RETURNING'];

  // 3. Filter for the MAP (Show assigned/active vehicles by default, all if toggled)
  let mapVehicles = (typeFilter === 'ALL' ? allVehicles : allVehicles.filter((v) => v.type === typeFilter));
  if (!showAll) {
    mapVehicles = mapVehicles.filter(v => MISSION_STATUSES.includes(v.status));
  }
  
  // 4. Filter for the SIDEBAR (Only show those on mission)
  const sidebarVehicles = allVehicles.filter(v => MISSION_STATUSES.includes(v.status));

  // Role-filtered incidents
  const filteredIncidents = incidents.filter((i) => {
    // 1. Role filter
    let roleOk = true;
    if (user?.role === 'HOSPITAL_ADMIN')     roleOk = i.incidentType === 'MEDICAL';
    else if (user?.role === 'POLICE_ADMIN')  roleOk = (i.incidentType === 'CRIME' || i.incidentType === 'ACCIDENT');
    else if (user?.role === 'FIRE_SERVICE_ADMIN') roleOk = i.incidentType === 'FIRE';

    if (!roleOk) return false;

    // 2. Tab filter (e.g. SYSTEM_ADMIN clicks "Fire")
    if (typeFilter === 'ALL') return true;
    if (typeFilter === 'AMBULANCE')  return i.incidentType === 'MEDICAL';
    if (typeFilter === 'POLICE')     return (i.incidentType === 'CRIME' || i.incidentType === 'ACCIDENT');
    if (typeFilter === 'FIRE_TRUCK') return i.incidentType === 'FIRE';

    return true;
  });

  // Simulation mutations
  const setSpeedMut = useMutation({
    mutationFn: (m: number) => simulationApi.setSpeed(m),
  });
  const blockageMut = useMutation({
    mutationFn: (id: string) => simulationApi.triggerBlockage(id),
  });

  const handleSpeedChange = (v: number) => {
    setSimSpeed(v);
    setSpeedMut.mutate(v);
  };

  const liveVehicle = selectedVehicle
    ? (liveVehicles[selectedVehicle.vehicleId] ?? selectedVehicle)
    : null;

  return (
    <div className="h-full flex" style={{ background: '#0A0C0F' }}>
      {/* Left panel */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: connected ? '#7CB518' : '#5A6370', display: 'inline-block' }} />
            <span className="text-xs font-mono" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
          <span className="text-xs ml-auto font-mono" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>
            {sidebarVehicles.length}v · {filteredIncidents.length}i
          </span>
        </div>

        {/* Type filter — SYSTEM_ADMIN only */}
        {isAdmin && (
          <div className="flex gap-1 p-2 border-b" style={{ borderColor: 'var(--border)' }}>
            {TYPE_FILTERS.map((f) => (
              <button key={f.key} onClick={() => setTypeFilter(f.key)}
                className="flex-1 py-1 rounded text-xs font-semibold transition-all"
                style={{
                  fontFamily: 'Syne, sans-serif',
                  background: typeFilter === f.key ? 'rgba(232,68,42,0.15)' : 'transparent',
                  color:      typeFilter === f.key ? '#E8442A' : 'var(--text-faint)',
                }}>
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Incident list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredIncidents.length === 0
            ? <p className="text-xs text-center py-10" style={{ color: 'var(--text-faint)' }}>No active incidents</p>
            : filteredIncidents.map((inc) => {
                const conf = INCIDENT_CONFIG[inc.incidentType];
                // Find vehicle assigned to this incident
                const vehicle = allVehicles.find((v) => v.incidentId === inc.id);
                return (
                  <button key={inc.id} onClick={() => setSelInc(inc)}
                    className="w-full text-left px-3 py-3 border-b transition-all"
                    style={{ borderColor: 'var(--border)', borderLeft: `2px solid ${conf.color}` }}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold" style={{ color: conf.color, fontFamily: 'Syne, sans-serif' }}>{conf.label}</span>
                      <StatusBadge status={inc.status} />
                    </div>
                    <p className="text-xs truncate mb-1" style={{ color: 'var(--text-muted)' }}>{inc.citizenName}</p>
                    {vehicle && vehicle.etaSec !== null && (
                      <p className="text-xs font-mono" style={{ color: '#E8442A', fontFamily: 'JetBrains Mono, monospace' }}>
                        ETA {formatEta(vehicle.etaSec)}
                      </p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{formatRelative(inc.createdAt)}</p>
                  </button>
                );
              })
          }
        </div>

        {/* Simulation controls — SYSTEM_ADMIN only */}
        {isAdmin && (
          <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
            <p className="label mb-2 flex items-center gap-1"><Zap size={10} />Sim Controls</p>
            <div className="mb-2">
              <div className="flex justify-between mb-1">
                <span className="label">Speed</span>
                <span className="text-xs font-mono" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#E8442A' }}>{simSpeed}x</span>
              </div>
              <input type="range" min={1} max={10} step={1} value={simSpeed}
                onChange={(e) => handleSpeedChange(+e.target.value)}
                className="w-full accent-ember" style={{ accentColor: '#E8442A' }} />
              <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>
                <span>1x</span><span>10x</span>
              </div>
            </div>
            <div>
              <label className="label block mb-1.5">Blockage — Vehicle ID</label>
              <div className="flex gap-1">
                <input value={blockageVehicleId} onChange={(e) => setBlockageId(e.target.value)}
                  className="input-base text-xs flex-1" placeholder="vehicle _id" />
                <button onClick={() => blockageMut.mutate(blockageVehicleId)} disabled={!blockageVehicleId || blockageMut.isPending}
                  className="btn btn-secondary text-xs px-2 py-1.5 flex-shrink-0"
                  style={{ borderColor: '#C97B1A', color: '#C97B1A' }}>
                  {blockageMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Map — takes all remaining space */}
      <div className="flex-1 relative overflow-hidden">
        <Suspense fallback={
          <div className="w-full h-full flex items-center justify-center" style={{ background: '#0A0C0F' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: '#E8442A' }} />
          </div>
        }>
          <DispatchMap
            vehicles={mapVehicles}
            incidents={filteredIncidents}
            onVehicleClick={(v) => { 
              setSelV(v); 
              setSelInc(null); 
              (window as any)._selectedVehicleId = v.vehicleId;
            }}
            onIncidentClick={(i) => { 
              setSelInc(i); 
              setSelV(null); 
              (window as any)._selectedVehicleId = null;
            }}
            vehicleTypeFilter={typeFilter}
          />

          {/* Map Overlay Controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            <button
              onClick={() => setShowAll(!showAll)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                showAll 
                  ? 'bg-blue-600 text-white border-blue-500 shadow-lg' 
                  : 'bg-[#1e2229]/80 text-[#9AA3AF] border-[#2e353f] hover:bg-[#2e353f] backdrop-blur-md'
              }`}
            >
              <Zap size={14} className={showAll ? 'fill-current' : ''} />
              {showAll ? 'Showing All Fleet' : 'Focus: Assigned Only'}
            </button>
          </div>
        </Suspense>

        {/* Connection status pill */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-mono z-10"
          style={{ background: 'rgba(17,18,20,0.9)', border: `1px solid ${connected ? 'rgba(124,181,24,0.4)' : 'rgba(232,68,42,0.4)'}`, fontFamily: 'JetBrains Mono, monospace', color: connected ? '#7CB518' : '#E8442A' }}>
          {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
          {connected ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>

      {/* Right panel — vehicle detail */}
      <AnimatePresence>
        {liveVehicle && (
          <motion.div
            key="vehicle-panel"
            initial={{ x: 320 }} animate={{ x: 0 }} exit={{ x: 320 }}
            transition={{ type: 'tween', duration: 0.22 }}
            className="w-72 flex-shrink-0 border-l overflow-y-auto"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>{liveVehicle.vehicleCode}</p>
                <p className="text-xs" style={{ color: VEHICLE_TYPE_CONFIG[liveVehicle.type]?.color ?? '#9AA3AF', fontFamily: 'Syne, sans-serif' }}>{liveVehicle.type.replace('_',' ')}</p>
              </div>
              <button onClick={() => setSelV(null)} className="btn-ghost p-1 rounded"><X size={15} /></button>
            </div>
            <div className="p-4 space-y-3">
              {liveVehicle.driverName && <div><p className="label mb-0.5">Driver</p><p className="text-sm">{liveVehicle.driverName}</p></div>}
              <div className="grid grid-cols-2 gap-3">
                <div><p className="label mb-0.5">Speed</p><p className="text-lg font-bold font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{liveVehicle.speedKmh.toFixed(0)} <span className="text-xs font-normal" style={{ color: 'var(--text-faint)' }}>km/h</span></p></div>
                <div><p className="label mb-0.5">Heading</p><p className="text-lg font-bold font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{liveVehicle.heading}</p></div>
              </div>

              {liveVehicle.etaSec !== null && (
                <div className="p-3 rounded-lg" style={{ background: 'rgba(232,68,42,0.08)', border: '1px solid rgba(232,68,42,0.2)' }}>
                  <p className="label mb-1">ETA to Scene</p>
                  <p className="text-2xl font-bold font-mono" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#E8442A' }}>{formatEta(liveVehicle.etaSec)}</p>
                </div>
              )}

              {liveVehicle.batteryPct !== null && (
                <div>
                  <p className="label mb-1.5">Battery</p>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-hi)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${liveVehicle.batteryPct}%`, background: liveVehicle.batteryPct < 20 ? '#E8442A' : liveVehicle.batteryPct < 50 ? '#C97B1A' : '#7CB518' }} />
                  </div>
                  <p className="text-xs font-mono mt-1" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-faint)' }}>{liveVehicle.batteryPct}%</p>
                </div>
              )}

              {liveVehicle.deviation && (
                <div className="flex items-center gap-2 p-2 rounded-lg text-xs" style={{ background: 'rgba(201,123,26,0.12)', color: '#C97B1A' }}>
                  <AlertTriangle size={13} /> Route deviation detected
                </div>
              )}
              {liveVehicle.arrived && (
                <div className="flex items-center gap-2 p-2 rounded-lg text-xs" style={{ background: 'rgba(124,181,24,0.12)', color: '#7CB518' }}>
                  <CheckCircle size={13} /> Arrived on scene
                </div>
              )}

              <div>
                <p className="label mb-1">Coordinates</p>
                <p className="text-xs font-mono" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-faint)' }}>
                  {liveVehicle.lat.toFixed(5)}, {liveVehicle.lng.toFixed(5)}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right panel — incident detail */}
      <AnimatePresence>
        {selectedIncident && !liveVehicle && (
          <motion.div
            key="incident-panel"
            initial={{ x: 320 }} animate={{ x: 0 }} exit={{ x: 320 }}
            transition={{ type: 'tween', duration: 0.22 }}
            className="w-72 flex-shrink-0 border-l overflow-y-auto"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <IncidentTypeBadge type={selectedIncident.incidentType} />
              <button onClick={() => setSelInc(null)} className="btn-ghost p-1 rounded"><X size={15} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div><p className="label mb-0.5">Caller</p><p className="text-sm">{selectedIncident.citizenName}</p></div>
              {selectedIncident.citizenPhone && <div><p className="label mb-0.5">Phone</p><p className="text-sm font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{selectedIncident.citizenPhone}</p></div>}
              {selectedIncident.address && <div><p className="label mb-0.5">Location</p><p className="text-sm">{selectedIncident.address}</p></div>}
              {selectedIncident.notes && <div><p className="label mb-0.5">Notes</p><p className="text-xs" style={{ color: 'var(--text-muted)' }}>{selectedIncident.notes}</p></div>}
              <div><p className="label mb-0.5">Status</p><StatusBadge status={selectedIncident.status} /></div>
              {selectedIncident.responder && <div><p className="label mb-0.5">Assigned Unit</p><p className="text-sm">{selectedIncident.responder.name}</p><p className="text-xs" style={{ color: 'var(--text-faint)' }}>{selectedIncident.responder.stationName}</p></div>}
              <div>
                <p className="label mb-2">Timeline</p>
                {(selectedIncident.statusHistory ?? []).map((h, i) => (
                  <div key={i} className="flex gap-2 text-xs mb-1.5">
                    <span className="font-mono" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>{new Date(h.changedAt).toLocaleTimeString()}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{h.oldStatus} → {h.newStatus}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
