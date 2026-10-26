import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { User, City, Occurrence, SystemSetting } from '../models/index.js';
let mongo, app, admin, soldier, city, otherCity, users, settings, crimeTypes;
const origin = 'http://localhost:5173',
  password = 'MapaCrimes!2026';
before(async () => {
  process.env.JWT_SECRET = 'chave_testes_mapa_crimes_lista_grande_123456789';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri('map_crimes'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
  [city, otherCity] = await City.create([
    { name: 'Cidade do mapa', latitude: -5.2, longitude: -44.4 },
    { name: 'Outra cidade do mapa', latitude: -6, longitude: -45 },
  ]);
  settings = await SystemSetting.create({ key: 'general' });
  users = await User.create(
    ['Administrativo', 'Praça'].map((role, i) => ({
      name: `Usuário mapa ${i}`,
      email: `mapa${i}@teste.local`,
      city: city._id,
      role,
      active: true,
      password: bcrypt.hashSync(password, 4),
    })),
  );
  const agents = [];
  for (const u of users) {
    const a = request.agent(app);
    assert.equal(
      (await a.post('/api/auth/login').set('Origin', origin).send({ email: u.email, password }))
        .status,
      200,
    );
    agents.push(a);
  }
  [admin, soldier] = agents;
  const rows = Array.from({ length: 130 }, (_, i) => ({
    protocol: `MAP-${i}`,
    city: city._id,
    crimeType: 'Furto',
    address: `Rua ${i}`,
    description: 'Descrição reservada que não precisa ser retornada no mapa.',
    priority: ['Alta', 'Média', 'Baixa'][i % 3],
    status: i % 2 ? 'Em atendimento' : 'Em aberto',
    occurredAt: new Date('2026-10-25T12:00:00-03:00'),
    latitude: -5.2 + i / 1000,
    longitude: -44.4,
    createdBy: users[0]._id,
  }));
  await Occurrence.insertMany([
    ...rows,
    {
      ...rows[0],
      _id: undefined,
      protocol: 'MAP-SEM-GPS',
      latitude: undefined,
      longitude: undefined,
    },
    { ...rows[0], _id: undefined, protocol: 'MAP-DELETED', deleted: true },
    {
      ...rows[0],
      _id: undefined,
      protocol: 'MAP-OUTRA',
      city: otherCity._id,
      occurredAt: new Date('2026-10-24T12:00:00-03:00'),
    },
  ]);
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
const body = (types) => ({
  institution: settings.institution,
  inactivityMinutes: 5,
  alertMinutes: 10,
  soundEnabled: true,
  notificationsEnabled: true,
  modules: settings.modules,
  operations: [],
  crimeTypes: types,
});
test('mapa retorna todos os pontos filtrados além da primeira página sem expor descrição', async () => {
  assert.equal((await request(app).get('/api/occurrences/map')).status, 401);
  const r = await soldier.get(`/api/occurrences/map?city=${city._id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 130);
  assert.equal(r.body.total, 131);
  assert.equal(r.body.withoutCoordinates, 1);
  assert.ok(
    r.body.items.every((o) => typeof o.latitude === 'number' && o.description === undefined),
  );
  assert.ok(!r.body.items.some((o) => o.protocol === 'MAP-DELETED'));
});
test('mapa combina filtros de urgência, status, cidade e período', async () => {
  const r = await admin.get(
    `/api/occurrences/map?city=${city._id}&priority=Alta&status=Em%20atendimento&from=2026-10-25&to=2026-10-25`,
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 22);
  assert.ok(
    r.body.items.every(
      (o) =>
        o.priority === 'Alta' && o.status === 'Em atendimento' && o.city._id === String(city._id),
    ),
  );
  assert.equal((await admin.get('/api/occurrences/map?from=2026-10-26&to=2026-10-25')).status, 422);
  assert.equal((await admin.get('/api/occurrences/map?city=inválido')).status, 422);
});
test('administrador cadastra 500 tipos longos e o parser aceita a lista acima de 100 KB', async () => {
  crimeTypes = Array.from({ length: 500 }, (_, i) => `Infração ${i} ${'á'.repeat(180)}`);
  assert.ok(Buffer.byteLength(JSON.stringify(body(crimeTypes))) > 100 * 1024);
  assert.equal(
    (await soldier.put('/api/settings').set('Origin', origin).send(body(crimeTypes))).status,
    403,
  );
  const r = await admin.put('/api/settings').set('Origin', origin).send(body(crimeTypes));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await SystemSetting.findOne({ key: 'general' })).crimeTypes.length, 500);
});
test('ocorrência e filtros aceitam nomes de crime acima de 100 caracteres preservando a seleção exata', async () => {
  const payload = (crimeType) => ({
    city: String(city._id),
    occurredAt: new Date().toISOString(),
    crimeType,
    address: 'Rua do crime pesquisado',
    description: 'Descrição válida de ocorrência com classificação extensa.',
    priority: 'Média',
    latitude: -5,
    longitude: -44,
  });
  for (const crime of crimeTypes.slice(-2)) {
    const r = await soldier.post('/api/occurrences').set('Origin', origin).send(payload(crime));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.crimeType, crime);
  }
  const filter = encodeURIComponent(crimeTypes.at(-1));
  const list = await admin.get(`/api/occurrences?crimeType=${filter}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 1);
  const map = await admin.get(`/api/occurrences/map?crimeType=${filter}`);
  assert.equal(map.status, 200);
  assert.equal(map.body.items.length, 1);
  assert.equal(map.body.items[0].crimeType, crimeTypes.at(-1));
});
test('limites de 500 tipos e 200 caracteres são validados sem corromper a lista existente', async () => {
  assert.equal(
    (
      await admin
        .put('/api/settings')
        .set('Origin', origin)
        .send(body([...crimeTypes, 'Crime extra']))
    ).status,
    422,
  );
  assert.equal(
    (
      await admin
        .put('/api/settings')
        .set('Origin', origin)
        .send(body(['x'.repeat(201)]))
    ).status,
    422,
  );
  assert.equal((await SystemSetting.findOne({ key: 'general' })).crimeTypes.length, 500);
});
