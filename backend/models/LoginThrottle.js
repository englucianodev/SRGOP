import mongoose from 'mongoose';
// Keyed by the e-mail typed at login, existing or not, so the lock does not reveal accounts.
const schema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 200 },
  failures: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('LoginThrottle', schema);
