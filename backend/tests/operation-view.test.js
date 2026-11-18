import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createApp } from '../app.js';
import { User, City, Crew, Vehicle, Occurrence, SystemSetting, AuditLog } from '../models/index.js';
import { connectDatabase } from '../config/database.js';
import { operationEvents } from '../services/operationEvents.js';
let mongo, app, city, officer, praca, crew, aberta, encerrada;
const password = 'VisaoOperacao!2026';
const origin = 'http://localhost:5173';
const post = (agent, url, body = {}) => agent.post(`/api${url}`).set('Origin', origin).send(body);
async function account(name, role) {
  const user = await User.create({
    name,
    email: `${'u'}.${Math.random().toString(36).slice(2, 8)}@visao.local`,
    city: city._id,
    role,
    active: true,
    password: await bcrypt.hash(password, 4),
  });
  const agent = request.agent(app);
  const r = await post(agent, '/auth/login', { email: user.email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { user, agent };
}
const occurrenceData = (protocol, extra = {}) => ({
  protocol,
  occurredAt: new Date(),
  city: city._id,
  crimeType: 'Furto',
  address: 'Rua Reservada, 99',
  description: 'Vítima Fulano de Tal relatou o furto.',
  priority: 'Alta',
  createdBy: praca.user._id,
  ...extra,
});
before(async () => {
  process.env.JWT_SECRET = 'chave_de_testes_da_visao_da_operacao_1234567890';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectDatabase(mongo.getUri('srgop_operation_view'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  city = await City.create({ name: 'Cidade da operação', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  app = createApp();
  officer = await account('Oficial da operação', 'Oficial');
  praca = await account('Praça da operação', 'Praça');
  const vehicle = await Vehicle.create({ prefix: 'VTR-OP', plate: 'OPE1A23', city: city._id });
  crew = await Crew.create({
    name: 'Guarnição operação',
    city: city._id,
    vehicle: vehicle._id,
    members: [praca.user._id],
    driver: praca.user._id,
    status: 'Disponível',
    shiftStart: new Date(Date.now() - 3600000),
    shiftEnd: new Date(Date.now() + 8 * 3600000),
  });
  await User.updateOne({ _id: praca.user._id }, { crew: crew._id });
  [aberta, encerrada] = await Occurrence.create([
    occurrenceData('OP-ABERTA'),
    occurrenceData('OP-ENCERRADA', { status: 'Encerrada' }),
    occurrenceData('OP-EXCLUIDA', { deleted: true }),
  ]);
  const r = await post(officer.agent, '/dispatches', {
    occurrence: String(aberta._id),
    crew: String(crew._id),
    reason: 'Motivo reservado do despacho',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test('gestão recebe ocorrências abertas e eventos sem dados pessoais', async () => {
  const body = (await officer.agent.get('/api/dashboard')).body;
  const protocols = body.open.map((o) => o.protocol);
  assert.deepEqual(protocols, ['OP-ABERTA']);
  assert.equal(body.open[0].status, 'Despachada');
  assert.equal(body.open[0].crew.name, 'Guarnição operação');
  const dispatch = body.events.find((e) => e.action === 'Despacho' && e.label === aberta.protocol);
  assert.ok(dispatch);
  assert.equal(dispatch.actor, 'Oficial da operação');
  const text = JSON.stringify(body.events);
  for (const secret of ['Vítima Fulano', 'Rua Reservada', 'Motivo reservado', 'Guarnição operação']) {
    assert.ok(!text.includes(secret), secret);
  }
  assert.ok(!('detail' in dispatch));
});
test('Praça não recebe open nem events', async () => {
  const body = (await praca.agent.get('/api/dashboard')).body;
  assert.equal(body.open, undefined);
  assert.equal(body.events, undefined);
});
test('eventos vêm do mais recente ao mais antigo, filtrados por data, ação e limite', async () => {
  const old = new Date(Date.now() - 48 * 3600000);
  await AuditLog.create([
    { action: 'Encerramento de turno', entity: 'Crew', entityId: String(crew._id), actor: officer.user._id },
    { action: 'Login', entity: 'User', entityId: String(officer.user._id) },
    { action: 'Aceite', entity: 'Occurrence', entityId: String(encerrada._id), createdAt: old },
  ]);
  const events = await operationEvents(new Date(Date.now() - 3600000));
  assert.deepEqual(events.map((e) => e.action), ['Encerramento de turno', 'Despacho']);
  assert.equal(events[0].label, 'Guarnição operação');
  assert.equal((await operationEvents(new Date(Date.now() - 3600000), 1)).length, 1);
});
