import mongoose, { Document, Schema } from 'mongoose';

export interface IHospitalCapacity extends Document {
  responderId:     string;
  stationName:     string;
  totalBeds:       number;
  availableBeds:   number;
  occupancyPct:    number;
  recordedAt:      Date;
}

const HospitalCapacitySchema = new Schema<IHospitalCapacity>(
  {
    responderId:    { type: String, required: true },
    stationName:    { type: String, required: true },
    totalBeds:      { type: Number, required: true },
    availableBeds:  { type: Number, required: true },
    occupancyPct:   { type: Number, required: true },
    recordedAt:     { type: Date,   default: Date.now },
  },
  { versionKey: false }
);

HospitalCapacitySchema.index({ responderId: 1 });
HospitalCapacitySchema.index({ recordedAt: -1 });
// TTL — auto-delete after 90 days
HospitalCapacitySchema.index({ recordedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const HospitalCapacity = mongoose.model<IHospitalCapacity>(
  'HospitalCapacity', HospitalCapacitySchema
);
