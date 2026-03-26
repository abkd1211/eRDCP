'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { incidentApi } from '@/lib/services';
import { IncidentTypeBadge, StatusBadge, PriorityBadge, Skeleton } from '@/components/ui';
import { formatRelative } from '@/lib/utils';
import { useAuth } from '@/store/auth.store';
import type { IncidentStatus } from '@/types';
import dynamic from 'next/dynamic';

const IncidentForm = dynamic(() => import('@/components/forms/IncidentForm'), { ssr: false });

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'ALL',         label: 'All' },
  { key: 'CREATED',     label: 'Created' },
  { key: 'DISPATCHED',  label: 'Dispatched' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'RESOLVED',    label: 'Resolved' },
];

export default function IncidentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [page, setPage]         = useState(1);
  const [statusFilter, setSF]   = useState('ALL');
  const [search, setSearch]     = useState('');
  const [showForm, setShowForm] = useState(false);
  const [updatingId, setUpdId]  = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', page, statusFilter],
    queryFn: () => incidentApi.list({
      page,
      limit: 20,
      ...(statusFilter !== 'ALL' && { status: statusFilter as IncidentStatus }),
    }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: IncidentStatus }) =>
      incidentApi.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['incidents-open'] });
      setUpdId(null);
    },
  });

  const incidents = data?.data ?? [];
  const filtered  = search
    ? incidents.filter((i) =>
        i.citizenName.toLowerCase().includes(search.toLowerCase()) ||
        i.address?.toLowerCase().includes(search.toLowerCase())
      )
    : incidents;

  const NEXT_STATUS: Record<IncidentStatus, IncidentStatus | null> = {
    CREATED:     'DISPATCHED',
    DISPATCHED:  'IN_PROGRESS',
    IN_PROGRESS: 'RESOLVED',
    RESOLVED:    null,
    CANCELLED:   null,
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              className="input-base pl-9 w-56" placeholder="Search incidents..." />
          </div>
        </div>
        {user?.role === 'SYSTEM_ADMIN' && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary gap-1.5">
            <Plus size={15} /> New Incident
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => { setSF(t.key); setPage(1); }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0"
            style={{
              fontFamily: 'Syne, sans-serif',
              background: statusFilter === t.key ? 'rgba(232,68,42,0.12)' : 'var(--surface-hi)',
              color:      statusFilter === t.key ? '#E8442A' : 'var(--text-faint)',
              border:     `1px solid ${statusFilter === t.key ? 'rgba(232,68,42,0.3)' : 'var(--border)'}`,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-hi)' }}>
                {['Type','Caller','Location','Status','Priority','Responder','Time','Action'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                : filtered.length === 0
                  ? <tr><td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--text-faint)' }}>No incidents found</td></tr>
                  : filtered.map((inc) => {
                      const next = NEXT_STATUS[inc.status];
                      return (
                        <tr key={inc.id}
                          className="border-b transition-colors hover:opacity-80"
                          style={{ borderColor: 'var(--border)' }}>
                          <td className="px-4 py-3"><IncidentTypeBadge type={inc.incidentType} /></td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{inc.citizenName}</td>
                          <td className="px-4 py-3 max-w-32 truncate" style={{ color: 'var(--text-faint)' }}>{inc.address ?? `${inc.latitude?.toFixed(3)}, ${inc.longitude?.toFixed(3)}`}</td>
                          <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
                          <td className="px-4 py-3"><PriorityBadge priority={inc.priority} /></td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{inc.responder?.name ?? '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>{formatRelative(inc.createdAt)}</td>
                          <td className="px-4 py-3">
                            {next && (
                              <button
                                onClick={() => { setUpdId(inc.id); updateStatus.mutate({ id: inc.id, status: next }); }}
                                disabled={updatingId === inc.id}
                                className="btn btn-secondary text-xs px-2 py-1 whitespace-nowrap">
                                → {next.replace('_',' ')}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-mono" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>
              {data.total} total · page {data.page}/{data.pages}
            </p>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-ghost p-1.5 rounded"><ChevronLeft size={14} /></button>
              <button onClick={() => setPage((p) => Math.min(data.pages, p + 1))} disabled={page === data.pages} className="btn btn-ghost p-1.5 rounded"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {/* New incident form */}
      <AnimatePresence>
        {showForm && (
          <IncidentForm
            onClose={() => setShowForm(false)}
            onSuccess={() => {
              setShowForm(false);
              qc.invalidateQueries({ queryKey: ['incidents'] });
              qc.invalidateQueries({ queryKey: ['incidents-open'] });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
