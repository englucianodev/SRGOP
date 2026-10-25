import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'CrewChat', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceCrew: { type: mongoose.Schema.Types.ObjectId, ref: 'Crew', required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  },
  { timestamps: true },
);
schema.index({ chat: 1, _id: -1 });
export default mongoose.model('ChatMessage', schema);
