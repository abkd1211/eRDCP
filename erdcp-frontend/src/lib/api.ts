'use client';
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '@/store/auth.store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request — read at call time so rehydration timing doesn't matter
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    // Prefer the Zustand store (already in memory after rehydration)
    // Fall back to localStorage directly for the first few ms before rehydration
    const token =
      useAuth.getState().accessToken ??
      localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

let isRefreshing = false;
let queue: Array<(token: string) => void> = [];

function flushQueue(token: string) {
  queue.forEach((cb) => cb(token));
  queue = [];
}

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    // Never retry the refresh call itself, and never retry twice
    if (
      err.response?.status !== 401 ||
      original._retry ||
      original.url?.includes('/auth/refresh-token')
    ) {
      return Promise.reject(err);
    }

    // If a refresh is already in flight, queue this request
    if (isRefreshing) {
      return new Promise((resolve) => {
        queue.push((token: string) => {
          original.headers.Authorization = `Bearer ${token}`;
          resolve(api(original));
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const refreshToken =
        useAuth.getState().refreshToken ??
        localStorage.getItem('refreshToken');

      if (!refreshToken) throw new Error('No refresh token');

      const { data } = await axios.post(`${API_URL}/auth/refresh-token`, { refreshToken });
      const tokens = data?.data;

      if (!tokens?.accessToken) throw new Error('No access token in refresh response');

      const newAccess  = tokens.accessToken;
      const newRefresh = tokens.refreshToken ?? refreshToken;

      // Update Zustand store + localStorage together
      useAuth.getState().updateTokens({ accessToken: newAccess, refreshToken: newRefresh });

      flushQueue(newAccess);
      original.headers.Authorization = `Bearer ${newAccess}`;
      return api(original);
    } catch {
      queue = [];
      useAuth.getState().clearAuth();
      if (typeof window !== 'undefined') window.location.href = '/auth/login';
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;