import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const RANK = { critico: 0, alto: 1, medio: 2, baixo: 3, info: 4 };
const NOT_PROBLEMS = new Set(['fluxo', 'recusa-esperada', 'simulador', 'controle']);
// Health checks need ~2 min (4 × 30 s) plus the 2-min failure window to declare an outage.
const OUTAGE_DETECTION_MS = 4 * 60000;

/** Messages that differ only by protocols, ids, counts or times describe the same problem. */
export const groupKey = ({ severity, category, message }) =>
  `${severity}|${category}|${String(message).replace(/[\w/.-]*\d[\w/.:-]*/g, '#')}`;

function readJsonl(dir, from, to) {
  if (!existsSync(dir)) return [];
  const rows = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort())
    for (const line of readFileSync(path.join(dir, file), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const at = Date.parse(row.t);
        if ((!from || at >= +from) && (!to || at < +to)) rows.push(row);
      } catch {
        /* a line cut by a crash is ignored */
      }
    }
  return rows;
}

const stats = (values) => {
  if (!values.length) return { count: 0, median: null, p95: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { count: sorted.length, median: at(0.5), p95: at(0.95), max: sorted.at(-1) };
};

const increment = (target, key, by = 1) => ({ ...target, [key]: (target[key] ?? 0) + by });

function groupProblems(events) {
  const groups = new Map();
  for (const e of events) {
    const key = groupKey(e);
    const group = groups.get(key) ?? { severity: e.severity, category: e.category, message: e.message, count: 0, first: e.t, last: e.t, roles: new Set(), cities: new Set(), examples: [], screenshots: [] };
    group.count++;
    group.last = e.t;
    if (e.role) group.roles.add(e.role);
    if (e.city) group.cities.add(e.city);
    if (group.examples.length < 3 && !group.examples.includes(e.message)) group.examples.push(e.message);
    if (e.details?.screenshot && group.screenshots.length < 3) group.screenshots.push(e.details.screenshot);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, roles: [...g.roles], cities: [...g.cities] }))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.count - a.count);
}

function summarizeEndpoints(rows) {
  const merged = new Map();
  for (const { endpoints } of rows)
    for (const e of endpoints) {
      const m = merged.get(e.key) ?? { key: e.key, count: 0, serverErrors: 0, clientErrors: 0, network: 0, slow: 0, p95: 0, max: 0, weightedP50: 0 };
      m.count += e.count;
      m.serverErrors += e.serverErrors;
      m.clientErrors += e.clientErrors;
      m.network += e.network;
      m.slow += e.slow;
      m.p95 = Math.max(m.p95, e.p95);
      m.max = Math.max(m.max, e.max);
      m.weightedP50 += e.p50 * e.count;
      merged.set(e.key, m);
    }
  return [...merged.values()]
    .map(({ weightedP50, ...m }) => ({ ...m, p50: Math.round(weightedP50 / Math.max(1, m.count)), errorRate: (m.serverErrors + m.network) / Math.max(1, m.count) }))
    .sort((a, b) => b.serverErrors + b.network - (a.serverErrors + a.network) || b.p95 - a.p95);
}

/** Turns the raw event log into the numbers and groups used by the report. */
export function aggregate(dataDir, { from, to } = {}) {
  const events = readJsonl(path.join(dataDir, 'eventos'), from, to);
  // Failures in the minutes before an automatic pause are symptoms of that outage (already
  // reported as one critical event), not hundreds of separate problems.
  const outageStarts = events.filter((e) => e.category === 'indisponibilidade' && e.severity === 'critico').map((e) => Date.parse(e.t));
  const inOutage = (e) => e.category !== 'indisponibilidade' && outageStarts.some((p) => { const t = Date.parse(e.t); return t <= p && t >= p - OUTAGE_DETECTION_MS; });
  const candidates = events.filter((e) => e.severity !== 'info' && !NOT_PROBLEMS.has(e.category));
  const problemsRaw = candidates.filter((e) => !inOutage(e));
  const outageSymptoms = candidates.length - problemsRaw.length;
  const flowEvents = events.filter((e) => e.category === 'fluxo');
  let severity = { critico: 0, alto: 0, medio: 0, baixo: 0 };
  let byDay = {};
  let byRole = {};
  for (const e of problemsRaw) {
    severity = increment(severity, e.severity);
    const day = e.t.slice(0, 10);
    byDay = { ...byDay, [day]: increment(byDay[day] ?? {}, e.severity) };
    byRole = increment(byRole, e.role || 'Sistema');
  }
  let flow = {};
  let occurrencesByCategory = {};
  let occurrencesByOrigin = {};
  const dispatchLatency = [];
  const cpuLatency = [];
  const attendanceMinutes = [];
  const entryDelays = [];
  for (const e of flowEvents) {
    const d = e.details ?? {};
    flow = increment(flow, d.code);
    if (d.code === 'ocorrencia.criada') {
      occurrencesByCategory = increment(occurrencesByCategory, d.category ?? 'outros');
      occurrencesByOrigin = increment(occurrencesByOrigin, d.origin ?? 'desconhecida');
    }
    if (d.code === 'despacho.recebido' && d.via === 'tempo-real') dispatchLatency.push(d.latencyMs);
    if (d.code === 'cpu.notificado') cpuLatency.push(d.latencyMs);
    if (d.code === 'atendimento.encerrado') attendanceMinutes.push(d.durationMin);
    if (d.code === 'turno.inicio' && d.mode === 'normal') entryDelays.push(d.delayMin);
  }
  return {
    period: { from: events[0]?.t ?? null, to: events.at(-1)?.t ?? null },
    severity,
    byDay,
    byRole,
    problems: groupProblems(problemsRaw),
    simulatorFaults: groupProblems(events.filter((e) => e.category === 'simulador' && e.severity !== 'info')),
    outages: events.filter((e) => e.category === 'indisponibilidade').map((e) => ({ t: e.t, severity: e.severity, message: e.message, durationMs: e.details?.durationMs })),
    outageSymptoms,
    expectedRejections: events.filter((e) => e.category === 'recusa-esperada').length,
    flow,
    occurrencesByCategory,
    occurrencesByOrigin,
    latency: { dispatch: stats(dispatchLatency), cpu: stats(cpuLatency) },
    attendance: stats(attendanceMinutes),
    entryDelay: stats(entryDelays),
    endpoints: summarizeEndpoints(readJsonl(path.join(dataDir, 'metricas'), from, to)),
  };
}
