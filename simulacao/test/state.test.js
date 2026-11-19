import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SimulationState } from '../src/lib/state.js';

const DAY = 86400000;
const file = () => path.join(mkdtempSync(path.join(tmpdir(), 'sim-')), 'estado.json');

test('conta somente o tempo em execução e ignora lacunas longas do processo', () => {
  const state = SimulationState.create(file(), { days: 1, now: 0 });
  state.tick(10000);
  state.tick(20000);
  assert.equal(state.data.activeMs, 20000);
  state.tick(20000 + 3600000); // processo ficou parado 1h (reinício da VPS)
  assert.equal(state.data.activeMs, 20000 + state.maxTickGapMs);
});

test('pausa interrompe a contagem e registra a duração ao retomar', () => {
  const state = SimulationState.create(file(), { days: 1, now: 0 });
  state.tick(10000);
  state.pause('Indisponibilidade da API', 10000, { automatic: true });
  state.tick(70000);
  assert.equal(state.data.activeMs, 10000);
  state.resume(130000);
  assert.equal(state.data.status, 'executando');
  assert.deepEqual(
    { ...state.data.pauses[0], from: undefined, to: undefined },
    { reason: 'Indisponibilidade da API', automatic: true, durationMs: 120000, from: undefined, to: undefined },
  );
  state.tick(140000);
  assert.equal(state.data.activeMs, 20000);
});

test('termina ao completar os dias configurados de tempo ativo', () => {
  const state = SimulationState.create(file(), { days: 1, now: 0 });
  state.data.activeMs = DAY - 1000;
  assert.equal(state.isComplete(), false);
  state.tick(state.data.lastTickAt + 5000);
  assert.equal(state.isComplete(), true);
});

test('persiste e recarrega o mesmo estado (retomada após reinício)', () => {
  const target = file();
  const state = SimulationState.create(target, { days: 3, now: 0 });
  state.tick(15000);
  state.trackOccurrence('abc', { protocol: '2026/1', phase: 'atendimento' });
  state.save();
  const loaded = SimulationState.load(target);
  assert.equal(loaded.data.activeMs, 15000);
  assert.equal(loaded.data.plannedActiveMs, 3 * DAY);
  assert.equal(loaded.data.occurrences.abc.protocol, '2026/1');
});

test('ao recarregar, o primeiro tick não soma o tempo em que o processo esteve fora', () => {
  const target = file();
  const state = SimulationState.create(target, { days: 1, now: 0 });
  state.tick(15000);
  state.save();
  const loaded = SimulationState.load(target);
  loaded.markRestart(15000 + 6 * 3600000);
  loaded.tick(15000 + 6 * 3600000 + 10000);
  assert.equal(loaded.data.activeMs, 25000);
});

test('ocorrências antigas são descartadas do estado', async () => {
  const { SimulationState } = await import('../src/lib/state.js');
  const now = Date.parse('2026-11-15T12:00:00Z');
  const state = SimulationState.create('x.json', { days: 1, now });
  state.trackOccurrence('velha', { createdAt: new Date(now - 2 * 86400000).toISOString() });
  state.trackOccurrence('nova', { createdAt: new Date(now - 3600000).toISOString() });
  state.pruneOccurrences(now);
  assert.deepEqual(Object.keys(state.data.occurrences), ['nova']);
});
