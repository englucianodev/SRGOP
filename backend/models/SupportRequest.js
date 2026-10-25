import mongoose from 'mongoose';
export default mongoose.model(
  'SupportRequest',
  new mongoose.Schema(
    {
      occurrence: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Occurrence',
        required: true,
        index: true,
      },
      targetCrew: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Crew',
        required: true,
        index: true,
      },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      authorizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      shift: { type: mongoose.Schema.Types.ObjectId, ref: 'CrewShift', index: true },
      members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      startedAt: Date,
      endedAt: Date,
      reason: { type: String, required: true, maxlength: 1000 },
      status: {
        type: String,
        enum: ['Pendente', 'Autorizado', 'Recusado', 'Concluído'],
        default: 'Pendente',
        index: true,
      },
    },
    { timestamps: true },
  ),
);
