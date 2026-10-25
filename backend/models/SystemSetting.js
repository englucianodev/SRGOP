import mongoose from 'mongoose';
import { MODULES } from '../utils/constants.js';
export default mongoose.model(
  'SystemSetting',
  new mongoose.Schema(
    {
      key: { type: String, default: 'general', unique: true },
      institution: {
        type: String,
        default: '18º BPM · Polícia Militar do Maranhão',
        maxlength: 150,
      },
      inactivityMinutes: { type: Number, default: 5, min: 1, max: 60 },
      alertMinutes: { type: Number, default: 10, min: 1, max: 120 },
      soundEnabled: { type: Boolean, default: true },
      notificationsEnabled: { type: Boolean, default: true },
      modules: { type: [String], enum: MODULES, default: MODULES },
      crimeTypes: {
        type: [String],
        default: [
          'Furto',
          'Roubo',
          'Violência doméstica',
          'Perturbação do sossego',
          'Tráfico de drogas',
          'Acidente de trânsito',
          'Outros',
        ],
      },
      operations: [
        {
          name: { type: String, required: true, maxlength: 120 },
          objective: { type: String, required: true, maxlength: 1000 },
          day: { type: String, required: true },
        },
      ],
    },
    { timestamps: true },
  ),
);
