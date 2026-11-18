import mongoose from 'mongoose';
import { STATUSES, PRIORITIES } from '../utils/constants.js';
import {
  INVOLVED_ROLES,
  SEIZURE_KINDS,
  MAX_INVOLVED,
  MAX_SEIZURES,
} from '../utils/occurrenceDetails.js';
const ref = (name) => ({ type: mongoose.Schema.Types.ObjectId, ref: name });
const limited = (item, max, label) => ({
  type: [item],
  default: [],
  validate: [(items) => items.length <= max, `Limite de ${max} ${label} por ocorrência.`],
});
// Personal data: never copy these fields into history or audit entries.
const involvedSchema = new mongoose.Schema(
  {
    role: { type: String, enum: INVOLVED_ROLES, required: true },
    name: { type: String, required: true, minlength: 2, maxlength: 120 },
    document: { type: String, maxlength: 40 },
    phone: { type: String, maxlength: 30 },
    notes: { type: String, maxlength: 300 },
  },
  { _id: false },
);
const seizureSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: SEIZURE_KINDS, required: true },
    description: { type: String, maxlength: 200, default: '' },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, maxlength: 20, default: '' },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    protocol: { type: String, required: true, unique: true, immutable: true },
    occurredAt: { type: Date, required: true, index: true },
    city: { ...ref('City'), required: true, index: true },
    crimeType: { type: String, required: true, maxlength: 200, index: true },
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
    arrivedAt: Date,
    endedAt: Date,
    durationSeconds: { type: Number, min: 0 },
    summary: { type: String, maxlength: 10000 },
    weapons: { type: Number, min: 0, default: 0 },
    recoveredVehicles: { type: Number, min: 0, default: 0 },
    detained: { type: Number, min: 0, default: 0 },
    approaches: { type: Number, min: 0, default: 0 },
    involved: limited(involvedSchema, MAX_INVOLVED, 'envolvidos'),
    seizures: limited(seizureSchema, MAX_SEIZURES, 'apreensões'),
    policeStation: { type: String, maxlength: 160 },
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
