// Operational situation of a crew, shared by the dashboard map and the operation page.
export const ENTERING_WINDOW_MS = 15 * 60000;

// `tone` names the CSS class of the situation room (pins, chips, side bars); `color` serves the
// plain Leaflet markers of the Map page and follows the same system palette.
export const SITUATION_STYLE = {
  livre: { label: 'Livre', color: '#298267', tone: 'livre' },
  atendimento: { label: 'Em atendimento', color: '#c74b4b', tone: 'atendendo' },
  entrando: { label: 'Entrando em serviço', color: '#7c8798', tone: 'entrando' },
  expirado: { label: 'Turno encerrado', color: '#d0682f', tone: 'expirado' },
  fora: { label: 'Fora de serviço', color: '#aeb8c1', tone: 'off' },
};

// Timeline tag (short uppercase label and its tone) for each audited operation action.
export const EVENT_TAGS = {
  Despacho: ['DESPACHO', 'brand'],
  Aceite: ['ACEITO', 'ok'],
  Encerramento: ['ENCERRADO', 'muted'],
  'Ingresso na guarnição': ['ENTRADA', 'brand-2'],
  'Saída da guarnição': ['SAÍDA', 'warn'],
  'Encerramento de turno': ['TURNO', 'warn'],
  'Apoio autorizado': ['APOIO', 'warn'],
  'Assumiu CPU': ['CPU', 'cpu'],
  'CPU administrado': ['CPU', 'cpu'],
  'Passagem do CPU aceita': ['CPU', 'cpu'],
  'Turno do CPU fechado': ['CPU', 'cpu'],
};
export const eventTag = (action) => EVENT_TAGS[action] || ['EVENTO', 'muted'];

// Rules are tested in order; the first match wins.
export function crewSituation(crew, now = Date.now()) {
  if (!crew?.members?.length || crew.status === 'Fora de serviço') return 'fora';
  if (crew.shiftEnd && +new Date(crew.shiftEnd) <= now) return 'expirado';
  if (crew.status === 'Em atendimento') return 'atendimento';
  if (crew.shiftStart && now - +new Date(crew.shiftStart) < ENTERING_WINDOW_MS) return 'entrando';
  return 'livre';
}

export function operationCounters(crews = [], now = Date.now()) {
  const counters = { emServico: 0, emAtendimento: 0, livres: 0, expirados: 0 };
  for (const crew of crews) {
    const situation = crewSituation(crew, now);
    if (situation === 'fora') continue;
    counters.emServico += 1;
    if (situation === 'atendimento') counters.emAtendimento += 1;
    if (situation === 'livre') counters.livres += 1;
    if (situation === 'expirado') counters.expirados += 1;
  }
  return counters;
}
