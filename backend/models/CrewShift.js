import mongoose from 'mongoose';
export default mongoose.model(
  'CrewShift',
  new mongoose.Schema(
    {
      crew: { type: mongoose.Schema.Types.ObjectId, ref: 'Crew', required: true, index: true },
      crewName: String,
      city: { type: mongoose.Schema.Types.ObjectId, ref: 'City' },
      cityName: String,
      vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
      vehiclePrefix: String,
      members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      changes: [
        {
          member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          memberName: String,
          actorName: String,
          action: { type: String, enum: ['Ingresso', 'Saída', 'Motorista'], required: true },
          reason: String,
          at: { type: Date, default: Date.now },
        },
      ],
      start: { type: Date, required: true },
      plannedEnd: { type: Date, required: true },
      end: Date,
      endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reason: String,
    },
    { timestamps: true },
  ),
);
