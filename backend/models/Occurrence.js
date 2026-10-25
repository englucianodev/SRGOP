import mongoose from 'mongoose';
import { STATUSES, PRIORITIES } from '../utils/constants.js';
const ref = (name) => ({ type: mongoose.Schema.Types.ObjectId, ref: name });
const schema = new mongoose.Schema(
  {
    protocol: { type: String, required: true, unique: true },
    occurredAt: { type: Date, required: true, index: true },
    city: { ...ref('City'), required: true, index: true },
    crimeType: { type: String, required: true, maxlength: 100, index: true },
    address: { type: String, required: true, maxlength: 300 },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    description: { type: String, required: true, maxlength: 10000 },
    priority: { type: String, enum: PRIORITIES, required: true },
    status: { type: String, enum: STATUSES, default: 'Em aberto', index: true },
    createdBy: { ...ref('User'), required: true },
    crew: ref('Crew'),
    vehicle: ref('Vehicle'),
    assignedMembers: [ref('User')],
    dispatchedAt: Date,
    acceptedBy: ref('User'),
    startedAt: Date,
    endedAt: Date,
    durationSeconds: { type: Number, min: 0 },
    summary: { type: String, maxlength: 10000 },
    weapons: { type: Number, min: 0, default: 0 },
    recoveredVehicles: { type: Number, min: 0, default: 0 },
    detained: { type: Number, min: 0, default: 0 },
    approaches: { type: Number, min: 0, default: 0 },
    history: [
      {
        action: { type: String, required: true },
        actor: ref('User'),
        at: { type: Date, default: Date.now },
        detail: String,
      },
    ],
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);
schema.index({ city: 1, status: 1, occurredAt: -1 });
schema.index({ createdAt: -1 });
export default mongoose.model('Occurrence', schema);
