import mongoose from 'mongoose';
import { ROLES, RANKS } from '../utils/constants.js';
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    callSign: { type: String, trim: true, maxlength: 80, default: '' },
    rank: { type: String, enum: ['', ...RANKS], default: '' },
    serviceNumber: { type: String, trim: true, maxlength: 40, default: '' },
    registration: { type: String, trim: true, maxlength: 40, default: '' },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    avatarVersion: { type: String, default: '' },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 200,
    },
    password: { type: String, required: true, select: false },
    city: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true, index: true },
    role: { type: String, enum: ROLES, default: 'Praça', required: true },
    requestedRole: { type: String, enum: ROLES, default: 'Praça' },
    active: { type: Boolean, default: false, index: true },
    crew: { type: mongoose.Schema.Types.ObjectId, ref: 'Crew', default: null, index: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, obj) => {
        delete obj.password;
        return obj;
      },
    },
  },
);
export default mongoose.model('User', schema);
