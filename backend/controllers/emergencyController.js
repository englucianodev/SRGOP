import { Emergency, Crew, User, DailyOfficer, Notification } from '../models/index.js';
import { activeDuty } from '../utils/duty.js';
import { serviceWindow } from '../utils/time.js';
import { requireValue } from '../utils/errors.js';
import { transaction } from '../services/operations.js';
import { audit } from '../services/audit.js';
import { emergencyChanged, deliverNotifications } from '../services/realtime.js';
const currentCrew = (actor, session) =>
  Crew.findOne({ _id: actor.crew, members: actor._id, ...activeDuty() })
    .populate('city', 'name')
    .session(session || null);
async function permitted(actor, row) {
  return (
    ['Oficial', 'Administrativo'].includes(actor.role) ||
    row.recipients.some((id) => String(id) === String(actor._id)) ||
    Boolean(await currentCrew(actor))
  );
}
export async function create(req, res) {
  const result = await transaction(async (session) => {
    const crew = await currentCrew(req.user, session);
    requireValue(crew, 'Urgência UU está disponível somente para policiais em serviço.', 403);
    await User.updateOne({ _id: req.user._id }, { updatedAt: new Date() }, { session });
    const existing = await Emergency.findOne({ actor: req.user._id, resolvedAt: null }).session(
      session,
    );
    if (existing) return { row: existing, notifications: [], existing: true };
    const crews = await Crew.find(activeDuty()).session(session);
    const cpu = await DailyOfficer.findOne({ day: serviceWindow().day }).session(session);
    const users = await User.find({
      active: true,
      $or: [
        ...crews.map((c) => ({ crew: c._id, _id: { $in: c.members } })),
        ...(cpu ? [{ _id: cpu.officer }] : []),
      ],
    }).session(session);
    const gps =
      req.input.latitude !== undefined
        ? { ...req.input, locatedAt: new Date() }
        : crew.location || {};
    const [row] = await Emergency.create(
      [
        {
          actor: req.user._id,
          crew: crew._id,
          city: crew.city?._id,
          actorName: [req.user.rank, req.user.callSign || req.user.name].filter(Boolean).join(' '),
          crewName: crew.name,
          cityName: crew.city?.name,
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy: gps.accuracy,
          locatedAt: gps.locatedAt,
          recipients: users.map((u) => u._id),
        },
      ],
      { session },
    );
    const notifications = await Notification.insertMany(
      users.map((u) => ({
        user: u._id,
        kind: 'urgencia',
        priority: 'Máxima',
        emergency: row._id,
        title: 'URGÊNCIA UU · APOIO IMEDIATO',
        message: `${row.actorName} · ${row.crewName} · ${row.cityName || 'Município não informado'}`,
      })),
      { session },
    );
    await audit(
      req.user,
      'Urgência UU acionada',
      'Emergency',
      row._id,
      row.cityName || '',
      session,
    );
    return { row, notifications };
  });
  if (!result.existing) {
    emergencyChanged(result.row);
    deliverNotifications(result.notifications);
  }
  res.status(result.existing ? 200 : 201).json(result.row);
}
export async function list(req, res) {
  const duty = await currentCrew(req.user);
  const cpu = await DailyOfficer.exists({ officer: req.user._id, day: serviceWindow().day });
  res.json(
    await Emergency.find({ resolvedAt: null, ...(duty || cpu ? {} : { recipients: req.user._id }) })
      .sort({ createdAt: -1 })
      .limit(100),
  );
}
export async function detail(req, res) {
  const row = await Emergency.findById(req.params.id);
  requireValue(row, 'Alerta não encontrado.', 404);
  requireValue(await permitted(req.user, row), 'Você não tem acesso a este alerta.', 403);
  res.json(row);
}
export async function acknowledge(req, res) {
  const row = await Emergency.findById(req.params.id);
  requireValue(row, 'Alerta não encontrado.', 404);
  requireValue(await permitted(req.user, row), 'Você não tem acesso a este alerta.', 403);
  await Emergency.updateOne({ _id: row._id }, { $addToSet: { acknowledgedBy: req.user._id } });
  await Notification.updateMany({ emergency: row._id, user: req.user._id }, { read: true });
  await audit(req.user, 'Ciência da Urgência UU', 'Emergency', row._id);
  res.json({ message: 'Ciência registrada; a urgência continua ativa até ser encerrada.' });
}
export async function resolve(req, res) {
  const row = await Emergency.findById(req.params.id);
  requireValue(row, 'Alerta não encontrado.', 404);
  requireValue(
    String(row.actor) === String(req.user._id) ||
      ['Oficial', 'Administrativo'].includes(req.user.role),
    'Somente quem pediu apoio ou a central pode encerrar a urgência.',
    403,
  );
  const result = await Emergency.findOneAndUpdate(
    { _id: row._id, resolvedAt: null },
    { resolvedAt: new Date(), resolvedBy: req.user._id, reason: req.input.reason },
    { new: true },
  );
  requireValue(result, 'A urgência já foi encerrada.', 409);
  await audit(req.user, 'Urgência UU encerrada', 'Emergency', row._id, req.input.reason);
  emergencyChanged(result);
  res.json(result);
}
