import mongoose from 'mongoose';
const ref = (model) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, required: true });
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    createdBy: ref('User'),
    memberships: [{ crew: ref('Crew'), shift: ref('CrewShift') }],
  },
  { timestamps: true },
);
schema.index({ 'memberships.crew': 1, updatedAt: -1 });
export default mongoose.model('CrewChat', schema);
