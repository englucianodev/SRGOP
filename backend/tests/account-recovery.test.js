import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { User, City, Session, SystemSetting, PasswordReset, AuditLog } from '../models/index.js';
import { setMailTransport } from '../services/mail.js';
import { MODULES } from '../utils/constants.js';

let mongo, app, city;
const sent = [];
const origin = 'http://localhost:5173';
const password = 'RecuperacaoTeste!2026';
const bypass = 'token-de-teste-com-mais-de-trinta-e-dois-caracteres';
const post = (agent, path, body) =>
  agent.post(`/api${path}`).set('Origin', origin).set('x-simulation-token', bypass).send(body);
const login = (agent, email, extra = {}) =>
  post(agent, '/auth/login', { email, password, ...extra });

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
async function person(tag, role) {
  const user = await account(tag, role);
  const agent = request.agent(app);
  assert.equal((await login(agent, user.email)).status, 200);
  return { user, agent };
}
async function waitFor(check, message) {
  for (let i = 0; i < 100; i++) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(message);
}
const settingsBody = (extra) => ({
  institution: 'Batalhão de teste',
  inactivityMinutes: 5,
  alertMinutes: 10,
  soundEnabled: true,
  notificationsEnabled: true,
  modules: MODULES,
  crimeTypes: ['Furto'],
  operations: [],
  ...extra,
});

before(async () => {
  process.env.JWT_SECRET = 'chave_teste_recuperacao_e_duas_etapas_1234567890';
  process.env.CLIENT_URL = origin;
  process.env.SIMULATION_BYPASS_TOKEN = bypass;
  process.env.BREVO_API_KEY = 'chave-falsa-de-teste';
  process.env.MAIL_FROM = 'nao-responda@srgop.example';
  delete process.env.APP_URL;
  setMailTransport(async (message) => {
    sent.push(message);
  });
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri('account_recovery'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
  city = await City.create({ name: 'Cidade da recuperação', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general', inactivityMinutes: 5 });
});
beforeEach(() => {
  sent.length = 0;
});
after(async () => {
  setMailTransport(null);
  for (const name of ['SIMULATION_BYPASS_TOKEN', 'BREVO_API_KEY', 'MAIL_FROM']) delete process.env[name];
  await mongoose.disconnect();
  await mongo?.stop();
});

// ── Password recovery by e-mail ──────────────────────────────────────
test('a tela de login sabe se a recuperação por e-mail está configurada', async () => {
  assert.deepEqual((await request(app).get('/api/auth/options')).body, { passwordRecovery: true });
  const key = process.env.BREVO_API_KEY;
  delete process.env.BREVO_API_KEY;
  try {
    assert.deepEqual((await request(app).get('/api/auth/options')).body, { passwordRecovery: false });
  } finally {
    process.env.BREVO_API_KEY = key;
  }
});
test('pedido de recuperação responde igual para e-mail existente ou não e só envia para conta real', async () => {
  const user = await account('RecuperaPedido');
  const agent = request.agent(app);
  const unknown = await post(agent, '/auth/password/forgot', { email: 'ninguem@sim.srgop.local' });
  const known = await post(agent, '/auth/password/forgot', { email: user.email.toUpperCase() });
  assert.equal(unknown.status, 200);
  assert.deepEqual(known.body, unknown.body);
  const mail = await waitFor(() => sent[0], 'e-mail de recuperação não foi enviado');
  assert.equal(sent.length, 1);
  assert.equal(mail.to.email, user.email);
  const [, token] = mail.text.match(/http:\/\/localhost:5173\/redefinir-senha#([\w-]{40,})/);
  const stored = await PasswordReset.findOne({ user: user._id });
  assert.notEqual(stored.tokenHash, token, 'o token não pode ficar em texto puro no banco');
  assert.ok(+stored.expiresAt - Date.now() <= 30 * 60000);
  // A second request right after must not flood the mailbox.
  await post(agent, '/auth/password/forgot', { email: user.email });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(sent.length, 1);
});
test('redefinição troca a senha, revoga sessões, libera bloqueio e o link só vale uma vez', async () => {
  const p = await person('RecuperaTroca');
  const agent = request.agent(app);
  for (let i = 0; i < 5; i++)
    await post(agent, '/auth/login', { email: p.user.email, password: 'errada' });
  assert.equal((await login(agent, p.user.email)).status, 429);
  await post(agent, '/auth/password/forgot', { email: p.user.email });
  const mail = await waitFor(() => sent[0], 'e-mail de recuperação não foi enviado');
  const token = mail.text.match(/#([\w-]+)/)[1];
  const nova = 'SenhaRedefinida!2026';
  const body = { password: nova, confirmPassword: nova };
  assert.equal((await post(agent, '/auth/password/reset', { token: `${token}x`, ...body })).status, 422);
  assert.equal(
    (await post(agent, '/auth/password/reset', { token, password: nova, confirmPassword: 'outra-senha-1' }))
      .status,
    422,
  );
  assert.equal((await post(agent, '/auth/password/reset', { token, ...body })).status, 200);
  assert.equal((await p.agent.get('/api/auth/me')).status, 401, 'sessões antigas revogadas');
  assert.equal((await login(agent, p.user.email)).status, 401, 'senha antiga não entra');
  assert.equal(
    (await post(agent, '/auth/login', { email: p.user.email, password: nova })).status,
    200,
  );
  assert.equal((await post(agent, '/auth/password/reset', { token, ...body })).status, 422);
  assert.ok(await AuditLog.exists({ entityId: String(p.user._id), action: /Senha redefinida/ }));
});
test('link vencido ou de conta desativada é recusado', async () => {
  const user = await account('RecuperaVencido');
  const agent = request.agent(app);
  await post(agent, '/auth/password/forgot', { email: user.email });
  const mail = await waitFor(() => sent[0], 'e-mail de recuperação não foi enviado');
  const token = mail.text.match(/#([\w-]+)/)[1];
  const body = { token, password: 'SenhaRedefinida!2026', confirmPassword: 'SenhaRedefinida!2026' };
  await User.updateOne({ _id: user._id }, { active: false });
  assert.equal((await post(agent, '/auth/password/reset', body)).status, 422);
  await User.updateOne({ _id: user._id }, { active: true });
  await PasswordReset.updateOne({ user: user._id }, { expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await post(agent, '/auth/password/reset', body)).status, 422);
});
