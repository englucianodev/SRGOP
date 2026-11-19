import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { User, City, Crew, SystemSetting } from '../models/index.js';
import { openCpuShift } from '../services/cpuShift.js';

let mongo, app, city, crew, cpu, officer, admin, first, second;
const origin = 'http://localhost:5173',
  password = 'EncerramentoCpu!2026';
const post = (agent, url, body = {}) => agent.post(`/api${url}`).set('Origin', origin).send(body);
const exitBody = (member) => ({
  member: String(member.user._id),
  action: 'Saída',
  reason: 'Dispensa antecipada autorizada.',
});

async function account(name, role = 'Praça') {
  const user = await User.create({
    name,
    email: `${name}@cpu-exit.local`,
    city: city._id,
    role,
    active: true,
    password: await bcrypt.hash(password, 4),
  });
  const agent = request.agent(app);
  assert.equal((await post(agent, '/auth/login', { email: user.email, password })).status, 200);
  return { user, agent };
}

before(async () => {
  process.env.JWT_SECRET = 'chave_teste_encerramento_cpu_123456789abcdef';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(mongo.getUri('cpu_early_exit'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
  city = await City.create({ name: 'Cidade CPU', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  cpu = await account('OficialCPU', 'Oficial');
  officer = await account('OutroOficial', 'Oficial');
  admin = await account('Administrativo', 'Administrativo');
  first = await account('PrimeiroPraca');
  second = await account('SegundoPraca');
  await openCpuShift(cpu.user._id);
  crew = await Crew.create({ name: 'Equipe CPU', city: city._id });
  for (const member of [first, second])
    assert.equal(
      (await post(member.agent, `/crews/${crew._id}/join`, { driver: false })).status,
      200,
    );
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('somente o CPU do dia encerra antecipadamente o turno de um policial', async () => {
  for (const other of [officer, admin]) {
    const r = await post(other.agent, `/crews/${crew._id}/members`, exitBody(first));
    assert.equal(r.status, 403);
    assert.match(r.body.message, /CPU do dia/);
  }
  assert.equal((await Crew.findById(crew._id)).members.length, 2);
});

test('outro oficial ainda pode definir o motorista atual', async () => {
  const r = await post(officer.agent, `/crews/${crew._id}/members`, {
    member: String(second.user._id),
    action: 'Motorista',
    reason: 'Troca de motorista autorizada.',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

test('o CPU encerra o turno de apenas um integrante e a guarnição continua', async () => {
  const r = await post(cpu.agent, `/crews/${crew._id}/members`, exitBody(first));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = await Crew.findById(crew._id);
  assert.deepEqual(row.members.map(String), [String(second.user._id)]);
  assert.notEqual(row.status, 'Fora de serviço');
  assert.equal((await User.findById(first.user._id)).crew, null);
});

test('somente o CPU do dia encerra antecipadamente o turno da guarnição', async () => {
  const body = { reason: 'Encerramento antecipado autorizado.' };
  for (const other of [officer, admin]) {
    const r = await post(other.agent, `/crews/${crew._id}/end-shift`, body);
    assert.equal(r.status, 403);
    assert.match(r.body.message, /CPU do dia/);
  }
  const r = await post(cpu.agent, `/crews/${crew._id}/end-shift`, body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await Crew.findById(crew._id)).status, 'Fora de serviço');
});
