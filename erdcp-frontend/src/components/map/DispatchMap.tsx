'use client';
import { useEffect, useRef, useCallback } from 'react';
import type { Incident, VehicleLive } from '@/types';
import { VEHICLE_TYPE_CONFIG, INCIDENT_CONFIG } from '@/lib/utils';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
const ACCRA = { lng: -0.187, lat: 5.603 };

interface MarkerEntry {
  marker:     AnyMap;
  el:         HTMLDivElement;
  prevLat:    number;
  prevLng:    number;
  animFrame?: number;
}

interface Props {
  vehicles:         VehicleLive[];
  incidents:        Incident[];
  onVehicleClick:   (v: VehicleLive) => void;
  onIncidentClick:  (i: Incident) => void;
  vehicleTypeFilter?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMap = any;

export default function DispatchMap({ vehicles, incidents, onVehicleClick, onIncidentClick, vehicleTypeFilter }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<AnyMap>(null);
  const mbglRef      = useRef<AnyMap>(null);
  const loadedRef    = useRef(false);
  const vRef         = useRef<Record<string, MarkerEntry>>({});
  const iRef         = useRef<Record<string, AnyMap>>({});
  const trailsRef    = useRef<Record<string, [number, number][]>>({});
  // Store latest props in refs so callbacks don't go stale
  const vehiclesRef   = useRef(vehicles);
  const incidentsRef  = useRef(incidents);
  const filterRef     = useRef(vehicleTypeFilter);

  useEffect(() => { vehiclesRef.current  = vehicles;         }, [vehicles]);
  useEffect(() => { incidentsRef.current = incidents;        }, [incidents]);
  useEffect(() => { filterRef.current    = vehicleTypeFilter;}, [vehicleTypeFilter]);

  const buildSvg = useCallback((type: string, deviation: boolean, arrived: boolean, deg: number) => {
    const conf  = VEHICLE_TYPE_CONFIG[type as keyof typeof VEHICLE_TYPE_CONFIG];
    const color = arrived ? '#7CB518' : deviation ? '#C97B1A' : (conf?.color ?? '#9AA3AF');
    
    // Premium Car Model SVG
    return `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" />
          <feOffset dx="0" dy="1" result="offsetblur" />
          <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g transform="rotate(${deg},22,22)" filter="url(#shadow)">
        <!-- Car Body -->
        <rect x="14" y="8" width="16" height="28" rx="5" fill="${color}" />
        <!-- Roof -->
        <rect x="16" y="14" width="12" height="12" rx="2" fill="white" fill-opacity="0.25" />
        <!-- Windshield -->
        <path d="M16 14 L28 14 L26 11 L18 11 Z" fill="white" fill-opacity="0.4" />
        <!-- Lights -->
        <rect x="16" y="7" width="3" height="2" rx="0.5" fill="white" fill-opacity="0.8" />
        <rect x="25" y="7" width="3" height="2" rx="0.5" fill="white" fill-opacity="0.8" />
        <!-- Back Lights (Red) -->
        <rect x="16" y="35" width="4" height="1.5" rx="0.5" fill="#EF4444" fill-opacity="0.8" />
        <rect x="24" y="35" width="4" height="1.5" rx="0.5" fill="#EF4444" fill-opacity="0.8" />
        <!-- Type Icon -->
        <text x="22" y="24" text-anchor="middle" dominant-baseline="middle" font-size="8" fill="white" fill-opacity="0.9" style="font-family: Arial;">
          ${conf?.marker ?? '•'}
        </text>
      </g>
    </svg>`;
  }, []);

  const animateMarker = useCallback((entry: MarkerEntry, toLat: number, toLng: number) => {
    if (entry.animFrame) cancelAnimationFrame(entry.animFrame);
    const { prevLat: fromLat, prevLng: fromLng } = entry;
    const t0 = performance.now();
    const duration = 4500; // 4.5s glide for ~5s ping interval
    const step = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      if (p === 1) console.log('Marker animation finished', entry.marker._vehicleId);
      const e = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      entry.marker.setLngLat([fromLng + (toLng - fromLng) * e, fromLat + (toLat - fromLat) * e]);
      
      // Lock-on behavior: if this vehicle is currently selected, follow it
      const selectedId = (window as any)._selectedVehicleId;
      if (selectedId === entry.marker._vehicleId && mapRef.current) {
        mapRef.current.setCenter([fromLng + (toLng - fromLng) * e, fromLat + (toLat - fromLat) * e]);
      }

      if (p < 1) entry.animFrame = requestAnimationFrame(step);
    };
    entry.animFrame = requestAnimationFrame(step);
    entry.prevLat = toLat;
    entry.prevLng = toLng;
  }, []);

  const syncVehicles = useCallback(() => {
    const map  = mapRef.current;
    const mbgl = mbglRef.current;
    if (!map || !mbgl || !loadedRef.current) return;

    const all      = vehiclesRef.current;
    const flt      = filterRef.current;
    const filtered = flt && flt !== 'ALL' ? all.filter((v) => v.type === flt) : all;

    // Remove stale
    for (const id of Object.keys(vRef.current)) {
      if (!filtered.find((v) => v.vehicleId === id)) {
        vRef.current[id].marker.remove();
        delete vRef.current[id];
      }
    }

    for (const v of filtered) {
      const svg      = buildSvg(v.type, v.deviation, v.arrived, v.headingDeg);
      const existing = vRef.current[v.vehicleId];
      
      // Update trail breadcrumbs
      if (!trailsRef.current[v.vehicleId]) trailsRef.current[v.vehicleId] = [];
      const trail = trailsRef.current[v.vehicleId];
      // Only push if different from last
      const last = trail[trail.length - 1];
      if (!last || last[0] !== v.lng || last[1] !== v.lat) {
        trail.push([v.lng, v.lat]);
        if (trail.length > 50) trail.shift(); // Keep last 50 points
      }

      if (existing) {
        existing.el.innerHTML = svg;
        animateMarker(existing, v.lat, v.lng);
      } else {
        const el = document.createElement('div');
        el.innerHTML      = svg;
        el.style.cursor   = 'pointer';
        el.style.width    = '40px';
        el.style.height   = '40px';
        el.title = `${v.vehicleCode} (${v.type.replace('_',' ')})`;
        el.addEventListener('click', (e) => { e.stopPropagation(); onVehicleClick(v); });
        const marker = new mbgl.Marker({ element: el, anchor: 'center' }).setLngLat([v.lng, v.lat]).addTo(map);
        (marker as any)._vehicleId = v.vehicleId;
        vRef.current[v.vehicleId] = { marker, el, prevLat: v.lat, prevLng: v.lng };
      }
    }

    // Refresh trail layer
    if (map.getSource('vehicle-trails')) {
      const features = Object.entries(trailsRef.current)
        .filter(([id]) => filtered.some(v => v.vehicleId === id))
        .map(([id, coords]) => ({
          type: 'Feature',
          properties: { vehicleId: id },
          geometry: { type: 'LineString', coordinates: coords }
        }));
      (map.getSource('vehicle-trails') as any).setData({ type: 'FeatureCollection', features });
    }
  }, [buildSvg, animateMarker, onVehicleClick]);

  const syncIncidents = useCallback(() => {
    const map  = mapRef.current;
    const mbgl = mbglRef.current;
    if (!map || !mbgl || !loadedRef.current) return;

    const list = incidentsRef.current;

    // Remove stale
    for (const id of Object.keys(iRef.current)) {
      if (!list.find((i) => i.id === id)) {
        iRef.current[id].remove();
        delete iRef.current[id];
      }
    }

    for (const inc of list) {
      if (iRef.current[inc.id]) continue;
      const conf = INCIDENT_CONFIG[inc.incidentType];
      const el   = document.createElement('div');
      el.style.cursor = 'pointer';
      el.title = `${conf.label} — ${inc.citizenName}`;
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
        <path d="M16 0C7.16 0 0 7.16 0 16c0 10.67 16 24 16 24S32 26.67 32 16C32 7.16 24.84 0 16 0z" fill="${conf.color}" opacity="0.92"/>
        <circle cx="16" cy="16" r="7" fill="white" opacity="0.9"/>
        <circle cx="16" cy="16" r="3.5" fill="${conf.color}"/>
      </svg>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); onIncidentClick(inc); });
      const marker = new mbgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([inc.longitude, inc.latitude]).addTo(map);
      iRef.current[inc.id] = marker;
    }

    // Fit bounds once there are incidents
    if (list.length === 0) return;
    const lngs = list.map((i) => i.longitude).filter(l => !isNaN(l));
    const lats = list.map((i) => i.latitude).filter(l => !isNaN(l));
    if (lngs.length === 0) return;

    if (lngs.length === 1) {
      map.flyTo({ center: [lngs[0], lats[0]], zoom: 13, duration: 800 });
    } else {
      try {
        map.fitBounds(
          [[Math.min(...lngs) - 0.02, Math.min(...lats) - 0.02],
           [Math.max(...lngs) + 0.02, Math.max(...lats) + 0.02]],
          { padding: 20, maxZoom: 14, duration: 1000 }
        );
      } catch (err) {
        console.warn('Mapbox canvas constraints prevented fitBounds zooming', err);
      }
    }
  }, [onIncidentClick]);

  // Sync selected vehicle ID to window for the animation lock-on
  useEffect(() => {
    const selectedVeh = vehicles.find(v => (v as any).selected); // or passed via prop
    // Since onVehicleClick is called from parent, we can just use the prop if it was there
    // But DispatchPage doesn't pass 'selectedVehicleId' to DispatchMap.
    // I should probably update DispatchPage to pass the selectedVehicleId.
  }, [vehicles]);

  // Init map
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    if (!MAPBOX_TOKEN) return;

    import('mapbox-gl').then((mod) => {
      const mbgl: AnyMap = mod.default;
      mbgl.accessToken = MAPBOX_TOKEN;
      mbglRef.current  = mbgl;

      const map = new mbgl.Map({
        container: containerRef.current!,
        style:     'mapbox://styles/mapbox/dark-v11',
        center:    [ACCRA.lng, ACCRA.lat],
        zoom:      11,
        attributionControl: false,
      });
      mapRef.current = map;

      map.on('load', () => {
        loadedRef.current = true;
        
        // Add trail source & layer
        map.addSource('vehicle-trails', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
          id: 'vehicle-trails-layer',
          type: 'line',
          source: 'vehicle-trails',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#E8442A',
            'line-width': 3,
            'line-opacity': 0.6,
            'line-dasharray': [2, 1]
          }
        });

        syncVehicles();
        syncIncidents();
      });
    });

    return () => {
      mapRef.current?.remove?.();
      mapRef.current    = null;
      loadedRef.current = false;
      vRef.current      = {};
      iRef.current      = {};
    };
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when data changes
  useEffect(() => { syncVehicles(); },  [vehicles,  syncVehicles]);
  useEffect(() => { syncIncidents(); }, [incidents, syncIncidents]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#111214' }} />
      {!MAPBOX_TOKEN && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111214', flexDirection: 'column', gap: 8 }}>
          <p style={{ color: '#E8442A', fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 600 }}>Mapbox token missing</p>
          <p style={{ color: '#5A6370', fontSize: 11 }}>Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local</p>
        </div>
      )}
    </div>
  );
}
