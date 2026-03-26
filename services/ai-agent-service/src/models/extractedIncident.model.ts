import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IFieldConfidence {
  value:      string | number | null;
  confidence: number;  // 0-1 per field
  source:     string;  // which NLP rule matched
}

export interface IExtractedIncident extends Document {
  _id:       Types.ObjectId;
  sessionId: string;

  // Extracted fields — each with individual confidence score
  citizenName:   IFieldConfidence;
  incidentType:  IFieldConfidence;
  locationText:  IFieldConfidence;
  latitude:      IFieldConfidence;
  longitude:     IFieldConfidence;
  notes:         IFieldConfidence;
  urgencyLevel:  IFieldConfidence;  // 1-3

  // Overall score — weighted average of field confidences
  overallConfidence: number;

  // Review state
  autoSubmitted:  boolean;
  manuallyEdited: boolean;

  // Corrections made by human reviewer
  corrections: {
    field:       string;
    oldValue:    string;
    newValue:    string;
    correctedBy: string;
    correctedAt: Date;
  }[];

  // Geocoding result
  geocodingAttempted: boolean;
  geocodingSource:    string | null;  // 'nominatim' | 'manual'

  extractedAt: Date;
}

const FieldConfidenceSchema = new Schema({
  value:      { type: Schema.Types.Mixed, default: null },
  confidence: { type: Number, default: 0 },
  source:     { type: String, default: 'unknown' },
}, { _id: false });

const ExtractedIncidentSchema = new Schema<IExtractedIncident>(
  {
    sessionId:    { type: String, required: true, unique: true },

    citizenName:  { type: FieldConfidenceSchema, default: {} },
    incidentType: { type: FieldConfidenceSchema, default: {} },
    locationText: { type: FieldConfidenceSchema, default: {} },
    latitude:     { type: FieldConfidenceSchema, default: {} },
    longitude:    { type: FieldConfidenceSchema, default: {} },
    notes:        { type: FieldConfidenceSchema, default: {} },
    urgencyLevel: { type: FieldConfidenceSchema, default: {} },

    overallConfidence: { type: Number, default: 0 },
    autoSubmitted:     { type: Boolean, default: false },
    manuallyEdited:    { type: Boolean, default: false },

    corrections: [{
      field:       String,
      oldValue:    String,
      newValue:    String,
      correctedBy: String,
      correctedAt: { type: Date, default: Date.now },
    }],

    geocodingAttempted: { type: Boolean, default: false },
    geocodingSource:    { type: String,  default: null },

    extractedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

ExtractedIncidentSchema.index({ sessionId: 1 });
ExtractedIncidentSchema.index({ overallConfidence: 1 });
ExtractedIncidentSchema.index({ autoSubmitted: 1 });

export const ExtractedIncident = mongoose.model<IExtractedIncident>(
  'ExtractedIncident', ExtractedIncidentSchema
);
