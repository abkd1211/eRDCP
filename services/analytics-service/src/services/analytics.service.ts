import redisClient, { REDIS_KEYS, REDIS_TTL } from '../config/redis';
import { env }                                  from '../config/env';
import logger                                   from '../config/logger';
import { IncidentMetric }                       from '../models/incidentMetric.model';
import { ResponderPerformance }                 from '../models/responderPerformance.model';
import { ResourceUtilization }                  from '../models/resourceUtilization.model';
import { detectRegion, getPeriodDates, formatHourLabel } from '../utils/region';
import {
  IncidentCreatedPayload,
  IncidentDispatchedPayload,
  IncidentResolvedPayload,
  TripCompletedPayload,
  VehicleUnresponsivePayload,
  ResponseTimeStats,
  IncidentsByRegion,
  PeakHourData,
  HeatmapPoint,
  SlaReport,
  DashboardSnapshot,
} from '../types';

export class AnalyticsService {

  // ═══════════════════════════════════════════════════════
  // EVENT HANDLERS — called by RabbitMQ consumers
  // ═══════════════════════════════════════════════════════

  async handleIncidentCreated(payload: IncidentCreatedPayload): Promise<void> {
    const createdAt = new Date(payload.created_at);

    await IncidentMetric.findOneAndUpdate(
      { incidentId: payload.incident_id },
      {
        $setOnInsert: {
          incidentId:   payload.incident_id,
          incidentType: payload.incident_type,
          region:       detectRegion(payload.latitude, payload.longitude),
          latitude:     payload.latitude,
          longitude:    payload.longitude,
          priority:     payload.priority,
          createdBy:    payload.created_by,
          status:       payload.status,
          createdAt,
          hourOfDay:    createdAt.getHours(),
          dayOfWeek:    createdAt.getDay(),
        },
      },
      { upsert: true }
    );

    await this.invalidateDashboardCache();
    logger.debug('Analytics: incident created processed', { incidentId: payload.incident_id });
  }

  async handleIncidentDispatched(payload: IncidentDispatchedPayload): Promise<void> {
    const dispatchedAt  = new Date(payload.dispatched_at);

    // Update the incident metric with dispatch timing
    const metric = await IncidentMetric.findOne({ incidentId: payload.incident_id });
    if (!metric) {
      logger.warn('Analytics: metric not found for dispatched incident', { incidentId: payload.incident_id });
      return;
    }

    const dispatchTimeSec = Math.floor(
      (dispatchedAt.getTime() - metric.createdAt.getTime()) / 1000
    );
    const withinSla = dispatchTimeSec <= env.SLA_TARGET_SEC;

    await IncidentMetric.findOneAndUpdate(
      { incidentId: payload.incident_id },
      {
        $set: {
          assignedUnitId:   payload.assigned_unit_id,
          assignedUnitType: payload.assigned_unit_type,
          status:           'DISPATCHED',
          dispatchedAt,
          dispatchTimeSec,
          withinSla,
        },
      }
    );

    // Update responder performance stats
    await this.updateResponderPerformance(
      payload.assigned_unit_id,
      payload.assigned_unit_type,
      payload.responder_name,
      dispatchTimeSec,
      withinSla
    );

    await this.invalidateDashboardCache();
    logger.debug('Analytics: incident dispatched processed', {
      incidentId: payload.incident_id,
      dispatchTimeSec,
      withinSla,
    });
  }

  async handleIncidentResolved(payload: IncidentResolvedPayload): Promise<void> {
    const resolvedAt = new Date(payload.resolved_at);

    await IncidentMetric.findOneAndUpdate(
      { incidentId: payload.incident_id },
      {
        $set: {
          status:           'RESOLVED',
          resolvedAt,
          resolutionTimeSec:payload.duration_sec,
        },
      }
    );

    await this.invalidateDashboardCache();
    logger.debug('Analytics: incident resolved', { incidentId: payload.incident_id });
  }

  async handleTripCompleted(payload: TripCompletedPayload): Promise<void> {
    // Update responder performance with trip distance and speed
    const metric = await IncidentMetric.findOne({ incidentId: payload.incident_id });
    if (!metric?.assignedUnitId) return;

    await ResponderPerformance.findOneAndUpdate(
      { responderId: metric.assignedUnitId },
      {
        $inc: {
          totalResolved:   1,
          totalDistanceKm: payload.trip_summary.totalDistanceKm,
        },
        $set: { updatedAt: new Date() },
      }
    );

    // Recalculate average speed
    const perf = await ResponderPerformance.findOne({ responderId: metric.assignedUnitId });
    if (perf && perf.totalResolved > 0) {
      const avgSpeed = perf.totalDistanceKm / (perf.totalResolved || 1);
      await ResponderPerformance.findOneAndUpdate(
        { responderId: metric.assignedUnitId },
        { $set: { avgSpeedKmh: Math.round(avgSpeed * 10) / 10 } }
      );
    }

    logger.debug('Analytics: trip completed processed', { incidentId: payload.incident_id });
  }

  async handleVehicleUnresponsive(payload: VehicleUnresponsivePayload): Promise<void> {
    // Log for monitoring — future: trigger alert
    logger.warn('Analytics: vehicle unresponsive event received', {
      vehicleId:   payload.vehicle_id,
      vehicleCode: payload.vehicle_code,
      incidentId:  payload.incident_id,
    });
    // Could write to an alerts collection here in future
  }

  // ═══════════════════════════════════════════════════════
  // ANALYTICS QUERIES
  // ═══════════════════════════════════════════════════════

  // ─── Response Times ───────────────────────────────────────────────────────────
  async getResponseTimes(period = 'week'): Promise<ResponseTimeStats> {
    const cacheKey = REDIS_KEYS.responseTimes(period);
    const cached   = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { start, end } = getPeriodDates(period);

    const result = await IncidentMetric.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, dispatchTimeSec: { $ne: null } } },
      {
        $group: {
          _id:                    null,
          avgDispatchTimeSec:     { $avg: '$dispatchTimeSec' },
          avgArrivalTimeSec:      { $avg: '$arrivalTimeSec' },
          avgResolutionTimeSec:   { $avg: '$resolutionTimeSec' },
          minDispatchTimeSec:     { $min: '$dispatchTimeSec' },
          maxDispatchTimeSec:     { $max: '$dispatchTimeSec' },
          totalIncidents:         { $sum: 1 },
        },
      },
    ]);

    const stats: ResponseTimeStats = result[0]
      ? {
          avgDispatchTimeSec:   Math.round(result[0].avgDispatchTimeSec),
          avgArrivalTimeSec:    Math.round(result[0].avgArrivalTimeSec ?? 0),
          avgResolutionTimeSec: Math.round(result[0].avgResolutionTimeSec ?? 0),
          minDispatchTimeSec:   result[0].minDispatchTimeSec,
          maxDispatchTimeSec:   result[0].maxDispatchTimeSec,
          totalIncidents:       result[0].totalIncidents,
          period,
        }
      : {
          avgDispatchTimeSec: 0, avgArrivalTimeSec: 0, avgResolutionTimeSec: 0,
          minDispatchTimeSec: 0, maxDispatchTimeSec: 0, totalIncidents: 0, period,
        };

    await redisClient.setEx(cacheKey, REDIS_TTL.standard, JSON.stringify(stats));
    return stats;
  }

  // ─── Incidents by Region ──────────────────────────────────────────────────────
  async getIncidentsByRegion(period = 'week'): Promise<IncidentsByRegion[]> {
    const cacheKey = REDIS_KEYS.incidentsByRegion(period);
    const cached   = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { start, end } = getPeriodDates(period);

    const result = await IncidentMetric.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id:         { region: '$region', type: '$incidentType' },
          count:       { $sum: 1 },
          avgPriority: { $avg: '$priority' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Reshape: group by region, nest types inside
    const regionMap = new Map<string, IncidentsByRegion>();
    for (const row of result) {
      const { region, type } = row._id;
      if (!regionMap.has(region)) {
        regionMap.set(region, { region, total: 0, byType: {}, avgPriority: 0 });
      }
      const entry = regionMap.get(region)!;
      entry.total          += row.count;
      entry.byType[type]    = row.count;
      entry.avgPriority     = Math.round(row.avgPriority * 10) / 10;
    }

    const regions = Array.from(regionMap.values()).sort((a, b) => b.total - a.total);
    await redisClient.setEx(cacheKey, REDIS_TTL.standard, JSON.stringify(regions));
    return regions;
  }

  // ─── Resource Utilization ────────────────────────────────────────────────────
  async getResourceUtilization(): Promise<unknown> {
    const cached = await redisClient.get(REDIS_KEYS.resourceUtil());
    if (cached) return JSON.parse(cached);

    const result = await IncidentMetric.aggregate([
      { $match: { status: { $in: ['DISPATCHED', 'IN_PROGRESS'] } } },
      {
        $group: {
          _id:           '$assignedUnitType',
          deployedUnits: { $sum: 1 },
        },
      },
    ]);

    const utilization = result.map(r => ({
      resourceType:   r._id,
      deployedUnits:  r.deployedUnits,
    }));

    await redisClient.setEx(REDIS_KEYS.resourceUtil(), REDIS_TTL.standard, JSON.stringify(utilization));
    return utilization;
  }

  // ─── Peak Hours Analysis (extra feature) ─────────────────────────────────────
  async getPeakHours(period = 'month'): Promise<PeakHourData[]> {
    const cached = await redisClient.get(REDIS_KEYS.peakHours());
    if (cached) return JSON.parse(cached);

    const { start, end } = getPeriodDates(period);

    const result = await IncidentMetric.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$hourOfDay', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Fill in all 24 hours even if count is 0
    const hourMap = new Map(result.map((r) => [r._id as number, r.count as number]));
    const peakHours: PeakHourData[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: hourMap.get(hour) ?? 0,
      label: formatHourLabel(hour),
    }));

    await redisClient.setEx(REDIS_KEYS.peakHours(), REDIS_TTL.slow, JSON.stringify(peakHours));
    return peakHours;
  }

  // ─── Top Responders Leaderboard (extra feature) ──────────────────────────────
  async getTopResponders(limit = 10): Promise<unknown> {
    const cached = await redisClient.get(REDIS_KEYS.topResponders());
    if (cached) return JSON.parse(cached);

    const responders = await ResponderPerformance.find()
      .sort({ totalDispatches: -1, avgDispatchTimeSec: 1 })
      .limit(limit)
      .lean();

    await redisClient.setEx(REDIS_KEYS.topResponders(), REDIS_TTL.standard, JSON.stringify(responders));
    return responders;
  }

  // ─── SLA Report (extra feature) ──────────────────────────────────────────────
  async getSlaReport(period = 'week'): Promise<SlaReport> {
    const cached = await redisClient.get(REDIS_KEYS.slaReport());
    if (cached) return JSON.parse(cached);

    const { start, end } = getPeriodDates(period);

    const result = await IncidentMetric.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, withinSla: { $ne: null } } },
      {
        $group: {
          _id:        { type: '$incidentType', withinSla: '$withinSla' },
          count:      { $sum: 1 },
        },
      },
    ]);

    // Build SLA report structure
    const typeMap: Record<string, { total: number; withinSla: number; rate: number }> = {};
    let totalWithin = 0;
    let totalOutside = 0;

    for (const row of result) {
      const { type, withinSla } = row._id;
      if (!typeMap[type]) typeMap[type] = { total: 0, withinSla: 0, rate: 0 };
      typeMap[type].total += row.count;
      if (withinSla) {
        typeMap[type].withinSla += row.count;
        totalWithin += row.count;
      } else {
        totalOutside += row.count;
      }
    }

    // Calculate per-type rates
    for (const type of Object.keys(typeMap)) {
      typeMap[type].rate = typeMap[type].total > 0
        ? Math.round((typeMap[type].withinSla / typeMap[type].total) * 100)
        : 0;
    }

    const total = totalWithin + totalOutside;
    const report: SlaReport = {
      totalIncidents:  total,
      withinSla:       totalWithin,
      outsideSla:      totalOutside,
      complianceRate:  total > 0 ? Math.round((totalWithin / total) * 100) : 100,
      slaTargetSec:    env.SLA_TARGET_SEC,
      byType:          Object.entries(typeMap).map(([type, stats]) => ({
        type,
        total:     stats.total,
        withinSla: stats.withinSla,
        pct:       stats.rate,
      })),
    };

    await redisClient.setEx(REDIS_KEYS.slaReport(), REDIS_TTL.standard, JSON.stringify(report));
    return report;
  }

  // ─── Heatmap Data (extra feature) ────────────────────────────────────────────
  async getHeatmapData(period = 'month'): Promise<HeatmapPoint[]> {
    const cached = await redisClient.get(REDIS_KEYS.heatmap());
    if (cached) return JSON.parse(cached);

    const { start, end } = getPeriodDates(period);

    // Round coordinates to 2 decimal places (~1km grid) for clustering
    const result = await IncidentMetric.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: {
            lat:  { $round: ['$latitude',  2] },
            lng:  { $round: ['$longitude', 2] },
            type: '$incidentType',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 500 }, // Cap for performance
    ]);

    const points: HeatmapPoint[] = result.map(r => ({
      latitude:  r._id.lat,
      longitude: r._id.lng,
      weight:    r.count,
      type:      r._id.type,
    }));

    await redisClient.setEx(REDIS_KEYS.heatmap(), REDIS_TTL.slow, JSON.stringify(points));
    return points;
  }

  // ─── Dashboard Snapshot (extra feature) ──────────────────────────────────────
  async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    const cached = await redisClient.get(REDIS_KEYS.dashboard());
    if (cached) return JSON.parse(cached);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Run all queries in parallel
    const [
      totalIncidents,
      openIncidents,
      resolvedToday,
      responseTimeStats,
      slaReport,
      incidentsByType,
      incidentsByStatus,
      topResponders,
      recentActivity,
    ] = await Promise.all([
      IncidentMetric.countDocuments(),
      IncidentMetric.countDocuments({ status: { $in: ['CREATED', 'DISPATCHED', 'IN_PROGRESS'] } }),
      IncidentMetric.countDocuments({ status: 'RESOLVED', resolvedAt: { $gte: today } }),
      this.getResponseTimes('week'),
      this.getSlaReport('week'),
      IncidentMetric.aggregate([
        { $group: { _id: '$incidentType', count: { $sum: 1 } } },
      ]),
      IncidentMetric.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      ResponderPerformance.find()
        .sort({ totalDispatches: -1 })
        .limit(5)
        .lean(),
      IncidentMetric.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select('incidentId incidentType region status createdAt')
        .lean(),
    ]);

    const snapshot: DashboardSnapshot = {
      generatedAt:        new Date().toISOString(),
      totalIncidents,
      openIncidents,
      resolvedToday,
      avgResponseTimeSec: responseTimeStats.avgDispatchTimeSec,
      slaComplianceRate:  slaReport.complianceRate,
      activeVehicles:     0,   // Would come from dispatch service in production
      unresponsiveVehicles: 0,
      incidentsByType:    Object.fromEntries(incidentsByType.map(r => [r._id, r.count])),
      incidentsByStatus:  Object.fromEntries(incidentsByStatus.map(r => [r._id, r.count])),
      topResponders: topResponders.map(r => ({
        responderId:        r.responderId,
        responderName:      r.responderName,
        responderType:      r.responderType,
        totalDispatches:    r.totalDispatches,
        avgDispatchTimeSec: r.avgDispatchTimeSec,
        slaComplianceRate:  r.slaComplianceRate,
      })),
      recentActivity: recentActivity.map(r => ({
        incidentId: r.incidentId,
        type:       r.incidentType,
        region:     r.region,
        status:     r.status,
        createdAt:  r.createdAt,
      })),
    };

    await redisClient.setEx(REDIS_KEYS.dashboard(), REDIS_TTL.dashboard, JSON.stringify(snapshot));
    return snapshot;
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════

  private async updateResponderPerformance(
    responderId:   string,
    responderType: string,
    responderName: string,
    dispatchTimeSec: number,
    withinSla: boolean
  ): Promise<void> {
    const existing = await ResponderPerformance.findOne({ responderId });

    if (!existing) {
      await ResponderPerformance.create({
        responderId,
        responderName,
        responderType,
        stationName:        responderName,
        totalDispatches:    1,
        avgDispatchTimeSec: dispatchTimeSec,
        slaComplianceRate:  withinSla ? 100 : 0,
        currentStreak:      withinSla ? 1 : 0,
        bestStreak:         withinSla ? 1 : 0,
      });
      return;
    }

    const newTotal       = existing.totalDispatches + 1;
    const newAvgDispatch = Math.round(
      ((existing.avgDispatchTimeSec * existing.totalDispatches) + dispatchTimeSec) / newTotal
    );

    // Update SLA compliance rate
    const prevWithinSla  = Math.round((existing.slaComplianceRate / 100) * existing.totalDispatches);
    const newWithinSla   = prevWithinSla + (withinSla ? 1 : 0);
    const newSlaRate     = Math.round((newWithinSla / newTotal) * 100);

    // Update streaks
    const newStreak = withinSla ? existing.currentStreak + 1 : 0;
    const newBest   = Math.max(existing.bestStreak, newStreak);

    await ResponderPerformance.findOneAndUpdate(
      { responderId },
      {
        $set: {
          totalDispatches:    newTotal,
          avgDispatchTimeSec: newAvgDispatch,
          slaComplianceRate:  newSlaRate,
          currentStreak:      newStreak,
          bestStreak:         newBest,
          updatedAt:          new Date(),
        },
      }
    );
  }

  // ─── Hospital Capacity (live from incident service) ──────────────────────────
  // Reads from the IncidentMetric HOSPITAL_CAPACITY model
  // populated by the incident service when capacity is updated
  async getHospitalCapacity(): Promise<unknown> {
    // Query the resource utilization collection for hospital data
    const result = await this.hospitalCapacityAgg();
    return result;
  }

  private async hospitalCapacityAgg(): Promise<unknown> {
    // This data is published by the incident service via RabbitMQ
    // and stored in the resourceutilizations collection
    const data = await require('../models/resourceUtilization.model')
      .ResourceUtilization.find({ resourceType: 'AMBULANCE' })
      .sort({ recordedAt: -1 })
      .limit(50)
      .lean();
    return data;
  }

  private async invalidateDashboardCache(): Promise<void> {
    await redisClient.del(REDIS_KEYS.dashboard());
  }
}

export default new AnalyticsService();
