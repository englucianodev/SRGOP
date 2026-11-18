// Involved people, seized material and response times: the same limits the API enforces.
export const INVOLVED_ROLES = ['Vítima', 'Autor', 'Testemunha'];
export const SEIZURE_KINDS = ['Droga', 'Dinheiro', 'Munição', 'Outro'];
export const MAX_INVOLVED = 20;
export const MAX_SEIZURES = 30;
// Stable React keys for rows that have no server identifier. crypto.randomUUID is avoided
// because it does not exist outside secure contexts (the app is also served over the LAN).
let rowSequence = 0;
const nextKey = () => {
  rowSequence += 1;
  return `row-${rowSequence}`;
};
export const newPerson = () => ({
  key: nextKey(),
  role: INVOLVED_ROLES[0],
  name: '',
  document: '',
  phone: '',
  notes: '',
});
export const newSeizure = () => ({
  key: nextKey(),
  kind: SEIZURE_KINDS[0],
  description: '',
  quantity: '',
  unit: '',
});
export const editablePeople = (list = []) => list.map((person) => ({ ...newPerson(), ...person }));
export const editableSeizures = (list = []) =>
  list.map((seizure) => ({ ...newSeizure(), ...seizure }));
const filled = (fields) =>
  Object.fromEntries(
    Object.entries(fields)
      .map(([name, value]) => [name, value.trim()])
      .filter(([, value]) => value !== ''),
  );
export const involvedPayload = (list) =>
  list.map(({ role, name, document, phone, notes }) => ({
    role,
    name: name.trim(),
    ...filled({ document, phone, notes }),
  }));
export const seizuresPayload = (list) =>
  list.map(({ kind, description, quantity, unit }) => ({
    kind,
    description: description.trim(),
    quantity: Number(quantity),
    unit: unit.trim(),
  }));
export const elapsedSeconds = (from, to) =>
  from && to ? Math.max(0, Math.floor((new Date(to) - new Date(from)) / 1000)) : null;
export const seizureLabel = ({ kind, description, quantity, unit }) =>
  `${kind}${description ? `: ${description}` : ''} (${String(quantity).replace('.', ',')}${
    unit ? ` ${unit}` : ''
  })`;
