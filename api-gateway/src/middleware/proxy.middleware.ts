import { Request, Response, NextFunction } from 'express';
import http from 'http';
import https from 'https';
import axios, { AxiosRequestConfig } from 'axios';
import { ServiceKey, SERVICES } from '../config/env';
import { isServiceAvailable, recordFailure, recordSuccess } from '../services/circuitBreaker.service';
import redisClient, { REDIS_KEYS } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { GatewayRequest } from './auth.middleware';

// ─── Generic proxy handler ────────────────────────────────────────────────────
export const proxyTo = (serviceKey: ServiceKey, pathPrefix?: string) =>
  async (req: GatewayRequest, res: Response, next: NextFunction): Promise<void> => {
    const service = SERVICES[serviceKey];

    // ── Circuit breaker check ──────────────────────────────────────────────────
    const available = await isServiceAvailable(serviceKey);
    if (!available) {
      logger.warn(`Circuit open — rejecting request to ${service.name}`, { path: req.path });
      res.status(503).json({
        success: false,
        message: `${service.name} is temporarily unavailable. Please try again shortly.`,
        code: 'SERVICE_UNAVAILABLE',
      });
      return;
    }

    // ── Build target URL ───────────────────────────────────────────────────────
    const targetPath = pathPrefix
      ? req.originalUrl.replace(pathPrefix, '')
      : req.originalUrl;
    const targetUrl = `${service.url}${targetPath}`;

    // ── Response cache check (GET requests only) ───────────────────────────────
    const cacheEnabled = env.RESPONSE_CACHE_TTL > 0 && req.method === 'GET' && req.user;
    if (cacheEnabled) {
      const cacheKey = REDIS_KEYS.responseCache(`${serviceKey}:${req.originalUrl}`);
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          res.setHeader('X-Cache', 'HIT');
          res.setHeader('X-Correlation-ID', req.correlationId ?? '');
          res.json(JSON.parse(cached));
          return;
        }
      } catch (err) {
        logger.warn('Cache lookup failed', { service: serviceKey, error: (err as Error).message });
        // Continue to forward request if cache fails
      }
    }

    // ── Forward request ────────────────────────────────────────────────────────
    try {
      const config: AxiosRequestConfig = {
        method: req.method as AxiosRequestConfig['method'],
        url: targetUrl,
        headers: {
          ...req.headers,
          host: undefined,        // Don't forward original host
          'x-forwarded-for': req.ip,
          'x-gateway': 'true',
          'x-correlation-id': req.correlationId,
          'x-internal-secret': env.INTERNAL_SERVICE_SECRET,
        },
        data: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
        params: req.query,
        timeout: 15000,
        validateStatus: () => true,  // Don't throw on 4xx/5xx — pass them through
        maxBodyLength: 50 * 1024 * 1024, // 50MB for audio file uploads
        maxContentLength: 50 * 1024 * 1024,
      };

      const upstream = await axios(config);

      // Record success
      await recordSuccess(serviceKey);

      // Cache successful GET responses
      if (cacheEnabled && upstream.status === 200) {
        const cacheKey = REDIS_KEYS.responseCache(`${serviceKey}:${req.originalUrl}`);
        try {
          await redisClient.setEx(cacheKey, env.RESPONSE_CACHE_TTL, JSON.stringify(upstream.data));
          res.setHeader('X-Cache', 'MISS');
        } catch {
          // Ignore cache save failure
        }
      }

      // Forward response
      res.setHeader('X-Correlation-ID', req.correlationId ?? '');
      res.setHeader('X-Served-By', service.name);
      res.status(upstream.status).json(upstream.data);

    } catch (err: unknown) {
      await recordFailure(serviceKey);

      const isTimeout = err instanceof Error && err.message.includes('timeout');
      const isRefused = err instanceof Error && err.message.includes('ECONNREFUSED');

      logger.error(`Upstream error — ${service.name}`, {
        path: req.path,
        method: req.method,
        error: err instanceof Error ? err.message : String(err),
      });

      if (isTimeout) {
        res.status(504).json({ success: false, message: 'Upstream service timed out', code: 'GATEWAY_TIMEOUT' });
      } else if (isRefused) {
        res.status(503).json({ success: false, message: `${service.name} is not reachable`, code: 'SERVICE_UNAVAILABLE' });
      } else {
        next(err);
      }
    }
  };

// ─── Multipart stream proxy — for file uploads (AI agent) ────────────────────
// Pipes the raw request stream directly to the upstream service, bypassing
// express body parsers which would consume and destroy the multipart boundary.
export const proxyStream = (serviceKey: ServiceKey) =>
  async (req: GatewayRequest, res: Response, _next: NextFunction): Promise<void> => {
    const service = SERVICES[serviceKey];

    const available = await isServiceAvailable(serviceKey);
    if (!available) {
      res.status(503).json({
        success: false,
        message: `${service.name} is temporarily unavailable.`,
        code:    'SERVICE_UNAVAILABLE',
      });
      return;
    }

    const targetUrl = new URL(`${service.url}${req.originalUrl}`);
    const isHttps   = targetUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    // Forward all original headers, inject gateway headers
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) headers[k] = Array.isArray(v) ? v[0] : v;
    }
    headers['x-forwarded-for']    = req.ip ?? '';
    headers['x-gateway']          = 'true';
    headers['x-correlation-id']   = req.correlationId ?? '';
    headers['x-internal-secret']  = env.INTERNAL_SERVICE_SECRET;
    delete headers['host'];

    const options: http.RequestOptions = {
      hostname: targetUrl.hostname,
      port:     targetUrl.port || (isHttps ? 443 : 80),
      path:     targetUrl.pathname + targetUrl.search,
      method:   req.method,
      headers,
    };

    logger.info('Streaming multipart upload to upstream', { service: serviceKey, path: targetUrl.pathname });

    const proxyReq = transport.request(options, (proxyRes: http.IncomingMessage) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers as Record<string, string>);
      proxyRes.pipe(res, { end: true });
      recordSuccess(serviceKey).catch(() => {});
    });

    proxyReq.on('error', async (err: Error) => {
      await recordFailure(serviceKey);
      logger.error('Stream proxy error', { service: serviceKey, error: err.message });
      if (!res.headersSent) {
        res.status(502).json({ success: false, message: 'File upload proxy failed', code: 'UPSTREAM_ERROR' });
      }
    });

    // Pipe raw incoming request (including binary file) directly through
    req.pipe(proxyReq, { end: true });
  };

