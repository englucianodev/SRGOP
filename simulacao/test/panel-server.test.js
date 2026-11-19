import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPanelServer, requestAllowed } from '../src/panel/server.js';

const PORT = 4391;
const dir = mkdtempSync(path.join(os.tmpdir(), 'painel-'));
const dataDir = path.join(dir, 'dados');
const envFile = path.join(dir, '.env');
writeFileSync(envFile, 'SIM_PASSWORD=nao-pode-vazar-123\nSIM_DAYS=7\n');
mkdirSync(dataDir);
writeFileSync(path.join(dataDir, 'painel.json'), JSON.stringify({ t: Date.now(), status: 'executando', teams: [] }));
const server = createPanelServer({ root: dir, dataDir, envFile, port: PORT, camera: false });

function call(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path: urlPath, headers: { host: `localhost:${PORT}`, ...headers } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, text, json: () => JSON.parse(text) }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
const action = (name, body = {}, headers = { 'x-painel': '1', 'content-type': 'application/json' }) => call('POST', `/api/acao/${name}`, { body, headers });

test.before(() => new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve)));
test.after(() => new Promise((resolve) => server.close(resolve)));

test('página e estado abrem pelo localhost; segredos do .env nunca aparecem', async () => {
  assert.equal((await call('GET', '/')).status, 200);
  const painel = await call('GET', '/api/painel');
  assert.equal(painel.status, 200);
  assert.equal(painel.json().snapshot.status, 'executando');
  writeFileSync(path.join(dataDir, 'preparacao.json'), JSON.stringify({ status: 'executando', cities: [{ name: 'Capinzal', status: 'preparando' }], accounts: [] }));
  assert.equal((await call('GET', '/api/painel')).json().preparation.cities[0].name, 'Capinzal', 'painel traz a preparação do efetivo');
  const settings = await call('GET', '/api/configuracoes');
  assert.ok(!settings.text.includes('nao-pode-vazar'));
});

test('ações exigem cabeçalho próprio do painel e Host local', async () => {
  assert.equal((await action('pausar', {}, { 'content-type': 'application/json' })).status, 403);
  assert.equal((await call('GET', '/api/painel', { headers: { host: 'evil.example:4391' } })).status, 403);
  assert.equal(requestAllowed({ method: 'POST', headers: { host: `127.0.0.1:${PORT}`, 'x-painel': '1', 'content-type': 'text/plain' } }, PORT), false);
});

test('configurações válidas são gravadas e inválidas recusadas', async () => {
  const ok = await action('configuracoes', { SIM_DAYS: 2 });
  assert.equal(ok.status, 200, ok.text);
  assert.match(readFileSync(envFile, 'utf8'), /^SIM_DAYS=2$/m);
  assert.match(readFileSync(envFile, 'utf8'), /^SIM_PASSWORD=nao-pode-vazar-123$/m);
  assert.equal((await action('configuracoes', { SIM_PASSWORD: 'x' })).status, 400);
});

test('fotos só por nome válido (sem caminho) e ação desconhecida dá 404', async () => {
  assert.equal((await call('GET', '/fotos/..%2F.env')).status, 404);
  assert.equal((await action('apagar-tudo')).status, 404);
});

test('novo teste arquiva os dados e mantém o efetivo', async () => {
  writeFileSync(path.join(dataDir, 'painel.json'), JSON.stringify({ t: 0, status: 'finalizado', teams: [] }));
  writeFileSync(path.join(dataDir, 'estado.json'), '{"status":"finalizado"}');
  writeFileSync(path.join(dataDir, 'efetivo.json'), '{}');
  const res = await action('novo-teste');
  assert.equal(res.status, 200, res.text);
  const left = (await import('node:fs')).readdirSync(dataDir).sort();
  assert.deepEqual(left, ['arquivo', 'efetivo.json', 'preparacao.json'], 'o registro da preparação fica: as contas continuam no sistema');
});

test('limpeza total exige digitar LIMPAR', async () => {
  const res = await action('limpar-tudo', { confirmacao: 'sim' });
  assert.equal(res.status, 400);
  assert.match(res.json().message, /LIMPAR/);
});

test('painel informa o tema atual; ele é guardado e só aceita claro ou escuro', async () => {
  assert.equal((await action('tema', { tema: 'light' })).status, 200);
  assert.equal(JSON.parse(readFileSync(path.join(dataDir, 'tema.json'), 'utf8')).tema, 'light');
  assert.equal((await action('tema', { tema: 'roxo' })).status, 400);
  assert.equal(JSON.parse(readFileSync(path.join(dataDir, 'tema.json'), 'utf8')).tema, 'light');
});
