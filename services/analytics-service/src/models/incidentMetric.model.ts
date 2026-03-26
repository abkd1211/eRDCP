import mongoose, { Document, Schema } from 'mongoose';

export interface IIncidentMetric extends Document {
  incidentId:       string;
  incidentType:     string;
  region:           string;        // derived from lat/lng (e.g. "Accra", "Kumasi")
  latitude:         number;
  longitude:        number;
  priority:         number;
  createdBy:        string;
  assignedUnitId:   string | null;
  assignedUnitType: string | null;

  // Timing metrics (seconds)
  dispatchTimeSec:    number | null;  // created → dispatched
  arrivalTimeSec:     number | null;  // dispatched → arrived
  resolutionTimeSec:  number | null;  // created → resolved
  withinSla:          boolean | null; // whether dispatch was within SLA target

  // Status tracking
  status:       string;
  createdAt:    Date;
  dispatchedAt: Date | null;
  resolvedAt:   Date | null;

  // Linked reports count (from proximity deduplication feature)
  linkedReportCount: number;

  // Hour of day (0-23) for peak hours analysis
  hourOfDay:    number;
  dayOfWeek:    number;  // 0=Sunday, 6=Saturday
}

const IncidentMetricSchema = new Schema<IIncidentMetric>(
  {
    incidentId:       { type: String, required: true, unique: true },
    incidentType:     { type: String, required: true },
    region:           { type: String, default: 'Unknown' },
    latitude:         { type: Number, required: true },
    longitude:        { type: Number, required: true },
    priority:         { type: Number, default: 1 },
    createdBy:        { type: String, required: true },
    assignedUnitId:   { type: String, default: null },
    assignedUnitType: { type: String, default: null },

    dispatchTimeSec:   { type: Number, default: null },
    arrivalTimeSec:    { type: Number, default: null },
    resolutionTimeSec: { type: Number, default: null },
    withinSla:         { type: Boolean, default: null },

    status:       { type: String, required: true },
    createdAt:    { type: Date,   required: true },
    dispatchedAt: { type: Date,   default: null },
    resolvedAt:   { type: Date,   default: null },

    linkedReportCount: { type: Number, default: 0 },
    hourOfDay:         { type: Number, required: true },
    dayOfWeek:         { type: Number, required: true },
  },
  { versionKey: false }
);

IncidentMetricSchema.index({ incidentType: 1 });
IncidentMetricSchema.index({ region: 1 });
IncidentMetricSchema.index({ status: 1 });
IncidentMetricSchema.index({ createdAt: -1 });
IncidentMetricSchema.index({ withinSla: 1 });
IncidentMetricSchema.index({ hourOfDay: 1 });
IncidentMetricSchema.index({ latitude: 1, longitude: 1 });
IncidentMetricSchema.index({ assignedUnitType: 1 });

export const IncidentMetric = mongoose.model<IIncidentMetric>('IncidentMetric', IncidentMetricSchema);
