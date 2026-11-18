import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createApp } from '../app.js';
import {
  User,
  City,
  Crew,
  CrewShift,
  Vehicle,
  VehicleHandover,
  Occurrence,
  Attendance,
  SupportRequest,
  Emergency,
  DailyOfficer,
  SystemSetting,
} from '../models/index.js';
import { connectDatabase } from '../config/database.js';
import { serviceWindow } from '../utils/time.js';
import { buildHandover } from '../services/handover.js';
import { inspected } from './inspection-fixture.js';
let mongo, app, city, admin, officer, previousOfficer, driver, visitor, crew, vehicle;
const password = 'PassagemSegura!2026';
const origin = 'http://localhost:5173';
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const PRIVATE_TEXTS = ['Vítima Fulano de Tal', 'Rua Reservada, 99', 'Motivo reservado do apoio'];
const post = (agent, url, body = {}) => agent.post(`/api${url}`).set('Origin', origin).send(body);
const put = (agent, url, body) => agent.put(`/api${url}`).set('Origin', origin).send(body);
const previousDay = () => serviceWindow(new Date(+serviceWindow().start - 1)).day;
async function account(name, role = 'Praça') {
  const user = await User.create({
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@passagem.local`,
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
  description: 'Vítima Fulano de Tal relatou o furto do veículo.',
  priority: 'Alta',
  createdBy: driver.user._id,
  ...extra,
});
async function seedCrew() {
  vehicle = await Vehicle.create({ prefix: 'VTR-PASSAGEM', plate: 'PAS1A23', city: city._id });
  crew = await Crew.create({
    name: 'Guarnição passagem',
    city: city._id,
    vehicle: vehicle._id,
    members: [driver.user._id],
    driver: driver.user._id,
    status: 'Em atendimento',
    shiftStart: new Date(Date.now() - HOUR),
    shiftEnd: new Date(Date.now() + 8 * HOUR),
  });
  await User.updateOne({ _id: driver.user._id }, { crew: crew._id });
  // An off-duty crew must not be listed among the crews on duty.
  const idle = await Crew.create({ name: 'Guarnição de folga', city: city._id });
  const shift = await CrewShift.create({
    crew: crew._id,
    start: new Date(Date.now() - HOUR),
    plannedEnd: new Date(Date.now() + 8 * HOUR),
  });
  await VehicleHandover.create([
    {
      crew: crew._id,
      shift: shift._id,
      vehicle: vehicle._id,
      driver: driver.user._id,
      intake: inspected(100),
      pendingReturn: true,
    },
    {
      crew: crew._id,
      shift: shift._id,
      vehicle: vehicle._id,
      driver: visitor.user._id,
      intake: inspected(90),
      delivery: inspected(100),
      closedAt: new Date(),
    },
  ]);
  return idle;
}
async function seedOccurrences(idleCrew) {
  const [, , attending] = await Occurrence.create([
    occurrenceData('PASS-ABERTA', { createdAt: new Date(Date.now() - 45 * MINUTE) }),
    occurrenceData('PASS-DESPACHADA', {
      status: 'Despachada',
      priority: 'Média',
      crew: crew._id,
      dispatchedAt: new Date(),
    }),
    occurrenceData('PASS-ATENDIMENTO', {
      status: 'Em atendimento',
      crew: crew._id,
      acceptedBy: driver.user._id,
      startedAt: new Date(Date.now() - 10 * MINUTE),
    }),
    occurrenceData('PASS-ENCERRADA', { status: 'Encerrada' }),
    occurrenceData('PASS-EXCLUIDA', { deleted: true }),
  ]);
  await Attendance.create({
    occurrence: attending._id,
    crew: crew._id,
    acceptedBy: driver.user._id,
    startedAt: attending.startedAt,
  });
  await SupportRequest.create([
    {
      occurrence: attending._id,
      targetCrew: idleCrew._id,
      requestedBy: driver.user._id,
      reason: 'Motivo reservado do apoio.',
    },
    {
      occurrence: attending._id,
      targetCrew: idleCrew._id,
      requestedBy: driver.user._id,
      reason: 'Motivo reservado do apoio.',
      status: 'Recusado',
    },
  ]);
}
async function seedEmergencies() {
  await Emergency.create([
    {
      actor: driver.user._id,
      crew: crew._id,
      city: city._id,
      actorName: 'Motorista passagem',
      crewName: crew.name,
      cityName: city.name,
    },
    {
      actor: visitor.user._id,
      actorName: 'Visitante passagem',
      crewName: crew.name,
      cityName: city.name,
      resolvedAt: new Date(),
    },
  ]);
}
before(async () => {
  process.env.JWT_SECRET = 'chave_de_testes_da_passagem_de_servico_do_cpu_123456';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectDatabase(mongo.getUri('srgop_cpu_handover'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  city = await City.create({ name: 'Cidade da passagem', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  app = createApp();
  admin = await account('Administrador passagem', 'Administrativo');
  officer = await account('Oficial que assume', 'Oficial');
  previousOfficer = await account('Oficial anterior', 'Oficial');
  driver = await account('Motorista passagem');
  visitor = await account('Visitante passagem');
  const idleCrew = await seedCrew();
  await seedOccurrences(idleCrew);
  await seedEmergencies();
  await DailyOfficer.create({
    day: previousDay(),
    officer: previousOfficer.user._id,
    assumedAt: new Date(+serviceWindow().start - 23 * HOUR),
  });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test('resumo reúne ocorrências aguardando, atendimentos, apoios, urgências, guarnições e checklists', async () => {
  const summary = await buildHandover();
  assert.ok(summary.generatedAt instanceof Date);
  assert.equal(summary.occurrences.total, 2);
  assert.deepEqual(summary.occurrences.items.map((o) => o.protocol).sort(), [
    'PASS-ABERTA',
    'PASS-DESPACHADA',
  ]);
  const open = summary.occurrences.items.find((o) => o.protocol === 'PASS-ABERTA');
  assert.equal(open.city, 'Cidade da passagem');
  assert.equal(open.crimeType, 'Furto');
  assert.equal(open.priority, 'Alta');
  assert.equal(open.status, 'Em aberto');
  assert.ok(open.waitingMinutes >= 45 && open.waitingMinutes < 50, String(open.waitingMinutes));
  assert.equal(summary.attendances.length, 1);
  assert.equal(summary.attendances[0].protocol, 'PASS-ATENDIMENTO');
  assert.equal(summary.attendances[0].city, 'Cidade da passagem');
  assert.equal(summary.attendances[0].crew, 'Guarnição passagem');
  assert.ok(summary.attendances[0].startedAt instanceof Date);
  assert.equal(summary.supportRequests.length, 1);
  assert.equal(summary.supportRequests[0].protocol, 'PASS-ATENDIMENTO');
  assert.equal(summary.supportRequests[0].targetCrew, 'Guarnição de folga');
  assert.equal(summary.emergencies.length, 1);
  assert.equal(summary.emergencies[0].crew, 'Guarnição passagem');
  assert.equal(summary.emergencies[0].city, 'Cidade da passagem');
  assert.deepEqual(summary.crews, [
    { name: 'Guarnição passagem', city: 'Cidade da passagem', status: 'Em atendimento', members: 1 },
  ]);
  assert.deepEqual(summary.vehicleChecklists, [
    { vehicle: 'VTR-PASSAGEM', driver: 'Motorista passagem', kind: 'Entrega' },
  ]);
  assert.deepEqual(summary.totals, {
    occurrences: 2,
    open: 1,
    dispatched: 1,
    attendances: 1,
    supportRequests: 1,
    emergencies: 1,
    crews: 1,
    vehicleChecklists: 1,
  });
});
test('resumo não leva descrições livres, endereços nem motivos informados', async () => {
  const text = JSON.stringify(await buildHandover());
  for (const secret of PRIVATE_TEXTS) assert.equal(text.includes(secret), false, secret);
});
test('GET /cpu/handover é recusado para Praça e traz o resumo ao vivo e o CPU anterior ao Oficial', async () => {
  assert.equal((await request(app).get('/api/cpu/handover')).status, 401);
  assert.equal((await visitor.agent.get('/api/cpu/handover')).status, 403);
  const r = await officer.agent.get('/api/cpu/handover');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.day, serviceWindow().day);
  assert.equal(r.body.summary.totals.occurrences, 2);
  assert.equal(r.body.summary.attendances[0].protocol, 'PASS-ATENDIMENTO');
  assert.equal(r.body.previous.day, previousDay());
  assert.equal(r.body.previous.officer.name, 'Oficial anterior');
  assert.ok(r.body.previous.assumedAt);
  assert.equal(r.body.current, null);
  assert.equal(r.body.snapshot, null);
});
test('POST /cpu devolve e grava o retrato das pendências sem alterar a resposta atual', async () => {
  const r = await post(officer.agent, '/cpu', {});
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.day, serviceWindow().day);
  assert.equal(r.body.officer.name, 'Oficial que assume');
  assert.ok(r.body.assumedAt);
  assert.equal(r.body.handover.totals.occurrences, 2);
  assert.equal(r.body.handover.vehicleChecklists[0].vehicle, 'VTR-PASSAGEM');
  const stored = await DailyOfficer.findOne({ day: serviceWindow().day }).select('+handover');
  assert.equal(stored.handover.totals.emergencies, 1);
  assert.equal(stored.handover.occurrences.items.length, 2);
  const overview = await officer.agent.get('/api/cpu/handover');
  assert.equal(overview.body.current.officer.name, 'Oficial que assume');
  assert.equal(overview.body.snapshot.generatedAt, r.body.handover.generatedAt);
  assert.equal(overview.body.summary.totals.occurrences, 2);
});
test('retrato fica restrito à passagem de serviço e não aparece nas demais consultas do CPU', async () => {
  const cpu = await officer.agent.get('/api/cpu');
  assert.equal(cpu.status, 200);
  assert.equal(cpu.body.officer.name, 'Oficial que assume');
  assert.equal(cpu.body.handover, undefined);
  const service = await visitor.agent.get('/api/service-cpu');
  assert.equal(service.status, 200);
  assert.equal(service.body.handover, undefined);
  const dashboard = await visitor.agent.get('/api/dashboard');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.cpu.handover, undefined);
});
test('segunda tentativa de assumir o CPU continua respondendo 409', async () => {
  assert.equal((await post(officer.agent, '/cpu', {})).status, 409);
  assert.equal((await post(previousOfficer.agent, '/cpu', {})).status, 409);
  assert.equal(await DailyOfficer.countDocuments({ day: serviceWindow().day }), 1);
});
test('troca do CPU pelo Administrativo registra novo retrato das pendências', async () => {
  const earlier = await DailyOfficer.findOne({ day: serviceWindow().day }).select('+handover');
  await Occurrence.create(occurrenceData('PASS-NOVA'));
  const r = await put(admin.agent, '/cpu', {
    officer: String(previousOfficer.user._id),
    reason: 'Substituição do oficial de serviço.',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(String(r.body.officer), String(previousOfficer.user._id));
  const stored = await DailyOfficer.findOne({ day: serviceWindow().day }).select('+handover');
  assert.equal(stored.handover.totals.occurrences, 3);
  assert.ok(+stored.handover.generatedAt > +earlier.handover.generatedAt);
});
test('lista de ocorrências aguardando é limitada a 50 e informa o total real', async () => {
  await Occurrence.insertMany(
    Array.from({ length: 55 }, (_, i) => occurrenceData(`PASS-LOTE-${i}`, { priority: 'Baixa' })),
  );
  const summary = await buildHandover();
  assert.equal(summary.occurrences.items.length, 50);
  assert.equal(summary.occurrences.total, 58);
  assert.equal(summary.totals.occurrences, 58);
  assert.equal(summary.totals.open, 57);
  assert.equal(summary.totals.dispatched, 1);
  // Oldest first, so the longest wait is never cut from the list.
  assert.equal(summary.occurrences.items[0].protocol, 'PASS-ABERTA');
});
