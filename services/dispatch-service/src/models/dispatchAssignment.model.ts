import mongoose, { Document, Schema } from 'mongoose';

export interface ITripSummary {
  totalDistanceKm: number;
  durationSec:     number;
  avgSpeedKmh:     number;
  maxSpeedKmh:     number;
  pingCount:       number;
}

export interface IDispatchAssignment extends Document {
  vehicleId:       string;
  incidentId:      string;
  driverUserId:    string;
  assignedAt:      Date;
  enRouteAt:       Date | null;
  arrivedAt:       Date | null;
  completedAt:     Date | null;
  status:          'ASSIGNED' | 'EN_ROUTE' | 'ON_SCENE' | 'COMPLETED' | 'CANCELLED';

  // Origin snapshot (vehicle location at time of dispatch)
  originLatitude:  number;
  originLongitude: number;

  // Destination (incident location)
  destLatitude:    number;
  destLongitude:   number;

  // ETA tracking
  estimatedArrivalSec: number | null;
  actualArrivalSec:    number | null;

  // Trip summary (populated when completed)
  tripSummary: ITripSummary | null;

  createdAt: Date;
  updatedAt: Date;
}

const DispatchAssignmentSchema = new Schema<IDispatchAssignment>(
  {
    vehicleId:    { type: String, required: true },
    incidentId:   { type: String, required: true },
    driverUserId: { type: String, required: true },
    assignedAt:   { type: Date,   default: Date.now },
    enRouteAt:    { type: Date,   default: null },
    arrivedAt:    { type: Date,   default: null },
    completedAt:  { type: Date,   default: null },
    status:       { type: String, default: 'ASSIGNED', enum: ['ASSIGNED','EN_ROUTE','ON_SCENE','COMPLETED','CANCELLED'] },

    originLatitude:  { type: Number, required: true },
    originLongitude: { type: Number, required: true },
    destLatitude:    { type: Number, required: true },
    destLongitude:   { type: Number, required: true },

    estimatedArrivalSec: { type: Number, default: null },
    actualArrivalSec:    { type: Number, default: null },

    tripSummary: {
      type: {
        totalDistanceKm: Number,
        durationSec:     Number,
        avgSpeedKmh:     Number,
        maxSpeedKmh:     Number,
        pingCount:       Number,
      },
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

DispatchAssignmentSchema.index({ vehicleId: 1 });
DispatchAssignmentSchema.index({ incidentId: 1 });
DispatchAssignmentSchema.index({ status: 1 });

export const DispatchAssignment = mongoose.model<IDispatchAssignment>('DispatchAssignment', DispatchAssignmentSchema);
