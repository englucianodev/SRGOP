import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'cpu-turno-'));
process.env.SIM_DADOS = dataDir;
const { CpuActor } = await import('../src/actors/cpu.js');

test('ao sair do turno o CPU consulta o relatório do turno no SRGOP e grava o relatório', async () => {
  const flows = [];
  const collector = { flow: (code, message, ctx, details) => flows.push({ code, message, details }), event() {} };
  const cpu = new CpuActor({ engine: { collector, watch: {} }, account: { name: 'Ana Souza', rank: '1º Tenente', duty: 'cpu', email: 'x@y' }, enterAt: 0 });
  const asked = [];
  cpu.officer.ensureSession = async () => {};
  cpu.officer.logout = async () => {};
  cpu.officer.api.get = async (url) => {
    asked.push(url);
    return { header: { day: '2026-11-18', officer: 'Ana Souza', start: '2026-11-18T11:00:00.000Z', end: '2026-11-19T11:10:00.000Z' }, synthetic: { occurrences: { registered: 1, attended: 1, inProgress: 0, waiting: 0, cancelled: 0, averageMinutes: 3 }, staff: { officers: 2, crews: 1 }, results: { policeStation: 1, detained: 1, recoveredVehicles: 0, weapons: 0, approaches: 0, seizures: {} }, byCity: { Tuntum: 1 }, byCrimeType: { Furto: 1 } } };
  };
  cpu.day = '2026-11-18';
  cpu.shiftId = 's1';
  cpu.phase = 'saindo';
  await cpu.leave(Date.parse('2026-11-19T11:10:00Z'));
  assert.deepEqual(asked, ['/reports/cpu-shifts/s1']);
  const saved = JSON.parse(readFileSync(path.join(dataDir, 'relatorios', 'turnos', 'turno-2026-11-18.json'), 'utf8'));
  assert.equal(saved.occurrences.attended, 1);
  assert.equal(saved.results.policeStation, 1);
  assert.ok(existsSync(path.join(dataDir, 'relatorios', 'turnos', 'turno-2026-11-18.html')));
  assert.equal(flows[0].code, 'cpu.relatorio');
  assert.equal(flows.at(-1).code, 'cpu.saiu');
});
