import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: Number,
  value: { type: Number, default: 0 },
});

export default mongoose.model('OccurrenceSequence', schema);
