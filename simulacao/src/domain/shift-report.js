// End-of-shift report of the CPU officer, built from the SRGOP report (GET /reports) and cut
// to the shift window (08:00 → 08:00, or up to the moment the test was finished).
import { localDateTime } from '../lib/time.js';

const RESULT_KEYS = ['detained', 'recoveredVehicles', 'weapons', 'approaches'];
const PENDING = new Set(['Em aberto', 'Despachada']);
const idOf = (value) => String(value?._id ?? value ?? '');
const inWindow = (date, { start, end }) => {
  const t = Date.parse(date);
  return Number.isFinite(t) && t >= +start && t < +end;
};

function countBy(rows, label) {
  const counts = new Map();
  for (const row of rows) {
    const key = label(row) || 'Não informado';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function seizureTotals(rows) {
  const totals = new Map();
  for (const item of rows.flatMap((r) => r.seizures ?? [])) {
    const key = `${item.kind}|${item.unit ?? ''}`;
    const entry = totals.get(key) ?? { kind: item.kind, count: 0, quantity: 0, unit: item.unit ?? '' };
    entry.count++;
    entry.quantity += Number(item.quantity) || 0;
    totals.set(key, entry);
  }
  return [...totals.values()];
}

function staffOf(shifts, window) {
  const inShift = shifts.filter((s) => inWindow(s.start, window));
  const crews = new Set(inShift.map((s) => idOf(s.crew)));
  const people = new Set(inShift.flatMap((s) => (s.members ?? []).map(idOf)));
  return { crews: crews.size, crewOfficers: people.size, total: people.size + 1 };
}

/** Totals of the occurrences registered during the shift. */
export function summarizeShift(report, { start, end, cpu }) {
  const window = { start, end };
  const rows = (report.rows ?? []).filter((r) => inWindow(r.createdAt ?? r.occurredAt, window));
  const closed = rows.filter((r) => r.status === 'Encerrada');
  const results = Object.fromEntries(RESULT_KEYS.map((k) => [k, rows.reduce((sum, r) => sum + (Number(r[k]) || 0), 0)]));
  const durations = closed.map((r) => r.durationSeconds).filter(Number.isFinite);
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    cpu,
    occurrences: {
      registered: rows.length,
      attended: closed.length,
      inProgress: rows.filter((r) => r.status === 'Em atendimento').length,
      pending: rows.filter((r) => PENDING.has(r.status)).length,
      cancelled: rows.filter((r) => r.status === 'Cancelada').length,
    },
    averageMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60) : null,
    staff: staffOf(report.shifts ?? [], window),
    results: { ...results, policeStation: rows.filter((r) => String(r.policeStation ?? '').trim()).length, seizures: seizureTotals(rows) },
    byCity: countBy(rows, (r) => r.city?.name),
    byCrimeType: countBy(rows, (r) => r.crimeType),
  };
}

const toRows = (counts) =>
  Object.entries(counts ?? {}).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

/** Converts the backend CPU-shift report (GET /reports/cpu-shifts/:id) to the summarizeShift format. */
export function summarizeCpuShift(report, { cpu } = {}) {
  const { header = {}, synthetic: s = {} } = report;
  const counts = s.occurrences ?? {};
  const results = s.results ?? {};
  return {
    start: header.start ?? null,
    end: header.end ?? null,
    cpu: cpu ?? { name: header.officer, rank: '' },
    occurrences: {
      registered: counts.registered ?? 0,
      attended: counts.attended ?? 0,
      inProgress: counts.inProgress ?? 0,
      pending: counts.waiting ?? 0,
      cancelled: counts.cancelled ?? 0,
    },
    averageMinutes: counts.averageMinutes ?? null,
    staff: { crews: s.staff?.crews ?? 0, crewOfficers: s.staff?.officers ?? 0, total: s.staff?.officers ?? 0 },
    results: {
      detained: results.detained ?? 0,
      recoveredVehicles: results.recoveredVehicles ?? 0,
      weapons: results.weapons ?? 0,
      approaches: results.approaches ?? 0,
      policeStation: results.policeStation ?? 0,
      seizures: Object.entries(results.seizures ?? {}).map(([kind, count]) => ({ kind, count, quantity: count, unit: '' })),
    },
    byCity: toRows(s.byCity),
    byCrimeType: toRows(s.byCrimeType),
  };
}

/** One line for the timeline of the panel. */
export const shiftHeadline = (s) =>
  `Relatório do turno: ${s.occurrences.attended} ocorrência(s) atendida(s) de ${s.occurrences.registered}, ${s.staff.total} policiais empregados, ` +
  `${s.results.policeStation} condução(ões) à delegacia, ${s.results.detained} detido(s), ${s.results.recoveredVehicles} veículo(s) recuperado(s).`;

const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const line = (label, value) => `<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`;
const table = (title, rows) =>
  rows.length ? `<h2>${escape(title)}</h2><table>${rows.map((r) => line(r.name, r.total)).join('')}</table>` : '';

export function renderShiftReport(s) {
  const seizures = s.results.seizures.map((x) => line(`Apreensão: ${x.kind} (${x.count} registro(s))`, `${x.quantity} ${x.unit}`.trim())).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de turno do CPU</title>
<style>body{font:14px/1.45 system-ui,sans-serif;color:#14202e;background:#fff;max-width:760px;margin:24px auto;padding:0 16px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #d6dde6;padding-bottom:4px}
p{margin:0;color:#4a5868}table{width:100%;border-collapse:collapse}th,td{padding:5px 8px;border-bottom:1px solid #edf0f4;text-align:left}
td{text-align:right;font-variant-numeric:tabular-nums}</style></head><body>
<h1>Relatório de turno do CPU</h1>
<p>${escape(localDateTime(new Date(s.start)))} a ${escape(localDateTime(new Date(s.end)))} · ${escape(`${s.cpu?.rank ?? ''} ${s.cpu?.name ?? ''}`.trim())}</p>
<h2>Ocorrências</h2><table>
${line('Registradas no turno', s.occurrences.registered)}${line('Atendidas (encerradas)', s.occurrences.attended)}
${line('Em atendimento na passagem', s.occurrences.inProgress)}${line('Aguardando guarnição', s.occurrences.pending)}
${line('Canceladas', s.occurrences.cancelled)}${line('Tempo médio de atendimento', s.averageMinutes === null ? '—' : `${s.averageMinutes} min`)}</table>
<h2>Efetivo</h2><table>
${line('Policiais empregados', s.staff.total)}${line('Nas guarnições', s.staff.crewOfficers)}${line('No CPU', 1)}${line('Guarnições empregadas', s.staff.crews)}</table>
<h2>Resultados</h2><table>
${line('Conduções à delegacia', s.results.policeStation)}${line('Pessoas detidas', s.results.detained)}
${line('Veículos recuperados', s.results.recoveredVehicles)}${line('Armas apreendidas', s.results.weapons)}${line('Abordagens', s.results.approaches)}
${seizures}</table>
${table('Por município', s.byCity)}${table('Por tipo de ocorrência', s.byCrimeType)}
</body></html>`;
}
