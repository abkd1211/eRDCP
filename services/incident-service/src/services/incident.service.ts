import { IncidentStatus, IncidentType, ResponderStatus, ResponderType, Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import redisClient, { REDIS_KEYS, REDIS_TTL } from '../config/redis';
import { publishEvent, ROUTING_KEYS } from '../config/rabbitmq';
import logger from '../config/logger';
import { findNearest, incidentToResponderType, haversineKm } from '../utils/geo';
import {
  CreateIncidentDto,
  UpdateIncidentStatusDto,
  CreateResponderDto,
  PaginatedResult,
  NearestResponderResult,
  IncidentCreatedPayload,
  IncidentDispatchedPayload,
  IncidentResolvedPayload,
  AiCallProcessedPayload,
  NearbyIncidentResult,
  LinkIncidentDto,
  UpdateHospitalCapacityDto,
  UpdateResponderLocationDto,
} from '../types';

export class IncidentService {

  // ═══════════════════════════════════════════════════════
  // INCIDENTS
  // ═══════════════════════════════════════════════════════

  // ─── Create Incident ─────────────────────────────────────────────────────────
  async createIncident(dto: CreateIncidentDto, createdBy: string) {
    // 1. Create the incident record
    const incident = await prisma.incident.create({
      data: {
        citizenName:  dto.citizenName,
        citizenPhone: dto.citizenPhone,
        incidentType: dto.incidentType,
        latitude:     dto.latitude,
        longitude:    dto.longitude,
        address:      dto.address,
        notes:        dto.notes,
        priority:     dto.priority ?? 1,
        createdBy,
        status:       IncidentStatus.CREATED,
      },
      include: { statusHistory: true },
    });

    // 2. Auto-find and assign the nearest available responder
    const responderType = incidentToResponderType(dto.incidentType) as ResponderType;
    const nearest = await this.findNearestAvailableResponder(
      dto.latitude, dto.longitude, responderType
    );

    let updatedIncident = incident;

    if (nearest) {
      updatedIncident = await this.dispatchToResponder(incident.id, nearest.responderId, createdBy);
      logger.info('Auto-dispatched to nearest responder', {
        incidentId:   incident.id,
        responderId:  nearest.responderId,
        distanceKm:   nearest.distanceKm,
      });
    } else {
      logger.warn('No available responder found for incident', {
        incidentId:   incident.id,
        incidentType: dto.incidentType,
        responderType,
      });
    }

    // 3. Publish incident.created event to RabbitMQ
    const eventPayload: IncidentCreatedPayload = {
      incident_id:      incident.id,
      incident_type:    dto.incidentType,
      latitude:         dto.latitude,
      longitude:        dto.longitude,
      citizen_name:     dto.citizenName,
      created_by:       createdBy,
      status:           updatedIncident.status,
      assigned_unit_id: updatedIncident.assignedUnitId,
      priority:         dto.priority ?? 1,
      created_at:       incident.createdAt.toISOString(),
    };
    await publishEvent(ROUTING_KEYS.INCIDENT_CREATED, eventPayload);

    // 4. Invalidate open incidents cache
    await redisClient.del(REDIS_KEYS.openIncidents());

    return updatedIncident;
  }

  // ─── Get Incident by ID ───────────────────────────────────────────────────────
  async getIncidentById(id: string) {
    // Try cache
    const cached = await redisClient.get(REDIS_KEYS.incident(id));
    if (cached) return JSON.parse(cached);

    const incident = await prisma.incident.findUnique({
      where:   { id },
      include: {
        statusHistory: { orderBy: { changedAt: 'desc' } },
        responder:     true,
      },
    });

    if (!incident) {
      throw Object.assign(new Error('Incident not found'), { status: 404, code: 'NOT_FOUND' });
    }

    await redisClient.setEx(REDIS_KEYS.incident(id), REDIS_TTL.incident, JSON.stringify(incident));
    return incident;
  }

  // ─── List Incidents ───────────────────────────────────────────────────────────
  async listIncidents(
    page = 1,
    limit = 20,
    filters: { status?: IncidentStatus; type?: IncidentType; extraTypes?: string[] } = {}
  ): Promise<PaginatedResult<unknown>> {
    const skip  = (page - 1) * limit;

    // Build the type filter — extraTypes supports multi-type roles (e.g. POLICE sees CRIME+ACCIDENT)
    let typeFilter: object | undefined;
    if (filters.extraTypes && filters.extraTypes.length > 1) {
      typeFilter = { incidentType: { in: filters.extraTypes as IncidentType[] } };
    } else if (filters.type) {
      typeFilter = { incidentType: filters.type };
    }

    const where = {
      ...(filters.status && { status: filters.status }),
      ...typeFilter,
    };

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        skip,
        take:    limit,
        include: { responder: { select: { id: true, name: true, type: true, stationName: true } } },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.incident.count({ where }),
    ]);

    return { data: incidents, total, page, pages: Math.ceil(total / limit), limit };
  }

  // ─── List Open Incidents ──────────────────────────────────────────────────────
  async listOpenIncidents(typeFilter?: string, extraTypes?: string[]) {
    // Build cache key that includes the filter so different roles get different caches
    const cacheKey = typeFilter
      ? `${REDIS_KEYS.openIncidents()}:${typeFilter}`
      : REDIS_KEYS.openIncidents();

    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Build incident type where clause
    let incidentTypeWhere: object = {};
    if (extraTypes && extraTypes.length > 1) {
      incidentTypeWhere = { incidentType: { in: extraTypes as IncidentType[] } };
    } else if (typeFilter) {
      incidentTypeWhere = { incidentType: typeFilter as IncidentType };
    }

    const incidents = await prisma.incident.findMany({
      where: {
        status: { in: [IncidentStatus.CREATED, IncidentStatus.DISPATCHED, IncidentStatus.IN_PROGRESS] },
        ...incidentTypeWhere,
      },
      include: { responder: { select: { id: true, name: true, type: true, stationName: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    await redisClient.setEx(cacheKey, 30, JSON.stringify(incidents));
    return incidents;
  }

  // ─── Update Incident Status ───────────────────────────────────────────────────
  async updateIncidentStatus(id: string, dto: UpdateIncidentStatusDto, changedBy: string) {
    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) {
      throw Object.assign(new Error('Incident not found'), { status: 404, code: 'NOT_FOUND' });
    }

    this.validateStatusTransition(incident.status, dto.status);

    const updateData: Record<string, unknown> = { status: dto.status };
    if (dto.status === IncidentStatus.RESOLVED) {
      updateData.resolvedAt = new Date();
    }

    const [updated] = await prisma.$transaction([
      prisma.incident.update({ where: { id }, data: updateData }),
      prisma.incidentStatusHistory.create({
        data: {
          incidentId: id,
          oldStatus:  incident.status,
          newStatus:  dto.status,
          changedBy,
          note:       dto.note,
        },
      }),
    ]);

    // Free up responder if resolved/cancelled
    if (
      (dto.status === IncidentStatus.RESOLVED || dto.status === IncidentStatus.CANCELLED) &&
      incident.assignedUnitId
    ) {
      await prisma.responder.update({
        where: { id: incident.assignedUnitId },
        data:  { status: ResponderStatus.AVAILABLE },
      });
      await redisClient.del(REDIS_KEYS.responders(incident.assignedUnitType ?? ''));
    }

    // Publish resolved event
    if (dto.status === IncidentStatus.RESOLVED) {
      const durationSec = incident.dispatchedAt
        ? Math.floor((Date.now() - incident.dispatchedAt.getTime()) / 1000)
        : 0;

      const payload: IncidentResolvedPayload = {
        incident_id:  id,
        resolved_by:  changedBy,
        resolved_at:  new Date().toISOString(),
        duration_sec: durationSec,
      };
      await publishEvent(ROUTING_KEYS.INCIDENT_RESOLVED, payload);
    }

    // Invalidate caches
    await redisClient.del(REDIS_KEYS.incident(id));
    await redisClient.del(REDIS_KEYS.openIncidents());

    logger.info('Incident status updated', { id, from: incident.status, to: dto.status });
    return updated;
  }

  // ─── Manually Assign Responder ────────────────────────────────────────────────
  async assignResponder(incidentId: string, responderId: string, assignedBy: string) {
    const [incident, responder] = await Promise.all([
      prisma.incident.findUnique({ where: { id: incidentId } }),
      prisma.responder.findUnique({ where: { id: responderId } }),
    ]);

    if (!incident) throw Object.assign(new Error('Incident not found'),  { status: 404, code: 'NOT_FOUND' });
    if (!responder) throw Object.assign(new Error('Responder not found'), { status: 404, code: 'NOT_FOUND' });

    if (responder.status !== ResponderStatus.AVAILABLE) {
      throw Object.assign(
        new Error('Responder is not currently available'),
        { status: 409, code: 'RESPONDER_UNAVAILABLE' }
      );
    }

    return this.dispatchToResponder(incidentId, responderId, assignedBy);
  }

  // ═══════════════════════════════════════════════════════
  // RESPONDERS
  // ═══════════════════════════════════════════════════════

  // ─── Create Responder ─────────────────────────────────────────────────────────
  async createResponder(dto: CreateResponderDto, managedBy: string) {
    const responder = await prisma.responder.create({
      data: {
        name:        dto.name,
        type:        dto.type,
        stationName: dto.stationName,
        latitude:    dto.latitude,
        longitude:   dto.longitude,
        address:     dto.address,
        phone:       dto.phone,
        capacity:    dto.capacity ?? 1,
        managedBy,
      },
    });

    // Invalidate responder type cache
    await redisClient.del(REDIS_KEYS.responders(dto.type));

    // Publish responder.created so dispatch-service auto-provisions a vehicle
    await publishEvent(ROUTING_KEYS.RESPONDER_CREATED, {
      responder_id:        responder.id,
      name:                responder.name,
      type:                responder.type,
      station_name:        responder.stationName,
      latitude:            responder.latitude,
      longitude:           responder.longitude,
      incident_service_id: responder.id,
    });

    logger.info('Responder registered', { responderId: responder.id, type: dto.type });
    return responder;
  }

  // ─── List Responders ──────────────────────────────────────────────────────────
  async listResponders(type?: ResponderType) {
    const cacheKey = REDIS_KEYS.responders(type ?? 'ALL');
    const cached   = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const responders = await prisma.responder.findMany({
      where:   type ? { type } : undefined,
      orderBy: { name: 'asc' },
    });

    await redisClient.setEx(cacheKey, REDIS_TTL.responderList, JSON.stringify(responders));
    return responders;
  }

  // ─── Update Responder Availability ───────────────────────────────────────────
  async updateResponderStatus(id: string, status: ResponderStatus) {
    const responder = await prisma.responder.findUnique({ where: { id } });
    if (!responder) {
      throw Object.assign(new Error('Responder not found'), { status: 404, code: 'NOT_FOUND' });
    }

    const updated = await prisma.responder.update({ where: { id }, data: { status } });

    // Invalidate caches
    await redisClient.del(REDIS_KEYS.responders(responder.type));
    await redisClient.del(REDIS_KEYS.responders('ALL'));

    logger.info('Responder status updated', { id, status });
    return updated;
  }

  // ─── Find Nearest Available Responder ────────────────────────────────────────
  // For AMBULANCE type: also checks hospital bed availability so the patient
  // can be received. Filters out hospitals with 0 available beds.
  async findNearestAvailableResponder(
    latitude: number,
    longitude: number,
    type: ResponderType
  ): Promise<NearestResponderResult | null> {
    const cacheKey = REDIS_KEYS.nearestResponder(latitude, longitude, type);
    const cached   = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Base filter — must be available
    const baseWhere: Record<string, unknown> = { type, status: ResponderStatus.AVAILABLE };

    // For AMBULANCE: also require at least 1 available bed
    // If no hospital has updated their beds (null), we still include them
    // (benefit of the doubt — better to dispatch than not)
    if (type === ResponderType.AMBULANCE) {
      baseWhere.OR = [
        { availableBeds: { gt: 0 } },
        { availableBeds: null },   // beds not yet configured — include by default
      ];
    }

    const availableResponders = await prisma.responder.findMany({
      where: baseWhere as any,
    });

    if (availableResponders.length === 0) {
      // If AMBULANCE with bed filter found nothing, fall back to any available ambulance
      if (type === ResponderType.AMBULANCE) {
        logger.warn('No ambulances with available beds — falling back to any available ambulance');
        const fallback = await prisma.responder.findMany({
          where: { type, status: ResponderStatus.AVAILABLE },
        });
        if (fallback.length === 0) return null;
        const nearest = findNearest({ latitude, longitude }, fallback);
        if (!nearest) return null;
        return {
          responderId:   nearest.id,
          responderName: nearest.name,
          responderType: nearest.type,
          distanceKm:    nearest.distanceKm,
          coordinates:   { latitude: nearest.latitude, longitude: nearest.longitude },
        };
      }
      return null;
    }

    const nearest = findNearest({ latitude, longitude }, availableResponders);
    if (!nearest) return null;

    const result: NearestResponderResult = {
      responderId:   nearest.id,
      responderName: nearest.name,
      responderType: nearest.type,
      distanceKm:    nearest.distanceKm,
      coordinates:   { latitude: nearest.latitude, longitude: nearest.longitude },
    };

    await redisClient.setEx(cacheKey, REDIS_TTL.nearestResponder, JSON.stringify(result));
    return result;
  }

  // ═══════════════════════════════════════════════════════
  // AI CALL AGENT INTEGRATION
  // ═══════════════════════════════════════════════════════

  // ─── Handle AI-Extracted Incident ─────────────────────────────────────────────
  // Called when RabbitMQ receives an ai.call.processed event
  async handleAiCallProcessed(payload: AiCallProcessedPayload): Promise<void> {
    if (!payload.auto_submit || payload.extracted.confidence < 0.85) {
      logger.info('AI call requires manual review — not auto-submitted', {
        sessionId:  payload.session_id,
        confidence: payload.extracted.confidence,
      });
      return;
    }

    // Map the extracted incident type string to our enum
    const rawType = payload.extracted.incident_type.toUpperCase();
    const incidentType = Object.values(IncidentType).includes(rawType as IncidentType)
      ? (rawType as IncidentType)
      : IncidentType.OTHER;

    try {
      await this.createIncident(
        {
          citizenName:  payload.extracted.citizen_name || 'Unknown (AI Logged)',
          citizenPhone: payload.caller_phone,
          incidentType,
          latitude:     payload.extracted.latitude,
          longitude:    payload.extracted.longitude,
          address:      payload.extracted.location_text,
          notes:        `[AI LOGGED] ${payload.extracted.notes}\nTranscript: ${payload.transcript}`,
          priority:     2, // AI-logged incidents default to high priority
        },
        'ai-agent-service' // system user
      );

      logger.info('AI call auto-submitted as incident', { sessionId: payload.session_id });
    } catch (err) {
      logger.error('Failed to auto-create AI incident', {
        sessionId: payload.session_id,
        error:     err,
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════

  // ─── Dispatch to Responder (internal) ────────────────────────────────────────
  private async dispatchToResponder(incidentId: string, responderId: string, dispatchedBy: string) {
    const responder = await prisma.responder.findUnique({ where: { id: responderId } });
    if (!responder) throw Object.assign(new Error('Responder not found'), { status: 404 });

    const [updated] = await prisma.$transaction([
      // Update incident
      prisma.incident.update({
        where: { id: incidentId },
        data: {
          assignedUnitId:   responderId,
          assignedUnitType: responder.type,
          status:           IncidentStatus.DISPATCHED,
          dispatchedAt:     new Date(),
        },
        include: { statusHistory: true, responder: true },
      }),
      // Add status history
      prisma.incidentStatusHistory.create({
        data: {
          incidentId,
          oldStatus: IncidentStatus.CREATED,
          newStatus: IncidentStatus.DISPATCHED,
          changedBy: dispatchedBy,
          note:      `Dispatched to ${responder.name} (${responder.stationName})`,
        },
      }),
      // Mark responder as busy
      prisma.responder.update({
        where: { id: responderId },
        data:  { status: ResponderStatus.BUSY },
      }),
    ]);

    // Publish incident.dispatched event
    // NOTE: latitude/longitude are the responder station coords (backward compat).
    // incident_latitude/longitude are the SCENE coords — the simulation uses these
    // as the driving destination so the vehicle actually goes to the incident.
    const payload: IncidentDispatchedPayload = {
      incident_id:        incidentId,
      assigned_unit_id:   responderId,
      assigned_unit_type: responder.type,
      responder_name:     responder.name,
      latitude:           responder.latitude,
      longitude:          responder.longitude,
      incident_latitude:  updated.latitude,
      incident_longitude: updated.longitude,
      dispatched_at:      new Date().toISOString(),
    };
    await publishEvent(ROUTING_KEYS.INCIDENT_DISPATCHED, payload);

    // Invalidate caches
    await redisClient.del(REDIS_KEYS.incident(incidentId));
    await redisClient.del(REDIS_KEYS.openIncidents());
    await redisClient.del(REDIS_KEYS.responders(responder.type));

    return updated;
  }

  // ═══════════════════════════════════════════════════════
  // PROXIMITY & DEDUPLICATION
  // ═══════════════════════════════════════════════════════

  // ─── Check Nearby Open Incidents ─────────────────────────────────────────────
  // Called before creating a new incident to detect potential duplicates.
  // Returns any open incidents within radiusMetres of the given coordinates.
  async checkNearbyOpenIncidents(
    latitude:     number,
    longitude:    number,
    radiusMetres: number = 200
  ): Promise<NearbyIncidentResult[]> {
    const openIncidents = await prisma.incident.findMany({
      where: {
        status: { in: [IncidentStatus.CREATED, IncidentStatus.DISPATCHED, IncidentStatus.IN_PROGRESS] },
      },
      include: {
        responder: { select: { id: true, name: true, stationName: true } },
      },
    });

    const nearby: NearbyIncidentResult[] = [];

    for (const inc of openIncidents) {
      const distMetres = haversineKm(latitude, longitude, inc.latitude, inc.longitude) * 1000;
      if (distMetres <= radiusMetres) {
        nearby.push({
          incidentId:   inc.id,
          incidentType: inc.incidentType,
          status:       inc.status,
          distanceMetres: Math.round(distMetres),
          latitude:     inc.latitude,
          longitude:    inc.longitude,
          address:      inc.address,
          createdBy:    inc.createdBy,
          createdAt:    inc.createdAt,
          assignedUnit: inc.responder
            ? { id: inc.responder.id, name: inc.responder.name, station: inc.responder.stationName }
            : null,
          linkedReportCount: await prisma.relatedIncidentReport.count({
            where: { parentIncidentId: inc.id },
          }),
        });
      }
    }

    // Sort by closest first
    return nearby.sort((a, b) => a.distanceMetres - b.distanceMetres);
  }

  // ─── Get Nearby Incidents (for API endpoint) ──────────────────────────────────
  async getNearbyIncidents(latitude: number, longitude: number, radiusMetres = 500) {
    return this.checkNearbyOpenIncidents(latitude, longitude, radiusMetres);
  }

  // ─── Link Incident as Related Report ─────────────────────────────────────────
  // When a second admin receives a call about an already-active incident,
  // they can link their report to the parent instead of creating a duplicate.
  // The parent incident handles dispatch — this just adds witness info.
  async linkIncidentReport(dto: LinkIncidentDto, createdBy: string) {
    // Verify parent incident exists and is still open
    const parent = await prisma.incident.findUnique({
      where: { id: dto.parentIncidentId },
      include: { responder: true },
    });

    if (!parent) {
      throw Object.assign(
        new Error('Parent incident not found'),
        { status: 404, code: 'NOT_FOUND' }
      );
    }

    if (parent.status === IncidentStatus.RESOLVED || parent.status === IncidentStatus.CANCELLED) {
      throw Object.assign(
        new Error(`Cannot link to a ${parent.status.toLowerCase()} incident`),
        { status: 409, code: 'INCIDENT_CLOSED' }
      );
    }

    // Create the linked report
    const report = await prisma.relatedIncidentReport.create({
      data: {
        parentIncidentId: dto.parentIncidentId,
        citizenName:      dto.citizenName,
        citizenPhone:     dto.citizenPhone,
        notes:            dto.notes,
        createdBy,
      },
    });

    // Escalate priority on parent if multiple reports are coming in
    const reportCount = await prisma.relatedIncidentReport.count({
      where: { parentIncidentId: dto.parentIncidentId },
    });

    // Auto-escalate: 2+ reports → high priority, 4+ → critical
    let newPriority = parent.priority;
    if (reportCount >= 4 && parent.priority < 3)      newPriority = 3;
    else if (reportCount >= 2 && parent.priority < 2) newPriority = 2;

    if (newPriority !== parent.priority) {
      await prisma.incident.update({
        where: { id: dto.parentIncidentId },
        data:  { priority: newPriority },
      });
      logger.info('Incident priority auto-escalated', {
        incidentId:   dto.parentIncidentId,
        oldPriority:  parent.priority,
        newPriority,
        reportCount,
      });
    }

    // Invalidate cache
    await redisClient.del(REDIS_KEYS.incident(dto.parentIncidentId));
    await redisClient.del(REDIS_KEYS.openIncidents());

    logger.info('Incident linked as related report', {
      parentIncidentId: dto.parentIncidentId,
      reportId:         report.id,
      reportCount,
    });

    return {
      report,
      parentIncident: {
        id:           parent.id,
        status:       parent.status,
        assignedUnit: parent.responder
          ? { name: parent.responder.name, station: parent.responder.stationName }
          : null,
        priority:     newPriority,
        reportCount,
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  // HOSPITAL CAPACITY
  // ═══════════════════════════════════════════════════════

  // ─── Update Hospital Bed Capacity ────────────────────────────────────────────
  // Called by HOSPITAL_ADMIN to update current bed availability.
  // For MEDICAL incidents, the nearest-responder algorithm factors in
  // bed availability to ensure the ambulance goes to a hospital that
  // can actually receive the patient.
  async updateHospitalCapacity(
    responderId: string,
    dto: UpdateHospitalCapacityDto,
    updatedBy: string
  ) {
    const responder = await prisma.responder.findUnique({ where: { id: responderId } });
    if (!responder) {
      throw Object.assign(new Error('Responder not found'), { status: 404, code: 'NOT_FOUND' });
    }
    if (responder.type !== 'AMBULANCE') {
      throw Object.assign(
        new Error('Capacity updates only apply to AMBULANCE type responders'),
        { status: 400, code: 'INVALID_RESPONDER_TYPE' }
      );
    }

    const updated = await prisma.responder.update({
      where: { id: responderId },
      data: {
        totalBeds:     dto.totalBeds,
        availableBeds: dto.availableBeds,
        hospitalId:    dto.hospitalId,
        bedsUpdatedAt: new Date(),
      },
    });

  

    // Use raw query to insert log since Prisma client may not be regenerated yet
    await prisma.$executeRaw`
      INSERT INTO hospital_capacity_logs
        (id, responder_id, hospital_id, station_name, total_beds, available_beds, updated_by)
      VALUES
        (gen_random_uuid(), ${responderId}, ${dto.hospitalId ?? responderId},
         ${responder.stationName}, ${dto.totalBeds}, ${dto.availableBeds}, ${updatedBy})
    `;

    // Invalidate responder cache
    await redisClient.del(REDIS_KEYS.responders(responder.type));
    await redisClient.del(REDIS_KEYS.responders('ALL'));

    logger.info('Hospital capacity updated', {
      responderId,
      stationName:   responder.stationName,
      totalBeds:     dto.totalBeds,
      availableBeds: dto.availableBeds,
    });

    return updated;
  }

  // ─── Get Hospital Capacities ──────────────────────────────────────────────────
  async getHospitalCapacities() {
    const hospitals = await prisma.responder.findMany({
      where: { type: 'AMBULANCE' },
      select: {
        id:            true,
        name:          true,
        stationName:   true,
        latitude:      true,
        longitude:     true,
        status:        true,
        totalBeds:     true,
        availableBeds: true,
        bedsUpdatedAt: true,
        capacity:      true,
      },
      orderBy: { stationName: 'asc' },
    });
    return hospitals;
  }


  // ─── Update Responder Location ────────────────────────────────────────────────
  // Allows service admins to correct or update their station's GPS coordinates.
  // Important for accuracy of the nearest-responder algorithm.
  async updateResponderLocation(
    responderId: string,
    dto: UpdateResponderLocationDto
  ) {
    const responder = await prisma.responder.findUnique({ where: { id: responderId } });
    if (!responder) {
      throw Object.assign(new Error('Responder not found'), { status: 404, code: 'NOT_FOUND' });
    }

    const updated = await prisma.responder.update({
      where: { id: responderId },
      data: {
        latitude:  dto.latitude,
        longitude: dto.longitude,
        ...(dto.address && { address: dto.address }),
      },
    });

    // Invalidate all nearest-responder cache keys for this type
    await redisClient.del(REDIS_KEYS.responders(responder.type));
    await redisClient.del(REDIS_KEYS.responders('ALL'));

    logger.info('Responder location updated', { responderId, lat: dto.latitude, lng: dto.longitude });
    return updated;
  }

  // ─── Get All Linked Reports for an Incident ───────────────────────────────────
  async getLinkedReports(incidentId: string) {
    const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) {
      throw Object.assign(new Error('Incident not found'), { status: 404, code: 'NOT_FOUND' });
    }
    return prisma.relatedIncidentReport.findMany({
      where:   { parentIncidentId: incidentId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ─── Validate Status Transition ───────────────────────────────────────────────
  private validateStatusTransition(current: IncidentStatus, next: IncidentStatus): void {
    const allowed: Record<IncidentStatus, IncidentStatus[]> = {
      [IncidentStatus.CREATED]:     [IncidentStatus.DISPATCHED, IncidentStatus.CANCELLED],
      [IncidentStatus.DISPATCHED]:  [IncidentStatus.IN_PROGRESS, IncidentStatus.CANCELLED],
      [IncidentStatus.IN_PROGRESS]: [IncidentStatus.RESOLVED, IncidentStatus.CANCELLED],
      [IncidentStatus.RESOLVED]:    [],
      [IncidentStatus.CANCELLED]:   [],
    };

    if (!allowed[current].includes(next)) {
      throw Object.assign(
        new Error(`Cannot transition from ${current} to ${next}`),
        { status: 400, code: 'INVALID_STATUS_TRANSITION' }
      );
    }
  }
}

export default new IncidentService();
