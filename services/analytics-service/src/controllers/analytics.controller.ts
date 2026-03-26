import { Request, Response, NextFunction } from 'express';
import analyticsService from '../services/analytics.service';
import { sendSuccess } from '../utils/response';

export class AnalyticsController {

  // GET /analytics/dashboard
  getDashboard = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const snapshot = await analyticsService.getDashboardSnapshot();
      sendSuccess(res, 200, 'Dashboard snapshot retrieved', snapshot);
    } catch (err) { next(err); }
  };

  // GET /analytics/response-times?period=week
  getResponseTimes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = req.query.period as string ?? 'week';
      const stats  = await analyticsService.getResponseTimes(period);
      sendSuccess(res, 200, 'Response time statistics retrieved', stats);
    } catch (err) { next(err); }
  };

  // GET /analytics/incidents-by-region?period=week
  getIncidentsByRegion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = req.query.period as string ?? 'week';
      const data   = await analyticsService.getIncidentsByRegion(period);
      sendSuccess(res, 200, 'Incidents by region retrieved', data);
    } catch (err) { next(err); }
  };

  // GET /analytics/resource-utilization
  getResourceUtilization = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await analyticsService.getResourceUtilization();
      sendSuccess(res, 200, 'Resource utilization retrieved', data);
    } catch (err) { next(err); }
  };

  // GET /analytics/peak-hours?period=month
  getPeakHours = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = req.query.period as string ?? 'month';
      const data   = await analyticsService.getPeakHours(period);
      sendSuccess(res, 200, 'Peak hours analysis retrieved', data);
    } catch (err) { next(err); }
  };

  // GET /analytics/top-responders?limit=10
  getTopResponders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string ?? '10'), 50);
      const data  = await analyticsService.getTopResponders(limit);
      sendSuccess(res, 200, 'Top responders leaderboard retrieved', data);
    } catch (err) { next(err); }
  };

  // GET /analytics/sla?period=week
  getSlaReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = req.query.period as string ?? 'week';
      const report = await analyticsService.getSlaReport(period);
      sendSuccess(res, 200, 'SLA compliance report retrieved', report);
    } catch (err) { next(err); }
  };

  // GET /analytics/heatmap?period=month
  getHeatmap = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = req.query.period as string ?? 'month';
      const points = await analyticsService.getHeatmapData(period);
      sendSuccess(res, 200, 'Heatmap data retrieved', points);
    } catch (err) { next(err); }
  };
}

export default new AnalyticsController();
