import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeShift, renderShiftReport } from '../src/domain/shift-report.js';

const start = new Date('2026-11-18T11:00:00Z'); // 08:00 local
const end = new Date('2026-11-19T11:00:00Z');
const row = (over) => ({
  createdAt: '2026-11-18T12:00:00Z', status: 'Encerrada', durationSeconds: 240,
  city: { name: 'Tuntum' }, crimeType: 'Furto', crew: { _id: 'c1', name: 'GU Tuntum' },
  detained: 0, recoveredVehicles: 0, weapons: 0, approaches: 1, seizures: [], policeStation: '', ...over,
});
const report = {
  rows: [
    row({ detained: 2, policeStation: 'Delegacia de Tuntum', approaches: 3 }),
    row({ recoveredVehicles: 1, weapons: 1, seizures: [{ kind: 'Droga', quantity: 50, unit: 'g' }], city: { name: 'Dom Pedro' } }),
    row({ status: 'Em atendimento', durationSeconds: undefined }),
    row({ status: 'Em aberto' }),
    row({ createdAt: '2026-11-18T10:59:00Z', detained: 9 }), // turno anterior
    row({ createdAt: '2026-11-19T11:00:00Z', detained: 9 }), // turno seguinte
  ],
  shifts: [
    { start: '2026-11-18T11:05:00Z', crew: { _id: 'c1', name: 'GU Tuntum' }, members: [{ _id: 'u1' }, { _id: 'u2' }] },
    { start: '2026-11-18T11:06:00Z', crew: { _id: 'c2', name: 'GU Dom Pedro' }, members: [{ _id: 'u3' }, { _id: 'u2' }] },
    { start: '2026-11-17T11:06:00Z', crew: { _id: 'c9', name: 'Antiga' }, members: [{ _id: 'u9' }] },
  ],
};

test('resume só o que foi registrado dentro da janela do turno', () => {
  const s = summarizeShift(report, { start, end, cpu: { name: 'Ana', rank: '1º Tenente' } });
  assert.equal(s.occurrences.registered, 4);
  assert.equal(s.occurrences.attended, 2);
  assert.equal(s.occurrences.inProgress, 1);
  assert.equal(s.occurrences.pending, 1);
  assert.equal(s.results.detained, 2);
  assert.equal(s.results.policeStation, 1, 'conduções à delegacia');
  assert.equal(s.results.recoveredVehicles, 1);
  assert.equal(s.results.weapons, 1);
  assert.equal(s.results.approaches, 3 + 1 + 1 + 1);
  assert.deepEqual(s.results.seizures, [{ kind: 'Droga', count: 1, quantity: 50, unit: 'g' }]);
  assert.equal(s.averageMinutes, 4);
});

test('policiais empregados: integrantes distintos das guarnições do turno + oficial do CPU', () => {
  const s = summarizeShift(report, { start, end, cpu: { name: 'Ana', rank: '1º Tenente' } });
  assert.equal(s.staff.crews, 2);
  assert.equal(s.staff.crewOfficers, 3);
  assert.equal(s.staff.total, 4);
});

test('relatório renderizado traz os totais e escapa HTML', () => {
  const s = summarizeShift({ ...report, rows: [row({ city: { name: '<b>X</b>' } })] }, { start, end, cpu: { name: 'Ana', rank: '1º Tenente' } });
  const html = renderShiftReport(s);
  assert.match(html, /Conduções à delegacia/);
  assert.match(html, /Policiais empregados/);
  assert.ok(!html.includes('<b>X</b>'));
});
