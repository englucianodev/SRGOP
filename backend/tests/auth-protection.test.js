import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { User, City, Crew, Session, SystemSetting, LoginThrottle } from '../models/index.js';

let mongo, app, city, uri;
const origin = 'http://localhost:5173';
const password = 'ProtecaoTeste!2026';
const HOUR = 3600000;
const TOLERANCE_MS = 10000;
// Simulated accounts skip the per-IP login limit, which these tests would otherwise hit.
const bypass = 'token-de-teste-com-mais-de-trinta-e-dois-caracteres';
const near = (value, expected, message) =>
  assert.ok(Math.abs(+value - expected) < TOLERANCE_MS, `${message}: ${new Date(+value).toISOString()}`);

async function account(tag, role = 'Praça') {
  return User.create({
    name: tag,
    email: `${tag.toLowerCase()}@sim.srgop.local`,
    password: await bcrypt.hash(password, 4),
    role,
    active: true,
    city: city._id,
  });
}
const login = (agent, email, pass = password) =>
  agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .set('x-simulation-token', bypass)
    .send({ email, password: pass });
async function person(tag, role) {
  const user = await account(tag, role);
  const agent = request.agent(app);
  const response = await login(agent, user.email);
  assert.equal(response.status, 200);
  const token = response.headers['set-cookie'][0].split(';')[0].split('=')[1];
  return { user, agent, token, session: await Session.findOne({ user: user._id }) };
}
async function duty(p, { mode = 'Regular', hours = 20 } = {}) {
  const crew = await Crew.create({
    name: `Equipe ${p.user.name}`,
    city: city._id,
    type: mode === 'Motocicleta' ? 'Motocicleta' : 'Viatura Convencional',
    shiftMode: mode,
    members: [p.user._id],
    status: 'Disponível',
    shiftStart: new Date(),
    shiftEnd: mode === 'Motocicleta' ? null : new Date(Date.now() + hours * HOUR),
  });
  await User.updateOne({ _id: p.user._id }, { crew: crew._id });
  return crew;
}
const expiry = async (p) => +(await Session.findById(p.session._id)).expiresAt;

before(async () => {
  process.env.JWT_SECRET = 'chave_teste_protecao_de_autenticacao_1234567890';
  process.env.CLIENT_URL = origin;
  process.env.SIMULATION_BYPASS_TOKEN = bypass;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  uri = mongo.getUri('auth_protection');
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
  city = await City.create({ name: 'Cidade da proteção', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general', inactivityMinutes: 5 });
});
after(async () => {
  delete process.env.SIMULATION_BYPASS_TOKEN;
  await mongoose.disconnect();
  await mongo?.stop();
});

// ── Session lasts until the end of the shift ─────────────────────────
test('sessão comum vence em 12 h, mas o token aceita a extensão do turno', async () => {
  const p = await person('SessaoComum');
  near(p.session.expiresAt, Date.now() + 12 * HOUR, 'vencimento inicial');
  const { exp } = jwt.decode(p.token);
  assert.ok(exp * 1000 > Date.now() + 6 * 24 * HOUR, 'o JWT não pode ser o limite de 12 h');
  assert.equal((await p.agent.get('/api/auth/me')).status, 200);
  near(await expiry(p), +p.session.expiresAt, 'fora de serviço nada é estendido');
});
test('quem entra em serviço mantém a sessão até o fim do turno, com uma hora de tolerância', async () => {
  const p = await person('SessaoTurno');
  const crew = await duty(p, { hours: 20 });
  assert.equal((await p.agent.get('/api/auth/me')).status, 200);
  near(await expiry(p), +crew.shiftEnd + HOUR, 'vencimento após entrar em serviço');
});
test('após 13 h de serviço a sessão continua válida', async (t) => {
  const p = await person('SessaoLonga');
  await duty(p, { hours: 20 });
  assert.equal((await p.agent.get('/api/auth/me')).status, 200);
  const later = Date.now() + 13 * HOUR;
  t.mock.timers.enable({ apis: ['Date'], now: later });
  try {
    await Session.updateOne({ _id: p.session._id }, { lastActivity: new Date(later - 60000) });
    assert.equal((await p.agent.get('/api/auth/me')).status, 200);
  } finally {
    t.mock.timers.reset();
  }
});
test('turno aberto de motocicleta renova a sessão quando restam menos de seis horas', async () => {
  const p = await person('SessaoMoto');
  await duty(p, { mode: 'Motocicleta' });
  await Session.updateOne({ _id: p.session._id }, { expiresAt: new Date(Date.now() + 8 * HOUR) });
  assert.equal((await p.agent.get('/api/auth/me')).status, 200);
  near(await expiry(p), Date.now() + 8 * HOUR, 'com folga não renova');
  await Session.updateOne({ _id: p.session._id }, { expiresAt: new Date(Date.now() + 3 * HOUR) });
  assert.equal((await p.agent.get('/api/auth/me')).status, 200);
  near(await expiry(p), Date.now() + 12 * HOUR, 'renovação do turno aberto');
});
test('sessão já vencida não é reativada pelo serviço e o fim do turno não encurta a sessão', async () => {
  const expired = await person('SessaoVencida');
  await duty(expired);
  await Session.updateOne({ _id: expired.session._id }, { expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await expired.agent.get('/api/auth/me')).status, 401);

  const p = await person('SessaoFimTurno');
  const crew = await duty(p, { hours: 20 });
  assert.equal((await p.agent.get('/api/auth/me')).status, 200);
  const extended = await expiry(p);
  await Crew.updateOne({ _id: crew._id }, { shiftEnd: new Date(Date.now() - 1000) });
  assert.equal((await p.agent.get('/api/auth/me')).status, 200);
  assert.equal(await expiry(p), extended);
});

// ── Per-account lockout ──────────────────────────────────────────────
test('cinco senhas erradas seguidas bloqueiam a conta por 15 minutos, inclusive para a senha certa', async () => {
  const user = await account('BloqueioConta');
  const agent = request.agent(app);
  for (let i = 0; i < 4; i++) assert.equal((await login(agent, user.email, 'errada')).status, 401);
  assert.equal((await login(agent, user.email)).status, 200, 'acerto antes do limite');
  assert.equal(await LoginThrottle.countDocuments({ email: user.email }), 0, 'acerto zera o contador');
  for (let i = 0; i < 5; i++) assert.equal((await login(agent, user.email, 'errada')).status, 401);
  const blocked = await login(request.agent(app), user.email);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.origin, 'Proteção de autenticação');
  const lock = await LoginThrottle.findOne({ email: user.email });
  near(lock.lockedUntil, Date.now() + 15 * 60000, 'prazo do bloqueio');
  // A session opened before the lock keeps working: only new logins are refused.
  assert.equal((await agent.get('/api/auth/me')).status, 200);
  await LoginThrottle.updateOne({ email: user.email }, { lockedUntil: new Date(Date.now() - 1000) });
  assert.equal((await login(request.agent(app), user.email)).status, 200, 'libera após o prazo');
});
test('o bloqueio ignora maiúsculas no e-mail e vale também para e-mail inexistente', async () => {
  const user = await account('BloqueioCaixa');
  const agent = request.agent(app);
  for (let i = 0; i < 5; i++)
    assert.equal((await login(agent, user.email.toUpperCase(), 'errada')).status, 401);
  assert.equal((await login(agent, user.email)).status, 429);
  const ghost = 'ninguem@sim.srgop.local';
  for (let i = 0; i < 5; i++) assert.equal((await login(agent, ghost, 'errada')).status, 401);
  const blocked = await login(agent, ghost, 'errada');
  assert.equal(blocked.status, 429, 'mesma resposta para conta que não existe');
});
test('redefinição de senha pelo Administrativo libera a conta bloqueada', async () => {
  const admin = await person('BloqueioAdmin', 'Administrativo');
  const user = await account('BloqueioLiberado');
  const agent = request.agent(app);
  for (let i = 0; i < 5; i++) assert.equal((await login(agent, user.email, 'errada')).status, 401);
  assert.equal((await login(agent, user.email)).status, 429);
  const novaSenha = 'NovaSenhaSegura!2026';
  const saved = await admin.agent
    .put(`/api/users/${user._id}`)
    .set('Origin', origin)
    .send({
      name: user.name,
      email: user.email,
      city: String(city._id),
      role: 'Praça',
      active: true,
      password: novaSenha,
    });
  assert.equal(saved.status, 200);
  assert.equal((await login(agent, user.email, novaSenha)).status, 200);
});

// ── Health ───────────────────────────────────────────────────────────
test('health consulta o banco: 503 com o MongoDB fora do ar, e a verificação de processo segue 200', async () => {
  const ok = await request(app).get('/api/health');
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { status: 'ok', service: 'SRGOP', database: 'ok' });
  await mongoose.disconnect();
  try {
    const down = await request(app).get('/api/health');
    assert.equal(down.status, 503);
    assert.equal(down.body.status, 'degraded');
    assert.equal(down.body.database, 'indisponível');
    const live = await request(app).get('/api/health/live');
    assert.equal(live.status, 200);
    assert.equal(live.body.status, 'ok');
  } finally {
    await mongoose.connect(uri);
  }
});
