import mongoose from 'mongoose';
export default mongoose.model(
  'InstitutionLogo',
  new mongoose.Schema(
    {
      key: { type: String, default: 'general', unique: true },
      data: { type: Buffer, required: true, select: false },
      mime: { type: String, enum: ['image/png', 'image/jpeg'], required: true },
    },
    { timestamps: true },
  ),
);
