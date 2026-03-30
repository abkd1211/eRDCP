'use client';
import { cn, INCIDENT_CONFIG, STATUS_CONFIG, ROLE_CONFIG, priorityColor, priorityLabel } from '@/lib/utils';
import type { IncidentType, IncidentStatus, Role } from '@/types';

// ─── Badge ────────────────────────────────────────────────────────────────────
interface BadgeProps { children: React.ReactNode; color?: string; bg?: string; className?: string; }
export function Badge({ children, color, bg, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold', className)}
      style={{ color: color ?? 'var(--text-muted)', background: bg ?? 'var(--surface-hi)', fontFamily: 'Syne, sans-serif', letterSpacing: '0.03em' }}>
      {children}
    </span>
  );
}

export function IncidentTypeBadge({ type }: { type: IncidentType }) {
  const c = INCIDENT_CONFIG[type];
  return <Badge color={c.color} bg={c.bg}>{c.label}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  // Try incident status first
  let c = (STATUS_CONFIG as any)[status];
  
  // Fallbacks for Responder/Vehicle status if not in IncidentStatus
  if (!c) {
    if (status === 'AVAILABLE')  c = { label: 'Available',  color: '#7CB518' };
    if (status === 'BUSY')       c = { label: 'Busy',       color: '#E8442A' };
    if (status === 'OFFLINE')    c = { label: 'Offline',    color: '#5A6370' };
    if (status === 'EN_ROUTE')   c = { label: 'En Route',   color: '#C97B1A' };
    if (status === 'ON_SCENE')   c = { label: 'On Scene',   color: '#1AB8C8' };
    if (status === 'RETURNING')  c = { label: 'Returning',  color: '#7CB518' };
  }

  if (!c) return <Badge>{status}</Badge>;
  return <Badge color={c.color} bg={`${c.color}18`}>{c.label ?? status}</Badge>;
}

export function RoleBadge({ role }: { role: Role }) {
  const c = ROLE_CONFIG[role];
  return <Badge color={c.color} bg={`${c.color}18`}>{c.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: number }) {
  const color = priorityColor(priority);
  return <Badge color={color} bg={`${color}18`}>{priorityLabel(priority)}</Badge>;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  accentColor?: string;
  trend?: { value: number; label: string };
  loading?: boolean;
}
export function StatCard({ label, value, icon, accentColor = '#E8442A', trend, loading }: StatCardProps) {
  if (loading) return (
    <div className="card p-4">
      <Skeleton className="h-3 w-20 mb-3" />
      <Skeleton className="h-8 w-24 mb-2" />
      <Skeleton className="h-3 w-16" />
    </div>
  );

  return (
    <div className="card p-4 overflow-hidden relative animate-fade-up"
      style={{ borderLeft: `2px solid ${accentColor}` }}>
      {/* Corner glow */}
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle at top right, ${accentColor}18, transparent 70%)` }} />

      <div className="flex items-start justify-between gap-2 relative">
        <div className="min-w-0 flex-1">
          <p className="label mb-2">{label}</p>
          <p className="text-3xl font-bold leading-none min-h-[36px] flex items-center"
            style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>
            {value}
          </p>
          {trend && (
            <p className="text-xs mt-2" style={{ color: trend.value >= 0 ? '#7CB518' : '#E8442A' }}>
              {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${accentColor}18`, color: accentColor }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
