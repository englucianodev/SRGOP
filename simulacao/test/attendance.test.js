import test from 'node:test';
import assert from 'node:assert/strict';
import { progressAttendance } from '../src/actors/attendance.js';

const MIN = 60000;
const fakeTeam = (attendance) => {
  const posts = [];
  return {
    posts,
    attendance,
    commander: { context: {}, api: { post: async (path, body) => posts.push({ path, body }) }, recover: async () => false },
    collector: { flow() {}, event() {} },
    engine: { state: { forgetOccurrence() {}, trackOccurrence() {} }, supportCandidate: () => null },
  };
};
const attendanceOf = ({ durationMs, dueAt }) => ({
  id: 'a1', protocol: '00001', startedAt: 0, dueAt, notesDone: 0, closeAttempts: 0, supportAsked: false,
  scenario: { notes: ['n1', 'n2', 'n3'], durationMs, wantsSupport: false, summary: 'ok', results: {} },
});

test('encerramento antecipado fecha o atendimento no novo prazo sem esperar as notas do roteiro original', async () => {
  // Roteiro de 120 min, mas o encerramento da simulação antecipou o prazo para 20 min.
  const team = fakeTeam(attendanceOf({ durationMs: 120 * MIN, dueAt: 20 * MIN }));
  for (let t = 0; t <= 21 * MIN && team.attendance; t += MIN) await progressAttendance(team, t);
  assert.equal(team.attendance, null, 'deveria ter encerrado até o novo prazo');
  assert.ok(team.posts.some((p) => p.path.endsWith('/close')));
});

test('atendimento normal registra todas as notas antes de encerrar', async () => {
  const team = fakeTeam(attendanceOf({ durationMs: 40 * MIN, dueAt: 40 * MIN }));
  for (let t = 0; t <= 45 * MIN && team.attendance; t += MIN) await progressAttendance(team, t);
  assert.equal(team.attendance, null);
  assert.deepEqual(team.posts.map((p) => p.path.split('/').pop()), ['notes', 'notes', 'notes', 'close']);
});

test('encerramento forçado fecha o atendimento aberto antes de sair do sistema', async () => {
  const { closeAttendanceNow } = await import('../src/actors/attendance.js');
  const team = fakeTeam(attendanceOf({ durationMs: 120 * MIN, dueAt: 120 * MIN }));
  await closeAttendanceNow(team, 10 * MIN);
  assert.equal(team.attendance, null);
  assert.ok(team.posts.some((p) => p.path === '/attendances/a1/close'));
});

test('atendimento nunca passa de 5 min, mesmo com roteiro longo, e registra as notas antes', async () => {
  const team = fakeTeam(attendanceOf({ durationMs: 240 * MIN, dueAt: 240 * MIN }));
  for (let t = 0; t <= 5 * MIN && team.attendance; t += MIN / 6) await progressAttendance(team, t);
  assert.equal(team.attendance, null, 'deveria ter encerrado em até 5 min');
  assert.deepEqual(team.posts.map((p) => p.path.split('/').pop()), ['notes', 'notes', 'notes', 'close']);
});

test('atendimento aberto há 2h (estado antigo) é encerrado no passo seguinte', async () => {
  const team = fakeTeam(attendanceOf({ durationMs: 300 * MIN, dueAt: 300 * MIN }));
  team.attendance.notesDone = 3;
  await progressAttendance(team, 120 * MIN);
  assert.equal(team.attendance, null);
});

test('startAttendance limita o prazo a 5 min', async () => {
  const { startAttendance } = await import('../src/actors/attendance.js');
  const team = fakeTeam(null);
  startAttendance(team, { _id: 'o9', protocol: 'P9' }, { notes: [], durationMs: 200 * MIN }, 'despacho', 0);
  assert.ok(team.attendance.dueAt <= 5 * MIN);
});

test('retomada de atendimento aberto há 2h no servidor encerra no primeiro passo', async () => {
  const { reconcileAttendance } = await import('../src/actors/attendance.js');
  const now = Date.parse('2026-11-18T12:00:00Z');
  const team = fakeTeam(null);
  team.commander.id = 'c1';
  team.commander.api.get = async () => [{ _id: 'o7', protocol: 'P7', status: 'Em atendimento', acceptedBy: 'c1', startedAt: '2026-11-18T10:00:00Z' }];
  team.engine.state.data = { occurrences: { o7: { scenario: { notes: [], summary: 'ok', results: {}, durationMs: 4 * MIN } } } };
  await reconcileAttendance(team, now);
  await progressAttendance(team, now + 10000);
  assert.equal(team.attendance, null);
  assert.ok(team.posts.some((p) => p.path === '/attendances/o7/close'));
});

test('encerramento: delegacia e apreensões só com a opção ligada (backend publicado antigo recusa)', async () => {
  const { closeBody } = await import('../src/actors/attendance.js');
  const team = { city: { name: 'Tuntum' } };
  const scenario = { summary: 'ok', results: { detained: 1, weapons: 0, seizures: [{ kind: 'Droga', quantity: 5, unit: 'g' }] } };
  assert.deepEqual(closeBody(team, scenario, false), { summary: 'ok', detained: 1, weapons: 0 });
  const full = closeBody(team, scenario, true);
  assert.match(full.policeStation, /Delegacia.*Tuntum/);
  assert.equal(full.seizures.length, 1);
});
