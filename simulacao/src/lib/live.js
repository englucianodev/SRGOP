// Pure helpers for the live monitor (src/cli/monitor.js): what to show and how to print it.

const OFFSET_MS = -3 * 3600000; // America/Fortaleza, no daylight saving

/** Flow codes that tell the story of an occurrence: creation, dispatch, support and attendance. */
const LABELS = {
  'ocorrencia.criada': 'OCORRÊNCIA',
  'roteamento.cpu': 'CPU',
  'cpu.notificado': 'CPU',
  'despacho.enviado': 'DESPACHO',
  'despacho.recebido': 'DESPACHO',
  'despacho.aceito': 'ACEITO',
  'despacho.rejeitado': 'REJEITADO',
  'atendimento.inicio': 'ATENDIMENTO',
  'apoio.solicitado': 'APOIO',
  'apoio.autorizado': 'APOIO',
  'apoio.recebido': 'APOIO',
  'atendimento.encerrado': 'ENCERRADO',
  'turno.inicio': 'TURNO',
  'turno.fim': 'TURNO',
  'turno.expirado': 'TURNO',
  'servico.troca': 'TURNO',
  'cpu.assumiu': 'TURNO',
  'cpu.saiu': 'TURNO',
  'cpu.relatorio': 'RELATÓRIO',
  'simulacao.inicio': 'SIMULAÇÃO',
  'simulacao.encerrando': 'SIMULAÇÃO',
  'simulacao.fim': 'SIMULAÇÃO',
};
const SERIOUS = new Set(['alto', 'critico']);
const COLORS = { OCORRÊNCIA: 36, CPU: 35, DESPACHO: 34, ACEITO: 32, REJEITADO: 33, ATENDIMENTO: 32, APOIO: 33, ENCERRADO: 90, TURNO: 37, RELATÓRIO: 36, SIMULAÇÃO: 37 };
const SEVERITY_COLORS = { critico: 41, alto: 31, medio: 33, baixo: 90 };
const LABEL_WIDTH = 12;
const CITY_WIDTH = 26;

/** By default: the occurrence story plus serious problems. `all` shows every event. */
export function isLiveRelevant(row, { all = false } = {}) {
  if (all) return true;
  if (row.category === 'fluxo') return Boolean(LABELS[row.details?.code]);
  return SERIOUS.has(row.severity);
}

const clock = (iso) => new Date(Date.parse(iso) + OFFSET_MS).toISOString().slice(11, 19);
const paint = (text, code, color) => (color && code ? `\x1b[${code}m${text}\x1b[0m` : text);

/** Structured form of an event for the web panel (same labels as the terminal monitor). */
export function describeLiveEvent(row) {
  const flowLabel = row.category === 'fluxo' ? LABELS[row.details?.code] ?? 'FLUXO' : null;
  return {
    t: row.t,
    time: clock(row.t),
    label: flowLabel ?? row.category,
    kind: flowLabel ? 'fluxo' : row.severity,
    city: row.city ?? '',
    actor: row.actor ?? '',
    message: row.message,
  };
}

export function formatLiveEvent(row, { color = true } = {}) {
  const flowLabel = row.category === 'fluxo' ? LABELS[row.details?.code] ?? row.details?.code ?? 'FLUXO' : null;
  const label = flowLabel ?? `${row.severity.toUpperCase()} ${row.category}`;
  const code = flowLabel ? COLORS[flowLabel] : SEVERITY_COLORS[row.severity];
  const where = (row.city ?? '').slice(0, CITY_WIDTH).padEnd(CITY_WIDTH);
  return `${clock(row.t)}  ${paint(label.padEnd(LABEL_WIDTH), code, color)} ${where} ${row.message}`.trimEnd();
}

/** Attendances the simulator is still running, oldest first, with minutes since creation. */
export function openAttendances(state, now = Date.now()) {
  return Object.values(state?.occurrences ?? {})
    .filter((o) => o.phase === 'atendimento')
    .map((o) => ({ ...o, minutes: Math.round((now - Date.parse(o.createdAt)) / 60000) }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
