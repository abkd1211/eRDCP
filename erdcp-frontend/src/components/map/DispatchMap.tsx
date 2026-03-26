'use client';
import { useEffect, useRef, useCallback } from 'react';
import type { Vehicle, Incident, VehicleLive } from '@/types';
import { VEHICLE_TYPE_CONFIG, INCIDENT_CONFIG } from '@/lib/utils';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
const ACCRA = { lng: -0.187, lat: 5.603 };

interface MarkerRef {
  marker: mapboxgl.Marker;
  el:     HTMLDivElement;
  prevLat: number;
  prevLng: number;
  animFrame?: number;
}

interface Props {
  vehicles:  VehicleLive[];
  incidents: Incident[];
  onVehicleClick:  (v: VehicleLive) => void;
  onIncidentClick: (i: Incident) => void;
  vehicleTypeFilter?: string;
}

export default function DispatchMap({ vehicles, incidents, onVehicleClick, onIncidentClick, vehicleTypeFilter }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<mapboxgl.Map | null>(null);
  const markersRef      = useRef<Record<string, MarkerRef>>({});
  const incMarkersRef   = useRef<Record<string, mapboxgl.Marker>>({});
  const initRef         = useRef(false);

  // Init map once
  useEffect(() => {
    if (initRef.current || !mapContainerRef.current || !MAPBOX_TOKEN) return;
    initRef.current = true;

    let mapboxgl: typeof import('mapbox-gl');
    import('mapbox-gl').then((mod) => {
      mapboxgl = mod.default as unknown as typeof import('mapbox-gl');
      (mapboxgl as unknown as { accessToken: string }).accessToken = MAPBOX_TOKEN;

      const map = new (mapboxgl as unknown as { Map: new (opts: unknown) => mapboxgl.Map }).Map({
        container: mapContainerRef.current!,
        style:     'mapbox://styles/mapbox/dark-v11',
        center:    [ACCRA.lng, ACCRA.lat],
        zoom:      11,
        attributionControl: false,
      });

      mapRef.current = map;
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      initRef.current = false;
    };
  }, []);

  // Build SVG vehicle marker
  const buildVehicleSvg = useCallback((type: string, deviation: boolean, arrived: boolean, heading: number) => {
    const conf  = VEHICLE_TYPE_CONFIG[type as keyof typeof VEHICLE_TYPE_CONFIG];
    const color = arrived ? '#7CB518' : deviation ? '#C97B1A' : conf?.color ?? '#9AA3AF';
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        <g transform="rotate(${heading}, 18, 18)">
          <rect x="10" y="8" width="16" height="20" rx="4" fill="${color}" opacity="0.92"/>
          <polygon points="18,3 23,12 13,12" fill="${color}"/>
          <rect x="13" y="12" width="10" height="8" rx="1" fill="white" opacity="0.3"/>
        </g>
      </svg>`;
  }, []);

  // Smooth interpolation
  const animateMarker = useCallback((ref: MarkerRef, toLat: number, toLng: number) => {
    if (ref.animFrame) cancelAnimationFrame(ref.animFrame);
    const fromLat = ref.prevLat;
    const fromLng = ref.prevLng;
    const start = performance.now();
    const duration = 800;

    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out
      const lat = fromLat + (toLat - fromLat) * ease;
      const lng = fromLng + (toLng - fromLng) * ease;
      ref.marker.setLngLat([lng, lat]);
      if (t < 1) ref.animFrame = requestAnimationFrame(step);
    };
    ref.animFrame = requestAnimationFrame(step);
    ref.prevLat = toLat;
    ref.prevLng = toLng;
  }, []);

  // Update vehicle markers when socket vehicles change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    import('mapbox-gl').then((mod) => {
      const mapboxgl = mod.default as unknown as { Marker: new (opts: unknown) => mapboxgl.Marker };

      const filtered = vehicleTypeFilter && vehicleTypeFilter !== 'ALL'
        ? vehicles.filter((v) => v.type === vehicleTypeFilter)
        : vehicles;

      // Remove stale markers
      Object.keys(markersRef.current).forEach((id) => {
        if (!filtered.find((v) => v.vehicleId === id)) {
          markersRef.current[id].marker.remove();
          delete markersRef.current[id];
        }
      });

      filtered.forEach((v) => {
        const svg = buildVehicleSvg(v.type, v.deviation, v.arrived, v.headingDeg);
        const existing = markersRef.current[v.vehicleId];

        if (existing) {
          existing.el.innerHTML = svg;
          animateMarker(existing, v.lat, v.lng);
        } else {
          const el = document.createElement('div');
          el.innerHTML = svg;
          el.style.cursor = 'pointer';
          el.title = `${v.vehicleCode} — ${v.type}`;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onVehicleClick(v);
          });

          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([v.lng, v.lat])
            .addTo(map);

          markersRef.current[v.vehicleId] = { marker, el, prevLat: v.lat, prevLng: v.lng };
        }
      });
    });
  }, [vehicles, vehicleTypeFilter, buildVehicleSvg, animateMarker, onVehicleClick]);

  // Update incident markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    import('mapbox-gl').then((mod) => {
      const mapboxgl = mod.default as unknown as { Marker: new (opts: unknown) => mapboxgl.Marker };

      // Remove stale
      Object.keys(incMarkersRef.current).forEach((id) => {
        if (!incidents.find((i) => i.id === id)) {
          incMarkersRef.current[id].remove();
          delete incMarkersRef.current[id];
        }
      });

      incidents.forEach((inc) => {
        if (incMarkersRef.current[inc.id]) return;
        const conf  = INCIDENT_CONFIG[inc.incidentType];
        const el    = document.createElement('div');
        el.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="34" viewBox="0 0 28 34">
            <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 20 14 20S28 23.33 28 14C28 6.27 21.73 0 14 0z"
              fill="${conf.color}" opacity="0.9"/>
            <circle cx="14" cy="14" r="6" fill="white" opacity="0.9"/>
          </svg>`;
        el.style.cursor = 'pointer';
        el.title = `${conf.label} — ${inc.citizenName}`;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onIncidentClick(inc);
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([inc.longitude, inc.latitude])
          .addTo(map);

        incMarkersRef.current[inc.id] = marker;
      });

      // Auto-fit bounds on first load
      const allLngs = [...incidents.map((i) => i.longitude)];
      const allLats = [...incidents.map((i) => i.latitude)];
      if (allLngs.length > 0 && !map.getCenter) return;
      if (allLngs.length >= 2) {
        map.fitBounds(
          [[Math.min(...allLngs) - 0.01, Math.min(...allLats) - 0.01],
           [Math.max(...allLngs) + 0.01, Math.max(...allLats) + 0.01]],
          { padding: 60, maxZoom: 14, duration: 800 }
        );
      } else if (allLngs.length === 1) {
        map.flyTo({ center: [allLngs[0], allLats[0]], zoom: 13 });
      }
    });
  }, [incidents, onIncidentClick]);

  return (
    <div ref={mapContainerRef} style={{ width: '100%', height: '100%', background: '#111214' }} />
  );
}
