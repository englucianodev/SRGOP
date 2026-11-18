// Operational situation of a crew, shared by the dashboard map and the operation page.
export const ENTERING_WINDOW_MS = 15 * 60000;

export const SITUATION_STYLE = {
  livre: { label: 'Livre', color: '#26a269' },
  atendimento: { label: 'Em atendimento', color: '#6f4cc2' },
  entrando: { label: 'Entrando em serviço', color: '#0e9fb5' },
  expirado: { label: 'Turno encerrado', color: '#e0653a' },
  fora: { label: 'Fora de serviço', color: '#aeb8c1' },
};

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
