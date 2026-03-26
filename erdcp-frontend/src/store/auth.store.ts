'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  user:         User | null;
  accessToken:  string | null;
  refreshToken: string | null;
  hydrated:     boolean;
  setAuth:      (user: User, tokens: { accessToken: string; refreshToken: string }) => void;
  clearAuth:    () => void;
  setHydrated:  () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user:         null,
      accessToken:  null,
      refreshToken: null,
      hydrated:     false,
      setAuth: (user, tokens) => {
        localStorage.setItem('accessToken',  tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
        set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      },
      clearAuth: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({ user: null, accessToken: null, refreshToken: null });
      },
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name:    'erdcp-auth',
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }),
      onRehydrateStorage: () => (state) => { state?.setHydrated(); },
    }
  )
);
