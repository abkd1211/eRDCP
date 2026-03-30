'use client';
import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { headingToDeg } from '@/lib/utils';
import type { VehicleLive, Alert, LocationUpdatePayload, EtaUpdatePayload, RouteDeviationPayload, VehicleArrivedPayload } from '@/types';

const WS_URL = process.env.NEXT_PUBLIC_DISPATCH_WS_URL ?? 'http://localhost:3003';

interface SocketState {
  socket:    Socket | null;
  connected: boolean;
  vehicles:  Record<string, VehicleLive>;
  alerts:    Alert[];
  connect:   (token: string) => void;
  disconnect:() => void;
  dismissAlert: (id: string) => void;
}

let alertCounter = 0;

export const useSocket = create<SocketState>((set, get) => ({
  socket:    null,
  connected: false,
  vehicles:  {},
  alerts:    [],

  connect: (token: string) => {
    const existing = get().socket;
    if (existing?.connected) return;

    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      set({ connected: true });
    });

    socket.on('disconnect', () => {
      console.warn('Socket.io disconnected from Dispatch Service');
      set({ connected: false });
    });

    // location:update — smooth interpolation via prevLat/prevLng
    socket.on('location:update', (payload: LocationUpdatePayload) => {
      console.log(`[Socket] location:update | vehicle: ${payload.vehicleCode} (${payload.vehicleId}) | incident: ${payload.incidentId} | status: ${payload.status}`);
      set((state) => {
        const existing = state.vehicles[payload.vehicleId];
        const updated: VehicleLive = {
          vehicleId:   payload.vehicleId,
          vehicleCode: payload.vehicleCode,
          type:        payload.type,
          driverUserId:payload.driverUserId,
          driverName:  payload.driverName,
          lat:         payload.latitude,
          lng:         payload.longitude,
          prevLat:     existing?.lat ?? payload.latitude,
          prevLng:     existing?.lng ?? payload.longitude,
          heading:     payload.heading,
          headingDeg:  headingToDeg(payload.heading),
          speedKmh:    payload.speedKmh,
          batteryPct:  payload.batteryPct,
          etaSec:      existing?.etaSec ?? null,
          deviation:   existing?.deviation ?? false,
          arrived:     existing?.arrived ?? false,
          unresponsive:existing?.unresponsive ?? false,
          status:      payload.status,
          incidentId:  payload.incidentId,
          lastUpdate:  Date.now(),
        };
        return { vehicles: { ...state.vehicles, [payload.vehicleId]: updated } };
      });
    });

    // eta:update
    socket.on('eta:update', (payload: EtaUpdatePayload) => {
      set((state) => {
        const v = state.vehicles[payload.vehicleId];
        if (!v) return state;
        return { vehicles: { ...state.vehicles, [payload.vehicleId]: { ...v, etaSec: payload.etaSec } } };
      });
    });

    // route:deviation
    socket.on('route:deviation', (payload: RouteDeviationPayload) => {
      set((state) => {
        const v = state.vehicles[payload.vehicleId];
        const id = `alert-${++alertCounter}`;
        const alert: Alert = {
          id, type: 'deviation',
          message: `${payload.vehicleCode} — Route deviation detected (${Math.round(payload.deviationMetres)}m off path)${payload.blocked ? '. Blockage triggered — rerouting.' : ''}`,
          vehicleCode: payload.vehicleCode,
          timestamp: Date.now(),
        };
        const vehicles = v
          ? { ...state.vehicles, [payload.vehicleId]: { ...v, deviation: true } }
          : state.vehicles;
        return { vehicles, alerts: [alert, ...state.alerts].slice(0, 10) };
      });
    });

    // vehicle:arrived
    socket.on('vehicle:arrived', (payload: VehicleArrivedPayload) => {
      set((state) => {
        const v = state.vehicles[payload.vehicleId];
        const id = `alert-${++alertCounter}`;
        const alert: Alert = {
          id, type: 'arrived',
          message: `${payload.vehicleCode} arrived on scene — response time ${Math.round(payload.arrivalSec / 60)} min`,
          vehicleCode: payload.vehicleCode,
          incidentId:  payload.incidentId,
          timestamp:   Date.now(),
        };
        // Play arrival chime
        if (typeof window !== 'undefined') playArrivalChime();
        const vehicles = v
          ? { ...state.vehicles, [payload.vehicleId]: { ...v, arrived: true, etaSec: 0 } }
          : state.vehicles;
        return { vehicles, alerts: [alert, ...state.alerts].slice(0, 10) };
      });
    });

    // vehicle:unresponsive
    socket.on('vehicle:unresponsive', (data: { vehicleId: string; vehicleCode: string }) => {
      set((state) => {
        const v = state.vehicles[data.vehicleId];
        const id = `alert-${++alertCounter}`;
        const alert: Alert = {
          id, type: 'unresponsive',
          message: `${data.vehicleCode} — No GPS signal detected`,
          vehicleCode: data.vehicleCode,
          timestamp: Date.now(),
        };
        const vehicles = v
          ? { ...state.vehicles, [data.vehicleId]: { ...v, unresponsive: true } }
          : state.vehicles;
        return { vehicles, alerts: [alert, ...state.alerts].slice(0, 10) };
      });
    });

    // incident:new broadcast to admins
    socket.on('incident:new', (data: { incidentId: string; incidentType: string }) => {
      const id = `alert-${++alertCounter}`;
      const alert: Alert = {
        id, type: 'incident_new',
        message: `New ${data.incidentType.toLowerCase()} incident created`,
        incidentId: data.incidentId,
        timestamp: Date.now(),
      };
      set((state) => ({ alerts: [alert, ...state.alerts].slice(0, 10) }));
    });

    // incident:unassigned — No available responder within radius
    socket.on('incident:unassigned', (payload: any) => {
      const id = `alert-${++alertCounter}`;
      const alert: Alert = {
        id, type: 'incident_unassigned',
        message: `UNASSIGNED: No responder within 50km for ${payload.incidentType} incident.`,
        incidentId: payload.incidentId,
        timestamp: Date.now(),
      };
      set((state) => ({ alerts: [alert, ...state.alerts].slice(0, 10) }));
      if (typeof window !== 'undefined' && (window as any).playSirenChime) {
        (window as any).playSirenChime();
      }
    });

    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null, connected: false, vehicles: {} });
  },

  dismissAlert: (id: string) => {
    set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) }));
  },
}));

// Web Audio API two-tone arrival chime
function playArrivalChime() {
  try {
    const ctx = new AudioContext();
    const play = (freq: number, start: number, duration: number) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    play(440, 0,    0.18);
    play(660, 0.22, 0.32);
    setTimeout(() => ctx.close(), 1000);
  } catch { /* silently ignore if no audio context */ }
}
