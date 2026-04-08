'use client';
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '@/store/auth.store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  // 65s timeout: Render free-tier cold starts can take 30–60s.
  // This matches the backend proxy timeout so the request doesn't give up
  // before the backend has a chance to wake up and respond.
  timeout: 65_000,
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

/** Returns true if the error is a network/timeout issue (no server response).
 *  These happen during Render cold starts and should NOT trigger logout. */
function isNetworkError(err: any): boolean {
  return !err.response && (
    err.code === 'ECONNABORTED'    || // Axios timeout
    err.code === 'ERR_NETWORK'     || // Network down
    err.code === 'ERR_CANCELED'    || // Request aborted
    err.message?.includes('timeout') ||
    err.message?.includes('Network Error')
  );
}

/** Sleep helper for back-off retries */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    // Never retry the refresh call itself, and never retry twice
    if (
      original._retry ||
      original.url?.includes('/auth/refresh-token')
    ) {
      return Promise.reject(err);
    }

    // ── Case 1: Network/timeout error (cold start) ────────────────────────────
    // The backend is waking up. Do NOT log out — retry the original request
    // after a back-off delay. The backend should respond within 60s.
    if (isNetworkError(err)) {
      if (!original._networkRetry) {
        original._networkRetry = 0;
      }
      if (original._networkRetry < 2) {
        original._networkRetry += 1;
        const delay = original._networkRetry * 8_000; // 8s, 16s
        await sleep(delay);
        return api(original);
      }
      // Give up after 2 retries — but still don't log out for network errors
      return Promise.reject(err);
    }

    // ── Case 2: Actual 401 — token may be expired, try refresh ───────────────
    if (err.response?.status !== 401) {
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
    } catch (refreshErr: any) {
      queue = [];
      // Only clear auth if the refresh endpoint itself definitively rejected us (401)
      // Not on network errors — keep the user logged in and let them retry manually
      if (refreshErr.response?.status === 401 || refreshErr.message === 'No refresh token') {
        useAuth.getState().clearAuth();
        if (typeof window !== 'undefined') window.location.href = '/auth/login';
      }
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;