import {
  CpuShift,
  CrewShift,
  Emergency,
  Occurrence,
  SupportRequest,
  User,
} from '../models/index.js';
import { serviceWindow } from '../utils/time.js';
import { seizuresText } from '../utils/occurrenceDetails.js';

// Privacy: address, involved people and summary are never read into the report.
const MS_PER_MINUTE = 60000;
const WAITING = ['Em aberto', 'Despachada'];
const round1 = (value) => Math.round(value * 10) / 10;
const minutesBetween = (from, to) =>
  from && to ? round1((new Date(to) - new Date(from)) / MS_PER_MINUTE) : null;
const iso = (date) => (date ? new Date(date).toISOString() : null);
const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] || 0), 0);

/** Mongo filter of the occurrences that belong to a shift: its duty day, inside its window. */
export function shiftOccurrenceFilter(shift) {
  const createdAt = {
    ...(shift.reportFrom ? { $gte: shift.reportFrom } : {}),
    ...(shift.reportUntil ? { $lt: shift.reportUntil } : {}),
  };
  return {
    deleted: false,
    dutyDay: shift.day,
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  };
}

const dayStart = (day) => serviceWindow(new Date(`${day}T08:00:00-03:00`)).start;

/** Time interval the report covers, used for crews, urgencies and supports. */
function reportWindow(day, shift) {
  if (!shift) {
    const from = dayStart(day);
    return { from, until: new Date(+from + 86400000) };
  }
  // An automatic close may happen after 08h; what follows the planned end belongs to the next day.
  const end = shift.closeReason === 'Automático' ? shift.plannedEnd : shift.end;
  return {
    from: shift.reportFrom ? shift.start : dayStart(day),
    until: end ?? new Date(),
  };
}

const count = (rows, label) => {
  const result = {};
  for (const row of rows) {
    const key = label(row) || 'Não informado';
    result[key] = (result[key] || 0) + 1;
  }
  return result;
};

function occurrenceSummary(rows) {
  const attended = rows.filter((row) => row.status === 'Encerrada');
  const withDuration = attended.filter((row) => row.durationSeconds != null);
  const seizures = {};
  for (const row of rows)
    for (const item of row.seizures || []) seizures[item.kind] = (seizures[item.kind] || 0) + 1;
  return {
    counts: {
      registered: rows.length,
      attended: attended.length,
      inProgress: rows.filter((row) => row.status === 'Em atendimento').length,
      waiting: rows.filter((row) => WAITING.includes(row.status)).length,
      cancelled: rows.filter((row) => row.status === 'Cancelada').length,
      averageMinutes: withDuration.length
        ? round1(sum(withDuration, 'durationSeconds') / withDuration.length / 60)
        : null,
    },
    results: {
      policeStation: rows.filter((row) => row.policeStation).length,
      detained: sum(rows, 'detained'),
      recoveredVehicles: sum(rows, 'recoveredVehicles'),
      weapons: sum(rows, 'weapons'),
      approaches: sum(rows, 'approaches'),
      seizures,
    },
  };
}

const analyticOccurrence = (row) => ({
  protocol: row.protocol,
  registeredAt: iso(row.createdAt),
  city: row.city?.name ?? null,
  crimeType: row.crimeType,
  status: row.status,
  crew: row.crew?.name ?? null,
  responseMinutes: minutesBetween(row.createdAt, row.startedAt),
  durationMinutes: row.durationSeconds == null ? null : round1(row.durationSeconds / 60),
  detained: row.detained || 0,
  policeStation: row.policeStation || null,
  seizures: seizuresText(row.seizures),
});

async function crewsOf(day, shift, window, occurrences) {
  const filter = shift
    ? {
        dutyDay: day,
        start: { $lt: window.until },
        $or: [{ end: null }, { end: { $gt: window.from } }],
      }
    : { dutyDay: day };
  const shifts = await CrewShift.find(filter).populate('members', 'name').sort({ start: 1 }).lean();
  // An occurrence belongs to the CrewShift of its crew that was open when it was taken.
  const attendances = new Map();
  for (const row of occurrences) {
    const when = row.startedAt ?? row.dispatchedAt;
    const owner = when
      ? shifts.find(
          (item) =>
            String(item.crew) === String(row.crew?._id) &&
            item.start <= when &&
            (!item.end || when < item.end),
        )
      : null;
    if (owner) attendances.set(owner._id, (attendances.get(owner._id) || 0) + 1);
  }
  return shifts.map((item) => ({
    name: item.crewName,
    city: item.cityName ?? null,
    start: iso(item.start),
    end: iso(item.end),
    members: (item.members || []).map((member) => member.name),
    attendances: attendances.get(item._id) || 0,
  }));
}

async function namesOf(ids) {
  const users = await User.find({ _id: { $in: ids } })
    .select('name')
    .lean();
  return new Map(users.map((user) => [String(user._id), user.name]));
}

// Transfers held by the shifts, plus the accepted one on `previous` that opened this shift.
async function transfersOf(shifts, opener) {
  const entries = shifts.flatMap((item) =>
    (item.transfers || []).map((t) => ({ from: item.officer, transfer: t })),
  );
  const previous = opener?.previous ? await CpuShift.findById(opener.previous).lean() : null;
  const accepted = (previous?.transfers || []).findLast(
    (t) => t.status === 'Aceita' && String(t.to) === String(opener.officer),
  );
  if (accepted) entries.push({ from: previous.officer, transfer: accepted });
  const names = await namesOf(entries.flatMap((e) => [e.from, e.transfer.to]));
  return entries
    .map(({ from, transfer: t }) => ({
      at: iso(t.decidedAt ?? t.requestedAt),
      from: names.get(String(from)) ?? null,
      to: names.get(String(t.to)) ?? null,
      status: t.status,
      reason: t.reason || '',
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

async function eventsOf({ from, until }) {
  const inWindow = { $gte: from, $lt: until };
  const [urgencies, supports] = await Promise.all([
    Emergency.find({ createdAt: inWindow }).lean(),
    SupportRequest.find({
      status: { $in: ['Autorizado', 'Concluído'] },
      $or: [{ startedAt: inWindow }, { startedAt: null, createdAt: inWindow }],
    })
      .populate('targetCrew', 'name')
      .lean(),
  ]);
  return [
    ...urgencies.map((item) => ({
      at: iso(item.createdAt),
      kind: 'Urgência',
      label: item.crewName ? `Guarnição ${item.crewName}` : 'Urgência acionada',
    })),
    ...supports.map((item) => ({
      at: iso(item.startedAt ?? item.createdAt),
      kind: 'Apoio',
      label: `Apoio autorizado: ${item.targetCrew?.name ?? 'guarnição'}`,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}

async function headerOf(day, shift, window) {
  if (!shift)
    return {
      day,
      officer: null,
      start: iso(window.from),
      end: iso(window.until),
      closeReason: null,
    };
  const names = await namesOf([shift.officer?._id ?? shift.officer]);
  return {
    day,
    officer: names.get(String(shift.officer?._id ?? shift.officer)) ?? null,
    start: iso(shift.start),
    end: iso(shift.end),
    closeReason: shift.closeReason ?? null,
  };
}

/** Synthetic and analytic report of a CPU shift, or of the whole duty day when `shift` is null. */
export async function buildShiftReport({ day, shift = null }) {
  const window = reportWindow(day, shift);
  const filter = shift ? shiftOccurrenceFilter(shift) : { deleted: false, dutyDay: day };
  const rows = await Occurrence.find(filter)
    .select('-address -description -summary -involved -history')
    .populate('city', 'name')
    .populate('crew', 'name')
    .sort({ createdAt: 1 })
    .lean();
  const dayShifts = shift ? [shift] : await CpuShift.find({ day }).sort({ start: 1 }).lean();
  const [header, crews, transfers, events] = await Promise.all([
    headerOf(day, shift, window),
    crewsOf(day, shift, window, rows),
    transfersOf(dayShifts, shift),
    eventsOf(window),
  ]);
  const { counts, results } = occurrenceSummary(rows);
  return {
    header,
    synthetic: {
      occurrences: counts,
      staff: {
        officers: new Set(crews.flatMap((item) => item.members)).size,
        crews: crews.length,
      },
      results,
      byCity: count(rows, (row) => row.city?.name),
      byCrimeType: count(rows, (row) => row.crimeType),
    },
    analytic: { occurrences: rows.map(analyticOccurrence), crews, transfers, events },
  };
}

// Quotes only when needed and neutralises values a spreadsheet would run as a formula.
const cell = (value) => {
  const text = String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&");
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const decimal = (value) => (value == null ? '' : String(value).replace('.', ','));
const table = (header, rows) => [header, ...rows].map((row) => row.map(cell).join(';'));

/** Analytic report as CSV: BOM, ';' separator, one block per section separated by a blank line. */
export function analyticCsv(report) {
  const { occurrences, crews, transfers, events } = report.analytic;
  const blocks = [
    table(
      [
        'Protocolo',
        'Registrada em',
        'Cidade',
        'Tipo',
        'Status',
        'Guarnição',
        'Resposta (min)',
        'Duração (min)',
        'Conduzidos',
        'Delegacia de destino',
        'Material apreendido',
      ],
      occurrences.map((o) => [
        o.protocol,
        o.registeredAt,
        o.city,
        o.crimeType,
        o.status,
        o.crew,
        decimal(o.responseMinutes),
        decimal(o.durationMinutes),
        o.detained,
        o.policeStation,
        o.seizures,
      ]),
    ),
    table(
      ['Guarnição', 'Cidade', 'Início', 'Fim', 'Integrantes', 'Atendimentos'],
      crews.map((c) => [c.name, c.city, c.start, c.end, c.members.join(' | '), c.attendances]),
    ),
    table(
      ['Passagem em', 'De', 'Para', 'Situação', 'Motivo'],
      transfers.map((t) => [t.at, t.from, t.to, t.status, t.reason]),
    ),
    table(
      ['Evento em', 'Tipo', 'Descrição'],
      events.map((e) => [e.at, e.kind, e.label]),
    ),
  ];
  return '﻿' + blocks.map((lines) => lines.join('\r\n')).join('\r\n\r\n');
}
