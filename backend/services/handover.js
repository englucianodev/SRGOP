import {
  Occurrence,
  SupportRequest,
  Emergency,
  Crew,
  VehicleHandover,
  DailyOfficer,
} from '../models/index.js';
import { activeDuty } from '../utils/duty.js';
import { serviceWindow } from '../utils/time.js';
// Largest list sent or stored per section; totals stay exact beyond it.
const LIST_LIMIT = 50;
const MINUTE_MS = 60000;
const WAITING_STATUSES = ['Em aberto', 'Despachada'];
const pendingChecklist = () => ({
  closedAt: null,
  $or: [{ pendingReturn: true }, { pendingIntake: true }],
});
// Counts only when the list was cut, so the usual case costs one query per section.
const exactTotal = (rows, count) => (rows.length < LIST_LIMIT ? rows.length : count());
async function section(model, filter, shape, toItem) {
  const rows = await shape(model.find(filter)).limit(LIST_LIMIT).lean();
  return {
    items: rows.map(toItem),
    total: await exactTotal(rows, () => model.countDocuments(filter)),
  };
}
// Only operational fields are selected: no address, description, coordinates or free text.
async function waitingOccurrences(now) {
  const rows = await Occurrence.find({ deleted: false, status: { $in: WAITING_STATUSES } })
    .select('protocol city crimeType priority status createdAt')
    .populate('city', 'name')
    .sort({ createdAt: 1 })
    .limit(LIST_LIMIT)
    .lean();
  // The cut is decided on the whole list: a per-status slice is always shorter than it.
  const [open, dispatched] = await Promise.all(
    WAITING_STATUSES.map((status) =>
      rows.length < LIST_LIMIT
        ? rows.filter((row) => row.status === status).length
        : Occurrence.countDocuments({ deleted: false, status }),
    ),
  );
  const items = rows.map((row) => ({
    protocol: row.protocol,
    city: row.city?.name || '',
    crimeType: row.crimeType,
    priority: row.priority,
    status: row.status,
    waitingMinutes: Math.max(0, Math.floor((+now - +row.createdAt) / MINUTE_MS)),
  }));
  return { items, open, dispatched };
}
const attendancesInProgress = () =>
  section(
    Occurrence,
    { deleted: false, status: 'Em atendimento' },
    (query) =>
      query
        .select('protocol city crew startedAt')
        .populate('city', 'name')
        .populate('crew', 'name')
        .sort({ startedAt: 1 }),
    (row) => ({
      protocol: row.protocol,
      city: row.city?.name || '',
      crew: row.crew?.name || '',
      startedAt: row.startedAt,
    }),
  );
const pendingSupport = () =>
  section(
    SupportRequest,
    { status: 'Pendente' },
    (query) =>
      query
        .select('occurrence targetCrew createdAt')
        .populate('occurrence', 'protocol')
        .populate('targetCrew', 'name')
        .sort({ createdAt: 1 }),
    (row) => ({
      protocol: row.occurrence?.protocol || '',
      targetCrew: row.targetCrew?.name || '',
      requestedAt: row.createdAt,
    }),
  );
const openEmergencies = () =>
  section(
    Emergency,
    { resolvedAt: null },
    (query) => query.select('actorName crewName cityName createdAt').sort({ createdAt: 1 }),
    (row) => ({
      requester: row.actorName || '',
      crew: row.crewName || '',
      city: row.cityName || '',
      triggeredAt: row.createdAt,
    }),
  );
const crewsOnDuty = () =>
  section(
    Crew,
    activeDuty(),
    (query) => query.select('name city status members').populate('city', 'name').sort({ name: 1 }),
    (row) => ({
      name: row.name,
      city: row.city?.name || '',
      status: row.status,
      members: row.members?.length || 0,
    }),
  );
const pendingChecklists = () =>
  section(
    VehicleHandover,
    pendingChecklist(),
    (query) =>
      query
        .select('vehicle driver pendingIntake')
        .populate('vehicle', 'prefix')
        .populate('driver', 'name')
        .sort({ createdAt: 1 }),
    (row) => ({
      vehicle: row.vehicle?.prefix || '',
      driver: row.driver?.name || '',
      // Same precedence as the checklist itself: the intake comes before the delivery.
      kind: row.pendingIntake ? 'Recebimento' : 'Entrega',
    }),
  );
/** Summary of everything still pending, for the officer who takes over the CPU. */
export async function buildHandover(now = new Date()) {
  const [waiting, attendances, supportRequests, emergencies, crews, vehicleChecklists] =
    await Promise.all([
      waitingOccurrences(now),
      attendancesInProgress(),
      pendingSupport(),
      openEmergencies(),
      crewsOnDuty(),
      pendingChecklists(),
    ]);
  const occurrences = waiting.open + waiting.dispatched;
  return {
    generatedAt: now,
    occurrences: { total: occurrences, items: waiting.items },
    attendances: attendances.items,
    supportRequests: supportRequests.items,
    emergencies: emergencies.items,
    crews: crews.items,
    vehicleChecklists: vehicleChecklists.items,
    totals: {
      occurrences,
      open: waiting.open,
      dispatched: waiting.dispatched,
      attendances: attendances.total,
      supportRequests: supportRequests.total,
      emergencies: emergencies.total,
      crews: crews.total,
      vehicleChecklists: vehicleChecklists.total,
    },
  };
}
const cpuEntry = (row) =>
  row
    ? { day: row.day, officer: { name: row.officer?.name || '' }, assumedAt: row.assumedAt }
    : null;
/** Live summary plus the previous CPU and the snapshot saved when today's officer assumed. */
export async function handoverOverview() {
  const { day, start } = serviceWindow();
  const previousDay = serviceWindow(new Date(+start - 1)).day;
  const [summary, current, previous] = await Promise.all([
    buildHandover(),
    DailyOfficer.findOne({ day }).select('+handover').populate('officer', 'name').lean(),
    DailyOfficer.findOne({ day: previousDay })
      .select('day officer assumedAt')
      .populate('officer', 'name')
      .lean(),
  ]);
  return {
    day,
    summary,
    previous: cpuEntry(previous),
    current: cpuEntry(current),
    snapshot: current?.handover || null,
  };
}
