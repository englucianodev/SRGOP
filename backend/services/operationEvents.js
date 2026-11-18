import { AuditLog, Crew, Occurrence } from '../models/index.js';

export const OPERATION_ACTIONS = [
  'Despacho',
  'Aceite',
  'Encerramento',
  'Ingresso na guarnição',
  'Saída da guarnição',
  'Encerramento de turno',
  'Apoio autorizado',
  'Assumiu CPU',
  'CPU administrado',
  'Passagem do CPU aceita',
  'Turno do CPU fechado',
];

const ids = (logs, entity) => [
  ...new Set(logs.filter((l) => l.entity === entity && l.entityId).map((l) => l.entityId)),
];

/** Maps entity id -> display label with a single query; the audit `detail` is never used. */
async function labels(Model, field, entityIds) {
  if (!entityIds.length) return new Map();
  const rows = await Model.find({ _id: { $in: entityIds } })
    .select(field)
    .lean();
  return new Map(rows.map((r) => [String(r._id), r[field]]));
}

/** Operation timeline since `since`, newest first, with only the protocol or crew name as label. */
export async function operationEvents(since, limit = 40) {
  const logs = await AuditLog.find({
    action: { $in: OPERATION_ACTIONS },
    createdAt: { $gte: since },
  })
    .populate('actor', 'name')
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('-detail')
    .lean();
  const [protocols, crewNames] = await Promise.all([
    labels(Occurrence, 'protocol', ids(logs, 'Occurrence')),
    labels(Crew, 'name', ids(logs, 'Crew')),
  ]);
  return logs.map((l) => ({
    at: l.createdAt,
    action: l.action,
    actor: l.actor?.name || null,
    label: (l.entity === 'Occurrence' ? protocols : crewNames).get(l.entityId) || '',
  }));
}
