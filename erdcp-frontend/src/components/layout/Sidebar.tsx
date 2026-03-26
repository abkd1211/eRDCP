'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, MapPin, AlertTriangle, BarChart3, Mic,
  Users, User, LogOut, Radio, X,
} from 'lucide-react';
import { useAuth } from '@/store/auth.store';
import { useSocket } from '@/store/socket.store';
import { authApi } from '@/lib/services';
import { useRouter } from 'next/navigation';
import type { Role } from '@/types';
import { ROLE_CONFIG } from '@/lib/utils';

interface NavItem { href: string; label: string; icon: React.ReactNode; roles?: Role[]; }

const NAV: NavItem[] = [
  { href: '/dashboard',  label: 'Dashboard',    icon: <LayoutDashboard size={17} /> },
  { href: '/dispatch',   label: 'Live Dispatch', icon: <MapPin size={17} /> },
  { href: '/incidents',  label: 'Incidents',     icon: <AlertTriangle size={17} />, roles: ['SYSTEM_ADMIN','HOSPITAL_ADMIN','POLICE_ADMIN','FIRE_SERVICE_ADMIN'] },
  { href: '/analytics',  label: 'Analytics',     icon: <BarChart3 size={17} />,     roles: ['SYSTEM_ADMIN','HOSPITAL_ADMIN','POLICE_ADMIN','FIRE_SERVICE_ADMIN'] },
  { href: '/agent',      label: 'AI Call Agent', icon: <Mic size={17} />,           roles: ['SYSTEM_ADMIN'] },
  { href: '/users',      label: 'User Mgmt',     icon: <Users size={17} />,         roles: ['SYSTEM_ADMIN'] },
];

interface Props { isOpen: boolean; onClose: () => void; }

export function Sidebar({ isOpen, onClose }: Props) {
  const pathname  = usePathname();
  const router    = useRouter();
  const { user, clearAuth } = useAuth();
  const { connected, disconnect } = useSocket();

  const visibleNav = NAV.filter((item) =>
    !item.roles || (user && item.roles.includes(user.role as Role))
  );

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    disconnect();
    clearAuth();
    router.replace('/auth/login');
  };

  const roleConf = user ? ROLE_CONFIG[user.role as Role] : null;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(232,68,42,0.15)' }}>
          <Radio size={16} style={{ color: '#E8442A' }} />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>ERDCP</p>
          <p className="font-mono text-xs" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>COMMAND</p>
        </div>
        <button onClick={onClose} className="lg:hidden ml-auto btn-ghost p-1 rounded" style={{ color: 'var(--text-faint)' }}>
          <X size={16} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {visibleNav.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href} onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all text-sm"
              style={{
                fontFamily: 'Syne, sans-serif', fontWeight: 600,
                color:      active ? '#E8442A' : 'var(--text-muted)',
                background: active ? 'rgba(232,68,42,0.08)' : 'transparent',
                borderLeft: active ? '2px solid #E8442A' : '2px solid transparent',
              }}>
              <span style={{ color: active ? '#E8442A' : 'var(--text-faint)' }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        <Link href="/profile" onClick={onClose}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all text-sm"
          style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 600,
            color:      pathname === '/profile' ? '#E8442A' : 'var(--text-muted)',
            background: pathname === '/profile' ? 'rgba(232,68,42,0.08)' : 'transparent',
            borderLeft: pathname === '/profile' ? '2px solid #E8442A' : '2px solid transparent',
          }}>
          <User size={17} style={{ color: pathname === '/profile' ? '#E8442A' : 'var(--text-faint)' }} />
          My Profile
        </Link>
      </nav>

      {/* User + status */}
      <div className="px-3 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse-dot"
            style={{ background: connected ? '#7CB518' : '#5A6370' }} />
          <span className="text-xs font-mono" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-2 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
            style={{ background: `${roleConf?.color}22`, color: roleConf?.color, fontFamily: 'Syne, sans-serif' }}>
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate" style={{ fontFamily: 'Syne, sans-serif' }}>{user?.name}</p>
            <p className="text-xs truncate" style={{ color: roleConf?.color, fontFamily: 'JetBrains Mono, monospace' }}>{roleConf?.label}</p>
          </div>
        </div>

        <button onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all"
          style={{ color: 'var(--text-faint)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#E8442A'; (e.currentTarget as HTMLElement).style.background = 'rgba(232,68,42,0.08)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
          <LogOut size={15} /> Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-52 flex-shrink-0 border-r"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={onClose} />
            <motion.aside key="drawer" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.24 }}
              className="lg:hidden fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
