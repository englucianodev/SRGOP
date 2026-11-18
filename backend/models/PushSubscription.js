import mongoose from 'mongoose';
// One row per device endpoint. `transport` is the only value today (browser Web Push); a native
// channel such as FCM can be added later by widening the enum and relaxing `keys` for it.
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Pushes stop when this session is gone (logout, expiry or administrative removal).
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    transport: { type: String, enum: ['webpush'], default: 'webpush' },
    endpoint: { type: String, required: true, unique: true, maxlength: 2048 },
    keys: {
      p256dh: { type: String, required: true, maxlength: 128 },
      auth: { type: String, required: true, maxlength: 64 },
    },
    failures: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
export default mongoose.model('PushSubscription', schema);
