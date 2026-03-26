'use client';
import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useAuth } from '@/store/auth.store';
import { useSocket } from '@/store/socket.store';
import { agentApi } from '@/lib/services';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      retryDelay: 2000,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
    },
    mutations: { retry: 0 },
  },
});

function SocketSync() {
  const { user, accessToken } = useAuth();
  const { connected, connect, disconnect } = useSocket();

  useEffect(() => {
    if (user && accessToken && !connected) connect(accessToken);
    if (!user && connected) disconnect();
  }, [user, accessToken, connected, connect, disconnect]);

  return null;
}

function OperatorHeartbeat() {
  const { user, accessToken } = useAuth();
  useEffect(() => {
    if (!user || !accessToken) return;
    agentApi.markOnline().catch(() => {});
    const id = setInterval(() => agentApi.heartbeat().catch(() => {}), 55_000);
    return () => {
      clearInterval(id);
      agentApi.markOffline().catch(() => {});
    };
  }, [user, accessToken]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
        <SocketSync />
        <OperatorHeartbeat />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
