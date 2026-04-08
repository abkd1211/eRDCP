'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Eye, EyeOff, Loader2, Lock, Zap } from 'lucide-react';
import { useAuth } from '@/store/auth.store';
import { authApi } from '@/lib/services';

const schema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const warmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormData) => {
    setError('');
    setIsWarmingUp(false);

    // Show "waking up" message after 5s — indicates cold start, not failure
    warmupTimerRef.current = setTimeout(() => setIsWarmingUp(true), 5_000);

    try {
      const res = await authApi.login(values.email, values.password);
      const { user, tokens } = res.data.data;
      setAuth(user, tokens);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Login failed. Check your credentials or try again.');
    } finally {
      if (warmupTimerRef.current) clearTimeout(warmupTimerRef.current);
      setIsWarmingUp(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
      className="animate-fade-up"
    >
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 relative"
          style={{ background: 'rgba(232,68,42,0.15)', border: '1px solid rgba(232,68,42,0.3)' }}>
          <Radio size={26} style={{ color: '#E8442A' }} />
          <span className="absolute inset-0 rounded-2xl animate-pulse-dot" style={{ boxShadow: '0 0 0 4px rgba(232,68,42,0.15)' }} />
        </div>
        <h1 className="text-3xl font-bold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>ERDCP</h1>
        <p className="label mt-1">Emergency Response &amp; Dispatch Platform</p>
      </div>

      {/* Card */}
      <div className="card p-8" style={{ borderTop: '2px solid #E8442A' }}>
        <h2 className="text-base font-semibold mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>Secure Access</h2>
        <p className="text-xs mb-6" style={{ color: 'var(--text-faint)' }}>Authorised personnel only. All sessions are audited.</p>

        <AnimatePresence>
          {isWarmingUp && !error && (
            <motion.div
              key="warmup"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 px-3 py-2 rounded-lg text-sm flex items-center gap-2"
              style={{ background: 'rgba(201,123,26,0.12)', border: '1px solid rgba(201,123,26,0.3)', color: '#C97B1A' }}
            >
              <Zap size={14} className="animate-pulse" />
              Services are waking up, please wait…
            </motion.div>
          )}
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 px-3 py-2 rounded-lg text-sm flex items-center gap-2"
              style={{ background: 'rgba(232,68,42,0.12)', border: '1px solid rgba(232,68,42,0.3)', color: '#E8442A' }}
            >
              <Lock size={14} />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label block mb-1.5">Email Address</label>
            <input {...register('email')} type="email" placeholder="admin@erdcp.gov.gh" className="input-base" autoComplete="email" />
            {errors.email && <p className="text-xs mt-1" style={{ color: '#E8442A' }}>{errors.email.message}</p>}
          </div>

          <div>
            <label className="label block mb-1.5">Password</label>
            <div className="relative">
              <input {...register('password')} type={showPassword ? 'text' : 'password'} placeholder="••••••••" className="input-base pr-10" autoComplete="current-password" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: 'var(--text-faint)' }}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.password && <p className="text-xs mt-1" style={{ color: '#E8442A' }}>{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={isSubmitting} className="btn btn-primary w-full py-3 mt-2">
            {isSubmitting ? <><Loader2 size={15} className="animate-spin" /> Authenticating...</> : 'Sign In'}
          </button>
        </form>
      </div>

      <p className="text-center mt-6 font-mono text-xs" style={{ color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>
        GHANA NATIONAL EMERGENCY SERVICES — RESTRICTED
      </p>
    </motion.div>
  );
}
