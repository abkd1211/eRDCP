import mongoose, { Document, Schema, Types } from 'mongoose';

export type SessionStatus =
  | 'RECEIVED'       // Audio received, not yet processed
  | 'TRANSCRIBING'   // Whisper running
  | 'EXTRACTING'     // NLP running
  | 'PENDING_REVIEW' // Low confidence — waiting for human
  | 'AUTO_SUBMITTED' // High confidence — auto-submitted to incident service
  | 'REVIEWED'       // Human reviewed and confirmed/corrected
  | 'DISCARDED'      // Too low confidence, discarded
  | 'FAILED';        // Processing error

export interface ICallSession extends Document {
  _id:               Types.ObjectId;
  sessionId:         string;
  callerPhone:       string;
  audioFilePath:     string;
  audioFileName:     string;
  audioFileSizeBytes:number;
  audioDurationSec:  number | null;
  status:            SessionStatus;

  // Language detection
  detectedLanguage:  string | null;  // en, tw (Twi), ga (Ga), ha (Hausa)
  languageName:      string | null;  // "English", "Twi", "Ga", "Hausa"

  operatorAvailable: boolean;        // was a human operator online when call came in?
  handledBy:         string | null;  // 'ai' | userId if human took over

  startedAt:  Date;
  endedAt:    Date | null;
  durationSec:number | null;

  // Processing timestamps
  transcribedAt: Date | null;
  extractedAt:   Date | null;
  submittedAt:   Date | null;
  reviewedAt:    Date | null;

  // Output
  incidentServiceId: string | null;  // ID returned from incident service after submission
  reviewedBy:        string | null;  // admin user ID who reviewed

  processingError:   string | null;
  createdAt:         Date;
}

const CallSessionSchema = new Schema<ICallSession>(
  {
    sessionId:         { type: String, required: true, unique: true },
    callerPhone:       { type: String, required: true },
    audioFilePath:     { type: String, required: true },
    audioFileName:     { type: String, required: true },
    audioFileSizeBytes:{ type: Number, default: 0 },
    audioDurationSec:  { type: Number, default: null },
    status:            { type: String, default: 'RECEIVED',
      enum: ['RECEIVED','TRANSCRIBING','EXTRACTING','PENDING_REVIEW',
             'AUTO_SUBMITTED','REVIEWED','DISCARDED','FAILED'] },

    detectedLanguage:  { type: String, default: null },
    languageName:      { type: String, default: null },

    operatorAvailable: { type: Boolean, default: false },
    handledBy:         { type: String,  default: null },

    startedAt:   { type: Date, default: Date.now },
    endedAt:     { type: Date, default: null },
    durationSec: { type: Number, default: null },

    transcribedAt: { type: Date, default: null },
    extractedAt:   { type: Date, default: null },
    submittedAt:   { type: Date, default: null },
    reviewedAt:    { type: Date, default: null },

    incidentServiceId: { type: String, default: null },
    reviewedBy:        { type: String, default: null },
    processingError:   { type: String, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, versionKey: false }
);

CallSessionSchema.index({ sessionId: 1 });
CallSessionSchema.index({ status: 1 });
CallSessionSchema.index({ createdAt: -1 });
CallSessionSchema.index({ operatorAvailable: 1 });

export const CallSession = mongoose.model<ICallSession>('CallSession', CallSessionSchema);
