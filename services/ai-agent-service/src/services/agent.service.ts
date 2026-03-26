import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

import { CallSession }        from '../models/callSession.model';
import { Transcription }      from '../models/transcription.model';
import { ExtractedIncident }  from '../models/extractedIncident.model';
import redisClient, { REDIS_KEYS, REDIS_TTL } from '../config/redis';
import { publishEvent, ROUTING_KEYS }         from '../config/rabbitmq';
import { env }                                from '../config/env';
import logger                                 from '../config/logger';
import { transcribeAudio, isWhisperAvailable } from '../utils/whisper';
import { extractIncidentData }                from '../utils/nlp.engine';
import { geocodeLocation, GHANA_DEFAULT_COORDS } from '../utils/geocoding';

export class AiAgentService {

  // ═══════════════════════════════════════════════════════
  // OPERATOR PRESENCE
  // ═══════════════════════════════════════════════════════

  // Call this when an admin logs into the dashboard
  async markOperatorOnline(userId: string): Promise<void> {
    await redisClient.setEx(REDIS_KEYS.operatorOnline(userId), REDIS_TTL.operatorHeartbeat, '1');
    await redisClient.sAdd(REDIS_KEYS.onlineOperators(), userId);
    logger.debug('Operator marked online', { userId });
  }

  // Call this on logout or when JWT expires
  async markOperatorOffline(userId: string): Promise<void> {
    await redisClient.del(REDIS_KEYS.operatorOnline(userId));
    await redisClient.sRem(REDIS_KEYS.onlineOperators(), userId);
    logger.debug('Operator marked offline', { userId });
  }

  // Heartbeat — frontend should call this every 60s to keep operator "online"
  async operatorHeartbeat(userId: string): Promise<void> {
    await redisClient.setEx(REDIS_KEYS.operatorOnline(userId), REDIS_TTL.operatorHeartbeat, '1');
  }

  async isOperatorAvailable(): Promise<boolean> {
    const members = await redisClient.sMembers(REDIS_KEYS.onlineOperators());
    if (members.length === 0) return false;

    // Verify each member still has an active heartbeat key
    for (const userId of members) {
      const alive = await redisClient.get(REDIS_KEYS.operatorOnline(userId));
      if (alive) return true;
      // Clean up stale member
      await redisClient.sRem(REDIS_KEYS.onlineOperators(), userId);
    }
    return false;
  }

  async getOnlineOperatorCount(): Promise<number> {
    const members = await redisClient.sMembers(REDIS_KEYS.onlineOperators());
    let count = 0;
    for (const userId of members) {
      const alive = await redisClient.get(REDIS_KEYS.operatorOnline(userId));
      if (alive) count++;
      else await redisClient.sRem(REDIS_KEYS.onlineOperators(), userId);
    }
    return count;
  }

  // ═══════════════════════════════════════════════════════
  // MAIN PIPELINE — ingest → transcribe → extract → submit
  // ═══════════════════════════════════════════════════════

  async processCall(
    audioFilePath: string,
    audioFileName: string,
    callerPhone:   string,
    fileSizeBytes: number
  ): Promise<{ sessionId: string; status: string; message: string }> {

    const sessionId        = uuidv4();
    const operatorAvailable = await this.isOperatorAvailable();

    // Create session record
    const session = await CallSession.create({
      sessionId,
      callerPhone,
      audioFilePath,
      audioFileName,
      audioFileSizeBytes: fileSizeBytes,
      status:             'RECEIVED',
      operatorAvailable,
      handledBy:          operatorAvailable ? 'human' : 'ai',
      startedAt:          new Date(),
    });

    logger.info('Call session created', {
      sessionId,
      callerPhone,
      operatorAvailable,
    });

    // If operator is available, just store the session for reference
    // The human will handle the call — AI doesn't intervene
    if (operatorAvailable) {
      return {
        sessionId,
        status:  'OPERATOR_AVAILABLE',
        message: 'Human operator is available. Call transferred. Session recorded for reference.',
      };
    }

    // No operator — AI takes over
    // Run pipeline asynchronously so response is immediate
    this.runPipeline(sessionId, audioFilePath).catch(err => {
      logger.error('Pipeline failed', { sessionId, error: err });
    });

    return {
      sessionId,
      status:  'AI_PROCESSING',
      message: 'No operator available. AI agent is processing the call.',
    };
  }

  // ─── Full AI Pipeline ─────────────────────────────────────────────────────
  private async runPipeline(sessionId: string, audioFilePath: string): Promise<void> {
    try {
      // Step 1 — Transcribe
      const transcript = await this.transcribeStep(sessionId, audioFilePath);
      if (!transcript) return;

      // Step 2 — Extract
      const extraction = await this.extractStep(sessionId, transcript);
      if (!extraction) return;

      // Step 3 — Geocode
      await this.geocodeStep(sessionId, extraction.locationText?.value as string);

      // Step 4 — Submit or queue for review
      await this.submitOrQueueStep(sessionId);

    } catch (err) {
      logger.error('Pipeline error', { sessionId, error: err });
      await CallSession.findOneAndUpdate(
        { sessionId },
        { status: 'FAILED', processingError: String(err) }
      );
    }
  }

  // ─── Step 1: Transcribe ───────────────────────────────────────────────────
  private async transcribeStep(sessionId: string, audioFilePath: string): Promise<string | null> {
    await CallSession.findOneAndUpdate({ sessionId }, { status: 'TRANSCRIBING' });

    const whisperAvailable = await isWhisperAvailable();

    let rawText:     string;
    let language:    string;
    let confidence:  number;
    let processingMs:number;
    let model:       string;

    if (whisperAvailable) {
      // Real Whisper transcription
      const result = await transcribeAudio(audioFilePath);
      rawText      = result.text;
      language     = result.language;
      confidence   = result.confidence;
      processingMs = result.processingMs;
      model        = result.model;
    } else {
      // Whisper not running — use a simulated transcript for development/testing
      logger.warn('Whisper not available — using simulated transcript for session', { sessionId });
      rawText      = 'Hello, my name is Kofi Mensah. There has been a serious accident on the N1 Highway near Achimota. Two vehicles collided and one person is unconscious and bleeding badly. Please send an ambulance immediately.';
      language     = 'en';
      confidence   = 0.92;
      processingMs = 0;
      model        = 'simulated';
    }

    // Clean text for NLP
    const cleanedText = rawText
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?'-]/g, '')
      .trim();

    // Save transcription
    await Transcription.create({
      sessionId,
      rawText,
      cleanedText,
      language,
      confidenceScore: confidence,
      wordCount:       cleanedText.split(' ').length,
      processedAt:     new Date(),
      whisperModel:    model,
      processingMs,
    });

    await CallSession.findOneAndUpdate(
      { sessionId },
      {
        transcribedAt:    new Date(),
        detectedLanguage: language,
        languageName:     this.getLanguageName(language),
      }
    );

    logger.info('Transcription complete', { sessionId, language, words: cleanedText.split(' ').length });
    return cleanedText;
  }

  // ─── Step 2: Extract ──────────────────────────────────────────────────────
  private async extractStep(sessionId: string, transcript: string): Promise<typeof ExtractedIncident.prototype | null> {
    await CallSession.findOneAndUpdate({ sessionId }, { status: 'EXTRACTING' });

    const nlpResult = extractIncidentData(transcript);

    logger.info('NLP extraction complete', {
      sessionId,
      incidentType:      nlpResult.incidentType.value,
      overallConfidence: nlpResult.overallConfidence,
      language:          nlpResult.languageName,
    });

    const extraction = await ExtractedIncident.create({
      sessionId,
      citizenName:  nlpResult.citizenName,
      incidentType: nlpResult.incidentType,
      locationText: nlpResult.locationText,
      latitude:     { value: null, confidence: 0, source: 'pending' },
      longitude:    { value: null, confidence: 0, source: 'pending' },
      notes:        nlpResult.notes,
      urgencyLevel: nlpResult.urgencyLevel,
      overallConfidence: nlpResult.overallConfidence,
      extractedAt:  new Date(),
    });

    await CallSession.findOneAndUpdate({ sessionId }, { extractedAt: new Date() });

    // Below minimum threshold — discard
    if (nlpResult.overallConfidence < env.MIN_EXTRACTION_CONFIDENCE) {
      await CallSession.findOneAndUpdate({ sessionId }, { status: 'DISCARDED' });
      logger.warn('Extraction discarded — confidence too low', {
        sessionId,
        confidence: nlpResult.overallConfidence,
        threshold:  env.MIN_EXTRACTION_CONFIDENCE,
      });
      return null;
    }

    return extraction;
  }

  // ─── Step 3: Geocode ──────────────────────────────────────────────────────
  private async geocodeStep(sessionId: string, locationText: string | null): Promise<void> {
    if (!locationText) return;

    const geoResult = await geocodeLocation(locationText);

    const lat = geoResult?.latitude  ?? GHANA_DEFAULT_COORDS.latitude;
    const lng = geoResult?.longitude ?? GHANA_DEFAULT_COORDS.longitude;
    const geoConf   = geoResult?.confidence ?? 0.3;
    const geoSource = geoResult ? 'nominatim' : 'default-accra';

    await ExtractedIncident.findOneAndUpdate(
      { sessionId },
      {
        latitude:  { value: lat,  confidence: geoConf, source: geoSource },
        longitude: { value: lng,  confidence: geoConf, source: geoSource },
        geocodingAttempted: true,
        geocodingSource:    geoSource,
        // Recalculate overall confidence with geocoding result
        $inc: {},
      }
    );

    logger.debug('Geocoding complete', { sessionId, lat, lng, source: geoSource });
  }

  // ─── Step 4: Submit or Queue ──────────────────────────────────────────────
  private async submitOrQueueStep(sessionId: string): Promise<void> {
    const extraction = await ExtractedIncident.findOne({ sessionId });
    if (!extraction) return;

    // Recalculate final confidence including geocoding
    const geoConf = (extraction.latitude.confidence + extraction.longitude.confidence) / 2;
    const finalConfidence = (
      (extraction.incidentType.confidence * 0.30) +
      (geoConf                            * 0.30) +
      (extraction.citizenName.confidence  * 0.15) +
      (extraction.notes.confidence        * 0.10) +
      (extraction.urgencyLevel.confidence * 0.15)
    );

    await ExtractedIncident.findOneAndUpdate(
      { sessionId },
      { overallConfidence: Math.round(finalConfidence * 100) / 100 }
    );

    if (finalConfidence >= env.AUTO_SUBMIT_CONFIDENCE_THRESHOLD) {
      await this.autoSubmitIncident(sessionId, extraction, finalConfidence);
    } else {
      // Queue for human review
      await CallSession.findOneAndUpdate({ sessionId }, { status: 'PENDING_REVIEW' });
      logger.info('Session queued for human review', {
        sessionId,
        confidence: finalConfidence,
        threshold:  env.AUTO_SUBMIT_CONFIDENCE_THRESHOLD,
      });
    }
  }

  // ─── Auto Submit to Incident Service ─────────────────────────────────────
  private async autoSubmitIncident(
    sessionId:  string,
    extraction: typeof ExtractedIncident.prototype,
    confidence: number
  ): Promise<void> {
    try {
      const session = await CallSession.findOne({ sessionId });

      // Publish to RabbitMQ → Incident Service consumes and creates the incident
      await publishEvent(ROUTING_KEYS.AI_CALL_PROCESSED, {
        session_id:   sessionId,
        caller_phone: session?.callerPhone ?? 'unknown',
        transcript:   (await Transcription.findOne({ sessionId }))?.cleanedText ?? '',
        extracted: {
          citizen_name:  extraction.citizenName.value  ?? 'Unknown Caller',
          incident_type: extraction.incidentType.value ?? 'OTHER',
          location_text: extraction.locationText.value ?? '',
          latitude:      extraction.latitude.value     ?? GHANA_DEFAULT_COORDS.latitude,
          longitude:     extraction.longitude.value    ?? GHANA_DEFAULT_COORDS.longitude,
          notes:         extraction.notes.value        ?? '',
          confidence,
        },
        auto_submit: true,
      });

      await ExtractedIncident.findOneAndUpdate(
        { sessionId },
        { autoSubmitted: true }
      );

      await CallSession.findOneAndUpdate(
        { sessionId },
        { status: 'AUTO_SUBMITTED', submittedAt: new Date() }
      );

      logger.info('Incident auto-submitted via RabbitMQ', { sessionId, confidence });

    } catch (err) {
      logger.error('Auto-submit failed', { sessionId, error: err });
      // Fall back to pending review
      await CallSession.findOneAndUpdate({ sessionId }, { status: 'PENDING_REVIEW' });
    }
  }

  // ═══════════════════════════════════════════════════════
  // HUMAN REVIEW OPERATIONS
  // ═══════════════════════════════════════════════════════

  async getPendingReviews(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [sessions, total] = await Promise.all([
      CallSession.find({ status: 'PENDING_REVIEW' })
        .sort({ createdAt: 'asc' })
        .skip(skip)
        .limit(limit)
        .lean(),
      CallSession.countDocuments({ status: 'PENDING_REVIEW' }),
    ]);

    // Attach extraction data to each session
    const enriched = await Promise.all(
      sessions.map(async (s) => {
        const extraction    = await ExtractedIncident.findOne({ sessionId: s.sessionId }).lean();
        const transcription = await Transcription.findOne({ sessionId: s.sessionId }).lean();
        return { ...s, extraction, transcription };
      })
    );

    return { data: enriched, total, page, pages: Math.ceil(total / limit) };
  }

  async getSessionById(sessionId: string) {
    const session      = await CallSession.findOne({ sessionId });
    if (!session) throw Object.assign(new Error('Session not found'), { status: 404, code: 'NOT_FOUND' });

    const transcription = await Transcription.findOne({ sessionId });
    const extraction    = await ExtractedIncident.findOne({ sessionId });

    return { session, transcription, extraction };
  }

  async reviewAndSubmit(
    sessionId: string,
    corrections: Record<string, string>,
    reviewedBy: string
  ): Promise<void> {
    const { session, extraction } = await this.getSessionById(sessionId);

    if (!extraction) throw Object.assign(new Error('No extraction found'), { status: 400 });

    // Apply corrections
    const correctionLog = [];
    for (const [field, newValue] of Object.entries(corrections)) {
      const oldValue = String((extraction as unknown as Record<string, unknown>)[field] ?? '');
      correctionLog.push({ field, oldValue, newValue, correctedBy: reviewedBy, correctedAt: new Date() });
    }

    if (correctionLog.length > 0) {
      await ExtractedIncident.findOneAndUpdate(
        { sessionId },
        {
          manuallyEdited: true,
          $push: { corrections: { $each: correctionLog } },
          ...(corrections.citizenName  && { 'citizenName.value':  corrections.citizenName }),
          ...(corrections.incidentType && { 'incidentType.value': corrections.incidentType }),
          ...(corrections.locationText && { 'locationText.value': corrections.locationText }),
          ...(corrections.notes        && { 'notes.value':        corrections.notes }),
          ...(corrections.latitude     && { 'latitude.value':     parseFloat(corrections.latitude) }),
          ...(corrections.longitude    && { 'longitude.value':    parseFloat(corrections.longitude) }),
        }
      );
    }

    // Submit with reviewed confidence = 1.0 (human verified)
    const updated = await ExtractedIncident.findOne({ sessionId });
    if (updated) await this.autoSubmitIncident(sessionId, updated, 1.0);

    await CallSession.findOneAndUpdate(
      { sessionId },
      { status: 'REVIEWED', reviewedAt: new Date(), reviewedBy }
    );

    logger.info('Session reviewed and submitted', { sessionId, reviewedBy, corrections: correctionLog.length });
  }

  // ─── Re-run NLP on existing transcript ───────────────────────────────────
  async replayNlp(sessionId: string): Promise<void> {
    const transcription = await Transcription.findOne({ sessionId });
    if (!transcription) throw Object.assign(new Error('No transcript found'), { status: 404 });

    // Delete old extraction and re-run
    await ExtractedIncident.deleteOne({ sessionId });
    await CallSession.findOneAndUpdate({ sessionId }, { status: 'EXTRACTING' });

    await this.extractStep(sessionId, transcription.cleanedText);
    await this.geocodeStep(sessionId, null);
    await this.submitOrQueueStep(sessionId);

    logger.info('NLP replay complete', { sessionId });
  }

  // ═══════════════════════════════════════════════════════
  // AGENT PERFORMANCE STATS
  // ═══════════════════════════════════════════════════════

  async getAgentStats() {
    const cached = await redisClient.get(REDIS_KEYS.agentStats());
    if (cached) return JSON.parse(cached);

    const [
      totalSessions,
      autoSubmitted,
      pendingReview,
      reviewed,
      discarded,
      failed,
      avgConfidence,
    ] = await Promise.all([
      CallSession.countDocuments(),
      CallSession.countDocuments({ status: 'AUTO_SUBMITTED' }),
      CallSession.countDocuments({ status: 'PENDING_REVIEW' }),
      CallSession.countDocuments({ status: 'REVIEWED' }),
      CallSession.countDocuments({ status: 'DISCARDED' }),
      CallSession.countDocuments({ status: 'FAILED' }),
      ExtractedIncident.aggregate([
        { $group: { _id: null, avg: { $avg: '$overallConfidence' } } }
      ]),
    ]);

    const operatorOnlineCount = await this.getOnlineOperatorCount();
    const autoSubmitRate = totalSessions > 0
      ? Math.round((autoSubmitted / totalSessions) * 100)
      : 0;

    const stats = {
      totalSessions,
      autoSubmitted,
      pendingReview,
      reviewed,
      discarded,
      failed,
      autoSubmitRate,
      avgConfidence:        Math.round((avgConfidence[0]?.avg ?? 0) * 100) / 100,
      operatorsOnline:      operatorOnlineCount,
      whisperAvailable:     await isWhisperAvailable(),
      confidenceThreshold:  env.AUTO_SUBMIT_CONFIDENCE_THRESHOLD,
      generatedAt:          new Date().toISOString(),
    };

    await redisClient.setEx(REDIS_KEYS.agentStats(), REDIS_TTL.agentStats, JSON.stringify(stats));
    return stats;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────
  private getLanguageName(code: string): string {
    const names: Record<string, string> = {
      en: 'English', tw: 'Twi', ga: 'Ga', ha: 'Hausa',
      fr: 'French',  ar: 'Arabic',
    };
    return names[code] ?? code.toUpperCase();
  }
}

export default new AiAgentService();
