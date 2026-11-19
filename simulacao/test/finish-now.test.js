import test from 'node:test';
import assert from 'node:assert/strict';
import { CrewTeam } from '../src/actors/crew.js';
import { Actor } from '../src/actors/actor.js';

const collector = { flows: [], flow(code) { this.flows.push(code); }, event() {} };
const account = (duty) => ({ email: `${duty}@sim.srgop.local`, name: duty, rank: 'Cabo', role: 'Praça', duty });

function crewWithAttendance(calls) {
  const engine = { collector, endShiftEarly: async () => calls.push('fim-do-turno'), state: { forgetOccurrence() {} }, watch: {} };
  const team = new CrewTeam({ engine, city: { _id: 'c1', name: 'Dom Pedro', latitude: -5, longitude: -44 }, crewId: 'crew1', vehicleId: 'v1', team: 'A', accounts: [account('comandante'), account('motorista')], enterAt: 0 });
  Object.assign(team, { phase: 'em-servico', stage: 'pronto' });
  team.attendance = { id: 'o1', protocol: '00009', startedAt: 0, dueAt: 9e12, notesDone: 0, closeAttempts: 0, scenario: { notes: ['a', 'b', 'c'], summary: 'ok', results: {}, durationMs: 9e12 } };
  team.commander.api.post = async (p) => calls.push(p);
  team.commander.logout = async () => calls.push('saiu-cmt');
  team.driver.logout = async () => calls.push('saiu-mot');
  team.driver.api.cookie = 'sessao';
  team.completePendingChecklists = async () => (calls.push('checklist'), true);
  return team;
}

test('encerrar agora fecha o atendimento sem esperar notas, termina o turno e sai', async () => {
  const calls = [];
  const team = crewWithAttendance(calls);
  await team.finishNow(1000);
  assert.deepEqual(calls, ['/attendances/o1/close', 'fim-do-turno', 'checklist', 'saiu-cmt', 'saiu-mot']);
  assert.equal(team.attendance, null);
  assert.equal(team.phase, 'encerrado');
});

test('ator congelado termina o passo em curso e não começa outro', async () => {
  class Slow extends Actor {
    steps = 0;
    async step() {
      this.steps++;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  const actor = new Slow(collector);
  actor.run(0);
  await actor.freeze();
  assert.equal(actor.busy, false);
  actor.run(1);
  assert.equal(actor.steps, 1);
});
