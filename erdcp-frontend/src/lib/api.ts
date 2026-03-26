'use client';
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '@/store/auth.store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_URL}/auth/refresh-token`, { refreshToken });
        const newAccess = data?.data?.accessToken ?? data?.data?.tokens?.accessToken;
        if (!newAccess) throw new Error('No access token in refresh response');
        localStorage.setItem('accessToken', newAccess);
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch {
        useAuth.getState().clearAuth();
        if (typeof window !== 'undefined') window.location.href = '/auth/login';
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
);

export default api;
