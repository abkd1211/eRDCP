import mongoose, { Document, Schema } from 'mongoose';

export interface ILocationHistory extends Document {
  vehicleId:  string;
  incidentId: string | null;
  latitude:   number;
  longitude:  number;
  speedKmh:   number;
  heading:    string;
  batteryPct: number | null;
  recordedAt: Date;
}

const LocationHistorySchema = new Schema<ILocationHistory>(
  {
    vehicleId:  { type: String, required: true },
    incidentId: { type: String, default: null },
    latitude:   { type: Number, required: true },
    longitude:  { type: Number, required: true },
    speedKmh:   { type: Number, default: 0 },
    heading:    { type: String, default: 'N' },
    batteryPct: { type: Number, default: null },
    recordedAt: { type: Date,   default: Date.now },
  },
  { versionKey: false }
);

LocationHistorySchema.index({ vehicleId: 1, recordedAt: -1 });
LocationHistorySchema.index({ incidentId: 1 });
// TTL index — auto-delete location history older than 30 days
LocationHistorySchema.index({ recordedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const LocationHistory = mongoose.model<ILocationHistory>('LocationHistory', LocationHistorySchema);
