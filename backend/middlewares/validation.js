import { z } from 'zod';
import { ROLES, RANKS, PRIORITIES, VEHICLE_STATUSES, MODULES } from '../utils/constants.js';
z.config(z.locales.pt());
export const id = z.string().regex(/^[a-f\d]{24}$/i, 'Identificador inválido.');
const text = (min = 1, max = 200) =>
  z.string().trim().min(min, `Informe ao menos ${min} caracteres.`).max(max);
const date = z.iso.datetime({ offset: true });
const password = text(10, 72).refine(
  (value) => Buffer.byteLength(value, 'utf8') <= 72,
  'A senha excede 72 bytes. Reduza caracteres especiais.',
);
const coord = {
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
};
const personal = {
  callSign: text(0, 80).optional(),
  rank: z.enum(['', ...RANKS]).optional(),
  serviceNumber: text(0, 40).optional(),
  registration: text(0, 40).optional(),
  phone: text(0, 30)
    .refine((value) => !value || /^[+\d().\s-]{8,30}$/.test(value), 'Informe um telefone válido.')
    .optional(),
};
const condition = z
  .object({ state: z.enum(['S/A', 'C/A']), observation: text(0, 1000).default('') })
  .strict()
  .refine((v) => v.state !== 'C/A' || v.observation.length >= 3, {
    message: 'Descreva a alteração observada (mínimo de três caracteres).',
    path: ['observation'],
  });
export const inspectionSchema = z
  .object({
    mileage: z.number().int().min(0).max(100000000),
    body: condition,
    electrical: condition,
    suspension: condition,
    tires: condition,
    brakes: condition,
    engine: condition,
  })
  .strict();
export const schemas = {
  inspection: inspectionSchema,
  emergency: z
    .object({
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      accuracy: z.number().min(0).optional(),
    })
    .strict()
    .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
      message: 'Informe as duas coordenadas.',
    }),
  mileage: z.object({ mileage: z.number().int().min(0).max(100000000) }).strict(),
  motorcycleLeave: z
    .object({
      checklist: inspectionSchema.optional(),
      checklists: z
        .array(z.object({ vehicle: id, checklist: inspectionSchema }).strict())
        .max(20)
        .optional(),
    })
    .strict(),
  account: z
    .object({
      name: text(3, 120),
      email: z.email().max(200),
      ...personal,
      currentPassword: text(1, 128).optional(),
    })
    .strict(),
  ownPassword: z
    .object({ currentPassword: text(1, 128), password, confirmPassword: text(10, 72) })
    .strict()
    .refine((v) => v.password === v.confirmPassword, {
      message: 'As senhas não coincidem.',
      path: ['confirmPassword'],
    }),
  login: z
    .object({ email: z.email(), password: text(1, 128), remember: z.boolean().default(false) })
    .strict(),
  register: z
    .object({
      name: text(3, 120),
      ...personal,
      email: z.email().max(200),
      password,
      confirmPassword: text(10, 72),
      city: id,
      role: z.enum(ROLES),
    })
    .strict()
    .refine((v) => v.password === v.confirmPassword, {
      message: 'As senhas não coincidem.',
      path: ['confirmPassword'],
    }),
  user: z
    .object({
      name: text(3, 120),
      ...personal,
      email: z.email().max(200),
      city: id,
      role: z.enum(ROLES),
      active: z.boolean(),
      password: password.optional(),
    })
    .strict(),
  occurrence: z
    .object({
      occurredAt: date,
      city: id,
      crimeType: text(2, 100),
      address: text(3, 300),
      description: text(10, 10000),
      priority: z.enum(PRIORITIES),
      ...coord,
    })
    .strict(),
  dispatch: z.object({ occurrence: id, crew: id, reason: text(3, 1000).optional() }).strict(),
  close: z
    .object({
      summary: text(10, 10000),
      weapons: z.number().int().min(0).max(100000).default(0),
      recoveredVehicles: z.number().int().min(0).max(100000).default(0),
      detained: z.number().int().min(0).max(100000).default(0),
      approaches: z.number().int().min(0).max(100000).default(0),
    })
    .strict(),
  reason: z.object({ reason: text(5, 1000) }).strict(),
  note: z.object({ text: text(3, 3000) }).strict(),
  support: z.object({ targetCrew: id, reason: text(5, 1000) }).strict(),
  crew: z
    .object({
      name: text(2, 100),
      city: id,
      vehicle: id.nullable().optional(),
      type: z.enum(['Motocicleta', 'Viatura Convencional']).optional(),
    })
    .strict(),
  join: z
    .object({
      driver: z.boolean(),
      motorcycle: id.optional(),
      motorcycleRole: z.enum(['Piloto', 'Garupa']).optional(),
      dutyPeriod: z.enum(['Manhã', 'Tarde', 'Noite']).optional(),
      checklist: inspectionSchema.optional(),
      motorcycles: z
        .array(z.object({ vehicle: id, checklist: inspectionSchema }).strict())
        .min(1)
        .max(1)
        .optional(),
    })
    .strict(),
  member: z
    .object({ member: id, action: z.enum(['Saída', 'Motorista']), reason: text(5, 1000) })
    .strict(),
  availability: z
    .object({ status: z.enum(['Disponível', 'Indisponível']), reason: text(5, 1000) })
    .strict(),
  message: z.object({ targetCrew: id, text: text(1, 2000) }).strict(),
  chat: z.object({ name: text(2, 100), crews: z.array(id).max(19) }).strict(),
  chatCrews: z.object({ crews: z.array(id).min(1).max(19) }).strict(),
  chatText: z.object({ text: text(1, 2000) }).strict(),
  chatAccess: z.object({ reason: text(10, 1000) }).strict(),
  gps: z.discriminatedUnion('enabled', [
    z.object({ enabled: z.literal(false) }).strict(),
    z
      .object({
        enabled: z.literal(true),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracy: z.number().min(0).max(100000),
      })
      .strict(),
  ]),
  vehicle: z
    .object({
      prefix: text(2, 40),
      brand: text(1, 60).optional(),
      model: text(1, 80).optional(),
      year: z.number().int().min(1900).max(2100).optional(),
      type: z.enum(['Motocicleta', 'SUV', 'Caminhonete']).optional(),
      provisional: z.boolean().optional(),
      plate: text(7, 10).regex(/^[A-Za-z0-9-]+$/),
      city: id,
      mileage: z.number().min(0),
      lastMaintenance: date.nullable().optional(),
      nextMaintenance: date.nullable().optional(),
      status: z.enum(VEHICLE_STATUSES),
      notes: text(0, 3000).optional(),
      ...coord,
    })
    .strict(),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      mileage: z.number().min(0).optional(),
    })
    .strict(),
  city: z
    .object({
      name: text(2, 100),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      active: z.boolean().default(true),
    })
    .strict(),
  settings: z
    .object({
      institution: text(3, 150),
      inactivityMinutes: z.number().int().min(1).max(60),
      alertMinutes: z.number().int().min(1).max(120),
      soundEnabled: z.boolean(),
      notificationsEnabled: z.boolean(),
      modules: z.array(z.enum(MODULES)),
      crimeTypes: z.array(text(2, 100)).min(1).max(100),
      operations: z
        .array(z.object({ name: text(2, 120), objective: text(5, 1000), day: z.iso.date() }))
        .max(100),
    })
    .strict(),
  cpu: z.object({ officer: id, reason: text(5, 1000) }).strict(),
};
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success)
    return res.status(422).json({
      message: result.error.issues
        .map((i) => `${i.path.join('.') || 'Campos'}: ${i.message}`)
        .join(' '),
      origin: 'Validação da API',
      redirect: '/dashboard',
    });
  req.input = result.data;
  next();
};
