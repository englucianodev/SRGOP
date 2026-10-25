import mongoose from 'mongoose';
export default mongoose.model(
  'AuditLog',
  new mongoose.Schema(
    {
      actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
      action: { type: String, required: true, maxlength: 120, index: true },
      entity: { type: String, required: true, maxlength: 80 },
      entityId: String,
      detail: { type: String, maxlength: 2000 },
      ip: String,
    },
    { timestamps: true },
  ),
);
