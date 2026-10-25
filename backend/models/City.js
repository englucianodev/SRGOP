import mongoose from 'mongoose';
export default mongoose.model(
  'City',
  new mongoose.Schema(
    {
      name: { type: String, required: true, trim: true, unique: true, maxlength: 100 },
      latitude: { type: Number, required: true, min: -90, max: 90 },
      longitude: { type: Number, required: true, min: -180, max: 180 },
      active: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);
