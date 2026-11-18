import mongoose from 'mongoose';
const ref = (name) => ({ type: mongoose.Schema.Types.ObjectId, ref: name });
const transfer = new mongoose.Schema({
  to: { ...ref('User'), required: true },
  reason: { type: String, maxlength: 300 },
  requestedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['Pendente', 'Aceita', 'Recusada', 'Cancelada'],
    default: 'Pendente',
  },
  decidedAt: Date,
});
const schema = new mongoose.Schema(
  {
    officer: { ...ref('User'), required: true, index: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    start: { type: Date, required: true },
    plannedEnd: { type: Date, required: true },
    end: Date,
    status: { type: String, enum: ['Aberto', 'Fechado'], default: 'Aberto' },
    closeReason: { type: String, enum: ['Automático', 'Passagem', 'Troca administrativa'] },
    // null reportFrom = since the start of the day, including what carried over from the day before.
    reportFrom: { type: Date, default: null },
    reportUntil: { type: Date, default: null },
    previous: ref('CpuShift'),
    next: ref('CpuShift'),
    transfers: [transfer],
  },
  { timestamps: true },
);
// Guarantees a single open shift, even under concurrent requests.
schema.index({ status: 1 }, { unique: true, partialFilterExpression: { status: 'Aberto' } });
export default mongoose.model('CpuShift', schema);
