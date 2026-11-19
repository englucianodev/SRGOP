import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { aggregate, groupKey } from '../src/report/aggregate.js';

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sim-rel-'));
  mkdirSync(path.join(dir, 'eventos'));
  mkdirSync(path.join(dir, 'metricas'));
  const rows = [
    { t: '2026-11-16T12:00:00.000Z', severity: 'alto', category: 'tempo-real', message: 'Aviso de despacho de 2026/000123 não chegou à guarnição em 90s.', role: 'CPU', city: 'Bacabal' },
    { t: '2026-11-16T13:00:00.000Z', severity: 'alto', category: 'tempo-real', message: 'Aviso de despacho de 2026/000129 não chegou à guarnição em 90s.', role: 'CPU', city: 'Pedreiras' },
    { t: '2026-11-16T14:00:00.000Z', severity: 'critico', category: 'erro-servidor', message: 'POST /occurrences → 500: Erro interno', role: 'Comandante', city: 'Bacabal' },
    { t: '2026-11-16T14:05:00.000Z', severity: 'info', category: 'fluxo', message: 'Cadastrou', details: { code: 'ocorrencia.criada', category: 'mariaPenha', origin: 'guarnicao' } },
    { t: '2026-11-16T14:06:00.000Z', severity: 'info', category: 'fluxo', message: 'Recebido', details: { code: 'despacho.recebido', latencyMs: 1200, via: 'tempo-real' } },
    { t: '2026-11-16T14:07:00.000Z', severity: 'info', category: 'recusa-esperada', message: 'POST /crews/:id/join → 409' },
    { t: '2026-11-16T14:08:00.000Z', severity: 'baixo', category: 'simulador', message: 'Falha interna do simulador: x' },
  ];
  writeFileSync(path.join(dir, 'eventos', '2026-11-16.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(
    path.join(dir, 'metricas', '2026-11-16.jsonl'),
    JSON.stringify({ t: '2026-11-16T14:00:00.000Z', endpoints: [{ key: 'POST /occurrences', count: 10, serverErrors: 1, clientErrors: 0, network: 0, slow: 2, p50: 300, p95: 2500, max: 4000 }] }) + '\n',
  );
  return dir;
}

test('agrupa mensagens que só diferem por números/protocolos', () => {
  assert.equal(
    groupKey({ severity: 'alto', category: 'x', message: 'Despacho 2026/000123 em 90s' }),
    groupKey({ severity: 'alto', category: 'x', message: 'Despacho 2026/000777 em 90s' }),
  );
});

test('consolida problemas, fluxo, latência e endpoints sem misturar eventos esperados', () => {
  const report = aggregate(fixture());
  assert.equal(report.severity.alto, 2);
  assert.equal(report.severity.critico, 1);
  const realTime = report.problems.find((p) => p.category === 'tempo-real');
  assert.equal(realTime.count, 2);
  assert.deepEqual(realTime.cities.sort(), ['Bacabal', 'Pedreiras']);
  assert.equal(report.problems[0].severity, 'critico');
  assert.ok(!report.problems.some((p) => ['fluxo', 'recusa-esperada', 'simulador'].includes(p.category)));
  assert.equal(report.simulatorFaults.length, 1);
  assert.equal(report.flow['ocorrencia.criada'], 1);
  assert.equal(report.occurrencesByCategory.mariaPenha, 1);
  assert.equal(report.latency.dispatch.median, 1200);
  assert.equal(report.endpoints[0].serverErrors, 1);
  assert.equal(report.expectedRejections, 1);
});

test('filtra pelo período informado', () => {
  const report = aggregate(fixture(), { from: new Date('2026-11-16T13:30:00Z') });
  assert.equal(report.severity.alto, 0);
  assert.equal(report.severity.critico, 1);
});
