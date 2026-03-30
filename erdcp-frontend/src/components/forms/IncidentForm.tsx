'use client';
import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, MapPin, Search, Loader2, AlertTriangle, Link2 } from 'lucide-react';
import { incidentApi } from '@/lib/services';
import { INCIDENT_CONFIG } from '@/lib/utils';
import type { IncidentType, NearbyIncident } from '@/types';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
const TYPES: IncidentType[] = ['MEDICAL','FIRE','CRIME','ACCIDENT','OTHER'];

const schema = z.object({
  citizenName:  z.string().min(1, 'Caller name is required'),
  citizenPhone: z.string().optional(),
  incidentType: z.enum(['MEDICAL','FIRE','CRIME','ACCIDENT','OTHER'] as const),
  priority:     z.number().min(1).max(3),
  notes:        z.string().optional(),
  latitude:     z.number({ required_error: 'Click on the map to set location' }),
  longitude:    z.number({ required_error: 'Click on the map to set location' }),
  address:      z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props { onClose: () => void; onSuccess: () => void; }

export default function IncidentForm({ onClose, onSuccess }: Props) {
  const [step, setStep]         = useState(0);
  const [nearbyAlert, setNearby]= useState<NearbyIncident | null>(null);
  const [submitting, setSubmit] = useState(false);
  const [error, setError]       = useState('');
  const [searchQuery, setSearch]= useState('');
  const [suggestions, setSugg]  = useState<Array<{ place_name: string; center: [number, number] }>>([]);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { incidentType: 'MEDICAL', priority: 1 },
  });

  const [lat, lng] = [watch('latitude'), watch('longitude')];
  const selectedType = watch('incidentType');

  // Init map on step 2
  useEffect(() => {
    if (step !== 2 || !mapRef.current || !MAPBOX_TOKEN || mapInstance.current) return;

    const timer = setTimeout(() => {
      import('mapbox-gl').then((mod) => {
        const mapboxgl = mod.default as unknown as { accessToken: string; Map: new (o: unknown) => mapboxgl.Map; Marker: new (o?: unknown) => mapboxgl.Marker };
        mapboxgl.accessToken = MAPBOX_TOKEN;

        const map = new mapboxgl.Map({
          container: mapRef.current!,
          style:  'mapbox://styles/mapbox/streets-v12',
          center: [-0.187, 5.603],
          zoom: 12,
          attributionControl: false,
        });
        mapInstance.current = map;

        map.on('click', (e: { lngLat: { lat: number; lng: number } }) => {
          const { lat, lng } = e.lngLat;
          setValue('latitude',  lat,  { shouldValidate: true });
          setValue('longitude', lng,  { shouldValidate: true });

          if (markerRef.current) markerRef.current.setLngLat([lng, lat]);
          else {
            const marker = new mapboxgl.Marker({ color: '#E8442A' }).setLngLat([lng, lat]).addTo(map);
            markerRef.current = marker;
          }

          // Reverse geocode
          fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}`)
            .then((r) => r.json())
            .then((d) => {
              const place = d.features?.[0]?.place_name;
              if (place) setValue('address', place);
            }).catch(() => {});

          // Check nearby
          incidentApi.getNearby(lat, lng, 200).then((nearby) => {
            setNearby(nearby[0] ?? null);
          }).catch(() => {});
        });
      });
    }, 150);

    return () => {
      clearTimeout(timer);
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        markerRef.current = null;
      }
    };
  }, [step, setValue]);

  // Geocoding search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) { setSugg([]); return; }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?country=gh&access_token=${MAPBOX_TOKEN}&limit=5`);
        const d = await r.json();
        setSugg(d.features?.map((f: { place_name: string; center: [number, number] }) => ({
          place_name: f.place_name,
          center:     f.center,
        })) ?? []);
      } catch { setSugg([]); }
    }, 400);
  }, [searchQuery]);

  const selectSuggestion = (s: { place_name: string; center: [number, number] }) => {
    const [sLng, sLat] = s.center;
    setValue('latitude', sLat, { shouldValidate: true });
    setValue('longitude', sLng, { shouldValidate: true });
    setValue('address', s.place_name);
    setSearch(s.place_name);
    setSugg([]);
    mapInstance.current?.flyTo({ center: [sLng, sLat], zoom: 15 });
    if (markerRef.current) markerRef.current.setLngLat([sLng, sLat]);
    else {
      import('mapbox-gl').then((mod) => {
        const mapboxgl = mod.default as unknown as { Marker: new (o?: unknown) => mapboxgl.Marker };
        const marker = new mapboxgl.Marker({ color: '#E8442A' }).setLngLat([sLng, sLat]).addTo(mapInstance.current!);
        markerRef.current = marker;
      });
    }
    incidentApi.getNearby(sLat, sLng, 200).then((nearby) => { setNearby(nearby[0] ?? null); }).catch(() => {});
  };

  const onSubmit = async (data: FormData) => {
    setSubmit(true); setError('');
    try {
      await incidentApi.create(data);
      onSuccess();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create incident');
      setSubmit(false);
    }
  };

  const STEPS = ['Caller', 'Details', 'Location', 'Review'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="card w-full flex flex-col"
        style={{ maxWidth: 540, maxHeight: '92vh', borderTop: '2px solid #E8442A' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>New Incident Report</h2>
          <button onClick={onClose} className="btn-ghost p-1 rounded"><X size={16} /></button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-0 px-5 pt-4 flex-shrink-0">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    background: i === step ? '#E8442A' : i < step ? 'rgba(124,181,24,0.2)' : 'var(--surface-hi)',
                    color: i === step ? '#fff' : i < step ? '#7CB518' : 'var(--text-faint)',
                  }}>{i + 1}</div>
                <span className="text-xs hidden sm:block" style={{ fontFamily: 'Syne, sans-serif', color: i === step ? 'var(--text)' : 'var(--text-faint)', fontWeight: i === step ? 600 : 400 }}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className="w-6 h-px mx-1" style={{ background: 'var(--border-strong)' }} />}
            </div>
          ))}
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Step 0 — Caller */}
            {step === 0 && (
              <div className="space-y-4 animate-fade-up">
                <div>
                  <label className="label block mb-1.5">Caller Name *</label>
                  <input {...register('citizenName')} className="input-base" placeholder="e.g. Kofi Mensah" />
                  {errors.citizenName && <p className="text-xs mt-1" style={{ color: '#E8442A' }}>{errors.citizenName.message}</p>}
                </div>
                <div>
                  <label className="label block mb-1.5">Caller Phone</label>
                  <input {...register('citizenPhone')} className="input-base" placeholder="+233 24 123 4567" />
                </div>
              </div>
            )}

            {/* Step 1 — Details */}
            {step === 1 && (
              <div className="space-y-4 animate-fade-up">
                <div>
                  <label className="label block mb-2">Incident Type *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TYPES.map((t) => {
                      const c = INCIDENT_CONFIG[t];
                      return (
                        <button key={t} type="button"
                          onClick={() => setValue('incidentType', t)}
                          className="p-3 rounded-lg border-2 text-left transition-all"
                          style={{
                            borderColor: selectedType === t ? c.color : 'var(--border)',
                            background:  selectedType === t ? c.bg : 'var(--surface-hi)',
                          }}>
                          <p className="text-sm font-semibold" style={{ color: c.color, fontFamily: 'Syne, sans-serif' }}>{c.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="label block mb-2">Priority</label>
                  <div className="flex gap-2">
                    {[{ v: 1, l: 'Normal', c: '#9AA3AF' }, { v: 2, l: 'High', c: '#C97B1A' }, { v: 3, l: 'Critical', c: '#E8442A' }].map((p) => (
                      <button key={p.v} type="button"
                        onClick={() => setValue('priority', p.v)}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all border"
                        style={{
                          fontFamily: 'Syne, sans-serif',
                          borderColor: watch('priority') === p.v ? p.c : 'var(--border)',
                          background:  watch('priority') === p.v ? `${p.c}18` : 'var(--surface-hi)',
                          color:       watch('priority') === p.v ? p.c : 'var(--text-muted)',
                        }}>{p.l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label block mb-1.5">Notes</label>
                  <textarea {...register('notes')} rows={3} className="input-base resize-none" placeholder="Describe the emergency..." />
                </div>
              </div>
            )}

            {/* Step 2 — Location */}
            {step === 2 && (
              <div className="space-y-3 animate-fade-up">
                {/* Search bar */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
                  <input value={searchQuery} onChange={(e) => setSearch(e.target.value)}
                    className="input-base pl-9" placeholder="Search location in Ghana..." />
                  {suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 card-hi z-10 overflow-hidden">
                      {suggestions.map((s, i) => (
                        <button key={i} type="button" onClick={() => selectSuggestion(s)}
                          className="w-full text-left px-3 py-2 text-xs hover:opacity-70 transition-opacity border-b last:border-b-0"
                          style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                          <MapPin size={11} className="inline mr-1.5" style={{ color: '#E8442A' }} />
                          {s.place_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Map */}
                <div ref={mapRef} style={{ width: '100%', height: 280, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }} />
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  <MapPin size={11} className="inline mr-1" /> Click on the map to place the incident pin
                </p>
                {errors.latitude && <p className="text-xs" style={{ color: '#E8442A' }}>{errors.latitude.message}</p>}

                {lat && lng && (
                  <p className="text-xs font-mono" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {lat.toFixed(6)}, {lng.toFixed(6)}
                  </p>
                )}

                {/* Nearby warning */}
                <AnimatePresence>
                  {nearbyAlert && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                      className="p-3 rounded-lg" style={{ background: 'rgba(201,123,26,0.12)', border: '1px solid rgba(201,123,26,0.3)' }}>
                      <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5"
                        style={{ color: '#C97B1A', fontFamily: 'Syne, sans-serif' }}>
                        <AlertTriangle size={13} />
                        Active incident {nearbyAlert.distanceMetres}m away
                      </p>
                      <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                        {nearbyAlert.incidentType} — created by {nearbyAlert.createdBy} — already {nearbyAlert.status.toLowerCase()}
                      </p>
                      <button type="button"
                        onClick={() => { incidentApi.linkReport({ parentIncidentId: nearbyAlert.incidentId, citizenName: watch('citizenName') ?? 'Unknown', notes: watch('notes') }); onSuccess(); }}
                        className="text-xs flex items-center gap-1 font-semibold"
                        style={{ color: '#C97B1A', fontFamily: 'Syne, sans-serif' }}>
                        <Link2 size={12} /> Link as witness report instead
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Step 3 — Review */}
            {step === 3 && (
              <div className="space-y-3 animate-fade-up">
                {[
                  { label: 'Caller',   value: watch('citizenName') },
                  { label: 'Phone',    value: watch('citizenPhone') || '—' },
                  { label: 'Type',     value: INCIDENT_CONFIG[watch('incidentType')]?.label },
                  { label: 'Priority', value: ['','Normal','High','Critical'][watch('priority')] },
                  { label: 'Location', value: watch('address') || `${lat?.toFixed(4)}, ${lng?.toFixed(4)}` },
                  { label: 'Notes',    value: watch('notes') || '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex gap-3">
                    <p className="label w-20 flex-shrink-0 pt-0.5">{label}</p>
                    <p className="text-sm flex-1" style={{ color: 'var(--text-muted)' }}>{value}</p>
                  </div>
                ))}
                {error && <p className="text-xs p-2 rounded" style={{ color: '#E8442A', background: 'rgba(232,68,42,0.1)' }}>{error}</p>}
              </div>
            )}
          </div>

          {/* Footer navigation */}
          <div className="flex items-center justify-between px-5 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <button type="button" onClick={() => step > 0 ? setStep((s) => s - 1) : onClose()}
              className="btn btn-ghost gap-1.5">
              <ChevronLeft size={15} />{step === 0 ? 'Cancel' : 'Back'}
            </button>
            {step < 3
              ? <button type="button" onClick={() => setStep((s) => s + 1)} className="btn btn-primary gap-1.5">
                  Next <ChevronRight size={15} />
                </button>
              : <button type="submit" disabled={submitting} className="btn btn-primary gap-1.5">
                  {submitting ? <><Loader2 size={14} className="animate-spin" />Creating...</> : 'Create Incident'}
                </button>
            }
          </div>
        </form>
      </motion.div>
    </div>
  );
}
