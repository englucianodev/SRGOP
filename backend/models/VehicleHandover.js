import mongoose from 'mongoose';
const ref = (model) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, required: true });
const item = new mongoose.Schema(
  {
    state: { type: String, enum: ['S/A', 'C/A'], required: true },
    observation: { type: String, maxlength: 1000, default: '' },
  },
  { _id: false },
);
const inspection = new mongoose.Schema(
  {
    mileage: { type: Number, min: 0, required: true },
    body: { type: item, required: true },
    electrical: { type: item, required: true },
    suspension: { type: item, required: true },
    tires: { type: item, required: true },
    brakes: { type: item, required: true },
    engine: { type: item, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    crew: ref('Crew'),
    shift: ref('CrewShift'),
    vehicle: ref('Vehicle'),
    driver: ref('User'),
    intake: inspection,
    delivery: inspection,
    pendingIntake: { type: Boolean, default: false },
    pendingReturn: { type: Boolean, default: false },
    closedAt: Date,
    reason: String,
  },
  { timestamps: true },
);
schema.index({ driver: 1, pendingReturn: 1 });
schema.index({ vehicle: 1, closedAt: 1 });
export default mongoose.model('VehicleHandover', schema);
