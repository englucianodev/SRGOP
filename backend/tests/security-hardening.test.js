import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { errorHandler } from '../middlewares/errors.js';
import { DAILY_UPLOAD_LIMIT } from '../controllers/occurrenceController.js';
import { User, City, Crew, Vehicle, Session, Attachment, SystemSetting } from '../models/index.js';
let mongo, app, city, admin, soldier;
const origin = 'http://localhost:5173',
  password = 'Seguranca!2026';
const post = (agent, route, body = {}) =>
  agent.post(`/api${route}`).set('Origin', origin).send(body);
async function person(name, role) {
  const user = await User.create({
    name,
    email: `${name.toLowerCase()}@security.local`,
    password: await bcrypt.hash(password, 4),
    city: city._id,
    role,
    active: true,
  });
  const agent = request.agent(app);
  assert.equal((await post(agent, '/auth/login', { email: user.email, password })).status, 200);
  return { user, agent };
}
async function occurrence(agent) {
  const r = await post(agent, '/occurrences', {
    city: String(city._id),
    occurredAt: new Date(Date.now() - 3600000).toISOString(),
    crimeType: 'Furto',
    address: 'Rua da segurança',
    description: 'Ocorrência criada para validar o endurecimento de segurança.',
    priority: 'Baixa',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
const attach = (agent, id, bytes, name) =>
  agent
    .post(`/api/occurrences/${id}/attachments`)
    .set('Origin', origin)
    .attach('file', bytes, name);
before(async () => {
  process.env.JWT_SECRET = 'chave_aleatoria_de_teste_para_seguranca_12345678';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(mongo.getUri('security_hardening'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
  city = await City.create({ name: 'Cidade segura', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  admin = await person('Admin', 'Administrativo');
  soldier = await person('Soldado', 'Praça');
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('M4: login e cadastro exigem origem autorizada mesmo sem cookie', async () => {
  const credentials = { email: soldier.user.email, password };
  const noOrigin = await request(app).post('/api/auth/login').send(credentials);
  assert.equal(noOrigin.status, 403);
  assert.equal(noOrigin.body.origin, 'Proteção CSRF');
  const register = await request(app).post('/api/auth/register').send({});
  assert.equal(register.status, 403);
  assert.equal((await post(request(app), '/auth/login', credentials)).status, 200);
});

test('M5: alterar o e-mail revoga as outras sessões e mantém a atual', async () => {
  const user = await person('Troca', 'Praça');
  const other = request.agent(app);
  await post(other, '/auth/login', { email: user.user.email, password });
  assert.equal((await Session.countDocuments({ user: user.user._id })).valueOf(), 2);
  const r = await user.agent.put('/api/auth/me').set('Origin', origin).send({
    name: 'Troca',
    email: 'troca.nova@security.local',
    currentPassword: password,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await user.agent.get('/api/auth/me')).status, 200);
  assert.equal((await other.get('/api/auth/me')).status, 401);
  assert.equal(await Session.countDocuments({ user: user.user._id }), 1);
});

test('L1: cadastro com e-mail existente responde igual a um cadastro novo', async () => {
  const input = (email) => ({
    name: 'Policial Repetido',
    email,
    password,
    confirmPassword: password,
    city: String(city._id),
    role: 'Praça',
  });
  const fresh = await post(request(app), '/auth/register', input('novo@security.local'));
  const repeated = await post(request(app), '/auth/register', input(soldier.user.email));
  assert.equal(fresh.status, 201, JSON.stringify(fresh.body));
  assert.equal(repeated.status, 201);
  assert.deepEqual(repeated.body, fresh.body);
  assert.equal(await User.countDocuments({ email: soldier.user.email }), 1);
  assert.equal((await User.findById(soldier.user._id)).active, true);
});

test('L1: login de e-mail inexistente também executa a verificação de senha', async () => {
  const original = bcrypt.compare;
  let calls = 0;
  bcrypt.compare = (...args) => {
    calls += 1;
    return original(...args);
  };
  try {
    const r = await post(request(app), '/auth/login', {
      email: 'ninguem@security.local',
      password,
    });
    assert.equal(r.status, 401);
    assert.equal(calls, 1);
  } finally {
    bcrypt.compare = original;
  }
});

test('L2: filtro do log de auditoria aceita apenas identificador de usuário', async () => {
  assert.equal((await admin.agent.get('/api/audit-logs?user=nao-e-um-id')).status, 422);
  // Express 5 keeps "user[$ne]" as a literal key, so no operator reaches the query.
  const injected = await admin.agent.get('/api/audit-logs?user[$ne]=x');
  assert.equal(injected.status, 200);
  const ok = await admin.agent.get(`/api/audit-logs?user=${admin.user._id}`);
  assert.equal(ok.status, 200);
  assert.ok(ok.body.every((row) => String(row.actor._id) === String(admin.user._id)));
});

test('L3: erro interno não revela método nem rota', () => {
  let sent;
  const res = {
    headersSent: false,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      sent = body;
    },
  };
  const original = console.error;
  console.error = () => {};
  try {
    errorHandler(new Error('falha interna'), { method: 'POST', path: '/api/segredo' }, res);
  } finally {
    console.error = original;
  }
  assert.equal(res.code, 500);
  assert.equal(sent.origin, 'Servidor');
  assert.doesNotMatch(JSON.stringify(sent), /segredo|falha interna/);
});

test('L4: anexos precisam de estrutura completa do formato', async () => {
  const row = await occurrence(soldier.agent);
  const truncatedPdf = Buffer.from('%PDF-1.4\n<script>alert(1)</script>');
  const truncatedJpeg = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(32)]);
  assert.equal((await attach(soldier.agent, row._id, truncatedPdf, 'a.pdf')).status, 422);
  assert.equal((await attach(soldier.agent, row._id, truncatedJpeg, 'a.jpg')).status, 422);
  const pdf = Buffer.from('%PDF-1.4\n% conteúdo mínimo\n%%EOF\n');
  assert.equal((await attach(soldier.agent, row._id, pdf, 'ok.pdf')).status, 201);
});

test('L4: limite diário de anexos por usuário', async () => {
  const row = await occurrence(admin.agent);
  await Attachment.insertMany(
    Array.from({ length: DAILY_UPLOAD_LIMIT }, (_, i) => ({
      occurrence: new mongoose.Types.ObjectId(),
      name: `antigo-${i}.pdf`,
      mime: 'application/pdf',
      data: Buffer.from('%PDF-%%EOF'),
      size: 10,
      uploadedBy: admin.user._id,
    })),
  );
  const pdf = Buffer.from('%PDF-1.4\n%%EOF');
  const r = await attach(admin.agent, row._id, pdf, 'excedente.pdf');
  assert.equal(r.status, 429, JSON.stringify(r.body));
});

test('M2: Praça não recebe dados cadastrais de viaturas e perfis de outras guarnições', async () => {
  const vehicle = await Vehicle.create({
    prefix: 'VTR-SEC',
    plate: 'SEC1A23',
    brand: 'Toyota',
    model: 'Hilux',
    year: 2024,
    city: city._id,
    mileage: 1234,
  });
  const other = await Crew.create({
    name: 'Outra guarnição',
    city: city._id,
    vehicle: vehicle._id,
    members: [admin.user._id],
  });
  const own = await Crew.create({
    name: 'Guarnição própria',
    city: city._id,
    vehicle: (
      await Vehicle.create({ prefix: 'VTR-OWN', plate: 'OWN1A23', brand: 'Ford', city: city._id })
    )._id,
    members: [soldier.user._id],
  });
  const find = (rows, crew) => rows.find((c) => String(c._id) === String(crew._id));

  const asSoldier = (await soldier.agent.get('/api/crews')).body;
  const foreign = find(asSoldier, other);
  assert.equal(foreign.vehicle.prefix, 'VTR-SEC');
  assert.equal(foreign.vehicle.plate, 'SEC1A23');
  assert.equal(foreign.vehicle.mileage, 1234);
  for (const field of ['brand', 'model', 'year']) assert.equal(foreign.vehicle[field], undefined);
  assert.equal(foreign.members[0].name, 'Admin');
  assert.equal(foreign.members[0].role, undefined);
  assert.equal(find(asSoldier, own).vehicle.brand, 'Ford');

  const asAdmin = (await admin.agent.get('/api/crews')).body;
  assert.equal(find(asAdmin, other).vehicle.brand, 'Toyota');
  assert.equal(find(asAdmin, other).members[0].role, 'Administrativo');
});
