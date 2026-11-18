// Involved people, seized material and response times of an occurrence.
// Pure helpers shared by the model, the validation schemas, the services and the reports.
export const INVOLVED_ROLES = ['Vítima', 'Autor', 'Testemunha'];
export const SEIZURE_KINDS = ['Droga', 'Dinheiro', 'Munição', 'Outro'];
export const MAX_INVOLVED = 20;
export const MAX_SEIZURES = 30;
const PERSON_FIELDS = ['role', 'name', 'document', 'phone', 'notes'];
const personKey = (person) => PERSON_FIELDS.map((field) => person[field] ?? '').join('\u0000');
const sameInvolved = (before = [], after = []) =>
  before.length === after.length &&
  before.every((person, i) => personKey(person) === personKey(after[i]));
const isStructured = (value) => typeof value === 'object' && value !== null;
// History and audit entries must never carry names, documents or phones: only the size is logged.
export const involvedSummary = (list = []) => `Envolvidos atualizados (${list.length})`;
// Change log of an edit. Lists and objects are never stringified, which would leak personal
// data or produce "[object Object]".
export function describeChanges(row, input) {
  const scalars = Object.keys(input)
    .filter((key) => !isStructured(input[key]) && String(row[key]) !== String(input[key]))
    .map((key) => `${key}: ${String(row[key] ?? '—')} → ${String(input[key])}`);
  const people =
    input.involved && !sameInvolved(row.involved, input.involved)
      ? [involvedSummary(input.involved)]
      : [];
  return [...scalars, ...people].join('; ');
}
// Must run before the closing input is applied, because it compares with the stored list.
export function closeDetailsSummary(row, input) {
  return [
    input.involved && !sameInvolved(row.involved, input.involved)
      ? involvedSummary(input.involved)
      : '',
    input.seizures?.length ? `Apreensões registradas (${input.seizures.length})` : '',
    input.policeStation ? 'Delegacia de destino informada' : '',
  ]
    .filter(Boolean)
    .join('; ');
}
const secondsBetween = (from, to) => Math.max(0, Math.floor((new Date(to) - new Date(from)) / 1000));
// Travel (accept → arrival) and on-scene (arrival → end) times. Arrival is optional, so both
// are null without it, and the on-scene time is null while the attendance is still open.
export function responseTimes(row) {
  if (!row.arrivedAt || !row.startedAt) return { travelSeconds: null, onSceneSeconds: null };
  return {
    travelSeconds: secondsBetween(row.startedAt, row.arrivedAt),
    onSceneSeconds: row.endedAt ? secondsBetween(row.arrivedAt, row.endedAt) : null,
  };
}
const average = (values) =>
  values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
export function averageResponseTimes(rows) {
  const times = rows.map(responseTimes);
  const known = (key) => times.map((time) => time[key]).filter((value) => value !== null);
  return {
    averageTravelSeconds: average(known('travelSeconds')),
    averageOnSceneSeconds: average(known('onSceneSeconds')),
  };
}
export const involvedCounts = (list = []) =>
  Object.fromEntries(
    INVOLVED_ROLES.map((role) => [role, list.filter((person) => person.role === role).length]),
  );
const decimal = (number) => String(number).replace('.', ',');
const seizureLabel = (seizure) =>
  `${seizure.kind}${seizure.description ? `: ${seizure.description}` : ''} (${decimal(
    seizure.quantity,
  )}${seizure.unit ? ` ${seizure.unit}` : ''})`;
export const seizuresText = (list = []) => list.map(seizureLabel).join(' | ');
