import mongoose from 'mongoose';
import { VEHICLE_STATUSES } from '../utils/constants.js';
const ref = (name) => ({ type: mongoose.Schema.Types.ObjectId, ref: name });
export default mongoose.model(
  'Vehicle',
  new mongoose.Schema(
    {
      prefix: { type: String, required: true, trim: true, unique: true, maxlength: 40 },
      plate: { type: String, required: true, uppercase: true, unique: true, maxlength: 10 },
      brand: { type: String, trim: true, maxlength: 60, default: 'Chevrolet' },
      model: { type: String, trim: true, maxlength: 80, default: 'S10' },
      year: { type: Number, min: 1900, max: 2100 },
      type: { type: String, enum: ['Motocicleta', 'SUV', 'Caminhonete'], default: 'Caminhonete' },
      provisional: { type: Boolean, default: false },
      inspectionHold: { type: Boolean, default: false },
      city: { ...ref('City'), required: true, index: true },
      mileage: { type: Number, min: 0, default: 0 },
      lastMaintenance: Date,
      nextMaintenance: Date,
      status: { type: String, enum: VEHICLE_STATUSES, default: 'Disponível', index: true },
      lastDriver: ref('User'),
      crew: { ...ref('Crew'), default: null },
      notes: { type: String, maxlength: 3000 },
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      locatedAt: Date,
    },
    { timestamps: true },
  ),
);
