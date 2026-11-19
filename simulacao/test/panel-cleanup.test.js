import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Processes } from '../src/panel/processes.js';

function setup() {
  const dataDir = path.join(mkdtempSync(path.join(os.tmpdir(), 'limpeza-')), 'dados');
  mkdirSync(path.join(dataDir, 'arquivo', '2026-11-17'), { recursive: true });
  mkdirSync(path.join(dataDir, 'relatorios'));
  writeFileSync(path.join(dataDir, 'estado.json'), '{"status":"finalizado"}');
  writeFileSync(path.join(dataDir, 'painel.json'), JSON.stringify({ t: 0, status: 'finalizado' }));
  writeFileSync(path.join(dataDir, 'efetivo.json'), '{}');
  return dataDir;
}

test('apaga os arquivos locais de todos os testes e mantém o efetivo e o registro da limpeza', () => {
  const dataDir = setup();
  writeFileSync(path.join(dataDir, 'limpeza.log'), 'ok');
  new Processes({ root: '.', dataDir }).removeLocalRuns();
  assert.deepEqual(readdirSync(dataDir).sort(), ['efetivo.json', 'limpeza.log']);
});

test('iniciar só é aceito depois da preparação do efetivo concluída', () => {
  const dataDir = setup();
  writeFileSync(path.join(dataDir, 'estado.json'), '{"status":"executando"}');
  const panel = new Processes({ root: '.', dataDir });
  panel.simulatorRunning = () => false;
  // Never start a real simulator from a test: it would run against the published system.
  panel.spawnNode = () => assert.fail('o teste tentou iniciar o simulador de verdade');
  assert.throws(() => panel.start(), /Prepare o efetivo/);
  for (const status of ['executando', 'falhou']) {
    writeFileSync(path.join(dataDir, 'preparacao.json'), JSON.stringify({ status }));
    assert.throws(() => panel.start(), /preparação/i);
  }
  panel.jobs.preparar = { running: true };
  writeFileSync(path.join(dataDir, 'preparacao.json'), JSON.stringify({ status: 'concluida' }));
  assert.throws(() => panel.start(), /preparação/i, 'nem enquanto outra preparação roda');
});

test('novo teste arquiva tudo menos o efetivo e a preparação (as contas continuam no sistema)', () => {
  const dataDir = setup();
  writeFileSync(path.join(dataDir, 'preparacao.json'), '{"status":"concluida"}');
  const panel = new Processes({ root: '.', dataDir });
  panel.simulatorRunning = () => false;
  panel.archive();
  assert.deepEqual(readdirSync(dataDir).sort(), ['arquivo', 'efetivo.json', 'preparacao.json']);
});

test('limpeza recusada com o simulador rodando ou já em andamento', () => {
  const dataDir = setup();
  const running = new Processes({ root: '.', dataDir });
  running.simulatorRunning = () => true;
  assert.throws(() => running.cleanAll(), /Encerre o teste/);
  const busy = new Processes({ root: '.', dataDir });
  busy.jobs.limpeza = { running: true };
  assert.throws(() => busy.cleanAll(), /já está em andamento/);
});
