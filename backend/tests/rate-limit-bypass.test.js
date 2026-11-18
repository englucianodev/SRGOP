import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { isSimulationRequest, isSimulationLogin } from '../middlewares/rateLimitBypass.js';

const TOKEN = 'simulacao-srgop-token-de-teste-com-32-caracteres-ou-mais';
const original = process.env.SIMULATION_BYPASS_TOKEN;
afterEach(() => {
  if (original === undefined) delete process.env.SIMULATION_BYPASS_TOKEN;
  else process.env.SIMULATION_BYPASS_TOKEN = original;
});
const fakeRequest = (token) => ({
  get: (name) => (name === 'x-simulation-token' ? token : undefined),
});

test('sem token configurado nenhuma requisição é isenta', () => {
  delete process.env.SIMULATION_BYPASS_TOKEN;
  assert.equal(isSimulationRequest(fakeRequest(TOKEN)), false);
  assert.equal(isSimulationRequest(fakeRequest('')), false);
});

test('token configurado curto demais é ignorado', () => {
  process.env.SIMULATION_BYPASS_TOKEN = 'curto';
  assert.equal(isSimulationRequest(fakeRequest('curto')), false);
});

test('somente o cabeçalho com o token exato é isento', () => {
  process.env.SIMULATION_BYPASS_TOKEN = TOKEN;
  assert.equal(isSimulationRequest(fakeRequest(TOKEN)), true);
  assert.equal(isSimulationRequest(fakeRequest(`${TOKEN}x`)), false);
  assert.equal(isSimulationRequest(fakeRequest(TOKEN.slice(0, -1))), false);
  assert.equal(isSimulationRequest(fakeRequest(undefined)), false);
});

test('o limite geral continua valendo sem o token e é ignorado com ele', async () => {
  process.env.SIMULATION_BYPASS_TOKEN = TOKEN;
  const app = createApp();
  let last;
  // /health/live answers without the database, so only the limiter decides the status.
  for (let i = 0; i < 301; i++) last = await request(app).get('/api/health/live');
  assert.equal(last.status, 429);
  const bypassed = await request(app).get('/api/health/live').set('x-simulation-token', TOKEN);
  assert.equal(bypassed.status, 200);
});

test('no login, o token só isenta contas simuladas', async () => {
  process.env.SIMULATION_BYPASS_TOKEN = TOKEN;
  const app = createApp();
  const login = (email) =>
    request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('x-simulation-token', TOKEN)
      .send({ email }); // invalid body: counted by the limiter, rejected before the DB
  let real;
  for (let i = 0; i < 31; i++) real = await login('policial@pm.ma.gov.br');
  assert.equal(real.status, 429);
  const simulated = await login('sim.tuntum.a.cmt@sim.srgop.local');
  assert.notEqual(simulated.status, 429);
});

test('isSimulationLogin exige token e e-mail simulado', () => {
  process.env.SIMULATION_BYPASS_TOKEN = TOKEN;
  const req = (token, email) => ({ ...fakeRequest(token), body: { email } });
  assert.equal(isSimulationLogin(req(TOKEN, 'sim.oficial1@sim.srgop.local')), true);
  assert.equal(isSimulationLogin(req(TOKEN, 'real@pm.ma.gov.br')), false);
  assert.equal(isSimulationLogin(req('', 'sim.oficial1@sim.srgop.local')), false);
  assert.equal(isSimulationLogin({ ...fakeRequest(TOKEN) }), false);
});
