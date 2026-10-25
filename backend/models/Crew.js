import mongoose from 'mongoose';
import { CREW_STATUSES } from '../utils/constants.js';
const ref = (name) => ({ type: mongoose.Schema.Types.ObjectId, ref: name });
export default mongoose.model(
  'Crew',
  new mongoose.Schema(
    {
      name: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
      city: { ...ref('City'), required: true, index: true },
      vehicle: { ...ref('Vehicle'), default: null },
      members: [ref('User')],
      driver: { ...ref('User'), default: null },
      status: { type: String, enum: CREW_STATUSES, default: 'Fora de serviço', index: true },
      shiftStart: Date,
      shiftEnd: Date,
      shift: ref('CrewShift'),
      currentOccurrence: { ...ref('Occurrence'), default: null },
      endedBy: ref('User'),
      endReason: String,
    },
    { timestamps: true },
  ),
);
