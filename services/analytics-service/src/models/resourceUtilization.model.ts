import mongoose, { Document, Schema } from 'mongoose';

export interface IResourceUtilization extends Document {
  resourceType:    string;   // AMBULANCE | POLICE | FIRE_TRUCK
  stationId:       string;
  stationName:     string;
  totalUnits:      number;
  deployedUnits:   number;
  utilizationPct:  number;
  recordedAt:      Date;
}

const ResourceUtilizationSchema = new Schema<IResourceUtilization>(
  {
    resourceType:   { type: String, required: true },
    stationId:      { type: String, required: true },
    stationName:    { type: String, required: true },
    totalUnits:     { type: Number, default: 0 },
    deployedUnits:  { type: Number, default: 0 },
    utilizationPct: { type: Number, default: 0 },
    recordedAt:     { type: Date,   default: Date.now },
  },
  { versionKey: false }
);

ResourceUtilizationSchema.index({ resourceType: 1 });
ResourceUtilizationSchema.index({ recordedAt: -1 });
// TTL — auto-delete utilization snapshots older than 90 days
ResourceUtilizationSchema.index({ recordedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const ResourceUtilization = mongoose.model<IResourceUtilization>(
  'ResourceUtilization', ResourceUtilizationSchema
);
