import { Request, Response, NextFunction } from 'express';
import path from 'path';
import agentService from '../services/agent.service';
import { sendSuccess, sendError } from '../types';
import { AuthenticatedRequest } from '../types';

export class AgentController {

  // ─── POST /agent/call/ingest ──────────────────────────────────────────────
  // Main endpoint — upload audio file, triggers full pipeline
  ingestCall = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        sendError(res, 400, 'Audio file is required', undefined, 'NO_FILE');
        return;
      }

      const callerPhone = req.body.callerPhone as string ?? 'unknown';

      const result = await agentService.processCall(
        req.file.path,
        req.file.originalname,
        callerPhone,
        req.file.size
      );

      sendSuccess(res, 202, result.message, result);
    } catch (err) { next(err); }
  };

  // ─── GET /agent/calls ─────────────────────────────────────────────────────
  listSessions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page  = parseInt(req.query.page  as string ?? '1');
      const limit = parseInt(req.query.limit as string ?? '20');
      const result = await agentService.getPendingReviews(page, limit);
      sendSuccess(res, 200, 'Sessions retrieved', result);
    } catch (err) { next(err); }
  };

  // ─── GET /agent/calls/:id ─────────────────────────────────────────────────
  getSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params.id as string;
      const result    = await agentService.getSessionById(sessionId);
      sendSuccess(res, 200, 'Session retrieved', result);
    } catch (err) { next(err); }
  };

  // ─── PUT /agent/calls/:id/review ─────────────────────────────────────────
  reviewSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user      = (req as AuthenticatedRequest).user;
      const sessionId = req.params.id as string;
      const { corrections } = req.body as { corrections: Record<string, string> };
      await agentService.reviewAndSubmit(sessionId, corrections ?? {}, user.id);
      sendSuccess(res, 200, 'Session reviewed and incident submitted', null);
    } catch (err) { next(err); }
  };

  // ─── POST /agent/calls/:id/replay ─────────────────────────────────────────
  replayNlp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params.id as string;
      await agentService.replayNlp(sessionId);
      sendSuccess(res, 200, 'NLP replay complete', null);
    } catch (err) { next(err); }
  };

  // ─── GET /agent/status ────────────────────────────────────────────────────
  getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await agentService.getAgentStats();
      sendSuccess(res, 200, 'AI agent status retrieved', stats);
    } catch (err) { next(err); }
  };

  // ─── POST /agent/operator/online ─────────────────────────────────────────
  markOperatorOnline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as AuthenticatedRequest).user;
      await agentService.markOperatorOnline(user.id);
      sendSuccess(res, 200, 'Operator marked online', { userId: user.id });
    } catch (err) { next(err); }
  };

  // ─── POST /agent/operator/offline ────────────────────────────────────────
  markOperatorOffline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as AuthenticatedRequest).user;
      await agentService.markOperatorOffline(user.id);
      sendSuccess(res, 200, 'Operator marked offline', { userId: user.id });
    } catch (err) { next(err); }
  };

  // ─── POST /agent/operator/heartbeat ──────────────────────────────────────
  operatorHeartbeat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as AuthenticatedRequest).user;
      await agentService.operatorHeartbeat(user.id);
      sendSuccess(res, 200, 'Heartbeat received', null);
    } catch (err) { next(err); }
  };
}

export default new AgentController();
