import mongoose, { Document, Schema } from 'mongoose';

export interface IResponderPerformance extends Document {
  responderId:   string;
  responderName: string;
  responderType: string;
  stationName:   string;

  // Cumulative stats
  totalDispatches:   number;
  totalResolved:     number;
  totalDistanceKm:   number;
  avgDispatchTimeSec:number;
  avgArrivalTimeSec: number;
  avgSpeedKmh:       number;
  slaComplianceRate: number;  // percentage 0-100

  // Streak tracking
  currentStreak:     number;  // consecutive on-time dispatches
  bestStreak:        number;

  updatedAt: Date;
}

const ResponderPerformanceSchema = new Schema<IResponderPerformance>(
  {
    responderId:   { type: String, required: true, unique: true },
    responderName: { type: String, required: true },
    responderType: { type: String, required: true },
    stationName:   { type: String, required: true },

    totalDispatches:    { type: Number, default: 0 },
    totalResolved:      { type: Number, default: 0 },
    totalDistanceKm:    { type: Number, default: 0 },
    avgDispatchTimeSec: { type: Number, default: 0 },
    avgArrivalTimeSec:  { type: Number, default: 0 },
    avgSpeedKmh:        { type: Number, default: 0 },
    slaComplianceRate:  { type: Number, default: 100 },

    currentStreak: { type: Number, default: 0 },
    bestStreak:    { type: Number, default: 0 },

    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

ResponderPerformanceSchema.index({ responderType: 1 });
ResponderPerformanceSchema.index({ totalDispatches: -1 });
ResponderPerformanceSchema.index({ avgDispatchTimeSec: 1 });
ResponderPerformanceSchema.index({ slaComplianceRate: -1 });

export const ResponderPerformance = mongoose.model<IResponderPerformance>(
  'ResponderPerformance', ResponderPerformanceSchema
);
