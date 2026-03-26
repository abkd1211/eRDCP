import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { IncidentType, IncidentStatus, VehicleType, Role } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Formatting ───────────────────────────────────────────────────────────────
export function formatSec(sec: number): string {
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

export function formatEta(sec: number | null): string {
  if (sec === null || sec < 0) return '--';
  if (sec < 60)   return `${sec}s`;
  return `${Math.ceil(sec / 60)} min`;
}

export function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Incident type config ──────────────────────────────────────────────────────
export const INCIDENT_CONFIG: Record<IncidentType, { label: string; color: string; bg: string; border: string }> = {
  MEDICAL:  { label: 'Medical',   color: '#7CB518', bg: 'rgba(124,181,24,0.12)',  border: '#7CB518' },
  FIRE:     { label: 'Fire',      color: '#E8442A', bg: 'rgba(232,68,42,0.12)',   border: '#E8442A' },
  CRIME:    { label: 'Crime',     color: '#1AB8C8', bg: 'rgba(26,184,200,0.12)',  border: '#1AB8C8' },
  ACCIDENT: { label: 'Accident',  color: '#C97B1A', bg: 'rgba(201,123,26,0.12)', border: '#C97B1A' },
  OTHER:    { label: 'Other',     color: '#9AA3AF', bg: 'rgba(154,163,175,0.12)', border: '#9AA3AF' },
};

export const STATUS_CONFIG: Record<IncidentStatus, { label: string; color: string }> = {
  CREATED:     { label: 'Created',     color: '#9AA3AF' },
  DISPATCHED:  { label: 'Dispatched',  color: '#C97B1A' },
  IN_PROGRESS: { label: 'In Progress', color: '#1AB8C8' },
  RESOLVED:    { label: 'Resolved',    color: '#7CB518' },
  CANCELLED:   { label: 'Cancelled',   color: '#5A6370' },
};

export const VEHICLE_TYPE_CONFIG: Record<VehicleType, { label: string; color: string; marker: string }> = {
  AMBULANCE:  { label: 'Ambulance',  color: '#7CB518', marker: '🚑' },
  POLICE:     { label: 'Police',     color: '#1AB8C8', marker: '🚔' },
  FIRE_TRUCK: { label: 'Fire Truck', color: '#E8442A', marker: '🚒' },
};

export const ROLE_CONFIG: Record<Role, { label: string; color: string; description: string }> = {
  SYSTEM_ADMIN:       { label: 'System Admin',       color: '#E8442A', description: 'Full platform access, user management, all incidents' },
  HOSPITAL_ADMIN:     { label: 'Hospital Admin',     color: '#7CB518', description: 'Medical incidents, ambulance fleet management' },
  POLICE_ADMIN:       { label: 'Police Admin',       color: '#1AB8C8', description: 'Crime & accident incidents, police unit management' },
  FIRE_SERVICE_ADMIN: { label: 'Fire Service Admin', color: '#C97B1A', description: 'Fire incidents, fire truck fleet management' },
  AMBULANCE_DRIVER:   { label: 'Ambulance Driver',   color: '#9AA3AF', description: 'Own vehicle telemetry and assignments' },
};

// ─── Heading degrees ──────────────────────────────────────────────────────────
export function headingToDeg(heading: string): number {
  const map: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
  return map[heading?.toUpperCase()] ?? 0;
}

// ─── Confidence colour ────────────────────────────────────────────────────────
export function confidenceColor(pct: number): string {
  if (pct >= 0.85) return '#7CB518';
  if (pct >= 0.60) return '#C97B1A';
  return '#E8442A';
}

// ─── Priority label ───────────────────────────────────────────────────────────
export function priorityLabel(p: number): string {
  return p >= 3 ? 'Critical' : p === 2 ? 'High' : 'Normal';
}
export function priorityColor(p: number): string {
  return p >= 3 ? '#E8442A' : p === 2 ? '#C97B1A' : '#9AA3AF';
}
