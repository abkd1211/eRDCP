'use client';
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Loader2, Mic, CheckCircle2, Clock, AlertTriangle, RotateCcw } from 'lucide-react';
import { agentApi } from '@/lib/services';
import { StatCard } from '@/components/ui';
import { confidenceColor, formatRelative } from '@/lib/utils';
import type { CallSession, SessionStatus } from '@/types';

const STATUS_LABELS: Record<SessionStatus, string> = {
  PENDING:            'Pending',
  TRANSCRIBING:       'Transcribing',
  EXTRACTING:         'Extracting',
  PENDING_REVIEW:     'Needs Review',
  AUTO_SUBMITTED:     'Auto Submitted',
  MANUALLY_SUBMITTED: 'Submitted',
  DISCARDED:          'Discarded',
  FAILED:             'Failed',
};
const STATUS_COLOR: Record<SessionStatus, string> = {
  PENDING:            '#9AA3AF',
  TRANSCRIBING:       '#1AB8C8',
  EXTRACTING:         '#C97B1A',
  PENDING_REVIEW:     '#C97B1A',
  AUTO_SUBMITTED:     '#7CB518',
  MANUALLY_SUBMITTED: '#7CB518',
  DISCARDED:          '#5A6370',
  FAILED:             '#E8442A',
};

export default function AgentPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [phone, setPhone]       = useState('');
  const [selectedId, setSelId]  = useState<string | null>(null);
  const [uploadError, setError] = useState('');

  const { data: status }   = useQuery({ queryKey: ['agent-status'],   queryFn: agentApi.getStatus,   refetchInterval: 15_000 });
  const { data: sessions } = useQuery({ queryKey: ['agent-sessions'], queryFn: () => agentApi.listSessions(1, 20), refetchInterval: 10_000 });
  const { data: detail }   = useQuery({
    queryKey: ['agent-session', selectedId],
    queryFn:  () => agentApi.getSession(selectedId!),
    enabled:  !!selectedId,
  });

  const ingestMut = useMutation({
    mutationFn: (fd: FormData) => agentApi.ingestCall(fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-sessions'] });
      setPhone('');
      setError('');
    },
    onError: (e: unknown) => {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Upload failed');
    },
  });

  const replayMut = useMutation({
    mutationFn: (id: string) => agentApi.replayNlp(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-session', selectedId] }),
  });

  const handleFile = (file: File) => {
    setError('');
    const fd = new FormData();
    fd.append('audio', file);
    if (phone) fd.append('callerPhone', phone);
    ingestMut.mutate(fd);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const sessionList: CallSession[] = sessions?.data ?? [];
  const det = detail;

  const EXTRACTION_FIELDS = [
    { key: 'citizenName',  label: 'Caller Name',   confKey: 'confidenceName' },
    { key: 'incidentType', label: 'Incident Type', confKey: 'confidenceType' },
    { key: 'locationText', label: 'Location',      confKey: 'confidenceLocation' },
    { key: 'urgency',      label: 'Urgency',       confKey: 'confidenceUrgency' },
    { key: 'notes',        label: 'Notes',         confKey: 'confidenceNotes' },
  ] as const;

  return (
    <div className="p-6 space-y-6">
      {/* Status banner */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{ background: status?.isAiActive ? 'rgba(26,184,200,0.08)' : 'rgba(201,123,26,0.08)', border: `1px solid ${status?.isAiActive ? 'rgba(26,184,200,0.2)' : 'rgba(201,123,26,0.2)'}` }}>
        <Mic size={13} style={{ color: status?.isAiActive ? '#1AB8C8' : '#C97B1A' }} />
        <p className="text-xs font-semibold" style={{ color: status?.isAiActive ? '#1AB8C8' : '#C97B1A', fontFamily: 'Syne, sans-serif' }}>
          {status?.isAiActive ? `AI Agent Active — ${status.operatorsOnline} operator(s) online — Groq ${status.whisperModel}` : 'AI Agent Standby — Operators online'}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Sessions"   value={status?.totalSessions  ?? 0}    accentColor="#1AB8C8" />
        <StatCard label="Auto Submit Rate" value={`${((status?.autoSubmitRate ?? 0) * 100).toFixed(0)}%`} accentColor="#7CB518" />
        <StatCard label="Avg Confidence"   value={`${((status?.avgConfidence ?? 0) * 100).toFixed(0)}%`}  accentColor="#C97B1A" />
        <StatCard label="Operators Online" value={status?.operatorsOnline ?? 0}   accentColor="#9AA3AF" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload panel */}
        <div className="space-y-4">
          <div>
            <label className="label block mb-1.5">Caller Phone (optional)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-base" placeholder="+233 24 123 4567" />
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all"
            style={{
              minHeight: 160,
              borderColor:  dragging ? '#1AB8C8' : 'var(--border-strong)',
              background:   dragging ? 'rgba(26,184,200,0.06)' : 'var(--surface-hi)',
            }}>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {ingestMut.isPending
              ? <><Loader2 size={28} className="animate-spin" style={{ color: '#1AB8C8' }} /><p className="text-xs" style={{ color: 'var(--text-faint)' }}>Processing audio...</p></>
              : <><Upload size={28} style={{ color: dragging ? '#1AB8C8' : 'var(--text-faint)' }} />
                  <p className="text-sm font-semibold" style={{ fontFamily: 'Syne, sans-serif', color: dragging ? '#1AB8C8' : 'var(--text-muted)' }}>Drop audio file or click to upload</p>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>WAV · MP3 · M4A · OGG · FLAC · WEBM — max 25MB</p>
                </>
            }
          </div>

          {uploadError && <p className="text-xs p-2 rounded" style={{ color: '#E8442A', background: 'rgba(232,68,42,0.1)' }}>{uploadError}</p>}

          {/* How it works */}
          <div className="card p-4">
            <p className="label mb-3">How It Works</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { n: 1, title: 'Audio Upload',    desc: 'Voicemail or recording uploaded via API or this interface' },
                { n: 2, title: 'Groq Whisper',    desc: 'Multilingual transcription — English, Twi, Ga, Hausa supported' },
                { n: 3, title: 'NLP Extraction',  desc: 'Rule-based extraction of incident type, location, caller details' },
                { n: 4, title: 'Auto Dispatch',   desc: 'Confidence ≥ 85%: auto-creates incident. Below: queued for review' },
              ].map(({ n, title, desc }) => (
                <div key={n} className="relative p-3 rounded-lg overflow-hidden" style={{ background: 'var(--surface-hi)' }}>
                  <span className="absolute top-1 right-2 text-3xl font-bold font-mono leading-none select-none"
                    style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--border-strong)', fontSize: 32 }}>{n}</span>
                  <p className="text-xs font-bold mb-1 relative z-10" style={{ fontFamily: 'Syne, sans-serif' }}>{title}</p>
                  <p className="text-xs relative z-10" style={{ color: 'var(--text-faint)' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sessions list */}
        <div className="card flex flex-col" style={{ maxHeight: 520 }}>
          <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <p className="label">Call Sessions</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessionList.length === 0
              ? <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <Mic size={24} style={{ color: 'var(--text-faint)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>No sessions yet. Upload an audio file to begin.</p>
                </div>
              : sessionList.map((s) => (
                <button key={s._id} onClick={() => setSelId(s._id)}
                  className="w-full text-left px-4 py-3 border-b last:border-b-0 transition-opacity hover:opacity-80"
                  style={{ borderColor: 'var(--border)', background: selectedId === s._id ? 'rgba(232,68,42,0.05)' : 'transparent' }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: STATUS_COLOR[s.status], animation: (s.status === 'TRANSCRIBING' || s.status === 'EXTRACTING') ? 'pulse-dot 1.4s ease-in-out infinite' : 'none' }} />
                      <span className="text-xs font-semibold" style={{ fontFamily: 'Syne, sans-serif', color: STATUS_COLOR[s.status] }}>{STATUS_LABELS[s.status]}</span>
                    </div>
                    {s.language && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-hi)', color: 'var(--text-faint)' }}>{s.language}</span>}
                  </div>
                  <p className="text-xs font-mono" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>{s.callerPhone || 'Unknown caller'}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{formatRelative(s.createdAt)}</p>
                </button>
              ))
            }
          </div>
        </div>
      </div>

      {/* Session detail modal */}
      <AnimatePresence>
        {selectedId && det && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setSelId(null); }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="card w-full flex flex-col"
              style={{ maxWidth: 580, maxHeight: '88vh', borderTop: '2px solid #1AB8C8' }}
            >
              <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>Session Detail</p>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>{det.session._id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => replayMut.mutate(selectedId)} disabled={replayMut.isPending}
                    className="btn btn-ghost p-2 rounded gap-1 text-xs" style={{ color: '#1AB8C8' }}>
                    {replayMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Re-run
                  </button>
                  <button onClick={() => setSelId(null)} className="btn-ghost p-1 rounded"><X size={15} /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Transcription */}
                {det.transcription && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="label">Transcription</p>
                      {det.transcription.language && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(26,184,200,0.12)', color: '#1AB8C8', fontFamily: 'Syne, sans-serif' }}>
                          Detected: {det.transcription.language}
                        </span>
                      )}
                    </div>
                    <div className="p-3 rounded-lg overflow-y-auto" style={{ maxHeight: 120, background: 'var(--surface-hi)', border: '1px solid var(--border)' }}>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{det.transcription.text || 'No transcript available'}</p>
                    </div>
                    {det.transcription.confidence !== undefined && (
                      <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>
                        Confidence: {(det.transcription.confidence * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                )}

                {/* Extracted fields */}
                {det.extraction && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="label">Extracted Fields</p>
                      <span className="text-xs font-mono font-bold" style={{ fontFamily: 'JetBrains Mono, monospace', color: confidenceColor(det.extraction.confidence) }}>
                        Overall: {(det.extraction.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="space-y-2">
                      {EXTRACTION_FIELDS.map(({ key, label, confKey }) => {
                        const value = det.extraction![key as keyof typeof det.extraction] as string;
                        const conf  = det.extraction![confKey as keyof typeof det.extraction] as number;
                        const color = confidenceColor(conf);
                        return (
                          <div key={key} className="p-3 rounded-lg" style={{ background: 'var(--surface-hi)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center justify-between mb-1">
                              <p className="label">{label}</p>
                              <div className="flex items-center gap-1.5">
                                <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-strong)' }}>
                                  <div className="h-full rounded-full" style={{ width: `${conf * 100}%`, background: color }} />
                                </div>
                                <span className="text-xs font-mono" style={{ fontFamily: 'JetBrains Mono, monospace', color, minWidth: 32 }}>{(conf * 100).toFixed(0)}%</span>
                              </div>
                            </div>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{String(value) || '—'}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Coordinates */}
                    {(det.extraction.latitude !== 0 || det.extraction.longitude !== 0) && (
                      <p className="text-xs font-mono mt-2" style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-faint)' }}>
                        GPS: {det.extraction.latitude.toFixed(5)}, {det.extraction.longitude.toFixed(5)}
                      </p>
                    )}
                  </div>
                )}

                {/* Status info */}
                <div className="flex items-center gap-2 text-xs p-3 rounded-lg" style={{ background: 'var(--surface-hi)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[det.session.status] }} />
                  <span style={{ color: STATUS_COLOR[det.session.status], fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{STATUS_LABELS[det.session.status]}</span>
                  <span style={{ color: 'var(--text-faint)' }}>· {formatRelative(det.session.updatedAt)}</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
