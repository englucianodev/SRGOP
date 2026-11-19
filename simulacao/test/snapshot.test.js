import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot } from '../src/engine/snapshot.js';

const officer = (name, rank, duty) => ({ account: { name, rank, duty, email: `${name}@sim.srgop.local` } });
const team = (city, extra = {}) => ({
  city: { _id: city, name: city, latitude: -5, longitude: -44 },
  team: 'A', phase: 'em-servico', crewId: `crew-${city}`,
  position: { latitude: -5.01, longitude: -44.02 },
  commander: officer(`Cmt ${city}`, '2ª Sargento', 'comandante'),
  driver: officer(`Mot ${city}`, 'Cabo', 'motorista'),
  attendance: null, ...extra,
});

test('fotografia do momento traz guarnições, efetivo, posição e atendimentos sem dados de login', () => {
  const busy = team('Dom Pedro', {
    attendance: { id: 'o1', protocol: '00004', startedAt: 1000, dueAt: 61000, notesDone: 1,
      scenario: { crimeType: 'Ameaça', category: 'mariaPenha', latitude: -5.1, longitude: -44.1, notes: ['a', 'b', 'c'], summary: 'x' } },
  });
  const sim = {
    state: { data: { status: 'executando', wrapUp: null, pause: null, startedAt: '2026-11-18T11:00:00Z', activeMs: 3600000, plannedActiveMs: 7200000 } },
    day: '2026-11-18', teams: new Map([['a', team('Capinzal')], ['b', busy]]), leaving: [],
    cpu: { phase: 'em-servico', officer: officer('Oficial', '1º Tenente', 'cpu') },
  };
  const snap = buildSnapshot(sim, 31000);
  assert.equal(snap.status, 'executando');
  assert.equal(snap.progress, 0.5);
  assert.equal(snap.teams.length, 2);
  const row = snap.teams.find((t) => t.city === 'Dom Pedro');
  assert.deepEqual(row.commander, { name: 'Cmt Dom Pedro', rank: '2ª Sargento' });
  assert.deepEqual(row.attendance, { protocol: '00004', crimeType: 'Ameaça', category: 'mariaPenha', latitude: -5.1, longitude: -44.1, startedAt: 1000, dueAt: 61000, notesDone: 1, notesTotal: 3 });
  assert.equal(snap.cpu.name, 'Oficial');
  const entering = buildSnapshot({ ...sim, teams: new Map([['c', team('Capinzal', { phase: 'entrando', stage: 'recebimento', enterSince: 500 })]]) }, 31000);
  assert.equal(entering.teams[0].stage, 'recebimento', 'etapa da entrada em serviço');
  assert.equal(entering.teams[0].enterSince, 500);
  const tracked = buildSnapshot({ ...sim, teams: new Map([['d', team('Capinzal', { gpsAt: 30000 })]]) }, 31000);
  assert.equal(tracked.teams[0].gpsAt, 30000, 'hora do último GPS aceito, para o mapa');
  assert.equal(snap.teams[0].gpsAt, null);
  assert.ok(!JSON.stringify(snap).includes('@sim.srgop.local'), 'não expõe e-mails');
});
