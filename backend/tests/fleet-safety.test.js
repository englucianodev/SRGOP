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
import { provisionDemoCrews } from '../services/demoCrews.js';
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
    motorcycle: String(moto._id),
    motorcycleRole: 'Piloto',
    motorcycles: [{ vehicle: String(moto._id), checklist: inspected(50) }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.shiftMode, 'Motocicleta');
  assert.equal(r.body.shiftEnd, null);
  assert.ok(+new Date(r.body.shiftStart) >= before);
  await expireShifts();
  assert.equal(String((await User.findById(biker.user._id)).crew), String(motoCrew._id));
  assert.equal(
    (
      await post(mate.agent, `/crews/${motoCrew._id}/join`, {
        driver: false,
        dutyPeriod: 'Noite',
        motorcycle: String(moto._id),
        motorcycleRole: 'Garupa',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await post(mate.agent, `/crews/${motoCrew._id}/join`, {
        driver: false,
        dutyPeriod: 'Manhã',
        motorcycle: String(moto._id),
        motorcycleRole: 'Garupa',
      })
    ).status,
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
    (
      await post(mate.agent, `/crews/${motoCrew._id}/join`, {
        driver: false,
        dutyPeriod: 'Tarde',
        motorcycle: String(moto._id),
        motorcycleRole: 'Garupa',
      })
    ).status,
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

test('KM menor é permitido apenas ao Administrativo, inclusive durante serviço', async () => {
  const patch = (agent, path, body) => agent.patch(`/api${path}`).set('Origin', origin).send(body);
  assert.equal(
    (await patch(cpu.agent, `/vehicles/${vehicle._id}/mileage`, { mileage: 10 })).status,
    403,
  );
  assert.equal(
    (await patch(admin.agent, `/vehicles/${vehicle._id}/mileage`, { mileage: 10 })).status,
    200,
  );
  assert.equal((await Vehicle.findById(vehicle._id)).mileage, 10);
  assert.equal(
    (
      await patch(cpu.agent, `/vehicles/${vehicle._id}/location`, {
        latitude: -5,
        longitude: -44,
        mileage: 9,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await patch(cpu.agent, `/vehicles/${vehicle._id}/location`, {
        latitude: -5,
        longitude: -44,
        mileage: 10,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await patch(admin.agent, `/vehicles/${vehicle._id}/location`, {
        latitude: -5,
        longitude: -44,
        mileage: 2,
      })
    ).status,
    200,
  );
  assert.equal(
    (await patch(admin.agent, `/vehicles/${vehicle._id}/mileage`, { mileage: -1 })).status,
    422,
  );
});

test('pré-seleção usa o checklist mais recente por veículo, incluindo C/A e observação', async () => {
  const fresh = await Vehicle.create({
    prefix: 'PREFILL',
    plate: 'PRE1F23',
    city: city._id,
    mileage: 321,
  });
  let r = await driver.agent.get(`/api/vehicle-checklists/defaults?vehicle=${fresh._id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.inspection, null);
  assert.equal(r.body.mileage, 321);
  const intake = inspected(321);
  intake.body = { state: 'C/A', observation: 'Amassado na porta' };
  await VehicleHandover.create({
    crew: crew._id,
    shift: (await Crew.findById(crew._id)).shift,
    vehicle: fresh._id,
    driver: driver.user._id,
    intake: { ...intake, at: new Date(Date.now() - 1000) },
    delivery: { ...inspected(322), at: new Date() },
    closedAt: new Date(),
  });
  r = await driver.agent.get(`/api/vehicle-checklists/defaults?vehicle=${fresh._id}`);
  assert.equal(r.body.inspection.body.state, 'S/A');
  const last = { ...intake, at: new Date(Date.now() + 1000) };
  const row = await VehicleHandover.create({
    crew: crew._id,
    shift: (await Crew.findById(crew._id)).shift,
    vehicle: fresh._id,
    driver: driver.user._id,
    intake: last,
    closedAt: new Date(),
  });
  r = await driver.agent.get(`/api/vehicle-checklists/defaults?vehicle=${fresh._id}`);
  assert.equal(r.body.inspection.body.state, 'C/A');
  assert.equal(r.body.inspection.body.observation, 'Amassado na porta');
  await VehicleHandover.deleteMany({ vehicle: fresh._id });
  await fresh.deleteOne();
});

test('tipo da guarnição valida o veículo e cada piloto escolhe uma moto e garupa identifica sua motocicleta', async () => {
  const c = await City.create({
    name: 'Cidade dos motociclistas',
    latitude: -5.4,
    longitude: -44.6,
  });
  const make = async (name) => {
    const a = await account(name);
    await User.updateOne({ _id: a.user._id }, { city: c._id });
    return a;
  };
  const a = await make('RiderUm'),
    b = await make('RiderDois'),
    d = await make('RiderTres');
  const bikes = await Vehicle.create(
    [1, 2, 3].map((i) => ({
      prefix: `MOTO-${i}`,
      plate: `MOT00${i}0`,
      city: c._id,
      type: 'Motocicleta',
      mileage: 100,
    })),
  );
  const conventional = await Vehicle.create({
    prefix: 'SUV-TESTE',
    plate: 'SUV1D23',
    city: c._id,
    type: 'SUV',
  });
  let r = await post(admin.agent, '/crews', {
    name: 'Moto Tipo inválido',
    city: String(c._id),
    type: 'Motocicleta',
    vehicle: String(conventional._id),
  });
  assert.equal(r.status, 422);
  r = await post(admin.agent, '/crews', {
    name: 'Moto Multiveículos',
    city: String(c._id),
    type: 'Motocicleta',
    vehicle: null,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body._id;
  const input = (vehicles) => ({
    driver: true,
    dutyPeriod: 'Tarde',
    motorcycle: String(vehicles[0]._id),
    motorcycleRole: 'Piloto',
    motorcycles: vehicles.map((v) => ({ vehicle: String(v._id), checklist: inspected(v.mileage) })),
  });
  assert.equal(
    (await post(a.agent, `/crews/${id}/join`, { driver: true, dutyPeriod: 'Tarde' })).status,
    422,
  );
  assert.equal((await post(a.agent, `/crews/${id}/join`, input([conventional]))).status, 409);
  assert.equal((await post(a.agent, `/crews/${id}/join`, input([bikes[0], bikes[0]]))).status, 422);
  assert.equal((await User.findById(a.user._id)).crew, null);
  assert.equal((await post(a.agent, `/crews/${id}/join`, input([bikes[0], bikes[1]]))).status, 422);
  assert.equal((await post(a.agent, `/crews/${id}/join`, input([bikes[0]]))).status, 200);
  assert.equal(
    await VehicleHandover.countDocuments({ crew: id, driver: a.user._id, closedAt: null }),
    1,
  );
  assert.equal((await post(b.agent, `/crews/${id}/join`, input([bikes[1]]))).status, 200);
  assert.equal(
    (
      await post(d.agent, `/crews/${id}/join`, {
        driver: false,
        dutyPeriod: 'Tarde',
        motorcycle: String(bikes[0]._id),
        motorcycleRole: 'Garupa',
      })
    ).status,
    200,
  );
  const state = await Crew.findById(id);
  assert.equal(String(state.driver), String(a.user._id));
  assert.equal(state.members.length, 3);
  assert.equal(await VehicleHandover.countDocuments({ crew: id, closedAt: null }), 2);
  assert.equal((await Vehicle.findById(bikes[1]._id)).status, 'Em operação');
  assert.equal(String((await Vehicle.findById(bikes[1]._id)).crew), id);
  assert.equal((await CrewShift.findById(state.shift)).motorcycles.length, 2);
  const crewList = (await a.agent.get('/api/crews')).body.find((c) => c._id === id);
  assert.equal(crewList.type, 'Motocicleta');
  assert.equal(crewList.motorcycleDrivers.length, 2);
  assert.equal((await post(a.agent, `/crews/${id}/leave`)).status, 422);
  assert.equal(
    (
      await post(a.agent, `/crews/${id}/leave`, {
        checklists: [{ vehicle: String(bikes[1]._id), checklist: inspected(100) }],
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await post(a.agent, `/crews/${id}/leave`, {
        checklists: [{ vehicle: String(bikes[0]._id), checklist: inspected(101) }],
      })
    ).status,
    200,
  );
  assert.equal((await Vehicle.findById(bikes[0]._id)).status, 'Disponível');
  assert.equal(
    (await post(b.agent, `/crews/${id}/leave`, { checklist: inspected(101) })).status,
    200,
  );
  assert.equal((await post(d.agent, `/crews/${id}/leave`)).status, 200);
});

test('guarnições por município e identificadores DEMO são únicos, limitados e repetíveis', async () => {
  const { provisionDefaultFleet } = await import('../services/defaultFleet.js');
  await provisionDefaultFleet(admin.user);
  const first = await provisionDemoCrews(admin.user);
  assert.ok(first.createdCrews > 0);
  const active = await City.find({ active: true, deleted: { $ne: true } });
  for (const c of active) {
    const crew = await Crew.findOne({
      city: c._id,
      type: 'Viatura Convencional',
      vehicle: { $ne: null },
    });
    assert.ok(crew);
    assert.equal(String((await Vehicle.findById(crew.vehicle)).crew), String(crew._id));
  }
  const pickups = await Vehicle.find({
    type: 'Caminhonete',
    city: { $in: active.map((c) => c._id) },
  });
  assert.ok(
    pickups.every(
      (v) =>
        /^DEMO01[012]\d$/.test(v.plate) &&
        Number(v.plate.slice(4)) <= 120 &&
        Number(v.prefix.slice(4)) >= 1800 &&
        Number(v.prefix.slice(4)) <= 1820,
    ),
  );
  assert.equal(new Set(pickups.map((v) => v.plate)).size, pickups.length);
  const next = await provisionDemoCrews(admin.user);
  assert.equal(next.updatedVehicles, 0);
  assert.equal(next.createdCrews, 0);
  assert.equal(next.linkedCrews, 0);
  const provisional = pickups.find((v) => v.provisional);
  const linked = await Crew.findById(provisional.crew);
  const edited = await admin.agent
    .put(`/api/crews/${linked._id}`)
    .set('Origin', origin)
    .send({
      name: `${linked.name} revisada`,
      city: String(linked.city),
      vehicle: String(provisional._id),
      type: 'Viatura Convencional',
    });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
});

test('administrador pode reduzir KM nos checklists sem liberar redução para outros perfis', async () => {
  const c = await Crew.create({ name: 'Equipe de correção administrativa', city: city._id });
  const v = await Vehicle.create({
    prefix: 'KM-CORR',
    plate: 'KMC1D23',
    city: city._id,
    mileage: 900,
    crew: c._id,
  });
  c.vehicle = v._id;
  await c.save();
  const joined = await post(admin.agent, `/crews/${c._id}/join`, {
    driver: true,
    checklist: inspected(100),
  });
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  assert.equal((await Vehicle.findById(v._id)).mileage, 100);
  await post(cpu.agent, `/crews/${c._id}/end-shift`, {
    reason: 'Finalizar serviço para correção de KM.',
  });
  const pending = (await admin.agent.get('/api/vehicle-checklists/pending')).body;
  assert.equal(
    (await post(admin.agent, `/vehicle-checklists/${pending[0]._id}`, inspected(50))).status,
    200,
  );
  assert.equal((await Vehicle.findById(v._id)).mileage, 50);
});

test('administrador associa, troca e transfere viaturas somente após liberar o vínculo anterior', async () => {
  const v = await Vehicle.create({
    prefix: 'ASSOC-1',
    plate: 'ASC1D23',
    city: city._id,
    provisional: true,
    status: 'Indisponível',
    mileage: 100,
    latitude: -5,
    longitude: -44,
  });
  const spare = await Vehicle.create({
    prefix: 'ASSOC-2',
    plate: 'ASC2D34',
    city: secondCity._id,
    status: 'Em manutenção',
  });
  const a = await Crew.create({ name: 'Associação origem', city: city._id });
  const b = await Crew.create({ name: 'Associação destino', city: secondCity._id });
  const save = (agent, c, vehicle, cityId = c.city) =>
    agent
      .put(`/api/crews/${c._id}`)
      .set('Origin', origin)
      .send({
        name: c.name,
        city: String(cityId),
        type: 'Viatura Convencional',
        vehicle: vehicle ? String(vehicle) : null,
      });
  assert.equal((await save(cpu.agent, a, v._id)).status, 403);
  assert.equal((await save(admin.agent, a, v._id)).status, 200);
  assert.equal((await Vehicle.findById(v._id)).status, 'Indisponível');
  assert.equal((await save(admin.agent, b, v._id)).status, 409);
  assert.equal((await save(admin.agent, a, v._id, secondCity._id)).status, 409);
  const edit = {
    prefix: 'ASSOC-EDITADO',
    plate: 'ASC1D23',
    city: String(city._id),
    mileage: 100,
    status: 'Indisponível',
    type: 'Caminhonete',
    brand: 'Chevrolet',
    model: 'S10',
    year: 2024,
  };
  assert.equal(
    (await admin.agent.put(`/api/vehicles/${v._id}`).set('Origin', origin).send(edit)).status,
    200,
  );
  assert.equal(
    (
      await admin.agent
        .put(`/api/vehicles/${v._id}`)
        .set('Origin', origin)
        .send({ ...edit, city: String(secondCity._id) })
    ).status,
    409,
  );
  assert.equal((await save(admin.agent, a, spare._id)).status, 200);
  assert.equal((await Vehicle.findById(v._id)).crew, null);
  assert.equal(String((await Vehicle.findById(spare._id)).city), String(city._id));
  assert.equal((await Vehicle.findById(spare._id)).status, 'Em manutenção');
  assert.equal((await save(admin.agent, b, v._id)).status, 200);
  const moved = await Vehicle.findById(v._id);
  assert.equal(String(moved.city), String(secondCity._id));
  assert.equal(String(moved.crew), String(b._id));
  assert.equal(moved.latitude, undefined);
  assert.equal(String((await Crew.findById(b._id)).vehicle), String(v._id));
  assert.equal((await save(admin.agent, b, null)).status, 200);
  assert.equal((await Vehicle.findById(v._id)).crew, null);
  assert.equal((await Crew.findById(b._id)).vehicle, null);
});

test('reserva concorrente mantém uma única guarnição por viatura e detecta vínculo inverso', async () => {
  const v = await Vehicle.create({ prefix: 'ASSOC-RACE', plate: 'ASR1D23', city: city._id });
  const [a, b] = await Crew.create([
    { name: 'Reserva viatura A', city: city._id },
    { name: 'Reserva viatura B', city: secondCity._id },
  ]);
  const put = (c) =>
    admin.agent
      .put(`/api/crews/${c._id}`)
      .set('Origin', origin)
      .send({
        name: c.name,
        city: String(c.city),
        type: 'Viatura Convencional',
        vehicle: String(v._id),
      });
  const results = await Promise.all([put(a), put(b)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const claimed = await Vehicle.findById(v._id);
  assert.equal(await Crew.countDocuments({ vehicle: v._id }), 1);
  assert.equal(String((await Crew.findById(claimed.crew)).vehicle), String(v._id));
  await Vehicle.updateOne({ _id: v._id }, { crew: null });
  assert.equal((await put(String(claimed.crew) === String(a._id) ? b : a)).status, 409);
});

test('entrega pendente impede desassociar ou transferir a viatura', async () => {
  const v = await Vehicle.create({ prefix: 'ASSOC-PEND', plate: 'ASP1D23', city: city._id });
  const c = await Crew.create({
    name: 'Equipe entrega pendente de transferência',
    city: city._id,
    vehicle: v._id,
  });
  await Vehicle.updateOne({ _id: v._id }, { crew: c._id });
  const shift = await CrewShift.create({
    crew: c._id,
    start: new Date(),
    plannedEnd: serviceWindow().end,
  });
  const record = await VehicleHandover.create({
    crew: c._id,
    shift: shift._id,
    vehicle: v._id,
    driver: driver.user._id,
    intake: inspected(0),
    pendingReturn: true,
  });
  const r = await admin.agent
    .put(`/api/crews/${c._id}`)
    .set('Origin', origin)
    .send({ name: c.name, city: String(c.city), vehicle: null, type: 'Viatura Convencional' });
  assert.equal(r.status, 409);
  assert.equal(String((await Vehicle.findById(v._id)).crew), String(c._id));
  await record.deleteOne();
});

test('ingressos simultâneos permitem pilotos de motos diferentes e preservam motorista único na convencional', async () => {
  for (const type of ['Motocicleta', 'Viatura Convencional']) {
    const tag = type === 'Motocicleta' ? 'MotoRace' : 'ConvRace';
    const a = await account(`${tag}Um`),
      b = await account(`${tag}Dois`);
    const c = await Crew.create({ name: `Equipe ${tag}`, city: city._id, type });
    const bikes = await Vehicle.create(
      [1, 2].map((i) => ({
        prefix: `${tag}-${i}`,
        plate: `${tag === 'MotoRace' ? 'MRC' : 'CRC'}${i}D23`,
        city: city._id,
        type: type === 'Motocicleta' ? 'Motocicleta' : 'Caminhonete',
        mileage: 50,
      })),
    );
    if (type !== 'Motocicleta') {
      c.vehicle = bikes[0]._id;
      await c.save();
      await Vehicle.updateOne({ _id: bikes[0]._id }, { crew: c._id });
    }
    const body = (i) =>
      type === 'Motocicleta'
        ? {
            driver: true,
            dutyPeriod: 'Noite',
            motorcycle: String(bikes[i]._id),
            motorcycleRole: 'Piloto',
            motorcycles: [{ vehicle: String(bikes[i]._id), checklist: inspected(50) }],
          }
        : { driver: true, checklist: inspected(50) };
    const results = await Promise.all([
      post(a.agent, `/crews/${c._id}/join`, body(0)),
      post(b.agent, `/crews/${c._id}/join`, body(1)),
    ]);
    assert.deepEqual(
      results.map((r) => r.status),
      [200, 200],
    );
    const active = await Crew.findById(c._id);
    assert.equal(active.members.length, 2);
    assert.ok([String(a.user._id), String(b.user._id)].includes(String(active.driver)));
    const records = await VehicleHandover.find({ crew: c._id, closedAt: null });
    assert.equal(records.length, type === 'Motocicleta' ? 2 : 1);
    assert.ok(records.some((r) => String(r.driver) === String(active.driver)));
    if (type === 'Motocicleta') {
      assert.equal((await CrewShift.findById(active.shift)).motorcycles.length, 2);
      assert.equal(
        await Vehicle.countDocuments({
          _id: { $in: bikes.map((v) => v._id) },
          status: 'Disponível',
          crew: null,
        }),
        0,
      );
    }
  }
});

test('duas equipes de moto não podem receber a mesma motocicleta', async () => {
  const a = await account('MotoUnicaEquipeUm'),
    b = await account('MotoUnicaEquipeDois');
  const [one, two] = await Crew.create([
    { name: 'Moto única A', city: city._id, type: 'Motocicleta' },
    { name: 'Moto única B', city: city._id, type: 'Motocicleta' },
  ]);
  const bike = await Vehicle.create({
    prefix: 'MOTO-UNICA',
    plate: 'MUN1D23',
    city: city._id,
    type: 'Motocicleta',
    mileage: 1,
  });
  const body = {
    driver: true,
    dutyPeriod: 'Manhã',
    motorcycle: String(bike._id),
    motorcycleRole: 'Piloto',
    motorcycles: [{ vehicle: String(bike._id), checklist: inspected(1) }],
  };
  const result = await Promise.all([
    post(a.agent, `/crews/${one._id}/join`, body),
    post(b.agent, `/crews/${two._id}/join`, body),
  ]);
  assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await VehicleHandover.countDocuments({ vehicle: bike._id, closedAt: null }), 1);
});

test('cada moto aceita no máximo um piloto e um garupa, com função e veículo obrigatórios', async () => {
  const a = await account('OcupPiloto'),
    b = await account('OcupGarupa'),
    x = await account('OcupExtra');
  const c = await Crew.create({
    name: 'Capacidade de motocicleta',
    city: city._id,
    type: 'Motocicleta',
  });
  const v = await Vehicle.create({
    prefix: 'MOTO-CAP',
    plate: 'MCA1D23',
    city: city._id,
    type: 'Motocicleta',
    mileage: 10,
  });
  const input = (role) => ({
    driver: role === 'Piloto',
    dutyPeriod: 'Manhã',
    motorcycle: String(v._id),
    motorcycleRole: role,
    ...(role === 'Piloto' ? { checklist: inspected(10) } : {}),
  });
  assert.equal(
    (
      await post(a.agent, `/crews/${c._id}/join`, {
        driver: true,
        dutyPeriod: 'Manhã',
        motorcycle: String(v._id),
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await post(a.agent, `/crews/${c._id}/join`, {
        driver: true,
        dutyPeriod: 'Manhã',
        motorcycleRole: 'Piloto',
      })
    ).status,
    422,
  );
  assert.equal((await post(b.agent, `/crews/${c._id}/join`, input('Garupa'))).status, 200);
  assert.equal(await VehicleHandover.countDocuments({ crew: c._id, closedAt: null }), 0);
  assert.equal((await post(x.agent, `/crews/${c._id}/join`, input('Garupa'))).status, 409);
  assert.equal(
    (
      await post(x.agent, `/crews/${c._id}/join`, {
        ...input('Garupa'),
        motorcycle: String(v._id).toUpperCase(),
      })
    ).status,
    409,
  );
  assert.equal((await post(a.agent, `/crews/${c._id}/join`, input('Piloto'))).status, 200);
  assert.equal((await post(x.agent, `/crews/${c._id}/join`, input('Piloto'))).status, 409);
  assert.equal((await User.findById(x.user._id)).crew, null);
  const state = await Crew.findById(c._id);
  assert.equal(state.members.length, 2);
  assert.equal(state.motorcycleSeats.length, 2);
  assert.deepEqual(state.motorcycleSeats.map((s) => s.role).sort(), ['Garupa', 'Piloto']);
  const options = (await x.agent.get(`/api/crews/${c._id}/motorcycles`)).body.find(
    (m) => m._id === String(v._id),
  );
  assert.equal(options.occupants, 2);
  assert.equal(options.pilotOccupied, true);
  assert.equal(options.passengerOccupied, true);
  assert.equal(
    (await post(a.agent, `/crews/${c._id}/leave`, { checklist: inspected(11) })).status,
    200,
  );
  assert.equal(String((await Vehicle.findById(v._id)).crew), String(c._id));
  assert.equal((await Crew.findById(c._id)).motorcycleSeats[0].role, 'Garupa');
  assert.equal((await post(b.agent, `/crews/${c._id}/leave`)).status, 200);
  assert.equal((await Vehicle.findById(v._id)).crew, null);
});

test('disputa simultânea por vaga de garupa não ultrapassa dois ocupantes nem duplica função', async () => {
  const [pilot, a, b] = await Promise.all([
    account('VagaPiloto'),
    account('VagaGarupaUm'),
    account('VagaGarupaDois'),
  ]);
  const c = await Crew.create({ name: 'Disputa por garupa', city: city._id, type: 'Motocicleta' });
  const v = await Vehicle.create({
    prefix: 'MOTO-VAGA',
    plate: 'MVG1D23',
    city: city._id,
    type: 'Motocicleta',
    mileage: 2,
  });
  const base = {
    driver: true,
    dutyPeriod: 'Noite',
    motorcycle: String(v._id),
    motorcycleRole: 'Piloto',
    checklist: inspected(2),
  };
  assert.equal((await post(pilot.agent, `/crews/${c._id}/join`, base)).status, 200);
  const body = {
    driver: false,
    dutyPeriod: 'Noite',
    motorcycle: String(v._id),
    motorcycleRole: 'Garupa',
  };
  const result = await Promise.all([
    post(a.agent, `/crews/${c._id}/join`, body),
    post(b.agent, `/crews/${c._id}/join`, body),
  ]);
  assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
  const state = await Crew.findById(c._id);
  assert.equal(state.members.length, 2);
  assert.equal(state.motorcycleSeats.filter((s) => s.role === 'Garupa').length, 1);
  assert.equal(await VehicleHandover.countDocuments({ crew: c._id, closedAt: null }), 1);
});

test('guarnição convencional limita quatro integrantes incluindo motorista sob concorrência', async () => {
  const members = [];
  for (let i = 0; i < 5; i++) members.push(await account(`LotacaoConv${i}`));
  const c = await Crew.create({
    name: 'Limite quatro na convencional',
    city: city._id,
    type: 'Viatura Convencional',
  });
  const v = await Vehicle.create({
    prefix: 'VTR-CAP',
    plate: 'VCA1D23',
    city: city._id,
    mileage: 20,
    crew: c._id,
  });
  c.vehicle = v._id;
  await c.save();
  for (let i = 0; i < 3; i++)
    assert.equal(
      (await post(members[i].agent, `/crews/${c._id}/join`, { driver: false })).status,
      200,
    );
  assert.equal(
    (await post(members[3].agent, `/crews/${c._id}/join`, { driver: false })).status,
    409,
  );
  const result = await Promise.all([
    post(members[3].agent, `/crews/${c._id}/join`, { driver: true, checklist: inspected(20) }),
    post(members[4].agent, `/crews/${c._id}/join`, { driver: false }),
  ]);
  assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
  const state = await Crew.findById(c._id);
  assert.equal(state.members.length, 4);
  assert.equal(String(state.driver), String(members[3].user._id));
  assert.equal(
    await User.countDocuments({ _id: { $in: members.map((m) => m.user._id) }, crew: c._id }),
    4,
  );
  assert.equal(await VehicleHandover.countDocuments({ crew: c._id, closedAt: null }), 1);
});

test('fim do turno libera vagas das motos e mantém entregas pendentes somente para pilotos', async () => {
  const pilot = await account('FimMotoPiloto'),
    passenger = await account('FimMotoGarupa');
  const c = await Crew.create({
    name: 'Encerramento de moto ocupada',
    city: city._id,
    type: 'Motocicleta',
  });
  const v = await Vehicle.create({
    prefix: 'MOTO-FIM',
    plate: 'MFI1D23',
    city: city._id,
    type: 'Motocicleta',
    mileage: 30,
  });
  assert.equal(
    (
      await post(pilot.agent, `/crews/${c._id}/join`, {
        driver: true,
        dutyPeriod: 'Tarde',
        motorcycle: String(v._id),
        motorcycleRole: 'Piloto',
        checklist: inspected(30),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await post(passenger.agent, `/crews/${c._id}/join`, {
        driver: false,
        dutyPeriod: 'Tarde',
        motorcycle: String(v._id),
        motorcycleRole: 'Garupa',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await post(cpu.agent, `/crews/${c._id}/end-shift`, {
        reason: 'Turno encerrado pela central para validar vagas.',
      })
    ).status,
    200,
  );
  const state = await Crew.findById(c._id);
  assert.equal(state.motorcycleSeats.length, 0);
  assert.equal(state.members.length, 0);
  assert.equal((await passenger.agent.get('/api/vehicle-checklists/pending')).body.length, 0);
  const pending = (await pilot.agent.get('/api/vehicle-checklists/pending')).body;
  assert.equal(pending.length, 1);
  assert.equal(
    (await post(pilot.agent, `/vehicle-checklists/${pending[0]._id}`, inspected(35))).status,
    200,
  );
  assert.equal((await Vehicle.findById(v._id)).crew, null);
});
