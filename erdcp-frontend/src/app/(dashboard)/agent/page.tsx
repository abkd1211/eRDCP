'use client';
import { useAuth } from '@/store/auth.store';
import { redirect } from 'next/navigation';
import AgentDashboard from '@/components/agent/AgentDashboard';

export default function AgentPage() {
  const { user, hydrated } = useAuth();

  // Wait for rehydration to avoid jumpy guards
  if (!hydrated) return null;

  // SYSTEM_ADMIN only for now — can be expanded to specialized dispatchers
  if (user && user.role !== 'SYSTEM_ADMIN') {
    redirect('/dashboard');
  }

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen">
      <div className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>AI Call Agent</h1>
        <p className="text-xs text-white/40 font-mono flex items-center gap-2 uppercase tracking-widest">
           <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
           Cognitive Emergency Ingestion & Dispatch Optimization
        </p>
      </div>

      <AgentDashboard />
    </div>
  );
}
