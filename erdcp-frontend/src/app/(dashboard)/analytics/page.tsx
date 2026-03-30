'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, PieChart, Pie, Cell } from 'recharts';
import { Clock, CheckCircle2, AlertTriangle, Activity, Download } from 'lucide-react';
import { analyticsApi } from '@/lib/services';
import { StatCard, Skeleton } from '@/components/ui';
import { formatSec, INCIDENT_CONFIG, downloadCsv } from '@/lib/utils';

const PERIODS = ['today','week','month','year'] as const;
type Period = typeof PERIODS[number];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('week');

  const { data: dash }     = useQuery({ queryKey: ['analytics-dashboard'],    queryFn: analyticsApi.getDashboard });
  const { data: sla }      = useQuery({ queryKey: ['sla', period],            queryFn: () => analyticsApi.getSla(period) });
  const { data: peakHours} = useQuery({ queryKey: ['peak-hours', period],     queryFn: () => analyticsApi.getPeakHours(period) });
  const { data: regions }  = useQuery({ queryKey: ['by-region', period],      queryFn: () => analyticsApi.getByRegion(period) });
  const { data: topR }     = useQuery({ queryKey: ['top-responders'],         queryFn: () => analyticsApi.getTopResponders(10) });
  const { data: times }    = useQuery({ queryKey: ['response-times', period], queryFn: () => analyticsApi.getResponseTimes(period) });

  const slaVal  = sla?.compliancePct ?? 0;
  const slaColor = slaVal >= 80 ? '#7CB518' : slaVal >= 60 ? '#C97B1A' : '#E8442A';

  // Normalise peak hours to 24-slot array
  const peakData = Array.from({ length: 24 }, (_, h) => ({
    hour:  h,
    count: (peakHours ?? []).find((p) => p.hour === h)?.count ?? 0,
  }));
  const maxPeak = Math.max(...peakData.map((p) => p.count), 1);

  // Type donut data
  const typeData = Object.entries(dash?.byType ?? {}).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));

  const handleDownload = () => {
    if (!dash) return;
    
    // Prepare report data
    const reportData = [
      { Category: 'OVERALL', Metric: 'Total Incidents', Value: dash.totalIncidents },
      { Category: 'OVERALL', Metric: 'Avg Dispatch (sec)', Value: times?.avgDispatchSec ?? 0 },
      { Category: 'OVERALL', Metric: 'Avg Arrival (sec)', Value: times?.avgArrivalSec ?? 0 },
      { Category: 'SLA',     Metric: 'Compliance %', Value: slaVal.toFixed(2) },
      // Add regional data
      ...(regions ?? []).map(r => ({ Category: 'REGION', Metric: r.region, Value: r.count })),
      // Add top responders
      ...(topR ?? []).map(r => ({ Category: 'RESPONDER', Metric: r.responderName, Value: `Dispatches: ${r.totalDispatch}, SLA: ${r.slaCompliance}%` }))
    ];

    downloadCsv(`ERDCP-Analytics-Report-${period}-${new Date().toISOString().split('T')[0]}`, reportData);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all"
              style={{
                fontFamily: 'Syne, sans-serif',
                background: period === p ? 'rgba(232,68,42,0.12)' : 'var(--surface-hi)',
                color:      period === p ? '#E8442A' : 'var(--text-faint)',
                border:     `1px solid ${period === p ? 'rgba(232,68,42,0.3)' : 'var(--border)'}`,
              }}>
              {p}
            </button>
          ))}
        </div>

        <button 
          onClick={handleDownload}
          disabled={!dash}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all bg-[#1AB8C8]/10 text-[#1AB8C8] border-[#1AB8C8]/30 hover:bg-[#1AB8C8]/20 disabled:opacity-30"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          <Download size={14} />
          Download Report
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Incidents"   value={dash?.totalIncidents ?? 0}           icon={<AlertTriangle size={18}/>} accentColor="#E8442A" />
        <StatCard label="Avg Dispatch Time" value={formatSec(times?.avgDispatchSec ?? 0)} icon={<Clock size={18}/>}        accentColor="#1AB8C8" />
        <StatCard label="Avg Arrival Time"  value={formatSec(times?.avgArrivalSec ?? 0)} icon={<Activity size={18}/>}     accentColor="#C97B1A" />
        <StatCard label="SLA Compliance"    value={`${slaVal.toFixed(1)}%`}              icon={<CheckCircle2 size={18}/>}  accentColor={slaColor} />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* SLA gauge */}
        <div className="card p-5">
          <p className="label mb-1">SLA Compliance</p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-faint)' }}>Target: 8 min dispatch — {period}</p>
          <div className="flex items-center justify-center">
            <div className="relative w-36 h-24">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="90%" innerRadius="60%" outerRadius="90%"
                  startAngle={180} endAngle={0}
                  data={[{ value: slaVal, fill: slaColor }]}>
                  <RadialBar dataKey="value" cornerRadius={4} />
                </RadialBarChart>
              </ResponsiveContainer>
              <p className="absolute bottom-0 left-1/2 -translate-x-1/2 text-2xl font-bold font-mono"
                style={{ fontFamily: 'JetBrains Mono, monospace', color: slaColor }}>
                {slaVal.toFixed(0)}%
              </p>
            </div>
          </div>
          <div className="mt-3 border-t pt-3 space-y-1.5" style={{ borderColor: 'var(--border)' }}>
            {(sla?.byType ?? []).map((bt) => (
              <div key={bt.type} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: INCIDENT_CONFIG[bt.type]?.color ?? '#9AA3AF' }} />
                <span className="text-xs flex-1" style={{ color: 'var(--text-muted)' }}>{INCIDENT_CONFIG[bt.type]?.label ?? bt.type}</span>
                <span className="text-xs font-mono" style={{ fontFamily: 'JetBrains Mono, monospace', color: bt.pct >= 80 ? '#7CB518' : '#C97B1A' }}>{bt.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Peak hours */}
        <div className="card p-5 lg:col-span-2">
          <p className="label mb-1">Peak Hours</p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-faint)' }}>Incident volume by hour of day</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={peakData} margin={{ left: -20, bottom: 0 }}>
              <XAxis dataKey="hour" tickFormatter={(h) => h % 3 === 0 ? `${h}h` : ''} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} />
              <Tooltip
                formatter={(v) => [v, 'Incidents']}
                labelFormatter={(h) => `${h}:00`}
                contentStyle={{ background: 'var(--surface-hi)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {peakData.map((entry, i) => {
                  const intensity = entry.count / maxPeak;
                  const color = intensity > 0.7 ? '#E8442A' : intensity > 0.4 ? '#C97B1A' : '#1AB8C8';
                  return <Cell key={i} fill={color} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Regions */}
        <div className="card p-5">
          <p className="label mb-4">Incidents by Region</p>
          {(regions ?? []).length === 0
            ? <p className="text-xs text-center py-8" style={{ color: 'var(--text-faint)' }}>No data</p>
            : (regions ?? []).slice(0, 10).map((r) => {
                const maxCount = Math.max(...(regions ?? []).map((x) => x.count), 1);
                return (
                  <div key={r.region} className="mb-2.5">
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text-muted)' }}>{r.region}</span>
                      <span className="font-mono" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-faint)' }}>{r.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hi)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(r.count / maxCount) * 100}%`, background: '#E8442A' }} />
                    </div>
                  </div>
                );
              })
          }
        </div>

        {/* Response times breakdown */}
        <div className="card p-5">
          <p className="label mb-4">Response Times</p>
          {[
            { label: 'Avg Dispatch',   val: times?.avgDispatchSec,   target: 480,  color: '#1AB8C8' },
            { label: 'Avg Arrival',    val: times?.avgArrivalSec,    target: 600,  color: '#C97B1A' },
            { label: 'Avg Resolution', val: times?.avgResolutionSec, target: 3600, color: '#7CB518' },
          ].map(({ label, val, target, color }) => {
            const secs = val ?? 0;
            const pct  = Math.min((secs / target) * 100, 100);
            return (
              <div key={label} className="mb-4">
                <div className="flex justify-between text-xs mb-1.5">
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{label}</span>
                  <span className="font-mono" style={{ fontFamily: 'JetBrains Mono, monospace', color }}>{formatSec(secs)}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden relative" style={{ background: 'var(--surface-hi)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>Target: {formatSec(target)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="card">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <p className="label">Top Responders</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-hi)' }}>
                {['Rank','Name','Dispatches','Avg Arrival','SLA','Streak'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(topR ?? []).length === 0
                ? <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-faint)' }}>No data yet</td></tr>
                : (topR ?? []).map((r, i) => (
                  <tr key={r.responderId} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-3 font-mono font-bold" style={{ fontFamily: 'JetBrains Mono, monospace', color: i === 0 ? '#C97B1A' : 'var(--text-faint)' }}>#{i + 1}</td>
                    <td className="px-4 py-3 font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{r.responderName}</td>
                    <td className="px-4 py-3 font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{r.totalDispatch}</td>
                    <td className="px-4 py-3 font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{formatSec(r.avgArrivalSec)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hi)' }}>
                          <div className="h-full rounded-full" style={{ width: `${r.slaCompliance}%`, background: r.slaCompliance >= 80 ? '#7CB518' : '#C97B1A' }} />
                        </div>
                        <span className="font-mono text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: r.slaCompliance >= 80 ? '#7CB518' : '#C97B1A' }}>
                          {r.slaCompliance.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-faint)' }}>{r.streakDays}d</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
