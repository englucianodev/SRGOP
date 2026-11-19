import { between, chance, intBetween, minutes } from '../lib/random.js';
import { config } from '../config.js';
import { ATTENDANCE_MAX_MS } from '../domain/timing.js';

const REJECT_REASONS = [
  'Guarnição em deslocamento para outra demanda; solicita redistribuição.',
  'Viatura com pane momentânea; solicita encaminhamento a outra guarnição.',
];
const SUPPORT_REASON = 'Solicita apoio para isolamento do local e controle da situação.';
const MAX_CLOSE_ATTEMPTS = 3;
/**
 * Closing form. With `details`, anyone detained is taken to the city's police station and seizures
 * are sent; without it only the fields every published backend version accepts are sent.
 */
export function closeBody(team, { summary, results = {} }, details = config.closeDetails) {
  const { seizures, ...counts } = results;
  if (!details) return { summary, ...counts };
  const station = counts.detained > 0 && team.city?.name ? { policeStation: `Delegacia de Polícia Civil de ${team.city.name}` } : {};
  return { summary, ...counts, ...(seizures?.length ? { seizures } : {}), ...station };
}

const scenarioSnapshot = ({ notes, summary, results, durationMs, wantsSupport, category, crimeType, latitude, longitude }) =>
  ({ notes, summary, results, durationMs, wantsSupport, category, crimeType, latitude, longitude });

/** Commander registers an occurrence; in the crew's own city the system assigns it at once. */
export async function registerOccurrence(team, { scenario, targetCity }, now) {
  const body = {
    occurredAt: new Date(now - minutes(intBetween(3, 25))).toISOString(),
    city: targetCity._id,
    crimeType: scenario.crimeType,
    address: scenario.address,
    description: scenario.description,
    priority: scenario.priority,
    latitude: scenario.latitude,
    longitude: scenario.longitude,
  };
  const occurrence = await team.commander.api.post('/occurrences', body);
  const own = String(targetCity._id) === String(team.city._id);
  team.engine.state.trackOccurrence(occurrence._id, {
    protocol: occurrence.protocol,
    cityId: targetCity._id,
    cityName: targetCity.name,
    origin: own ? 'guarnicao-propria-cidade' : 'guarnicao-outra-cidade',
    createdAt: new Date(now).toISOString(),
    scenario: scenarioSnapshot(scenario),
  });
  team.collector.flow('ocorrencia.criada', `Cadastrou ${occurrence.protocol} (${scenario.crimeType}) para ${targetCity.name}.`, team.commander.context, {
    protocol: occurrence.protocol, crimeType: scenario.crimeType, category: scenario.category, origin: own ? 'guarnicao' : 'outra-cidade', generatedBy: scenario.generatedBy,
  });
  if (!own) {
    team.engine.expectCpuNotice(occurrence._id, occurrence.protocol, now);
    return;
  }
  if (occurrence.status === 'Em atendimento' && String(occurrence.acceptedBy) === String(team.commander.id)) {
    startAttendance(team, occurrence, scenarioSnapshot(scenario), 'automatico', now);
    return;
  }
  team.collector.event({ ...team.commander.context, severity: 'alto', category: 'atendimento-automatico', message: `Ocorrência cadastrada pela guarnição na própria cidade não foi assumida automaticamente (situação "${occurrence.status}").`, details: { protocol: occurrence.protocol } });
  team.engine.expectCpuNotice(occurrence._id, occurrence.protocol, now);
}

export function startAttendance(team, occurrence, scenario, mode, now) {
  team.attendance = {
    id: String(occurrence._id),
    protocol: occurrence.protocol,
    scenario,
    startedAt: now,
    dueAt: now + Math.min(scenario.durationMs, ATTENDANCE_MAX_MS),
    notesDone: 0,
    supportAsked: false,
    closeAttempts: 0,
  };
  team.engine.state.trackOccurrence(occurrence._id, { phase: 'atendimento', dueAt: new Date(team.attendance.dueAt).toISOString() });
  team.collector.flow('atendimento.inicio', `Iniciou atendimento de ${occurrence.protocol} (${mode}).`, team.commander.context, { protocol: occurrence.protocol, mode });
}

/** Commander reads a dispatch, then accepts or (rarely) rejects it with a reason. */
export async function evaluateDispatch(team, occurrenceId, now) {
  const api = team.commander.api;
  const occurrence = await api.get(`/occurrences/${occurrenceId}`);
  const crewId = occurrence.crew?._id ?? occurrence.crew;
  if (occurrence.status !== 'Despachada' || String(crewId) !== String(team.crewId)) return;
  if (team.attendance) return;
  if (chance(config.rejectRate)) {
    await api.post(`/attendances/${occurrenceId}/reject`, { reason: REJECT_REASONS[intBetween(0, REJECT_REASONS.length - 1)] });
    team.collector.flow('despacho.rejeitado', `Rejeitou o despacho de ${occurrence.protocol}.`, team.commander.context, { protocol: occurrence.protocol });
    return;
  }
  await api.post(`/attendances/${occurrenceId}/accept`, {}, { tolerate: [409] });
  team.collector.flow('despacho.aceito', `Aceitou o despacho de ${occurrence.protocol}.`, team.commander.context, { protocol: occurrence.protocol });
  const known = team.engine.state.data.occurrences[occurrenceId]?.scenario;
  const scenario = known ?? scenarioSnapshot(await team.engine.factory.create(team.city));
  startAttendance(team, occurrence, scenario, 'despacho', now);
}

async function requestSupport(team, attendance) {
  attendance.supportAsked = true;
  const target = team.engine.supportCandidate(team);
  if (!target) return;
  await team.commander.api.post(`/attendances/${attendance.id}/support`, { targetCrew: target.crewId, reason: SUPPORT_REASON });
  team.engine.state.trackOccurrence(attendance.id, { supportFrom: target.city.name });
  team.collector.flow('apoio.solicitado', `Pediu apoio à guarnição de ${target.city.name} em ${attendance.protocol}.`, team.commander.context, { protocol: attendance.protocol });
}

async function close(team, attendance, now) {
  try {
    await team.commander.api.post(`/attendances/${attendance.id}/close`, closeBody(team, attendance.scenario));
  } catch (error) {
    if (await team.commander.recover(error)) return;
    attendance.closeAttempts++;
    attendance.dueAt = now + minutes(1);
    if (attendance.closeAttempts < MAX_CLOSE_ATTEMPTS) return;
    team.collector.event({ ...team.commander.context, severity: 'alto', category: 'encerramento', message: `Não foi possível encerrar o atendimento ${attendance.protocol} após ${MAX_CLOSE_ATTEMPTS} tentativas.`, details: { status: error.status, message: error.message } });
    team.attendance = null;
    return;
  }
  const durationMin = Math.round((now - attendance.startedAt) / 60000);
  team.collector.flow('atendimento.encerrado', `Encerrou ${attendance.protocol} após ${durationMin} min.`, team.commander.context, { protocol: attendance.protocol, durationMin });
  team.engine.state.forgetOccurrence(attendance.id);
  team.attendance = null;
}

/** Notes during the attendance, an occasional support request and the closing. */
export async function progressAttendance(team, now) {
  const attendance = team.attendance;
  if (!attendance) return;
  const { notes, wantsSupport } = attendance.scenario;
  const durationMs = Math.min(attendance.scenario.durationMs, ATTENDANCE_MAX_MS);
  const dueAt = Math.min(attendance.dueAt, attendance.startedAt + ATTENDANCE_MAX_MS);
  const elapsed = now - attendance.startedAt;
  if (now >= dueAt) return close(team, attendance, now);
  if (attendance.notesDone < notes.length && elapsed >= ((attendance.notesDone + 1) / (notes.length + 1)) * durationMs) {
    await team.commander.api.post(`/attendances/${attendance.id}/notes`, { text: notes[attendance.notesDone] });
    attendance.notesDone++;
    return;
  }
  if (wantsSupport && !attendance.supportAsked && elapsed >= 0.25 * durationMs) return requestSupport(team, attendance);
}

/** Used when the wrap-up time limit runs out: closes whatever is still open, once, without retries. */
export async function closeAttendanceNow(team, now) {
  const attendance = team.attendance;
  if (!attendance) return;
  attendance.closeAttempts = MAX_CLOSE_ATTEMPTS - 1;
  await close(team, attendance, now);
}

/** After a pause or restart, trusts the server about which attendance is really open. */
export async function reconcileAttendance(team, now) {
  const open = await team.commander.api.get('/attendances');
  const mine = open.find((o) => o.status === 'Em atendimento' && String(o.acceptedBy?._id ?? o.acceptedBy) === String(team.commander.id));
  if (!mine) {
    team.attendance = null;
    return;
  }
  if (team.attendance?.id === String(mine._id)) {
    team.attendance.dueAt = Math.min(team.attendance.dueAt, now + minutes(between(1, 2)));
    return;
  }
  const known = team.engine.state.data.occurrences[mine._id]?.scenario;
  const scenario = known ?? scenarioSnapshot(await team.engine.factory.create(team.city));
  // Uses the server's start so an attendance open for hours is closed at once by the 5 min cap.
  const serverStart = Date.parse(mine.startedAt ?? mine.acceptedAt ?? '');
  const startedAt = Number.isFinite(serverStart) ? Math.min(serverStart, now) : now;
  startAttendance(team, mine, { ...scenario, durationMs: minutes(between(1, 3)) }, 'retomada', startedAt);
}
