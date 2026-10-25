import mongoose from 'mongoose';
export default mongoose.model(
  'ProfilePhoto',
  new mongoose.Schema(
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
      data: { type: Buffer, required: true, select: false },
      mime: { type: String, enum: ['image/png', 'image/jpeg'], required: true },
    },
    { timestamps: true },
  ),
);
