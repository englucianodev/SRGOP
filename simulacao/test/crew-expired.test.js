import test from 'node:test';
import assert from 'node:assert/strict';
import { CrewTeam } from '../src/actors/crew.js';

const MIN = 60000;
const collector = { flows: [], flow(code) { this.flows.push(code); }, event() {} };
const account = (duty) => ({ email: `${duty}@sim.srgop.local`, name: duty, rank: 'Cabo', role: 'Praça', duty });
const expired = (id, title = 'Turno encerrado', createdAt = new Date(10 * MIN).toISOString()) => ({ _id: id, kind: 'turno-expirado', title, read: false, createdAt });

function attendingCrew(notifications) {
  collector.flows.length = 0;
  const engine = { collector, state: {}, watch: {} };
  const team = new CrewTeam({ engine, city: { _id: 'c1', name: 'Dom Pedro', latitude: -5, longitude: -44 }, crewId: 'crew1', vehicleId: 'v1', team: 'A', accounts: [account('comandante'), account('motorista')], enterAt: 0 });
  Object.assign(team, { phase: 'em-servico', stage: 'pronto' });
  team.dutySince = 5 * MIN;
  team.attendance = { id: 'o1', startedAt: 0, dueAt: 20 * MIN };
  team.commander.api.get = async (path) => (path === '/notifications' ? notifications : []);
  return team;
}

test('notificação turno-expirado reduz o prazo para no máximo 3 min e registra o fluxo uma vez', async () => {
  const team = attendingCrew([expired('n1')]);
  await team.readScreens(10 * 60000);
  await team.readScreens(10 * 60000);
  assert.ok(team.attendance.dueAt <= 13 * MIN);
  assert.ok(team.attendance.dueAt >= 11 * MIN);
  assert.equal(collector.flows.filter((c) => c === 'turno.expirado').length, 1);
});

test('alerta de guarnição além do turno (do CPU) não apressa a equipe', async () => {
  const team = attendingCrew([expired('n2', 'Guarnição além do turno')]);
  await team.readScreens(10 * 60000);
  assert.equal(team.attendance.dueAt, 20 * MIN);
  assert.equal(collector.flows.includes('turno.expirado'), false);
});

test('notificação antiga (antes da entrada em serviço) não apressa a equipe nem gera fluxo', async () => {
  const team = attendingCrew([expired('n3', 'Turno encerrado', new Date(1 * MIN).toISOString())]);
  await team.readScreens(10 * MIN);
  assert.equal(team.attendance.dueAt, 20 * MIN);
  assert.equal(collector.flows.includes('turno.expirado'), false);
});

test('notificação já lida não apressa a equipe', async () => {
  const team = attendingCrew([{ ...expired('n4'), read: true }]);
  await team.readScreens(10 * MIN);
  assert.equal(team.attendance.dueAt, 20 * MIN);
});
