import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrepProgress } from '../src/lib/progress.js';

const read = (dir) => JSON.parse(readFileSync(path.join(dir, 'preparacao.json'), 'utf8'));

test('registra cidades e contas da preparação sem expor e-mails', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prep-'));
  const progress = new PrepProgress(dir);
  progress.start(['Dom Pedro'], [
    { email: 'sim.dom-pedro.a.cmt@sim.srgop.local', name: 'Ana Lima Costa', rank: '2ª Sargento', duty: 'comandante', team: 'A', city: 'Dom Pedro' },
    { email: 'sim.oficial1@sim.srgop.local', name: 'Paulo Reis Dias', rank: '1º Tenente', duty: 'cpu', city: 'CPU' },
  ]);
  let data = read(dir);
  assert.equal(data.status, 'executando');
  assert.deepEqual(data.accounts.map((a) => a.result), ['pendente', 'pendente']);
  progress.city('Dom Pedro', 'pronta');
  progress.account('sim.dom-pedro.a.cmt@sim.srgop.local', 'criada');
  progress.account('sim.oficial1@sim.srgop.local', 'atualizada');
  progress.finish();
  data = read(dir);
  assert.equal(data.status, 'concluida');
  assert.equal(data.cities[0].status, 'pronta');
  assert.deepEqual(data.accounts.map((a) => a.result), ['criada', 'atualizada']);
  assert.ok(!JSON.stringify(data).includes('@sim.srgop.local'));
});

test('falha fica registrada com a mensagem', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prep-'));
  const progress = new PrepProgress(dir);
  progress.start([], []);
  progress.finish(new Error('Falha de rede'));
  assert.deepEqual([read(dir).status, read(dir).error], ['falhou', 'Falha de rede']);
});
