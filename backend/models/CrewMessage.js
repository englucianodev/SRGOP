import mongoose from 'mongoose';
const ref = (model) => ({ type: mongoose.Schema.Types.ObjectId, ref: model });
const schema = new mongoose.Schema(
  {
    sender: { ...ref('User'), required: true },
    sourceCrew: ref('Crew'),
    targetCrew: { ...ref('Crew'), required: true },
    participants: [ref('User')],
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  },
  { timestamps: true },
);
schema.index({ participants: 1, createdAt: -1 });
schema.index({ targetCrew: 1, createdAt: -1 });
export default mongoose.model('CrewMessage', schema);
