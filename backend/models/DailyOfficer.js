import mongoose from 'mongoose';
export default mongoose.model(
  'DailyOfficer',
  new mongoose.Schema(
    {
      day: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
      officer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      assumedAt: { type: Date, default: Date.now },
      modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reason: String,
    },
    { timestamps: true },
  ),
);
