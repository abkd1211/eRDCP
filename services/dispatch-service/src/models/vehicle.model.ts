import mongoose, { Document, Schema, Types } from 'mongoose';

export type VehicleType   = 'AMBULANCE' | 'POLICE' | 'FIRE_TRUCK';
export type VehicleStatus = 'AVAILABLE' | 'DISPATCHED' | 'EN_ROUTE' | 'ON_SCENE' | 'RETURNING' | 'OFFLINE' | 'UNRESPONSIVE';

export interface IVehicleLocation {
  latitude:    number;
  longitude:   number;
  updatedAt:   Date;
}

export interface IVehicle extends Document {
  _id: Types.ObjectId;
  vehicleCode:       string;
  type:              VehicleType;
  stationId:         string;   // responder ID from incident service
  stationName:       string;
  incidentServiceId: string;   // mirrors responder ID for cross-service reference
  driverUserId:      string;   // user ID from auth service
  driverName:        string;
  status:            VehicleStatus;
  currentLocation:   IVehicleLocation;
  currentIncidentId: string | null;

  // Telemetry
  speedKmh:          number;
  heading:           string;
  batteryPct:        number | null;  // driver phone battery %

  // Flags (extra features)
  isUnresponsive:    boolean;
  lastHeartbeatAt:   Date;
  routeDeviation:    boolean;   // true if vehicle has deviated from expected path

  createdAt:  Date;
  updatedAt:  Date;
}

const VehicleSchema = new Schema<IVehicle>(
  {
    vehicleCode:       { type: String, required: true, unique: true, uppercase: true },
    type:              { type: String, required: true, enum: ['AMBULANCE', 'POLICE', 'FIRE_TRUCK'] },
    stationId:         { type: String, required: true },
    stationName:       { type: String, required: true },
    incidentServiceId: { type: String, required: true },
    driverUserId:      { type: String, required: true },
    driverName:        { type: String, required: true },
    status:            { type: String, default: 'AVAILABLE', enum: ['AVAILABLE','DISPATCHED','EN_ROUTE','ON_SCENE','RETURNING','OFFLINE','UNRESPONSIVE'] },

    currentLocation: {
      latitude:  { type: Number, default: 0 },
      longitude: { type: Number, default: 0 },
      updatedAt: { type: Date,   default: Date.now },
    },

    currentIncidentId: { type: String, default: null },

    // Telemetry
    speedKmh:   { type: Number, default: 0 },
    heading:    { type: String, default: 'N' },
    batteryPct: { type: Number, default: null },

    // Flags
    isUnresponsive:  { type: Boolean, default: false },
    lastHeartbeatAt: { type: Date,    default: Date.now },
    routeDeviation:  { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for fast geolocation and status queries
VehicleSchema.index({ 'currentLocation.latitude': 1, 'currentLocation.longitude': 1 });
VehicleSchema.index({ status: 1 });
VehicleSchema.index({ type: 1, status: 1 });
VehicleSchema.index({ driverUserId: 1 });
VehicleSchema.index({ currentIncidentId: 1 });

export const Vehicle = mongoose.model<IVehicle>('Vehicle', VehicleSchema);
