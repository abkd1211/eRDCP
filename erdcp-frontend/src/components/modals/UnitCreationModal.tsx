'use client';
import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, Loader2, Ambulance, Building2, MapPin, User, Hash, Phone } from 'lucide-react';
import { vehicleApi, responderApi, authApi } from '@/lib/services';
import type { ResponderType } from '@/types';

interface Props {
  isOpen:    boolean;
  onClose:   () => void;
  role:      string;
  stationId?: string; // If creating for a specific hospital
}

export default function UnitCreationModal({ isOpen, onClose, role, stationId }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'VEHICLE' | 'STATION'>(role === 'SYSTEM_ADMIN' ? 'STATION' : 'VEHICLE');
  const [error, setError] = useState('');

  // Form states for Vehicle
  const [vCode, setVCode]   = useState('');
  const [vType, setVType]   = useState('AMBULANCE');
  const [vStation, setVStation] = useState(stationId ?? '');
  const [vDriver, setVDriver]   = useState('');
  
  // Form states for Station
  const [sName, setSName]   = useState('');
  const [sType, setSType]   = useState<ResponderType>('AMBULANCE');
  const [sPhone, setSPhone] = useState('');
  const [sLat, setSLat]     = useState('5.6037'); // Default Accra
  const [sLng, setSLng]     = useState('-0.1870');

  const { data: stations } = useQuery({ 
    queryKey: ['responders-all'], 
    queryFn: () => responderApi.list(),
    enabled: isOpen && tab === 'VEHICLE'
  });

  const { data: drivers } = useQuery({
    queryKey: ['users-drivers'],
    queryFn: () => authApi.listUsers(1, 100),
    enabled: isOpen && tab === 'VEHICLE'
  });

  const regVehicle = useMutation({
    mutationFn: vehicleApi.register,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
      qc.invalidateQueries({ queryKey: ['responders'] });
      onClose();
    },
    onError: (e: any) => setError(e.response?.data?.message ?? 'Failed to register vehicle')
  });

  const addStation = useMutation({
    mutationFn: responderApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['responders-all'] });
      onClose();
    },
    onError: (e: any) => setError(e.response?.data?.message ?? 'Failed to add station')
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (tab === 'VEHICLE') {
      const selSvc = stations?.find(s => s.id === vStation);
      const selDrv = drivers?.users.find(u => u.id === vDriver);
      
      if (!vStation || !vDriver) {
        setError('Please select a station and a driver');
        return;
      }

      regVehicle.mutate({
        vehicleCode: vCode,
        type: vType,
        stationId: vStation,
        stationName: selSvc?.name ?? 'Unknown Station',
        incidentServiceId: vStation,
        driverUserId: vDriver,
        driverName: selDrv?.name ?? 'Unknown Driver',
        latitude:  parseFloat(sLat),
        longitude: parseFloat(sLng)
      });
    } else {
        addStation.mutate({
        name: sName,
        type: sType,
        stationName: sName,
        latitude: parseFloat(sLat),
        longitude: parseFloat(sLng),
        phone: sPhone,
        capacity: sType === 'AMBULANCE' ? 50 : undefined
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="card w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <h3 className="font-bold text-lg leading-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
              {tab === 'VEHICLE' ? 'Register New Unit' : 'Setup New Station'}
            </h3>
            <p className="text-xs text-white/50 mt-1">Populate emergency response infrastructure</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={18}/></button>
        </div>

        {role === 'SYSTEM_ADMIN' && (
          <div className="flex p-1 bg-white/5 mx-5 mt-5 rounded-lg border border-white/5">
            <button type="button" onClick={() => setTab('STATION')} 
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${tab === 'STATION' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}>
              Station / Branch
            </button>
            <button type="button" onClick={() => setTab('VEHICLE')} 
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${tab === 'VEHICLE' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}>
              Vehicle / Unit
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs">{error}</div>}

          {tab === 'VEHICLE' ? (
            <>
              <div>
                <label className="label block mb-1.5 flex items-center gap-2"><Hash size={12}/>Vehicle Code</label>
                <input required value={vCode} onChange={e => setVCode(e.target.value)} className="input-base" placeholder="e.g. AMB-ACC-01" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label block mb-1.5 flex items-center gap-2"><Ambulance size={12}/>Unit Type</label>
                  <select value={vType} onChange={e => setVType(e.target.value)} className="input-base">
                    <option value="AMBULANCE">Ambulance</option>
                    <option value="POLICE">Police Cruiser</option>
                    <option value="FIRE_TRUCK">Fire Truck</option>
                  </select>
                </div>
                <div>
                  <label className="label block mb-1.5 flex items-center gap-2"><Building2 size={12}/>Parent Station</label>
                  <select required value={vStation} onChange={e => setVStation(e.target.value)} className="input-base">
                    <option value="">Select Station</option>
                    {stations?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label block mb-1.5 flex items-center gap-2"><User size={12}/>Assigned Driver</label>
                <select required value={vDriver} onChange={e => setVDriver(e.target.value)} className="input-base">
                  <option value="">Select Driver</option>
                  {drivers?.users.filter(u => u.role === 'AMBULANCE_DRIVER').map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label block mb-1.5 flex items-center gap-2"><Building2 size={12}/>Station / Hospital Name</label>
                <input required value={sName} onChange={e => setSName(e.target.value)} className="input-base" placeholder="e.g. Korle-Bu Teaching Hospital" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label block mb-1.5 flex items-center gap-2"><Ambulance size={12}/>Type</label>
                  <select value={sType} onChange={e => setSType(e.target.value as ResponderType)} className="input-base">
                    <option value="AMBULANCE">Hospital / Ambulance Base</option>
                    <option value="POLICE">Police Station</option>
                    <option value="FIRE_TRUCK">Fire Station</option>
                  </select>
                </div>
                <div>
                  <label className="label block mb-1.5 flex items-center gap-2"><Phone size={12}/>Contact Phone</label>
                  <input value={sPhone} onChange={e => setSPhone(e.target.value)} className="input-base" placeholder="+233..." />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="label block mb-1.5 flex items-center gap-2"><MapPin size={12}/>Initial GPS Location (Lat/Lng)</label>
            <div className="grid grid-cols-2 gap-3">
              <input required type="number" step="any" value={sLat} onChange={e => setSLat(e.target.value)} className="input-base" placeholder="Latitude" />
              <input required type="number" step="any" value={sLng} onChange={e => setSLng(e.target.value)} className="input-base" placeholder="Longitude" />
            </div>
          </div>

          <button 
            disabled={regVehicle.isPending || addStation.isPending}
            className="w-full mt-2 py-3 bg-white text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-white/90 transition-all disabled:opacity-50"
            style={{ fontFamily: 'Syne, sans-serif' }}
          >
            {(regVehicle.isPending || addStation.isPending) ? <Loader2 size={18} className="animate-spin" /> : null}
            {tab === 'VEHICLE' ? 'Register Unit' : 'Create Station'}
          </button>
        </form>
      </div>
    </div>
  );
}
