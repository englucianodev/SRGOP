import { z } from 'zod';
import { Crew, CrewShift, Attendance, SupportRequest } from '../models/index.js';
import { id } from '../middlewares/validation.js';
import { requireValue } from '../utils/errors.js';
import { dayKey, dayRange } from '../utils/time.js';

const key = (value) => String(value?._id || value || '');
const time = (value) => +new Date(value);
const limit = (rows, maximum, label) =>
  requireValue(
    rows.length <= maximum,
    `O relatório excede ${maximum} ${label}. Reduza o período ou selecione menos guarnições.`,
    422,
  );
const endOfShift = (shift, now) => Math.min(time(shift.end || shift.plannedEnd), now);
function daysBetween(start, end) {
  const days = [];
  if (end <= start) return days;
  for (let cursor = +dayRange(dayKey(new Date(start))).$gte; cursor < end; cursor += 86400000) {
    days.push(dayKey(new Date(cursor)));
    requireValue(
      days.length <= 3660,
      'Um registro excede dez anos de serviço. Verifique as datas do turno.',
      422,
    );
  }
  return days;
}
export function shiftComposition(shift, now) {
  const start = time(shift.start),
    end = endOfShift(shift, now);
  const people = new Map(
    (shift.members || []).filter(Boolean).map((m) => [key(m), m.name || 'Usuário não disponível']),
  );
  for (const change of shift.changes || [])
    if (change.member)
      people.set(
        key(change.member),
        change.memberName ||
          change.member?.name ||
          people.get(key(change.member)) ||
          'Usuário não disponível',
      );
  const intervals = [];
  for (const [memberId, name] of people) {
    const changes = (shift.changes || [])
      .filter((c) => key(c.member) === memberId && ['Ingresso', 'Saída'].includes(c.action))
      .sort((a, b) => time(a.at) - time(b.at));
    let joined = null,
      estimated = false;
    if (!changes.length || changes[0].action !== 'Ingresso') {
      joined = start;
      estimated = true;
    }
    const append = (leftAt) => {
      if (joined !== null && leftAt > joined)
        intervals.push({
          memberId,
          name,
          joinedAt: new Date(joined),
          leftAt: new Date(leftAt),
          estimated,
        });
      joined = null;
    };
    for (const change of changes) {
      const at = Math.max(start, Math.min(time(change.at), end));
      if (change.action === 'Ingresso' && joined === null) {
        joined = at;
        estimated = false;
      }
      if (change.action === 'Saída') append(at);
    }
    append(end);
  }
  return intervals;
}
const populateShift = (query) =>
  query
    .populate('crew', 'name city')
    .populate('city', 'name')
    .populate('members endedBy', 'name')
    .populate('changes.member changes.actor', 'name');
const populateService = (query) =>
  query
    .populate('members', 'name')
    .populate(
      'occurrence',
      'protocol occurredAt crimeType address status startedAt endedAt history',
    )
    .populate('acceptedBy', 'name');

export async function crewReports(req, res) {
  requireValue(
    z.iso.date().safeParse(req.query.from).success && z.iso.date().safeParse(req.query.to).success,
    'Informe datas inicial e final válidas.',
    422,
  );
  requireValue(
    req.query.from <= req.query.to,
    'A data final deve ser igual ou posterior à data inicial.',
    422,
  );
  requireValue(
    !req.query.crews || typeof req.query.crews === 'string',
    'Filtro de guarnições inválido.',
    422,
  );
  const ids = req.query.crews ? [...new Set(req.query.crews.split(',').filter(Boolean))] : [];
  requireValue(
    ids.length <= 100 && ids.every((value) => id.safeParse(value).success),
    'Selecione até cem guarnições válidas.',
    422,
  );
  const crews = await Crew.find(ids.length ? { _id: { $in: ids } } : {})
    .populate('city', 'name')
    .sort({ name: 1 })
    .lean();
  requireValue(
    !ids.length || crews.length === ids.length,
    'Uma das guarnições selecionadas não existe.',
    422,
  );
  const crewIds = crews.map((c) => c._id);
  const lower = +dayRange(req.query.from).$gte,
    upper = +dayRange(req.query.to).$lt,
    now = Date.now();
  const attendanceQuery = {
    crew: { $in: crewIds },
    startedAt: { $lt: new Date(Math.min(upper, now)) },
    $or: [
      { endedAt: { $gt: new Date(lower) } },
      ...(now > lower ? [{ status: 'Em atendimento' }] : []),
    ],
  };
  const [attendances, supports] = await Promise.all([
    populateService(Attendance.find(attendanceQuery)).limit(10001).lean(),
    SupportRequest.find({
      targetCrew: { $in: crewIds },
      authorizedBy: { $ne: null },
      status: { $in: ['Autorizado', 'Concluído'] },
      $or: [{ endedAt: { $gt: new Date(lower) } }, { endedAt: null }],
      createdAt: { $lt: new Date(Math.min(upper, now)) },
    })
      .populate('members', 'name')
      .populate('occurrence', 'protocol occurredAt crimeType address status endedAt history')
      .populate('authorizedBy', 'name')
      .limit(10001)
      .lean(),
  ]);
  limit(attendances, 10000, 'atendimentos');
  limit(supports, 10000, 'apoios');
  const services = attendances
    .filter((a) => a.occurrence && Math.min(a.endedAt ? time(a.endedAt) : now, now) > lower)
    .map((a) => ({
      _id: key(a),
      crewId: key(a.crew),
      shiftId: key(a.shift),
      type: 'Principal',
      occurrence: a.occurrence,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
      responsible: a.acceptedBy?.name || 'Usuário não disponível',
      members: a.members || [],
      estimated: false,
    }));
  for (const support of supports) {
    if (!support.occurrence) continue;
    const name = crews.find((c) => key(c) === key(support.targetCrew))?.name;
    const approval = support.occurrence.history?.find(
      (h) => h.action === 'Apoio autorizado' && h.detail === name,
    );
    const startedAt = support.startedAt || approval?.at || support.createdAt;
    const endedAt = support.endedAt || support.occurrence.endedAt;
    if (
      time(startedAt) >= Math.min(upper, now) ||
      Math.min(endedAt ? time(endedAt) : now, now) <= lower
    )
      continue;
    services.push({
      _id: key(support),
      crewId: key(support.targetCrew),
      shiftId: key(support.shift),
      type: 'Apoio',
      occurrence: support.occurrence,
      startedAt,
      endedAt,
      responsible: support.authorizedBy?.name || 'Usuário não disponível',
      members: support.members || [],
      estimated: !support.startedAt,
    });
  }
  limit(services, 10000, 'atendimentos e apoios');
  const earliest = Math.min(
    lower,
    ...services.filter((s) => !s.shiftId).map((s) => time(s.startedAt)),
  );
  const linkedShifts = services.map((s) => s.shiftId).filter(Boolean);
  const shifts = await populateShift(
    CrewShift.find({
      crew: { $in: crewIds },
      start: { $lt: new Date(Math.min(upper, now)) },
      $or: [
        { end: { $gt: new Date(earliest) } },
        { end: null, plannedEnd: { $gt: new Date(earliest) } },
        { _id: { $in: linkedShifts } },
      ],
    }),
  )
    .sort({ start: 1 })
    .limit(1001)
    .lean();
  limit(shifts, 1000, 'turnos');
  const compositions = new Map();
  const normalized = shifts.map((s) => {
    const composition = shiftComposition(s, now);
    compositions.set(key(s), composition);
    return {
      _id: key(s),
      crewId: key(s.crew),
      crewName: s.crewName || s.crew?.name || 'Guarnição não disponível',
      city: s.cityName || s.city?.name || null,
      vehicle: s.vehiclePrefix || null,
      start: s.start,
      plannedEnd: s.plannedEnd,
      end: s.end || null,
      effectiveEnd: new Date(endOfShift(s, now)),
      workedDays: daysBetween(Math.max(time(s.start), lower), Math.min(endOfShift(s, now), upper)),
      members: composition.filter((m) => time(m.joinedAt) < upper && time(m.leftAt) > lower),
      changes: (s.changes || [])
        .filter((c) => time(c.at) >= lower && time(c.at) < upper)
        .map((c) => ({
          action: c.action,
          member: c.memberName || c.member?.name || 'Usuário não disponível',
          actor: c.actorName || c.actor?.name || 'Sistema',
          reason: c.reason || '',
          at: c.at,
        })),
      attendances: [],
    };
  });
  const unlinked = new Map();
  for (const service of services) {
    const candidates = service.shiftId
      ? normalized.filter((s) => s._id === service.shiftId && s.crewId === service.crewId)
      : normalized.filter(
          (s) =>
            s.crewId === service.crewId &&
            time(s.start) <= time(service.startedAt) &&
            time(s.effectiveEnd) > time(service.startedAt),
        );
    const shift = candidates.length === 1 ? candidates[0] : null;
    const composition =
      compositions
        .get(shift?._id)
        ?.filter(
          (m) =>
            time(m.joinedAt) <= time(service.startedAt) && time(m.leftAt) > time(service.startedAt),
        ) || [];
    const members = service.members.length
      ? service.members.map((m) => ({ _id: key(m), name: m.name || 'Usuário não disponível' }))
      : composition.map((m) => ({ _id: m.memberId, name: m.name }));
    const row = {
      _id: service._id,
      type: service.type,
      occurrenceId: key(service.occurrence),
      protocol: service.occurrence.protocol,
      crimeType: service.occurrence.crimeType,
      address: service.occurrence.address,
      status: service.occurrence.status,
      occurredAt: service.occurrence.occurredAt,
      startedAt: service.startedAt,
      endedAt: service.endedAt || null,
      responsible: service.responsible,
      members,
      estimated:
        service.estimated || (!service.members.length && composition.some((m) => m.estimated)),
    };
    if (shift) shift.attendances.push(row);
    else {
      if (!unlinked.has(service.crewId)) unlinked.set(service.crewId, []);
      unlinked.get(service.crewId).push(row);
    }
  }
  normalized.forEach((shift) =>
    shift.attendances.sort((a, b) => time(a.startedAt) - time(b.startedAt)),
  );
  unlinked.forEach((rows) => rows.sort((a, b) => time(a.startedAt) - time(b.startedAt)));
  const groups = crews.map((crew) => {
    const selectedShifts = normalized.filter(
      (s) => s.crewId === key(crew) && (s.workedDays.length || s.attendances.length),
    );
    const unmatchedAttendances = unlinked.get(key(crew)) || [];
    const allServices = [...selectedShifts.flatMap((s) => s.attendances), ...unmatchedAttendances];
    return {
      _id: key(crew),
      name: crew.name,
      city: crew.city?.name,
      workedDays: [...new Set(selectedShifts.flatMap((s) => s.workedDays))].sort(),
      shifts: selectedShifts,
      unmatchedAttendances,
      occurrenceCount: new Set(allServices.map((a) => a.occurrenceId)).size,
      attendanceCount: allServices.length,
    };
  });
  const result = {
    from: req.query.from,
    to: req.query.to,
    timeZone: 'America/Fortaleza',
    generatedAt: new Date(now),
    crews: groups,
  };
  if (req.query.format === 'csv') {
    const header = [
      'Registro',
      'Guarnição',
      'Município do turno',
      'ID turno',
      'Início turno',
      'Fim efetivo / limite observado',
      'Dias trabalhados no período',
      'Integrante',
      'Ingresso',
      'Saída / limite observado',
      'Horário estimado',
      'Protocolo',
      'Participação',
      'Tipo',
      'Início atendimento',
      'Fim atendimento',
      'Situação ocorrência',
      'Responsável / autorizador do apoio',
      'Integrantes no início',
    ];
    const lines = [header];
    const addServices = (crew, shift, rows) =>
      rows.forEach((a) =>
        lines.push([
          'Atendimento',
          shift?.crewName || crew.name,
          shift?.city || 'Não registrado',
          shift?._id,
          shift?.start,
          shift?.effectiveEnd,
          shift?.workedDays.join(', '),
          '',
          '',
          '',
          a.estimated ? 'Sim' : 'Não',
          a.protocol,
          a.type,
          a.crimeType,
          a.startedAt,
          a.endedAt,
          a.status,
          a.responsible,
          a.members.map((m) => m.name).join(', '),
        ]),
      );
    for (const crew of groups) {
      if (!crew.shifts.length && !crew.unmatchedAttendances.length)
        lines.push(['Sem registros', crew.name, crew.city]);
      for (const shift of crew.shifts) {
        lines.push([
          'Turno',
          shift.crewName,
          shift.city || 'Não registrado',
          shift._id,
          shift.start,
          shift.effectiveEnd,
          shift.workedDays.join(', '),
        ]);
        shift.members.forEach((m) =>
          lines.push([
            'Integrante',
            shift.crewName,
            shift.city || 'Não registrado',
            shift._id,
            shift.start,
            shift.effectiveEnd,
            shift.workedDays.join(', '),
            m.name,
            m.joinedAt,
            m.leftAt,
            m.estimated ? 'Sim' : 'Não',
          ]),
        );
        addServices(crew, shift, shift.attendances);
      }
      addServices(crew, null, crew.unmatchedAttendances);
    }
    const escape = (value) =>
      `"${String(value instanceof Date ? value.toISOString() : (value ?? ''))
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""')}"`;
    return res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="srgop-rastreabilidade-guarnicoes.csv"',
      })
      .send(
        '\uFEFF' +
          lines
            .map((line) =>
              Array.from({ length: header.length }, (_, i) => escape(line[i])).join(';'),
            )
            .join('\r\n'),
      );
  }
  res.json(result);
}
