'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, CheckCircle2, Activity, Users, PlusCircle, Brain } from 'lucide-react';
import { analyticsApi } from '@/lib/services';
import { StatCard, IncidentTypeBadge, StatusBadge } from '@/components/ui';
import UnitCreationModal from '@/components/modals/UnitCreationModal';
import AgentDashboard from '@/components/agent/AgentDashboard';
import { formatSec, formatRelative, INCIDENT_CONFIG } from '@/lib/utils';
import { RadialBarChart, RadialBar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function SystemAdminView() {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'ai-agent'>('overview');
  const { data: dash, isLoading } = useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: analyticsApi.getDashboard,
    refetchInterval: 30_000,
  });
  const { data: sla } = useQuery({ queryKey: ['sla', 'week'], queryFn: () => analyticsApi.getSla('week') });
  const { data: topR } = useQuery({ queryKey: ['top-responders'], queryFn: () => analyticsApi.getTopResponders(5) });

  const typeData = Object.entries(dash?.byType ?? {}).map(([name, value]) => ({ name, value }));
  const slaVal = sla?.compliancePct ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <button 
               onClick={() => setActiveTab('overview')}
               className={`text-xl font-bold transition-all ${activeTab === 'overview' ? 'text-white underline decoration-indigo-500 underline-offset-8' : 'text-white/40 hover:text-white/60'}`}
               style={{ fontFamily: 'Syne, sans-serif' }}
             >
               System Overview
             </button>
             <button 
               onClick={() => setActiveTab('ai-agent')}
               className={`text-xl font-bold flex items-center gap-2 transition-all ${activeTab === 'ai-agent' ? 'text-white underline decoration-indigo-500 underline-offset-8' : 'text-white/40 hover:text-white/60'}`}
               style={{ fontFamily: 'Syne, sans-serif' }}
             >
               <Brain size={20} className={activeTab === 'ai-agent' ? 'text-indigo-400' : ''} />
               AI Agent
             </button>
          </div>
          <p className="text-xs text-white/50">
            {activeTab === 'overview' ? 'Real-time status of national emergency coordination' : 'AI Voice Operator & Call Ingestion Status'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setModalOpen(true)}
            className="btn py-2 px-4 bg-white/5 border border-white/10 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-white/10 transition-all font-syne"
          >
            <PlusCircle size={14} /> Register Unit
          </button>
        </div>
      </div>

      <UnitCreationModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        role="SYSTEM_ADMIN" 
      />

      {activeTab === 'ai-agent' ? (
        <AgentDashboard />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Total Incidents"  value={dash?.totalIncidents  ?? 0} icon={<AlertTriangle size={18}/>} accentColor="#E8442A" loading={isLoading} />
            <StatCard label="Open Now"         value={dash?.openIncidents   ?? 0} icon={<Activity size={18}/>}      accentColor="#C97B1A" loading={isLoading} />
            <StatCard label="Resolved Today"   value={dash?.resolvedToday   ?? 0} icon={<CheckCircle2 size={18}/>}  accentColor="#7CB518" loading={isLoading} />
            <StatCard label="Avg Response"     value={formatSec(dash?.avgResponseSec ?? 0)} icon={<Clock size={18}/>} accentColor="#1AB8C8" loading={isLoading} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* SLA Gauge */}
            <div className="card p-4">
              <p className="label mb-3">SLA Compliance</p>
              <div className="flex items-center justify-center">
                <ResponsiveContainer width={160} height={140}>
                  <RadialBarChart cx="50%" cy="75%" innerRadius="65%" outerRadius="90%"
                    startAngle={180} endAngle={0} data={[{ value: slaVal, fill: slaVal >= 80 ? '#7CB518' : slaVal >= 60 ? '#C97B1A' : '#E8442A' }]}>
                    <RadialBar dataKey="value" cornerRadius={4} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-center text-3xl font-bold -mt-6 font-mono" style={{ fontFamily: 'JetBrains Mono, monospace', color: slaVal >= 80 ? '#7CB518' : slaVal >= 60 ? '#C97B1A' : '#E8442A' }}>
                {slaVal.toFixed(1)}%
              </p>
              <p className="text-center label mt-1">Week target: 8 min dispatch</p>
            </div>

            {/* Type donut */}
            <div className="card p-4">
              <p className="label mb-3">By Type</p>
              {typeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={typeData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                      {typeData.map((entry) => (
                        <Cell key={entry.name} fill={INCIDENT_CONFIG[entry.name as keyof typeof INCIDENT_CONFIG]?.color ?? '#9AA3AF'} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number, name: string) => [value, INCIDENT_CONFIG[name as keyof typeof INCIDENT_CONFIG]?.label ?? name]}
                      contentStyle={{ 
                        background: '#121212', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        borderRadius: 12, 
                        fontSize: 12,
                        fontWeight: 'bold',
                        fontFamily: 'Syne, sans-serif'
                      }} 
                      itemStyle={{ color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-36 flex items-center justify-center text-xs" style={{ color: 'var(--text-faint)' }}>No data yet</div>
              )}
            </div>

            {/* Top responders */}
            <div className="card p-4">
              <p className="label mb-3 flex items-center gap-1.5"><Users size={12} />Top Responders</p>
              {(topR ?? []).length === 0
                ? <p className="text-xs py-8 text-center" style={{ color: 'var(--text-faint)' }}>No data yet</p>
                : (topR ?? []).map((r, i) => (
                  <div key={r.responderId} className="flex items-center gap-2 py-2 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-xs font-bold font-mono w-4" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ fontFamily: 'Syne, sans-serif' }}>{r.responderName}</p>
                      <p className="text-xs font-mono" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>{r.totalDispatch} dispatches · {formatSec(r.avgArrivalSec)} avg</p>
                    </div>
                    <span className="text-xs font-bold" style={{ color: r.slaCompliance >= 80 ? '#7CB518' : '#C97B1A', fontFamily: 'JetBrains Mono, monospace' }}>{r.slaCompliance.toFixed(0)}%</span>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Recent activity */}
          <div className="card">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="label">Recent Incidents</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Type','Caller','Status','Priority','Time','Responder'].map((h) => (
                      <th key={h} className="px-4 py-2 text-left label">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(dash?.recentIncidents ?? []).length === 0
                    ? <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-faint)' }}>No incidents yet</td></tr>
                    : (dash?.recentIncidents ?? []).map((inc) => (
                      <tr key={inc.id} className="border-b transition-colors" style={{ borderColor: 'var(--border)' }}>
                        <td className="px-4 py-2"><IncidentTypeBadge type={inc.incidentType} /></td>
                        <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{inc.citizenName}</td>
                        <td className="px-4 py-2"><StatusBadge status={inc.status} /></td>
                        <td className="px-4 py-2 font-mono" style={{ color: inc.priority >= 3 ? '#E8442A' : inc.priority === 2 ? '#C97B1A' : 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>
                          P{inc.priority}
                        </td>
                        <td className="px-4 py-2" style={{ color: 'var(--text-faint)' }}>{formatRelative(inc.createdAt)}</td>
                        <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{inc.responder?.name ?? '—'}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
