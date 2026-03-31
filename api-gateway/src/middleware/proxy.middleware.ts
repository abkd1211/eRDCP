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
export const proxyTo = (serviceKey: ServiceKey) =>
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
    const targetUrl = `${service.url}${req.originalUrl}`;

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
          'x-user-id':    req.user?.id    ?? '',
          'x-user-email': req.user?.email ?? '',
          'x-user-role':  req.user?.role  ?? '',
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
      const contentType = upstream.headers['content-type'];
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      
      res.setHeader('X-Correlation-ID', req.correlationId ?? '');
      res.setHeader('X-Served-By', service.name);
      res.status(upstream.status).send(upstream.data);

    } catch (err: any) {
      await recordFailure(serviceKey);

      const errorCode = err.code || 'UNKNOWN_ERROR';
      const errorMsg = err.response?.data?.message || err.message;
      
      // DIAGNOSTIC LOGGING
      logger.error(`Proxy failure to ${service.name} [${serviceKey}]: ${req.method} ${targetUrl}`, {
        errorCode,
        errorMsg,
        stack: err.stack?.split('\n').slice(0, 2).join(' '),
        headersSent: res.headersSent
      });

      if (res.headersSent) return;

      if (err.response) {
        // Forward the specific upstream error if it exists
        res.status(err.response.status).json(err.response.data);
      } else {
        // If internal connectivity fails (ECONNREFUSED, ETIMEDOUT, etc)
        const status = errorCode === 'ECONNABORTED' ? 504 : 502;
        res.status(status).json({
          success: false,
          message: errorCode === 'ECONNREFUSED' 
            ? `Connection Refused: ${service.name} is not listening on the expected port.`
            : `Bad Gateway: ${service.name} is unreachable or connection failed`,
          error:   errorCode,
          details: errorMsg,
          path:    targetUrl,
        });
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

