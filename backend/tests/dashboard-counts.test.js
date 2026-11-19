import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createApp } from '../app.js';
import { User, City, Occurrence, SystemSetting } from '../models/index.js';
import { connectDatabase } from '../config/database.js';
import { serviceWindow } from '../utils/time.js';

const HOUR = 3600000;
let mongo, app, city, officer;
const password = 'ContagemPainel!2026';
const origin = 'http://localhost:5173';

async function occurrence(protocol, { createdAt, ...extra }) {
  const row = await Occurrence.create({
    protocol,
    occurredAt: new Date(Date.now() - 30 * HOUR), // the fact happened the day before
    city: city._id,
    crimeType: 'Furto',
    address: 'Rua do painel, 10',
    description: 'Ocorrência de teste da contagem do painel.',
    priority: 'Média',
    createdBy: officer._id,
    ...extra,
  });
  // createdAt is managed by mongoose timestamps; set it directly to place it before or after 8h.
  await Occurrence.collection.updateOne({ _id: row._id }, { $set: { createdAt } });
  return row;
}

before(async () => {
  process.env.JWT_SECRET = 'chave_de_testes_da_contagem_do_painel_123456789';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectDatabase(mongo.getUri('srgop_dashboard_counts'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  city = await City.create({ name: 'Cidade do painel', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  app = createApp();
  officer = await User.create({
    name: 'Oficial do painel',
    email: 'oficial@painel.local',
    city: city._id,
    role: 'Oficial',
    active: true,
    password: await bcrypt.hash(password, 4),
  });
  const start = +serviceWindow().start;
  const inService = new Date(Math.max(start + 60000, Date.now() - 60000));
  const beforeService = new Date(start - 2 * HOUR);
  await occurrence('PAINEL-ATENDIDA', {
    createdAt: inService,
    status: 'Encerrada',
    endedAt: new Date(),
    weapons: 1,
  });
  await occurrence('PAINEL-ATIVA-ANTIGA', { createdAt: beforeService, status: 'Em atendimento' });
  await occurrence('PAINEL-ABERTA-ANTIGA', { createdAt: beforeService, status: 'Em aberto' });
  await occurrence('PAINEL-CANCELADA', { createdAt: inService, status: 'Cancelada' });
  await occurrence('PAINEL-SERVICO-ANTERIOR', {
    createdAt: beforeService,
    status: 'Encerrada',
    endedAt: new Date(start - HOUR),
  });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('painel conta as ocorrências do serviço atual com o mesmo critério em todos os números', async () => {
  const agent = request.agent(app);
  const login = await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'oficial@painel.local', password });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const body = (await agent.get('/api/dashboard')).body;
  const count = (status) => body.counts.find((r) => r._id === status)?.count || 0;
  // "Ocorrências atendidas" and the panorama's "Encerrada" are the same number.
  assert.equal(body.results.closed, 1);
  assert.equal(count('Encerrada'), body.results.closed);
  assert.equal(body.results.weapons, 1);
  // Still-active work started before 8h (or about a fact from another day) is still shown.
  assert.deepEqual(
    body.ongoing.map((o) => o.protocol),
    ['PAINEL-ATIVA-ANTIGA'],
  );
  assert.equal(count('Em atendimento') + count('Despachada'), body.ongoing.length);
  assert.equal(count('Em aberto'), body.alerts);
  assert.equal(count('Cancelada'), 1);
  assert.equal(
    body.counts.reduce((sum, r) => sum + r.count, 0),
    4,
  );
});
