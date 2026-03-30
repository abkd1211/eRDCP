'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth.store';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar }  from '@/components/layout/Topbar';
import { AlertToasts } from '@/components/layout/AlertToasts';
import { useSocket } from '@/store/socket.store';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, accessToken, hydrated } = useAuth();
  const { connect, disconnect } = useSocket();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const connectedRef = useRef(false);

  // ── Auth guard — only redirect AFTER Zustand has rehydrated ──────────────
  useEffect(() => {
    if (!hydrated) return;        // wait for localStorage read to finish
    if (!user) {
      router.replace('/auth/login');
    }
  }, [hydrated, user, router]);

  // ── Socket connection — separate effect, stable deps ─────────────────────
  useEffect(() => {
    if (!user || !accessToken) return;
    if (connectedRef.current) return;   // already connected this mount
    connectedRef.current = true;
    connect(accessToken);

    return () => {
      connectedRef.current = false;
      disconnect();
    };
    // Only re-run if the token actually changes (e.g. after refresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // ── Loading spinner while Zustand rehydrates ──────────────────────────────
  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-8 h-8 border-2 rounded-full border-t-transparent animate-spin"
          style={{ borderColor: '#E8442A', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  // ── Blank frame while redirect fires ─────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }} />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar onMenuToggle={() => setSidebarOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
      <AlertToasts />
    </div>
  );
}
