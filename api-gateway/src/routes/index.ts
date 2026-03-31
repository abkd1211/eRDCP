import { Router, Request, Response } from 'express';
import { authenticate, optionalAuth, requireRole } from '../middleware/auth.middleware';
import { proxyTo, proxyStream } from '../middleware/proxy.middleware';
import { authLimiter, strictLimiter } from '../middleware/rateLimit.middleware';
import { checkAllServices } from '../services/health.service';
import { getAllCircuitStatuses } from '../services/circuitBreaker.service';
import redisClient, { REDIS_KEYS } from '../config/redis';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// GATEWAY HEALTH & STATUS
// ═══════════════════════════════════════════════════════════════════════════

// Gateway own health
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'api-gateway',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Aggregated health — checks all 5 downstream services
router.get('/health/all', async (_req, res) => {
  const health = await checkAllServices();
  const httpStatus = health.gateway === 'healthy' ? 200
    : health.gateway === 'degraded' ? 207 : 503;
  res.status(httpStatus).json(health);
});

// Circuit breaker statuses
router.get('/health/circuits', authenticate, requireRole('SYSTEM_ADMIN'), async (_req, res) => {
  const circuits = await getAllCircuitStatuses();
  res.status(200).json({ success: true, message: 'Circuit statuses retrieved', data: circuits });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH SERVICE — :3001
// Public routes first, then protected
// ═══════════════════════════════════════════════════════════════════════════
router.post('/auth/register', authLimiter, proxyTo('auth'));
router.post('/auth/login', authLimiter, proxyTo('auth'));
router.post('/auth/refresh-token', proxyTo('auth'));

// Protected auth routes
router.post('/auth/logout', authenticate, proxyTo('auth'));
router.get('/auth/profile', authenticate, proxyTo('auth'));
router.put('/auth/profile', authenticate, proxyTo('auth'));

// Admin-only auth routes
router.get('/auth/users', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('auth'));
router.put('/auth/users/:id/role', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('auth'));
router.delete('/auth/users/:id', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('auth'));

// Internal — gateway itself uses this to verify tokens
router.post('/auth/verify-token', proxyTo('auth'));

// ═══════════════════════════════════════════════════════════════════════════
// INCIDENT SERVICE — :3002
// ═══════════════════════════════════════════════════════════════════════════
router.post('/incidents', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('incident'));
router.get('/incidents', authenticate, proxyTo('incident'));
router.get('/incidents/open', authenticate, proxyTo('incident'));
router.get('/incidents/nearby', authenticate, proxyTo('incident'));
router.post('/incidents/link', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('incident'));
router.get('/incidents/:id', authenticate, proxyTo('incident'));
router.put('/incidents/:id/status', authenticate, proxyTo('incident'));
router.put('/incidents/:id/assign', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('incident'));
router.get('/incidents/:id/linked-reports', authenticate, proxyTo('incident'));

// Nearest responder query
router.get('/incidents/nearest/:lat/:lng/:type', authenticate, proxyTo('incident'));

// Responders
router.get('/responders', authenticate, proxyTo('incident'));
router.post('/responders', authenticate, proxyTo('incident'));
router.put('/responders/:id/availability', authenticate, proxyTo('incident'));
router.put('/responders/:id/capacity', authenticate,
  requireRole('HOSPITAL_ADMIN', 'SYSTEM_ADMIN'), proxyTo('incident'));
router.put('/responders/:id/location', authenticate, proxyTo('incident'));
router.get('/responders/hospitals', authenticate, proxyTo('incident'));

// ═══════════════════════════════════════════════════════════════════════════
// DISPATCH SERVICE — :3003
// Note: Socket.io connections bypass the gateway and connect directly
//       to the dispatch service for lower latency real-time GPS
// ═══════════════════════════════════════════════════════════════════════════
router.post('/vehicles/register', authenticate, proxyTo('dispatch'));
router.get('/vehicles', authenticate, proxyTo('dispatch'));
router.get('/vehicles/:id', authenticate, proxyTo('dispatch'));
router.get('/vehicles/:id/location', authenticate, proxyTo('dispatch'));
router.put('/vehicles/:id/location', authenticate, proxyTo('dispatch'));
router.get('/vehicles/:id/history', authenticate, proxyTo('dispatch'));
router.get('/vehicles/:id/assignment', authenticate, proxyTo('dispatch'));
router.post('/vehicles/:id/trip/complete', authenticate, proxyTo('dispatch'));
router.get('/dispatch/:incidentId', authenticate, proxyTo('dispatch'));

// ─── Simulation Controls ──────────────────────────────────────────────────────
router.post('/simulation/speed', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('dispatch'));
router.get('/simulation/speed', authenticate, proxyTo('dispatch'));
router.post('/simulation/blockage/:vehicleId', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('dispatch'));
router.get('/simulation/active', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('dispatch'));

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS SERVICE — :3004
// ═══════════════════════════════════════════════════════════════════════════
router.get('/analytics/dashboard', authenticate, proxyTo('analytics'));
router.get('/analytics/response-times', authenticate, proxyTo('analytics'));
router.get('/analytics/incidents-by-region', authenticate, proxyTo('analytics'));
router.get('/analytics/resource-utilization', authenticate, proxyTo('analytics'));
router.get('/analytics/peak-hours', authenticate, proxyTo('analytics'));
router.get('/analytics/top-responders', authenticate, proxyTo('analytics'));
router.get('/analytics/sla', authenticate, proxyTo('analytics'));
router.get('/analytics/heatmap', authenticate, proxyTo('analytics'));
router.get('/analytics/hospital-capacity', authenticate,
  requireRole('HOSPITAL_ADMIN', 'SYSTEM_ADMIN'), proxyTo('analytics'));

// ═══════════════════════════════════════════════════════════════════════════
// AI AGENT SERVICE — :3005
// ═══════════════════════════════════════════════════════════════════════════
router.get('/agent/status', authenticate, proxyTo('agent'));
router.post('/agent/call/ingest', authenticate, requireRole('SYSTEM_ADMIN'), proxyStream('agent'));
router.get('/agent/calls', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('agent'));
router.get('/agent/calls/:id', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('agent'));
router.put('/agent/calls/:id/review', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('agent'));
router.post('/agent/calls/:id/replay', authenticate, requireRole('SYSTEM_ADMIN'), proxyTo('agent'));
router.post('/agent/operator/online', authenticate, proxyTo('agent'));
router.post('/agent/operator/offline', authenticate, proxyTo('agent'));
router.post('/agent/operator/heartbeat', authenticate, proxyTo('agent'));

// ═══════════════════════════════════════════════════════════════════════════
// GATEWAY UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

// Clear response cache — SYSTEM_ADMIN only
router.delete('/gateway/cache', authenticate, requireRole('SYSTEM_ADMIN'),
  strictLimiter,
  async (_req: Request, res: Response) => {
    const keys = await redisClient.keys('gateway:cache:*');
    if (keys.length > 0) await redisClient.del(keys);
    res.json({ success: true, message: `Cleared ${keys.length} cached responses`, data: { count: keys.length } });
  }
);

// Gateway info
router.get('/gateway/info', authenticate, (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'API Gateway info',
    data: {
      version: '1.0.0',
      services: {
        auth: 'http://[internal]:3001',
        incident: 'http://[internal]:3002',
        dispatch: 'http://[internal]:3003',
        analytics: 'http://[internal]:3004',
        agent: 'http://[internal]:3005',
      },
      note: 'Socket.io for real-time GPS connects directly to dispatch service on :3003',
    },
  });
});

// GATEWAY DEBUG: Returns public IP and headers (for IP detection troubleshooting)
router.get('/gateway/debug', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      ip:       _req.ip,
      ips:      _req.ips,
      headers:  _req.headers,
      method:   _req.method,
      protocol: _req.protocol,
    }
  });
});

export default router;
