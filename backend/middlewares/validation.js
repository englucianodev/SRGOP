import { z } from 'zod';
import { ROLES, PRIORITIES, VEHICLE_STATUSES, MODULES } from '../utils/constants.js';
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
export const schemas = {
  login: z
    .object({ email: z.email(), password: text(1, 128), remember: z.boolean().default(false) })
    .strict(),
  register: z
    .object({
      name: text(3, 120),
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
  crew: z.object({ name: text(2, 100), city: id, vehicle: id.nullable().optional() }).strict(),
  join: z.object({ driver: z.boolean() }).strict(),
  member: z
    .object({ member: id, action: z.enum(['Saída', 'Motorista']), reason: text(5, 1000) })
    .strict(),
  availability: z
    .object({ status: z.enum(['Disponível', 'Indisponível']), reason: text(5, 1000) })
    .strict(),
  message: z.object({ targetCrew: id, text: text(1, 2000) }).strict(),
  vehicle: z
    .object({
      prefix: text(2, 40),
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
