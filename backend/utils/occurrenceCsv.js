import { involvedCounts, responseTimes, seizuresText } from './occurrenceDetails.js';
// Quotes every cell and neutralises values a spreadsheet would run as a formula.
const escape = (value) =>
  `"${String(value ?? '')
    .replace(/^[=+@\-\t\r]/, "'$&")
    .replaceAll('"', '""')}"`;
const HEADER = [
  'Protocolo',
  'Data',
  'Cidade',
  'Tipo',
  'Prioridade',
  'Status',
  'Guarnição',
  'Viatura',
  'Responsável',
  'Duração (s)',
  'Armas',
  'Veículos recuperados',
  'Conduzidos',
  'Abordagens',
  'Chegada ao local',
  'Deslocamento (min)',
  'No local (min)',
  'Vítimas',
  'Autores',
  'Testemunhas',
  'Material apreendido',
  'Delegacia de destino',
];
// Decimal comma, as the spreadsheets that open this semicolon-separated file expect.
const minutes = (seconds) => (seconds === null ? '' : (seconds / 60).toFixed(1).replace('.', ','));
// Involved people are exported as counts by role only: no names, documents or phones.
function cells(row) {
  const { travelSeconds, onSceneSeconds } = responseTimes(row);
  const people = involvedCounts(row.involved);
  return [
    row.protocol,
    row.occurredAt.toISOString(),
    row.city?.name,
    row.crimeType,
    row.priority,
    row.status,
    row.crew?.name,
    row.vehicle?.prefix,
    row.acceptedBy?.name,
    row.durationSeconds,
    row.weapons,
    row.recoveredVehicles,
    row.detained,
    row.approaches,
    row.arrivedAt?.toISOString(),
    minutes(travelSeconds),
    minutes(onSceneSeconds),
    people['Vítima'],
    people.Autor,
    people.Testemunha,
    seizuresText(row.seizures),
    row.policeStation,
  ];
}
export const occurrenceCsv = (rows) =>
  [HEADER, ...rows.map(cells)].map((row) => row.map(escape).join(';')).join('\r\n');
