'use client';
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Phone, 
  Settings, 
  UserCheck, 
  UserX, 
  Zap,
  Activity,
  History,
  Brain,
  Shield,
  TrendingUp,
  Target,
  Search,
  Filter,
  AlertCircle,
  Loader2,
  X,
  Upload,
  Mic,
  Volume2,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { agentApi } from '@/lib/services';
import { StatusBadge, IncidentTypeBadge, StatCard } from '@/components/ui';
import { formatRelative } from '@/lib/utils';

const toast = {
  success: (msg: string) => console.log('Toast Success:', msg),
  error:   (msg: string) => console.error('Toast Error:', msg)
};

export default function AgentDashboard() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Queries
  const { data: status, error: statusError, isLoading: isStatusLoading } = useQuery({
    queryKey: ['agent-status'],
    queryFn: agentApi.getStatus,
    refetchInterval: (data) => (data ? 10000 : false), // Pause polling if in error state (503)
    retry: 1,
  });

  const { data: sessions, isLoading: isSessionsLoading } = useQuery({
    queryKey: ['agent-sessions'],
    queryFn: () => agentApi.listSessions(1, 10),
    refetchInterval: 5000,
  });

  // Mutations
  const toggleEngagement = useMutation({
    mutationFn: (active: boolean) => active ? agentApi.markOnline() : agentApi.markOffline(),
    onMutate: async (newActive) => {
      await queryClient.cancelQueries({ queryKey: ['agent-status'] });
      const previous = queryClient.getQueryData(['agent-status']);
      queryClient.setQueryData(['agent-status'], (old: any) => ({
        ...old,
        operatorsOnline: newActive ? 1 : 0
      }));
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-status'] });
      toast.success('Engagement status synchronized');
    },
    onError: (err: any, _newActive, context: any) => {
      queryClient.setQueryData(['agent-status'], context.previous);
      toast.error(`Sync failed: ${err.response?.data?.message || err.message}`);
    }
  });

  const resetMutation = useMutation({
    mutationFn: agentApi.resetCircuit,
    onSuccess: () => {
      toast.success('System re-sync triggered');
      queryClient.invalidateQueries({ queryKey: ['agent-status'] });
      queryClient.invalidateQueries({ queryKey: ['agent-sessions'] });
    },
    onError: () => toast.error('Resync failed — gateway still locked')
  });

  const ingestMutation = useMutation({
    mutationFn: (formData: FormData) => agentApi.ingestCall(formData),
    onSuccess: () => {
      setIsSimulating(false);
      setSelectedFile(null);
      toast.success('Analysis initiated');
      queryClient.invalidateQueries({ queryKey: ['agent-sessions'] });
    },
    onError: (err: any) => {
      toast.error(`Ingestion failed: ${err.message}`);
    }
  });

  const simulateMutation = useMutation({
    mutationFn: (script: string) => agentApi.simulateCall(script),
    onSuccess: () => {
      setIsSimulating(false);
      toast.success('Simulation signal injected');
      queryClient.invalidateQueries({ queryKey: ['agent-sessions'] });
    },
    onError: (err: any) => {
      toast.error(`Simulation failed: ${err.response?.data?.message || err.message}`);
    }
  });

  const handleSimulateSubmit = () => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append('audio', selectedFile);
    formData.append('callerPhone', 'SIM-GUEST-' + Math.floor(Math.random() * 9000 + 1000));
    ingestMutation.mutate(formData);
  };

  const handleTestIngest = (scenario?: string) => {
    const scripts: Record<string, string> = {
      'Motor.Collision': 'Report: Major multi-vehicle collision on N1 Highway near Achimota. Multiple causalities suspected. Urgent EMS and fire services needed.',
      'Armed.Assault': 'Emergency! There is an armed robbery in progress at a pharmacy in Osu. Shots have been fired, one person is down. Send police and ambulance now.',
      'Cardiac.Arrest': 'Help! My grandfather has collapsed and isn\'t breathing. We are at the Spintex Road Shell station. Please send an ambulance quickly.'
    };
    
    const script = scenario ? scripts[scenario] : scripts['Motor.Collision'];
    simulateMutation.mutate(script);
  };

  const isEngaged = (status?.operatorsOnline ?? 0) > 0;
  const isCircuitOpen = (statusError as any)?.response?.status === 503;

  return (
    <div className="p-6 space-y-6 animate-fade-in relative">
      
      {/* ── CONNECTION ERROR OVERLAY ── */}
      {isCircuitOpen && (
        <div className="absolute inset-x-6 top-6 z-30 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl backdrop-blur-md flex items-center justify-between animate-fade-down">
          <div className="flex items-center gap-3">
             <AlertCircle className="text-orange-500" size={20} />
             <div>
                <p className="text-xs font-bold text-orange-200 uppercase tracking-widest">System Signal Interrupted</p>
                <p className="text-[10px] text-orange-200/60 font-medium">Gateway has paused AI service route (Circuit Open).</p>
             </div>
          </div>
          <button 
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="btn btn-primary py-2 px-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
          >
            {resetMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Attempt Re-Sync
          </button>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className={`flex flex-col md:flex-row items-center justify-between gap-4 transition-opacity ${isCircuitOpen ? 'opacity-30 pointer-events-none' : ''}`}>
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg border" 
          style={{ 
            background: isEngaged ? 'rgba(124,181,24,0.1)' : 'rgba(232,68,42,0.1)', 
            borderColor: isEngaged ? 'rgba(124,181,24,0.2)' : 'rgba(232,68,42,0.2)' 
          }}>
           <div className={`w-2 h-2 rounded-full ${isEngaged ? 'bg-[#7CB518]' : 'bg-[#E8442A]'}`} />
           <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: isEngaged ? '#7CB518' : '#E8442A' }}>
             {isEngaged ? 'Ingestion Monitor: ENGAGED' : 'Ingestion Monitor: DISENGAGED (AUTONOMOUS)'}
           </p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => toggleEngagement.mutate(!isEngaged)}
            disabled={toggleEngagement.isPending || isStatusLoading}
            className={`btn py-2 px-4 text-xs font-bold ${isEngaged ? 'btn-secondary' : 'btn-primary'}`}
          >
            {toggleEngagement.isPending ? '...' : (isEngaged ? 'Disengage' : 'Engage System')}
          </button>
          <button 
            onClick={() => setIsSimulating(true)}
            className="btn btn-ghost border border-white/10 py-2 px-4 text-xs font-bold flex items-center gap-2"
          >
            <Zap size={14} /> Diagnostic Lab
          </button>
        </div>
      </div>

      {/* ── KPI SECTION ── */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 transition-opacity ${isCircuitOpen ? 'opacity-30' : ''}`}>
        <StatCard label="Review Loop" value={status?.operatorsOnline ?? 0} icon={<UserCheck size={16}/>} accentColor="#7CB518" loading={isStatusLoading} />
        <StatCard label="System Ingestions" value={status?.totalSessions ?? 0} icon={<History size={16}/>} accentColor="#1AB8C8" loading={isStatusLoading} />
        <StatCard label="Model Confidence" value={`${((status?.avgConfidence ?? 0.85) * 100).toFixed(0)}%`} icon={<Brain size={16}/>} accentColor="#C97B1A" loading={isStatusLoading} />
        <StatCard label="Auto-Dispatch" value={`${((status?.autoSubmitRate ?? 0.45) * 100).toFixed(0)}%`} icon={<Target size={16}/>} accentColor="#E8442A" loading={isStatusLoading} />
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 transition-opacity ${isCircuitOpen ? 'opacity-30' : ''}`}>
        {/* Call Audit Archive */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <p className="label">Call Processing Audit</p>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/20" />
                <input type="text" placeholder="Search Session..." className="bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1 text-[10px] focus:outline-none" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Session ID','Transcript Preview','Time','Intelligence','Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left label font-bold uppercase tracking-widest">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                {isSessionsLoading ? (
                  <tr><td colSpan={5} className="py-12 text-center text-white/20 uppercase tracking-widest italic animate-pulse">Syncing Cognitive Grid...</td></tr>
                ) : sessions?.data?.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center text-white/20 uppercase tracking-widest italic">Awaiting Signal Stimulus...</td></tr>
                ) : (
                  sessions?.data?.map((s: any) => (
                    <tr key={s._id} className="border-b last:border-b-0 hover:bg-white/[0.02]" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-3 font-mono text-[10px] text-white/40">{s.sessionId?.slice(-6).toUpperCase() ?? '—'}</td>
                      <td className="px-4 py-3 max-w-xs truncate text-white/70 font-medium">{s.transcription?.cleanedText || '—'}</td>
                      <td className="px-4 py-3 text-white/40">{formatRelative(s.createdAt)}</td>
                      <td className="px-4 py-3">
                         <div className="flex items-center gap-2">
                           <div className="w-10 h-1 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-[#1AB8C8]" style={{ width: `${(s.extraction?.overallConfidence || 0.8) * 100}%` }} />
                           </div>
                           <span className="text-[10px] text-white/30">{((s.extraction?.overallConfidence || 0.8) * 100).toFixed(0)}%</span>
                         </div>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))
                )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Configuration Panel */}
        <div className="space-y-6">
          <div className="card p-5">
            <p className="label mb-4 uppercase tracking-[0.2em] opacity-40">Intelligence Stack</p>
            <div className="space-y-4">
               {[
                 { icon: <Shield size={14}/>, label: 'Guard Rails', value: 'Active', color: '#7CB518' },
                 { icon: <Activity size={14}/>, label: 'Min Confidence', value: `${((status?.confidenceThreshold ?? 0.8) * 100).toFixed(0)}%`, color: '#1AB8C8' },
                 { icon: <Brain size={14}/>, label: 'STT Logic', value: status?.whisperAvailable ? 'Groq Whisper-v3' : 'Node Hybrid', color: '#C97B1A' }
               ].map((item, i) => (
                 <div key={i} className="flex items-center gap-3">
                    <div className="p-2 rounded-lg" style={{ background: `${item.color}10`, color: item.color }}>{item.icon}</div>
                    <div>
                       <p className="text-[10px] text-white/40 uppercase font-black tracking-tighter">{item.label}</p>
                       <p className="text-xs font-bold text-white/70">{item.value}</p>
                    </div>
                 </div>
               ))}
            </div>

            <div className="mt-6 pt-6 border-t border-white/5">
               <div className="p-3 rounded-lg bg-[#C97B1A]/5 border border-[#C97B1A]/10 flex items-start gap-2">
                  <AlertCircle size={14} className="text-[#C97B1A] mt-0.5 shrink-0" />
                  <p className="text-[10px] text-white/40 leading-relaxed font-medium">
                    Critical Policy: High-confidence incidents bypass manual reviews to ensure dispatcher availability for secondary coordination.
                  </p>
               </div>
            </div>
          </div>

          <div className="card p-5 bg-gradient-to-br from-[#F97316]/5 to-transparent border-[#F97316]/10">
             <div className="flex items-center gap-2 text-[#F97316] mb-2 font-bold text-xs uppercase tracking-widest">
                <Mic size={14} fill="currentColor" /> Signal Stimulation
             </div>
             <p className="text-[10px] text-white/40 mb-4 leading-relaxed">
               Inject actual audio signals into the ingestion logic to verify phonetic-to-entity extraction fidelity.
             </p>
             <button 
                onClick={() => setIsSimulating(true)}
                className="btn btn-secondary w-full py-3 text-[10px] font-black uppercase tracking-widest border-[#F97316]/20 text-[#F97316] hover:bg-[#F97316]/10"
             >
                Enter Diagnostic Lab
             </button>
          </div>
        </div>
      </div>

      {/* High-Fidelity Simulation Modal */}
      {isSimulating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="card p-8 w-full max-w-sm animate-fade-up border-t-4 border-[#F97316]">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3 text-[#F97316]">
                 <Volume2 size={24} />
                 <h2 className="font-bold text-xl uppercase italic tracking-tighter">Signal Lab</h2>
              </div>
              <button onClick={() => setIsSimulating(false)} className="text-white/20 hover:text-white transition-all"><X size={20} /></button>
            </div>

            <div className="space-y-6">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`w-full aspect-video rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
                  selectedFile ? 'border-[#7CB518]/40 bg-[#7CB518]/5 text-[#7CB518]' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] text-white/20'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} 
                  className="hidden" 
                  accept="audio/*"
                />
                {selectedFile ? (
                   <>
                     <CheckCircle2 size={32} />
                     <p className="text-xs font-bold italic">{selectedFile.name}</p>
                     <p className="text-[10px] opacity-40 uppercase">Click to re-select</p>
                   </>
                ) : (
                   <>
                     <Upload size={32} strokeWidth={1} />
                     <p className="text-xs font-bold uppercase tracking-widest italic">Signal Ingest</p>
                     <p className="text-[10px] opacity-40">MP3, WAV, M4A Accepted</p>
                   </>
                )}
              </div>

              <div className="p-4 bg-white/5 rounded-2xl space-y-3">
                 <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.2em] mb-1">Trigger Verified Sample</p>
                 <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'Motor.Collision', label: 'Motor Collision (N1)' },
                      { id: 'Armed.Assault', label: 'Armed Incident (Osu)' },
                      { id: 'Cardiac.Arrest', label: 'Medical Emergency' }
                    ].map(t => (
                      <button 
                        key={t.id} 
                        disabled={simulateMutation.isPending}
                        onClick={() => handleTestIngest(t.id)}
                        className="px-4 py-2 bg-white/5 border border-white/5 rounded-lg text-[10px] font-black italic text-white/20 text-left hover:border-orange-500/30 hover:text-orange-400 transition-all flex items-center justify-between"
                      >
                        {t.label}
                        <Zap size={10} className="opacity-40" />
                      </button>
                    ))}
                 </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setIsSimulating(false)} 
                className="btn btn-ghost flex-1 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] opacity-40 hover:opacity-100"
              >
                Abort
              </button>
              <button 
                onClick={handleSimulateSubmit} 
                disabled={ingestMutation.isPending || !selectedFile} 
                className={`btn flex-1 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] ${
                  selectedFile ? 'btn-primary' : 'bg-white/5 text-white/10 cursor-not-allowed'
                }`}
              >
                {ingestMutation.isPending ? 'Processing' : 'Inject Signal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
