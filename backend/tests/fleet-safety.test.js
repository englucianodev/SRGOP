import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { io as connect } from 'socket.io-client';
import { createApp } from '../app.js';
import {
  User,
  City,
  Crew,
  CrewShift,
  Vehicle,
  VehicleHandover,
  Occurrence,
  Notification,
  DailyOfficer,
  Emergency,
  SystemSetting,
} from '../models/index.js';
import { expireShifts } from '../services/operations.js';
import { serviceWindow } from '../utils/time.js';
import { roundHour } from '../utils/duty.js';
import { configureSocket } from '../services/realtime.js';
import { inspected } from './inspection-fixture.js';
let mongo,
  app,
  city,
  secondCity,
  deletedCity,
  admin,
  cpu,
  driver,
  replacement,
  biker,
  mate,
  offDuty,
  vehicle,
  moto,
  crew,
  motoCrew;
const origin = 'http://localhost:5173',
  password = 'FrotaTeste!2026';
const post = (agent, url, body = {}) => agent.post(`/api${url}`).set('Origin', origin).send(body);
async function account(name, role = 'Praça') {
  const user = await User.create({
    name,
    email: `${name}@fleet.local`,
    city: city._id,
    role,
    active: true,
    password: await bcrypt.hash(password, 4),
  });
  const agent = request.agent(app);
  const r = await post(agent, '/auth/login', { email: user.email, password });
  assert.equal(r.status, 200);
  return { user, agent, cookie: r.headers['set-cookie'].map((v) => v.split(';')[0]).join('; ') };
}
before(async () => {
  process.env.JWT_SECRET = 'chave_teste_frota_checklist_urgencia_123456789';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(mongo.getUri('fleet_safety'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
  [city, secondCity, deletedCity] = await City.create([
    { name: 'Cidade S10', latitude: -5.2, longitude: -44.4 },
    { name: 'Cidade nova', latitude: -5.3, longitude: -44.5 },
    { name: 'Cidade a excluir', latitude: -5.4, longitude: -44.6 },
  ]);
  await SystemSetting.create({ key: 'general' });
  admin = await account('Administrador', 'Administrativo');
  cpu = await account('OficialCPU', 'Oficial');
  driver = await account('Motorista');
  replacement = await account('Substituto');
  biker = await account('Motociclista');
  mate = await account('Apoio');
  offDuty = await account('ForaServico');
  await DailyOfficer.create({ day: serviceWindow().day, officer: cpu.user._id });
  vehicle = await Vehicle.create({
    prefix: 'S10-REAL',
    plate: 'ABC1D23',
    city: city._id,
    brand: 'Chevrolet',
    model: 'S10',
    year: 2024,
    type: 'Caminhonete',
    mileage: 1000,
  });
  moto = await Vehicle.create({
    prefix: 'MOTO-REAL',
    plate: 'DEF4G56',
    city: city._id,
    brand: 'Honda',
    model: 'XRE',
    year: 2023,
    type: 'Motocicleta',
    mileage: 50,
  });
  crew = await Crew.create({ name: 'Equipe S10', city: city._id, vehicle: vehicle._id });
  motoCrew = await Crew.create({ name: 'Equipe Moto', city: city._id, vehicle: moto._id });
  await Vehicle.updateOne({ _id: vehicle._id }, { crew: crew._id });
  await Vehicle.updateOne({ _id: moto._id }, { crew: motoCrew._id });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('exclusão de município é administrativa e preserva referências históricas', async () => {
  const row = await Occurrence.create({
    protocol: 'HISTORICO-CIDADE',
    city: deletedCity._id,
    occurredAt: new Date(),
    crimeType: 'Furto',
    address: 'Rua antiga',
    description: 'Histórico de cidade removida dos atendidos.',
    priority: 'Baixa',
    createdBy: admin.user._id,
  });
  assert.equal(
    (await driver.agent.delete(`/api/cities/${deletedCity._id}`).set('Origin', origin)).status,
    403,
  );
  assert.equal(
    (await admin.agent.delete(`/api/cities/${deletedCity._id}`).set('Origin', origin)).status,
    200,
  );
  assert.ok(
    !(await admin.agent.get('/api/cities')).body.some((c) => c._id === String(deletedCity._id)),
  );
  assert.equal((await Occurrence.findById(row._id).populate('city')).city.name, deletedCity.name);
});
test('provisionamento cria S10 provisória para cidade sem S10 e pode ser repetido sem duplicar', async () => {
  const r = await post(admin.agent, '/vehicles/provision-defaults');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.created, 1);
  const pending = await Vehicle.findOne({ city: secondCity._id });
  assert.equal(pending.brand, 'Chevrolet');
  assert.equal(pending.model, 'S10');
  assert.equal(pending.type, 'Caminhonete');
  assert.equal(pending.provisional, true);
  assert.equal(pending.status, 'Indisponível');
  assert.equal(pending.year, undefined);
  const again = await post(admin.agent, '/vehicles/provision-defaults');
  assert.equal(again.body.created, 0);
  assert.equal(await Vehicle.countDocuments({ city: secondCity._id }), 1);
  assert.equal((await Vehicle.findById(vehicle._id)).plate, 'ABC1D23');
});
test('recebimento exige seis itens, observação nas alterações e KM não decrescente', async () => {
  assert.equal((await post(driver.agent, `/crews/${crew._id}/join`, { driver: true })).status, 422);
  assert.equal(
    (
      await post(driver.agent, `/crews/${crew._id}/join`, {
        driver: true,
        checklist: { ...inspected(1000), body: { state: 'C/A', observation: '' } },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await post(driver.agent, `/crews/${crew._id}/join`, {
        driver: true,
        checklist: inspected(999),
      })
    ).status,
    409,
  );
  const r = await post(driver.agent, `/crews/${crew._id}/join`, {
    driver: true,
    checklist: { ...inspected(1000), body: { state: 'C/A', observation: 'Risco no para-choque.' } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const record = await VehicleHandover.findOne({ driver: driver.user._id });
  assert.equal(record.intake.mileage, 1000);
  assert.equal(record.intake.body.observation, 'Risco no para-choque.');
  assert.equal(
    (await admin.agent.delete(`/api/cities/${city._id}`).set('Origin', origin)).status,
    409,
  );
});
test('encerramento automático gera entrega obrigatória no próximo acesso e bloqueia novo serviço', async () => {
  await Crew.updateOne({ _id: crew._id }, { shiftEnd: new Date(Date.now() - 1000) });
  await expireShifts();
  const logged = request.agent(app);
  assert.equal(
    (await post(logged, '/auth/login', { email: driver.user.email, password })).status,
    200,
  );
  const pending = (await logged.get('/api/vehicle-checklists/pending')).body;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].pendingReturn, true);
  assert.equal((await Vehicle.findById(vehicle._id)).status, 'Indisponível');
  assert.equal(
    (await post(logged, `/crews/${crew._id}/join`, { driver: true, checklist: inspected(1000) }))
      .status,
    409,
  );
  assert.equal(
    (await post(replacement.agent, `/vehicle-checklists/${pending[0]._id}`, inspected(1010)))
      .status,
    404,
  );
  assert.equal(
    (await post(logged, `/vehicle-checklists/${pending[0]._id}`, inspected(999))).status,
    409,
  );
  assert.equal(
    (await post(logged, `/vehicle-checklists/${pending[0]._id}`, inspected(1010))).status,
    200,
  );
  assert.equal((await Vehicle.findById(vehicle._id)).mileage, 1010);
  assert.equal((await Vehicle.findById(vehicle._id)).status, 'Disponível');
  assert.ok((await VehicleHandover.findById(pending[0]._id)).closedAt);
  assert.equal(
    (
      await post(driver.agent, `/crews/${crew._id}/join`, {
        driver: true,
        checklist: inspected(1010),
      })
    ).status,
    200,
  );
});
test('troca de motorista exige entrega anterior e recebimento pelo novo condutor', async () => {
  assert.equal(
    (await post(replacement.agent, `/crews/${crew._id}/join`, { driver: false })).status,
    200,
  );
  const r = await post(cpu.agent, `/crews/${crew._id}/members`, {
    member: String(replacement.user._id),
    action: 'Motorista',
    reason: 'Troca autorizada para teste de checklist.',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const old = (await driver.agent.get('/api/vehicle-checklists/pending')).body[0],
    incoming = (await replacement.agent.get('/api/vehicle-checklists/pending')).body[0];
  assert.ok(old.pendingReturn);
  assert.ok(incoming.pendingIntake);
  assert.equal(
    (await post(replacement.agent, `/vehicle-checklists/${incoming._id}`, inspected(1010))).status,
    409,
  );
  assert.equal(
    (await post(driver.agent, `/vehicle-checklists/${old._id}`, inspected(1020))).status,
    200,
  );
  assert.equal(
    (await post(replacement.agent, `/vehicle-checklists/${incoming._id}`, inspected(1010))).status,
    409,
  );
  assert.equal(
    (await post(replacement.agent, `/vehicle-checklists/${incoming._id}`, inspected(1020))).status,
    200,
  );
  assert.equal((await Crew.findById(crew._id)).inspectionBlocked, false);
});
test('motocicleta exige turno e continua em serviço sem prazo de 24h', async () => {
  assert.equal(
    (
      await post(biker.agent, `/crews/${motoCrew._id}/join`, {
        driver: true,
        checklist: inspected(50),
      })
    ).status,
    422,
  );
  const before = Date.now();
  const r = await post(biker.agent, `/crews/${motoCrew._id}/join`, {
    driver: true,
    dutyPeriod: 'Manhã',
    checklist: inspected(50),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.shiftMode, 'Motocicleta');
  assert.equal(r.body.shiftEnd, null);
  assert.ok(+new Date(r.body.shiftStart) >= before);
  await expireShifts();
  assert.equal(String((await User.findById(biker.user._id)).crew), String(motoCrew._id));
  assert.equal(
    (await post(mate.agent, `/crews/${motoCrew._id}/join`, { driver: false, dutyPeriod: 'Noite' }))
      .status,
    409,
  );
  assert.equal(
    (await post(mate.agent, `/crews/${motoCrew._id}/join`, { driver: false, dutyPeriod: 'Manhã' }))
      .status,
    200,
  );
});
test('motocicletas participam de ocorrências automáticas, GPS e avisos ao CPU', async () => {
  const r = await post(biker.agent, '/occurrences', {
    city: String(city._id),
    occurredAt: new Date().toISOString(),
    crimeType: 'Furto',
    address: 'Rua da motocicleta',
    description: 'Ocorrência de teste com atendimento da equipe de motocicleta.',
    priority: 'Alta',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'Em atendimento');
  assert.equal(
    await Notification.countDocuments({
      occurrence: r.body._id,
      user: cpu.user._id,
      kind: 'automatico',
    }),
    1,
  );
  const gps = await biker.agent
    .patch(`/api/crews/${motoCrew._id}/gps`)
    .set('Origin', origin)
    .send({ enabled: true, latitude: -5.25, longitude: -44.45, accuracy: 8 });
  assert.equal(gps.status, 200);
  assert.equal(
    (
      await post(biker.agent, `/attendances/${r.body._id}/close`, {
        summary: 'Atendimento da motocicleta concluído.',
      })
    ).status,
    200,
  );
});
test('saída da motocicleta registra horários reais e arredondados e exige entrega do motorista', async () => {
  assert.equal((await post(biker.agent, `/crews/${motoCrew._id}/leave`)).status, 422);
  assert.equal(
    (await post(biker.agent, `/crews/${motoCrew._id}/leave`, { checklist: inspected(49) })).status,
    409,
  );
  assert.equal(
    (await post(biker.agent, `/crews/${motoCrew._id}/leave`, { checklist: inspected(55) })).status,
    200,
  );
  assert.equal((await User.findById(biker.user._id)).crew, null);
  assert.equal((await post(mate.agent, `/crews/${motoCrew._id}/leave`)).status, 200);
  const crew = await Crew.findById(motoCrew._id),
    shift = await CrewShift.findById(crew.shift);
  assert.ok(shift.end);
  assert.equal(+shift.roundedEnd, +roundHour(shift.end));
  assert.equal(+shift.roundedStart, +roundHour(shift.start));
  assert.ok(shift.changes.filter((c) => c.action === 'Saída').every((c) => c.roundedAt));
  assert.equal(roundHour('2026-10-25T08:29:59-03:00').toISOString(), '2026-10-25T11:00:00.000Z');
  assert.equal(roundHour('2026-10-25T08:30:00-03:00').toISOString(), '2026-10-25T12:00:00.000Z');
});
test('Urgência UU é exclusiva de quem está em serviço, alcança todas as equipes e o CPU com prioridade máxima', async () => {
  assert.equal((await post(offDuty.agent, '/emergencies')).status, 403);
  assert.equal(
    (await post(mate.agent, `/crews/${motoCrew._id}/join`, { driver: false, dutyPeriod: 'Tarde' }))
      .status,
    200,
  );
  const r = await post(replacement.agent, '/emergencies', {
    latitude: -5.26,
    longitude: -44.46,
    accuracy: 7,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const notices = await Notification.find({ emergency: r.body._id });
  assert.deepEqual(
    notices.map((n) => String(n.user)).sort(),
    [
      String(driver.user._id),
      String(replacement.user._id),
      String(mate.user._id),
      String(cpu.user._id),
    ].sort(),
  );
  assert.ok(notices.every((n) => n.priority === 'Máxima' && n.kind === 'urgencia'));
  assert.equal(r.body.cityName, city.name);
  assert.equal(r.body.latitude, -5.26);
  assert.equal((await post(replacement.agent, '/emergencies')).status, 200);
  assert.equal(
    await Emergency.countDocuments({ actor: replacement.user._id, resolvedAt: null }),
    1,
  );
  assert.equal((await offDuty.agent.get(`/api/emergencies/${r.body._id}`)).status, 403);
  assert.equal((await mate.agent.get(`/api/emergencies/${r.body._id}`)).status, 200);
  assert.equal((await post(mate.agent, `/emergencies/${r.body._id}/acknowledge`)).status, 200);
  assert.equal((await Emergency.findById(r.body._id)).resolvedAt, null);
  assert.equal(
    (await post(offDuty.agent, `/emergencies/${r.body._id}/resolve`, { reason: 'Não autorizado' }))
      .status,
    403,
  );
  assert.equal(
    (
      await post(cpu.agent, `/emergencies/${r.body._id}/resolve`, {
        reason: 'Apoio prestado e situação controlada.',
      })
    ).status,
    200,
  );
});
test('Socket.IO entrega Urgência UU aos policiais em serviço sem emitir despacho nem alertar quem está fora', async () => {
  const server = createServer(app),
    io = configureSocket(server, [origin]),
    sockets = [];
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const open = async (person) => {
    const socket = connect(`http://127.0.0.1:${server.address().port}`, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Origin: origin, Cookie: person.cookie },
    });
    sockets.push(socket);
    const ready = once(socket, 'connect', { signal: AbortSignal.timeout(5000) });
    socket.connect();
    await ready;
    return socket;
  };
  try {
    const receiver = await open(mate),
      outside = await open(offDuty),
      leaks = [];
    outside.on('emergency:changed', (e) => leaks.push(e));
    outside.on('notification', (e) => leaks.push(e));
    receiver.on('dispatch:new', (e) => leaks.push(e));
    const event = once(receiver, 'emergency:changed', { signal: AbortSignal.timeout(5000) });
    const notice = once(receiver, 'notification', { signal: AbortSignal.timeout(5000) });
    const r = await post(replacement.agent, '/emergencies');
    assert.equal(r.status, 201);
    assert.equal((await event)[0].emergencyId, r.body._id);
    assert.equal((await notice)[0].priority, 'Máxima');
    assert.deepEqual(leaks, []);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise((resolve) => io.close(resolve));
  }
});
