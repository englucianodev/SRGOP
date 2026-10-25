import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    occurrence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Occurrence',
      required: true,
      unique: true,
    },
    crew: { type: mongoose.Schema.Types.ObjectId, ref: 'Crew', required: true },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, required: true },
    endedAt: Date,
    durationSeconds: { type: Number, min: 0 },
    summary: { type: String, maxlength: 10000 },
    notes: [
      {
        text: { type: String, required: true, maxlength: 3000 },
        actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ['Em atendimento', 'Encerrada'],
      default: 'Em atendimento',
      index: true,
    },
  },
  { timestamps: true },
);
schema.index(
  { acceptedBy: 1 },
  { unique: true, partialFilterExpression: { status: 'Em atendimento' } },
);
export default mongoose.model('Attendance', schema);
