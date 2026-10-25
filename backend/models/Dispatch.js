import mongoose from 'mongoose';
export default mongoose.model(
  'Dispatch',
  new mongoose.Schema(
    {
      occurrence: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Occurrence',
        required: true,
        index: true,
      },
      crew: { type: mongoose.Schema.Types.ObjectId, ref: 'Crew', required: true },
      dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      reason: { type: String, maxlength: 1000 },
      dispatchedAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
  ),
);
