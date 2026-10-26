import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import {
  User,
  City,
  Crew,
  CrewShift,
  Vehicle,
  VehicleHandover,
  SystemSetting,
} from '../models/index.js';
import { inspected } from './inspection-fixture.js';
let mongo, app, admin, officer, soldier, driver, v1, v2, city, shift;
const origin = 'http://localhost:5173',
  password = 'RelatorioViaturas!2026';
const date = (value) => new Date(`${value}-03:00`);
const query = 'from=2026-10-21&to=2026-10-21';
const report = (agent = admin, extra = '') => agent.get(`/api/reports/vehicles?${query}${extra}`);
before(async () => {
  process.env.JWT_SECRET = 'chave_teste_relatorio_de_viaturas_1234567890';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri('vehicle_reports'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
  city = await City.create({ name: 'Município atual', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  const users = await User.create(
    ['Administrativo', 'Oficial', 'Praça'].map((role, i) => ({
      name: `Relator ${i}`,
      email: `relator${i}@vehicle.local`,
      city: city._id,
      role,
      active: true,
      password: bcrypt.hashSync(password, 4),
    })),
  );
  const agents = [];
  for (const u of users) {
    const agent = request.agent(app);
    assert.equal(
      (await agent.post('/api/auth/login').set('Origin', origin).send({ email: u.email, password }))
        .status,
      200,
    );
    agents.push(agent);
  }
  [admin, officer, soldier] = agents;
  driver = await User.create({
    name: 'Nome civil do condutor',
    callSign: 'Alves',
    rank: 'Cabo',
    email: 'condutor@vehicle.local',
    password: bcrypt.hashSync(password, 4),
    role: 'Praça',
    active: false,
    city: city._id,
  });
  [v1, v2] = await Vehicle.create([
    {
      prefix: 'VTR-1800',
      plate: 'DEMO0100',
      city: city._id,
      brand: 'Chevrolet',
      model: 'S10',
      mileage: 120,
    },
    {
      prefix: 'MOTO-1801',
      plate: 'MOT1D23',
      city: city._id,
      type: 'Motocicleta',
      brand: 'Honda',
      model: 'XRE',
      mileage: 50,
    },
  ]);
  const crew = await Crew.create({ name: 'Nome atual da equipe', city: city._id });
  shift = await CrewShift.create({
    crew: crew._id,
    crewName: 'Guarnição histórica',
    city: city._id,
    cityName: 'Município do serviço',
    start: date('2026-10-20T08:00:00'),
    plannedEnd: date('2026-10-21T08:00:00'),
  });
  const record = (vehicle, extra) =>
    VehicleHandover.create({
      vehicle: vehicle._id,
      crew: crew._id,
      shift: shift._id,
      driver: driver._id,
      ...extra,
    });
  const electrical = {
    ...inspected(110),
    electrical: { state: 'C/A', observation: 'Falha no farol registrada na entrega.' },
    at: date('2026-10-21T08:00:00'),
  };
  await record(v1, {
    intake: { ...inspected(100), at: date('2026-10-20T23:59:59') },
    delivery: electrical,
    closedAt: date('2026-10-21T08:00:00'),
  });
  await record(v1, {
    intake: {
      ...inspected(110),
      body: { state: 'C/A', observation: '  =HYPERLINK("teste");\nAmassado na porta' },
      at: date('2026-10-21T00:00:00'),
    },
    delivery: { ...inspected(120), at: date('2026-10-21T23:59:59.999') },
    closedAt: date('2026-10-21T23:59:59.999'),
  });
  await record(v1, {
    intake: { ...inspected(120), at: date('2026-10-22T00:00:00') },
    closedAt: date('2026-10-22T01:00:00'),
  });
  await record(v2, {
    intake: {
      ...inspected(50),
      engine: { state: 'C/A', observation: 'Ruído no motor durante o recebimento.' },
      at: date('2026-10-21T09:00:00'),
    },
    pendingReturn: true,
  });
  await record(v2, { pendingIntake: true });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('relatório de viaturas é restrito a Oficial e Administrativo', async () => {
  assert.equal((await request(app).get(`/api/reports/vehicles?${query}`)).status, 401);
  assert.equal((await report(soldier)).status, 403);
  assert.equal((await report(officer)).status, 200);
  assert.equal((await report()).status, 200);
});
test('período usa cada inspeção em Fortaleza e não cria checklist de entrega pendente', async () => {
  const r = await report();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.totals, {
    vehicles: 2,
    checklists: 4,
    intake: 2,
    delivery: 2,
    withChanges: 3,
    alterations: 3,
  });
  const vehicle = r.body.vehicles.find((v) => v._id === String(v1._id));
  assert.equal(vehicle.checklists.length, 3);
  assert.equal(vehicle.checklists[0].at, date('2026-10-21T00:00:00').toISOString());
  assert.equal(vehicle.checklists.at(-1).at, date('2026-10-21T23:59:59.999').toISOString());
  const moto = r.body.vehicles.find((v) => v._id === String(v2._id));
  assert.equal(moto.checklists.length, 1);
  assert.equal(moto.checklists[0].phase, 'intake');
  assert.equal(
    moto.checklists[0].items.find((i) => i.key === 'engine').observation,
    'Ruído no motor durante o recebimento.',
  );
});
test('registros identificam policial militar, guarnição histórica, KM e seis condições com observações', async () => {
  const r = await report(admin, `&vehicles=${v1._id}`);
  assert.equal(r.body.vehicles.length, 1);
  const items = r.body.vehicles[0].checklists;
  assert.ok(
    items.every(
      (c) =>
        c.officer === 'Cabo Alves' &&
        c.crew === 'Guarnição histórica' &&
        c.serviceCity === 'Município do serviço' &&
        c.items.length === 6,
    ),
  );
  const delivery = items.find((c) =>
    c.items.some((i) => i.key === 'electrical' && i.state === 'C/A'),
  );
  assert.equal(delivery.mileage, 110);
  assert.equal(delivery.phase, 'delivery');
  assert.match(delivery.items.find((i) => i.key === 'electrical').observation, /farol/);
  assert.equal(r.body.vehicles[0].city, 'Município atual');
});
test('filtros de viaturas, fase e apenas alterações usam os mesmos registros', async () => {
  let r = await report(admin, `&vehicles=${v1._id}&phase=intake`);
  assert.equal(r.body.totals.checklists, 1);
  assert.equal(r.body.totals.delivery, 0);
  r = await report(
    admin,
    `&vehicles=${String(v1._id).toUpperCase()},${v1._id}&phase=delivery&changesOnly=true`,
  );
  assert.equal(r.body.totals.vehicles, 1);
  assert.equal(r.body.totals.checklists, 1);
  assert.equal(r.body.totals.alterations, 1);
  r = await report(admin, '&changesOnly=true');
  assert.equal(r.body.totals.checklists, 3);
  assert.ok(r.body.vehicles.flatMap((v) => v.checklists).every((c) => c.alterations > 0));
  r = await admin.get(`/api/reports/vehicles?from=2026-10-01&to=2026-10-01&vehicles=${v2._id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.vehicles.length, 1);
  assert.equal(r.body.totals.checklists, 0);
});
test('datas, identificadores e filtros inválidos são rejeitados', async () => {
  for (const qs of [
    'from=2026-10-32&to=2026-10-21',
    'from=2026-10-22&to=2026-10-21',
    `${query}&vehicles=inválido`,
    `${query}&vehicles=${new mongoose.Types.ObjectId()}`,
    `${query}&phase=hack`,
    `${query}&changesOnly=1`,
    `${query}&format=pdf`,
    `${query}&vehicles=a&vehicles=b`,
  ])
    assert.equal((await admin.get(`/api/reports/vehicles?${qs}`)).status, 422, qs);
});
test('CSV contém os seis itens e neutraliza fórmulas sem perder observações', async () => {
  const r = await report(admin, `&vehicles=${v1._id}&format=csv`);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/csv/);
  assert.match(r.headers['content-disposition'], /srgop-checklists-viaturas/);
  assert.equal((r.text.match(/"Lataria"/g) || []).length, 3);
  assert.equal((r.text.match(/"Freios"/g) || []).length, 3);
  assert.match(r.text, /Cabo Alves/);
  assert.match(r.text, /Falha no farol/);
  assert.ok(r.text.includes("'  =HYPERLINK("));
  assert.ok(r.text.includes('""teste""'));
  assert.match(r.text, /Guarnição histórica/);
  const filtered = await report(
    admin,
    `&vehicles=${v1._id}&phase=delivery&changesOnly=true&format=csv`,
  );
  assert.equal((filtered.text.match(/"Lataria"/g) || []).length, 1);
  assert.match(filtered.text, /Falha no farol/);
  assert.doesNotMatch(filtered.text, /Amassado na porta/);
});
test('ausência de usuário atual não elimina checklist nem observação histórica', async () => {
  await User.deleteOne({ _id: driver._id });
  const r = await report();
  assert.equal(r.status, 200);
  assert.equal(r.body.totals.checklists, 4);
  assert.ok(
    r.body.vehicles
      .flatMap((v) => v.checklists)
      .every((c) => c.officer === 'Policial não disponível'),
  );
});
