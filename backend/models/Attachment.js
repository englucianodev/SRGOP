import mongoose from 'mongoose';
export default mongoose.model(
  'Attachment',
  new mongoose.Schema(
    {
      occurrence: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Occurrence',
        required: true,
        index: true,
      },
      name: { type: String, required: true, maxlength: 200 },
      mime: { type: String, required: true },
      data: { type: Buffer, required: true, select: false },
      size: { type: Number, required: true, max: 5242880 },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true },
  ),
);
