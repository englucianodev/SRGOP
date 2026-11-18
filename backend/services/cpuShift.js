import {
  CpuShift,
  DailyOfficer,
  Crew,
  CrewShift,
  Occurrence,
  Notification,
} from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { serviceWindow } from '../utils/time.js';
import { audit } from './audit.js';
import { transaction } from './operations.js';
import { deliverNotifications, serviceChanged } from './realtime.js';

const OFFICER_FIELDS = 'name callSign rank phone';
const MIN_SESSION_AFTER_MS = 3600000;
export const OVERTIME_ALERT_MS = 30 * 60000;

/** The open CPU shift, with the officer populated; null when nobody is on CPU. */
export const currentCpu = (session = null) =>
  CpuShift.findOne({ status: 'Aberto' })
    .populate('officer', OFFICER_FIELDS)
    .session(session || null);

/** Whether this user holds the open CPU shift. */
export const isCpu = (userId, session = null) =>
  CpuShift.exists({ status: 'Aberto', officer: userId }).session(session || null);

/** Shape returned by the CPU endpoints; keeps `officer` and `assumedAt` as consumers expect. */
export function cpuView(shift, pending = null) {
  if (!shift) return null;
  const transfer = [...(shift.transfers || [])].reverse().find((t) => t.status === 'Pendente');
  return {
    _id: shift._id,
    day: shift.day,
    officer: shift.officer,
    assumedAt: shift.start,
    plannedEnd: shift.plannedEnd,
    status: shift.status,
    transfer: transfer || null,
    pending,
  };
}

/** Day of the previous shift, loading it when only its id was given. */
async function previousDay(previous, session) {
  if (!previous) return null;
  if (previous.day) return previous.day;
  const row = await CpuShift.findById(previous)
    .select('day')
    .session(session || null)
    .lean();
  return row?.day ?? null;
}

/**
 * Opens a shift for the officer and upserts the day's DailyOfficer (the handover snapshot
 * holder). `handover`, `modifiedBy` and `reason` only feed that DailyOfficer record.
 * The report starts at `at` only when the previous shift covered the same service day;
 * otherwise it covers the whole day (including what was registered or rolled over since 08h).
 */
export async function openCpuShift(
  officerId,
  { session, at = new Date(), previous = null, handover, modifiedBy, reason } = {},
) {
  const window = serviceWindow(at);
  const reportFrom = (await previousDay(previous, session)) === window.day ? at : null;
  const [shift] = await CpuShift.create(
    [
      {
        officer: officerId,
        day: window.day,
        start: at,
        plannedEnd: window.end,
        reportFrom,
        previous: previous?._id || previous || undefined,
      },
    ],
    session ? { session } : {},
  );
  const set = { officer: officerId, assumedAt: at };
  if (handover !== undefined) set.handover = handover;
  if (modifiedBy) set.modifiedBy = modifiedBy;
  if (reason) set.reason = reason;
  await DailyOfficer.updateOne(
    { day: window.day },
    { $set: set },
    { upsert: true, session: session || undefined },
  );
  return shift;
}

/** A transfer still pending when the shift closes can no longer be accepted. */
async function cancelPendingTransfer(shift, at, session) {
  const { modifiedCount } = await CpuShift.updateOne(
    { _id: shift._id, 'transfers.status': 'Pendente' },
    { $set: { 'transfers.$.status': 'Cancelada', 'transfers.$.decidedAt': at } },
    { session },
  );
  const pending = modifiedCount && (shift.transfers || []).find((t) => t.status === 'Pendente');
  if (pending) Object.assign(pending, { status: 'Cancelada', decidedAt: at });
}

/** Closes the shift, notifies the officer to generate the reports and audits it.
 * Returns { shift, notification }; callers deliver the notification in realtime after commit. */
export async function closeCpuShift(shift, { reason, session, at = new Date(), actor } = {}) {
  const reportUntil = reason === 'Automático' ? null : at;
  // Conditional on still being open, so two racing closers cannot both close the same shift.
  const { modifiedCount } = await CpuShift.updateOne(
    { _id: shift._id, status: 'Aberto' },
    { $set: { status: 'Fechado', end: at, closeReason: reason, reportUntil } },
    { session },
  );
  if (!modifiedCount) throw new AppError('O turno do CPU já foi encerrado.', 409, 'CPU');
  await cancelPendingTransfer(shift, at, session);
  shift.status = 'Fechado';
  shift.end = at;
  shift.closeReason = reason;
  shift.reportUntil = reportUntil;
  const [notification] = await Notification.create(
    [
      {
        user: shift.officer._id || shift.officer,
        kind: 'turno-cpu',
        cpuShift: shift._id,
        title: 'Turno do CPU encerrado',
        message: `Gere o relatório sintético e analítico do turno de ${shift.day}.`,
      },
    ],
    session ? { session } : {},
  );
  await audit(
    actor || shift.officer._id || shift.officer,
    'Turno do CPU fechado',
    'CpuShift',
    shift._id,
    reason,
    session,
  );
  return { shift, notification };
}

/** What the shift still holds: occurrences being attended and crews still on duty. */
export async function shiftPending(shift) {
  const [occurrences, crews] = await Promise.all([
    Occurrence.find({ dutyDay: shift.day, status: 'Em atendimento', deleted: false })
      .populate('crew', 'name')
      .select('protocol crew')
      .lean(),
    CrewShift.find({ dutyDay: shift.day, end: null }).select('crewName members').lean(),
  ]);
  return {
    attending: occurrences.map((o) => ({ protocol: o.protocol, crew: o.crew?.name || '' })),
    onDuty: crews.map((c) => ({ crew: c.crewName || '', members: c.members?.length || 0 })),
  };
}

export const pendingMessage = (pending) =>
  `O turno do CPU anterior ainda não fechou: ${pending.attending.length} atendimento(s) e ${pending.onDuty.length} guarnição(ões) em serviço.`;

/** Session-policy helper: end of the duty for an officer holding the open shift. */
export const cpuDutyEnd = (shift, now = Date.now()) =>
  new Date(Math.max(+shift.plannedEnd, now + MIN_SESSION_AFTER_MS));

/** One-off migration: today's DailyOfficer without an open shift gets an open one. */
export async function migrateDailyOfficer() {
  const { day } = serviceWindow();
  return transaction(async (session) => {
    // Any shift already recorded for today (even a closed one) means this is not a legacy day.
    if (await CpuShift.exists({ $or: [{ status: 'Aberto' }, { day }] }).session(session))
      return null;
    const row = await DailyOfficer.findOne({ day }).session(session);
    if (!row) return null;
    return openCpuShift(row.officer, { session, at: row.assumedAt || new Date() });
  });
}

const DUTY_DAY_OFFSET_MS = 8 * 3600000;
const DUTY_TIMEZONE = 'America/Fortaleza';

/** Fills `dutyDay` on legacy occurrences from createdAt (service day starts at 08h local). */
export async function backfillDutyDay() {
  const result = await Occurrence.updateMany({ dutyDay: { $exists: false } }, [
    {
      $set: {
        dutyDay: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: { $subtract: ['$createdAt', DUTY_DAY_OFFSET_MS] },
            timezone: DUTY_TIMEZONE,
          },
        },
      },
    },
  ]);
  return result.modifiedCount;
}

/** At the 08h rollover, occurrences nobody accepted yet move to the new service day. */
export async function rollOverPending(now = new Date()) {
  const { day } = serviceWindow(now);
  const result = await Occurrence.updateMany(
    { dutyDay: { $lt: day }, status: { $in: ['Em aberto', 'Despachada'] }, deleted: false },
    { dutyDay: day },
  );
  return result.modifiedCount;
}

/** Crews with members still attending an accepted occurrence at least 30 min past their shift end. */
async function overtimeCrews(now) {
  const crews = await Crew.find({
    shiftEnd: { $lte: new Date(+now - OVERTIME_ALERT_MS) },
    'members.0': { $exists: true },
    currentOccurrence: { $ne: null },
    shift: { $ne: null },
  }).select('_id name shift currentOccurrence');
  const attending = await Occurrence.find({
    _id: { $in: crews.map((c) => c.currentOccurrence) },
    status: 'Em atendimento',
    deleted: false,
  }).select('_id');
  const accepted = new Set(attending.map((o) => String(o._id)));
  return crews.filter((c) => accepted.has(String(c.currentOccurrence)));
}

/** Alerts the CPU officer once per crew shift; returns the notification or null. */
async function alertOvertime(crew, officerId, now) {
  return transaction(async (session) => {
    const marked = await CrewShift.findOneAndUpdate(
      { _id: crew.shift, overtimeAlertAt: null },
      { $set: { overtimeAlertAt: now } },
      { session },
    );
    if (!marked) return null;
    const [notification] = await Notification.create(
      [
        {
          user: officerId,
          kind: 'turno-expirado',
          occurrence: crew.currentOccurrence,
          title: 'Guarnição além do turno',
          message: `${crew.name} segue em atendimento 30 min após o fim do turno.`,
        },
      ],
      { session },
    );
    return notification;
  });
}

async function alertOvertimeCrews(cpu, now) {
  if (!cpu) return 0; // no CPU: leave overtimeAlertAt unset so the alert still goes out later
  const notifications = [];
  for (const crew of await overtimeCrews(now)) {
    // One failing alert must not stop the others nor the auto-close that follows.
    try {
      const notification = await alertOvertime(crew, cpu.officer._id, now);
      if (notification) notifications.push(notification);
    } catch (error) {
      console.error('Turno do CPU: falha no alerta de guarnição além do turno:', error.message);
    }
  }
  if (notifications.length) deliverNotifications(notifications);
  return notifications.length;
}

/** Closes the open shift once its planned end passed and nothing is pending; idempotent. */
async function closeIfDone(cpu, now) {
  if (!cpu || now < cpu.plannedEnd) return false;
  const pending = await shiftPending(cpu);
  if (pending.attending.length || pending.onDuty.length) return false;
  const result = await transaction(async (session) => {
    // Re-read inside the transaction: a concurrent sweep may have closed it already.
    const open = await CpuShift.findOne({ _id: cpu._id, status: 'Aberto' }).session(session);
    if (!open) return null;
    return closeCpuShift(open, { reason: 'Automático', session, at: now });
  });
  if (!result) return false;
  deliverNotifications([result.notification]);
  serviceChanged();
  return true;
}

/** Periodic sweep: roll over pending occurrences, alert on overtime crews, auto-close the shift. */
export async function sweepCpuShift(now = new Date()) {
  const rolled = await rollOverPending(now);
  const cpu = await currentCpu();
  const alerted = await alertOvertimeCrews(cpu, now);
  const closed = await closeIfDone(cpu, now);
  return { rolled, alerted, closed };
}
