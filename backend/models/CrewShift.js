import mongoose from 'mongoose';
export default mongoose.model(
  'CrewShift',
  new mongoose.Schema(
    {
      crew: { type: mongoose.Schema.Types.ObjectId, ref: 'Crew', required: true, index: true },
      crewName: String,
      dutyDay: String,
      shiftMode: { type: String, enum: ['Regular', 'Motocicleta'], default: 'Regular' },
      dutyPeriod: String,
      roundedStart: Date,
      roundedEnd: Date,
      city: { type: mongoose.Schema.Types.ObjectId, ref: 'City' },
      cityName: String,
      vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
      vehiclePrefix: String,
      motorcycles: [
        {
          driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
          prefix: String,
        },
      ],
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
          roundedAt: Date,
        },
      ],
      start: { type: Date, required: true },
      plannedEnd: {
        type: Date,
        required: function () {
          return this.shiftMode !== 'Motocicleta';
        },
      },
      end: Date,
      endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reason: String,
    },
    { timestamps: true },
  ),
);
