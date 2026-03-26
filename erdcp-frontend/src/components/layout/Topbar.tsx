'use client';
import { usePathname } from 'next/navigation';
import { Menu, Bell, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/store/auth.store';
import { useSocket } from '@/store/socket.store';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':  'Dashboard',
  '/dispatch':   'Live Dispatch',
  '/incidents':  'Incidents',
  '/analytics':  'Analytics',
  '/agent':      'AI Call Agent',
  '/users':      'User Management',
  '/profile':    'My Profile',
};

interface Props { onMenuToggle: () => void; }

export function Topbar({ onMenuToggle }: Props) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { alerts } = useSocket();

  const title = PAGE_TITLES[pathname ?? ''] ?? 'ERDCP';
  const unread = alerts.length;

  return (
    <header className="flex items-center gap-3 px-4 border-b flex-shrink-0"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', height: 52 }}>
      {/* Mobile hamburger */}
      <button onClick={onMenuToggle} className="lg:hidden btn-ghost p-1.5 rounded-lg" aria-label="Open menu">
        <Menu size={18} />
      </button>

      {/* Title */}
      <h1 className="text-sm font-bold truncate min-w-0 flex-1"
        style={{ fontFamily: 'Syne, sans-serif' }}>
        {title}
      </h1>

      {/* Right controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Theme toggle */}
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="btn-ghost p-2 rounded-lg"
          aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Alerts bell */}
        <div className="relative">
          <button className="btn-ghost p-2 rounded-lg" aria-label="Alerts">
            <Bell size={16} />
          </button>
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold"
              style={{ background: '#E8442A', color: '#fff', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>

        {/* User initials */}
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ml-1"
          style={{ background: 'rgba(232,68,42,0.15)', color: '#E8442A', fontFamily: 'Syne, sans-serif' }}>
          {user?.name.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
