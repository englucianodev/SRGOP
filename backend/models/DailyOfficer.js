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
      // Pending-work snapshot taken when the officer assumed. Hidden by default so the
      // CPU lookups open to every profile never carry it; read it with select('+handover').
      handover: { type: mongoose.Schema.Types.Mixed, select: false },
    },
    { timestamps: true },
  ),
);
