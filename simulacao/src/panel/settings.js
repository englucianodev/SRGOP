// Test settings the panel may change in simulacao/.env. Only these keys are ever read back or
// written; credentials, tokens and URLs stay out of the panel. Changes apply on the next start.

export const FIELDS = Object.freeze([
  { key: 'SIM_DAYS', label: 'Duração do teste (dias)', min: 1, max: 60, step: 1, fallback: 7 },
  { key: 'SIM_OCORRENCIAS_MIN_HORA', label: 'Ocorrências por hora (mínimo)', min: 0, max: 30, step: 1, fallback: 1 },
  { key: 'SIM_OCORRENCIAS_MAX_HORA', label: 'Ocorrências por hora (máximo)', min: 1, max: 30, step: 1, fallback: 5 },
  { key: 'SIM_TAXA_OUTRA_CIDADE', label: 'Fração registrada em outra cidade', min: 0, max: 1, step: 0.01, fallback: 0.08 },
  { key: 'SIM_TAXA_CPU', label: 'Fração registrada pelo CPU', min: 0, max: 1, step: 0.01, fallback: 0.05 },
  { key: 'SIM_TAXA_REJEICAO', label: 'Fração de despachos rejeitados', min: 0, max: 1, step: 0.01, fallback: 0.05 },
  { key: 'SIM_TAXA_APOIO', label: 'Fração com pedido de apoio', min: 0, max: 1, step: 0.01, fallback: 0.07 },
  { key: 'SIM_GPS_INTERVALO_S', label: 'Intervalo do GPS (segundos)', min: 5, max: 600, step: 1, fallback: 15 },
  { key: 'SIM_ATORES_NAVEGADOR', label: 'Policiais usando o site no navegador', min: 0, max: 5, step: 1, fallback: 3 },
  { key: 'SIM_LENTIDAO_MS', label: 'Lentidão a partir de (ms)', min: 200, max: 60000, step: 100, fallback: 3000 },
  { key: 'IA_LIMITE_DIARIO', label: 'Chamadas de IA por dia', min: 0, max: 10000, step: 1, fallback: 100 },
  { key: 'PAINEL_FOTO_MIN', label: 'Foto do painel a cada (minutos)', min: 5, max: 240, step: 1, fallback: 15 },
]);
const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));
const LINE = /^\s*([A-Z0-9_]+)\s*=(.*)$/;

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

/** Current value of every editable field (the default when the key is absent or invalid). */
export function readSettings(text) {
  const raw = parseEnv(text);
  return Object.fromEntries(
    FIELDS.map(({ key, fallback, min, max }) => {
      const value = raw[key] === undefined || raw[key] === '' ? fallback : Number(raw[key]);
      return [key, Number.isFinite(value) && value >= min && value <= max ? value : fallback];
    }),
  );
}

function validate(changes, current) {
  for (const [key, value] of Object.entries(changes)) {
    const field = BY_KEY.get(key);
    if (!field) throw new Error(`"${key}" não pode ser alterado pelo painel.`);
    const number = typeof value === 'number' ? value : Number(value);
    if (value === '' || !Number.isFinite(number) || number < field.min || number > field.max)
      throw new Error(`${field.label}: use um valor entre ${field.min} e ${field.max}.`);
  }
  const merged = { ...current, ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, Number(v)])) };
  if (merged.SIM_OCORRENCIAS_MIN_HORA > merged.SIM_OCORRENCIAS_MAX_HORA)
    throw new Error('O mínimo de ocorrências por hora não pode passar do máximo.');
  return merged;
}

/** Returns the new .env text: known keys replaced in place, missing ones appended, rest kept. */
export function applySettings(text, changes) {
  const merged = validate(changes, readSettings(text));
  const pending = new Set(Object.keys(changes));
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/).map((line) => {
    const key = LINE.exec(line)?.[1];
    if (!key || !pending.has(key)) return line;
    pending.delete(key);
    return `${key}=${merged[key]}`;
  });
  while (lines.length && lines.at(-1) === '') lines.pop();
  for (const key of pending) lines.push(`${key}=${merged[key]}`);
  return `${lines.join(eol)}${eol}`;
}
