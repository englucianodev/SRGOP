import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'cpu-fecha-'));
process.env.SIM_DADOS = dataDir;
const { CpuActor } = await import('../src/actors/cpu.js');
const { summarizeCpuShift } = await import('../src/domain/shift-report.js');

const MIN = 60000;
const T0 = Date.parse('2026-11-18T11:00:00Z'); // 08:00 local

function makeCpu() {
  const flows = [];
  const events = [];
  const collector = { flow: (code, message) => flows.push({ code, message }), event: (e) => events.push(e) };
  const cpu = new CpuActor({ engine: { collector, watch: {} }, account: { name: 'Ana', rank: '1º Tenente', duty: 'cpu', email: 'x@y' }, enterAt: 0 });
  cpu.officer.login = async () => { cpu.officer.user = { _id: 'me' }; };
  cpu.officer.ensureSession = async () => {};
  cpu.officer.logout = async () => {};
  return { cpu, flows, events };
}

const synthetic = {
  occurrences: { registered: 5, attended: 3, inProgress: 1, waiting: 1, cancelled: 0, averageMinutes: 4.5 },
  staff: { officers: 6, crews: 3 },
  results: { policeStation: 2, detained: 4, recoveredVehicles: 1, weapons: 0, approaches: 7, seizures: { Droga: 2 } },
  byCity: { Tuntum: 3, 'Dom Pedro': 2 },
  byCrimeType: { Furto: 5 },
};

test('às 08h o CPU continua despachando até /cpu mostrar outro turno; então relata e sai', async () => {
  const { cpu, flows } = makeCpu();
  cpu.phase = 'em-servico';
  cpu.shiftId = 's1';
  cpu.day = '2026-11-18';
  let routines = 0;
  cpu.routine = async () => { routines++; };
  let current = { _id: 's1', day: '2026-11-18', pending: { attending: [{ protocol: 'P1' }], onDuty: [] } };
  const asked = [];
  cpu.officer.api.get = async (url) => {
    asked.push(url);
    if (url === '/cpu') return current;
    return { header: { day: '2026-11-18', officer: 'Ana', start: '2026-11-18T11:00:00.000Z', end: '2026-11-19T11:10:00.000Z' }, synthetic };
  };
  let loggedOut = false;
  cpu.officer.logout = async () => { loggedOut = true; };

  cpu.beginLeave(T0 + 24 * 60 * MIN);
  assert.equal(cpu.phase, 'aguardando-fechamento');
  const t = T0 + 24 * 60 * MIN;
  await cpu.step(t);
  await cpu.step(t + MIN);
  assert.ok(routines >= 2, 'segue despachando');
  assert.equal(loggedOut, false);
  assert.equal(cpu.phase, 'aguardando-fechamento');

  current = { _id: 's2', day: '2026-11-19', pending: null };
  await cpu.step(t + 2 * MIN);
  assert.equal(cpu.phase, 'encerrado');
  assert.equal(loggedOut, true);
  assert.ok(asked.includes('/reports/cpu-shifts/s1'));
  assert.ok(existsSync(path.join(dataDir, 'relatorios', 'turnos', 'turno-2026-11-18.json')));
  assert.deepEqual(flows.map((f) => f.code).slice(-2), ['cpu.relatorio', 'cpu.saiu']);
});

test('o CPU também sai quando /cpu volta null', async () => {
  const { cpu } = makeCpu();
  Object.assign(cpu, { phase: 'em-servico', shiftId: 's1', day: '2026-11-18' });
  cpu.routine = async () => {};
  cpu.officer.api.get = async (url) => (url === '/cpu' ? null : { header: { day: '2026-11-18' }, synthetic });
  cpu.beginLeave(T0);
  await cpu.step(T0);
  assert.equal(cpu.phase, 'encerrado');
});

test('passado o tempo máximo de espera registra evento alto com as pendências e sai', async () => {
  const { cpu, events } = makeCpu();
  Object.assign(cpu, { phase: 'em-servico', shiftId: 's1', day: '2026-11-18' });
  cpu.routine = async () => {};
  const pending = { attending: [{ protocol: 'P1', crew: 'GU' }], onDuty: [{ crew: 'GU', members: 2 }] };
  cpu.officer.api.get = async (url) => (url === '/cpu' ? { _id: 's1', day: '2026-11-18', pending } : { header: {}, synthetic });
  cpu.beginLeave(T0);
  await cpu.step(T0 + 119 * MIN);
  assert.equal(cpu.phase, 'aguardando-fechamento');
  await cpu.step(T0 + 121 * MIN);
  assert.equal(cpu.phase, 'encerrado');
  const alert = events.find((e) => e.category === 'cpu-fechamento');
  assert.equal(alert.severity, 'alto');
  assert.match(alert.message, /P1/);
});

test('o oficial do dia seguinte recebe 409, espera 2 min sem virar apoio e então assume', async () => {
  const { cpu, flows, events } = makeCpu();
  const now = Date.parse('2026-11-19T11:05:00Z');
  const old = { _id: 's1', day: '2026-11-18', officer: 'other', pending: { attending: [], onDuty: [{ crew: 'GU', members: 2 }] } };
  let reject = true;
  cpu.officer.api.get = async (url) => (url === '/cpu' ? (reject ? old : { _id: 's2', day: '2026-11-19', officer: 'me' }) : null);
  cpu.officer.api.post = async (url) => {
    assert.equal(url, '/cpu');
    if (reject) throw Object.assign(new Error('turno anterior aberto'), { status: 409 });
    return { _id: 's2' };
  };
  await cpu.enter(now);
  assert.equal(cpu.phase, 'entrando');
  assert.ok(events.some((e) => e.severity === 'baixo' && /Aguardando fechamento/.test(e.message)));
  assert.ok(!events.some((e) => /apoio/.test(e.message)));
  await cpu.enter(now + MIN); // too early
  assert.equal(cpu.phase, 'entrando');

  reject = false;
  await cpu.enter(now + 2 * MIN);
  assert.equal(cpu.phase, 'em-servico');
  assert.equal(cpu.shiftId, 's2');
  assert.ok(flows.some((f) => f.code === 'cpu.assumiu'));
});

test('segue como apoio só quando o CPU atual é do dia de serviço de hoje', async () => {
  const { cpu, events } = makeCpu();
  const now = Date.parse('2026-11-19T11:05:00Z');
  cpu.officer.api.get = async () => ({ _id: 's2', day: '2026-11-19', officer: 'other' });
  cpu.officer.api.post = async () => assert.fail('não deve assumir');
  await cpu.enter(now);
  assert.equal(cpu.phase, 'em-servico');
  assert.equal(cpu.shiftId, null);
  assert.ok(events.some((e) => /apoio/.test(e.message)));
});

test('summarizeCpuShift converte synthetic no formato de summarizeShift', () => {
  const s = summarizeCpuShift({ header: { day: '2026-11-18', officer: 'Ana', start: '2026-11-18T11:00:00.000Z', end: '2026-11-19T11:10:00.000Z' }, synthetic }, { cpu: { name: 'Ana', rank: '1º Tenente' } });
  assert.equal(s.occurrences.attended, 3);
  assert.equal(s.occurrences.pending, 1);
  assert.equal(s.staff.total, 6);
  assert.equal(s.staff.crews, 3);
  assert.equal(s.results.policeStation, 2);
  assert.equal(s.averageMinutes, 4.5);
  assert.deepEqual(s.byCity, [{ name: 'Tuntum', total: 3 }, { name: 'Dom Pedro', total: 2 }]);
  assert.equal(s.results.seizures[0].kind, 'Droga');
  assert.equal(s.start, '2026-11-18T11:00:00.000Z');
});
