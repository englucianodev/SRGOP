import mongoose from 'mongoose';
const ref = (model) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, required: true });
const schema = new mongoose.Schema({
  chat: ref('CrewChat'),
  actor: ref('User'),
  session: ref('Session'),
  reason: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
  expiresAt: { type: Date, required: true },
});
schema.index({ chat: 1, actor: 1, session: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('ChatAccess', schema);
