import mongoose from 'mongoose';
const ref = (model) => ({ type: mongoose.Schema.Types.ObjectId, ref: model });
const schema = new mongoose.Schema(
  {
    actor: { ...ref('User'), required: true },
    crew: ref('Crew'),
    city: ref('City'),
    actorName: String,
    crewName: String,
    cityName: String,
    latitude: Number,
    longitude: Number,
    locatedAt: Date,
    accuracy: Number,
    recipients: [ref('User')],
    acknowledgedBy: [ref('User')],
    resolvedAt: { type: Date, default: null },
    resolvedBy: ref('User'),
    reason: String,
  },
  { timestamps: true },
);
schema.index({ actor: 1 }, { unique: true, partialFilterExpression: { resolvedAt: null } });
export default mongoose.model('Emergency', schema);
