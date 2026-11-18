import test, { before, after, beforeEach } from 'node:test';
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
  Occurrence,
  Notification,
  Attendance,
  SupportRequest,
  Vehicle,
  SystemSetting,
} from '../models/index.js';
import { connectDatabase } from '../config/database.js';
import { expireShifts, alignActiveShifts } from '../services/operations.js';
import { inactivityPolicy } from '../services/sessionPolicy.js';
import { serviceWindow } from '../utils/time.js';
import { inspected } from './inspection-fixture.js';

let mongo, app, city, cpu, cmd, crew, shift, moto;
const origin = 'http://localhost:5173';
const password = 'ExpiraTurno!2026';
const NOTICE =
  'Seu turno encerrou. Finalize o atendimento o mais rápido possível para a próxima equipe assumir.';
const post = (agent, url, body = {}) => agent.post(`/api${url}`).set('Origin', origin).send(body);
const patch = (agent, url, body) => agent.patch(`/api${url}`).set('Origin', origin).send(body);
const closeBody = { summary: 'Atendimento concluído com as medidas necessárias.' };
const fix = { enabled: true, latitude: -5.2, longitude: -44.4, accuracy: 9 };

async function account(name, role) {
  const user = await User.create({
    name,
    email: `${name.toLowerCase()}@expira.local`,
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
const newOccurrence = (protocol) =>
  Occurrence.create({
    protocol,
    occurredAt: new Date(),
    city: city._id,
    crimeType: 'Furto',
    address: 'Rua do turno',
    description: 'Ocorrência do teste de expiração de turno.',
    priority: 'Alta',
    createdBy: cmd.user._id,
  });
// Crew on duty whose shift ended a second ago.
async function expiredCrew() {
  const past = new Date(Date.now() - 1000);
  crew = await Crew.create({
    name: 'Guarnição vencida',
    city: city._id,
    members: [cmd.user._id],
    driver: cmd.user._id,
    status: 'Disponível',
    shiftStart: new Date(Date.now() - 86400000),
    shiftEnd: past,
  });
  shift = await CrewShift.create({
    crew: crew._id,
    crewName: crew.name,
    start: crew.shiftStart,
    plannedEnd: past,
    members: [cmd.user._id],
  });
  await Crew.updateOne({ _id: crew._id }, { shift: shift._id });
  await User.updateOne({ _id: cmd.user._id }, { crew: crew._id });
}
// Dispatches and accepts while the shift is still open, then moves the shift end into the past.
async function acceptedThenExpired(protocol) {
  await Crew.updateOne({ _id: crew._id }, { shiftEnd: new Date(Date.now() + 3600000) });
  const occ = await newOccurrence(protocol);
  const d = await post(cpu.agent, '/dispatches', { occurrence: occ._id, crew: crew._id });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const a = await post(cmd.agent, `/attendances/${occ._id}/accept`);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  await Crew.updateOne({ _id: crew._id }, { shiftEnd: new Date(Date.now() - 1000) });
  return occ;
}
before(async () => {
  process.env.JWT_SECRET = 'chave_de_testes_expiracao_do_turno_1234567890';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectDatabase(mongo.getUri('srgop_shift_expiry'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  city = await City.create({ name: 'Cidade expiração', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  app = createApp();
  cpu = await account('Central', 'Oficial');
  cmd = await account('Comandante', 'Praça');
  moto = await account('Motociclista', 'Praça');
});
beforeEach(async () => {
  await Promise.all(
    [Crew, CrewShift, Occurrence, Notification, SupportRequest, Attendance].map((m) =>
      m.deleteMany({}),
    ),
  );
  await User.updateMany({}, { crew: null });
  await expiredCrew();
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('guarnição em atendimento às 08h continua, recebe aviso uma vez e não recebe despacho', async () => {
  const occ = await acceptedThenExpired('EXP-1');
  const outra = await newOccurrence('EXP-2');
  await expireShifts();
  await expireShifts();
  assert.equal((await Occurrence.findById(occ._id)).status, 'Em atendimento');
  assert.equal((await Crew.findById(crew._id)).members.length, 1);
  const notes = await Notification.find({ kind: 'turno-expirado', user: cmd.user._id });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'Turno encerrado');
  assert.equal(notes[0].message, NOTICE);
  assert.ok((await CrewShift.findById(shift._id)).expiryNoticeAt);
  const r = await post(cpu.agent, '/dispatches', { occurrence: outra._id, crew: crew._id });
  assert.equal(r.status, 409, JSON.stringify(r.body));
});
test('quem aceitou encerra depois das 08h e a guarnição sai de serviço', async () => {
  const occ = await acceptedThenExpired('EXP-3');
  const r = await post(cmd.agent, `/attendances/${occ._id}/close`, closeBody);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = await Crew.findById(crew._id);
  assert.equal(row.status, 'Fora de serviço');
  assert.equal(row.members.length, 0);
  assert.equal((await User.findById(cmd.user._id)).crew, null);
  const closed = await CrewShift.findById(shift._id);
  assert.ok(closed.end);
  assert.equal(closed.reason, 'Saída após atendimento com turno encerrado');
});
test('apoio com turno vencido também sai de serviço ao encerrar o atendimento', async () => {
  const occ = await acceptedThenExpired('EXP-4');
  const support = await Crew.create({
    name: 'Apoio vencido',
    city: city._id,
    members: [moto.user._id],
    status: 'Em atendimento',
    currentOccurrence: occ._id,
    shiftStart: new Date(Date.now() - 86400000),
    shiftEnd: new Date(Date.now() - 1000),
  });
  await User.updateOne({ _id: moto.user._id }, { crew: support._id });
  await SupportRequest.create({
    occurrence: occ._id,
    requestedBy: cmd.user._id,
    targetCrew: support._id,
    status: 'Autorizado',
    reason: 'Reforço necessário no local.',
  });
  assert.equal((await post(cmd.agent, `/attendances/${occ._id}/close`, closeBody)).status, 200);
  assert.equal((await Crew.findById(support._id)).members.length, 0);
  assert.equal((await Crew.findById(crew._id)).members.length, 0);
});
test('despacho sem aceite de guarnição vencida volta para a fila', async () => {
  const occ = await newOccurrence('EXP-5');
  await Crew.updateOne({ _id: crew._id }, { shiftEnd: new Date(Date.now() + 3600000) });
  assert.equal(
    (await post(cpu.agent, '/dispatches', { occurrence: occ._id, crew: crew._id })).status,
    201,
  );
  await Crew.updateOne({ _id: crew._id }, { shiftEnd: new Date(Date.now() - 1000) });
  await expireShifts();
  assert.equal((await Occurrence.findById(occ._id)).status, 'Em aberto');
  assert.equal((await Crew.findById(crew._id)).members.length, 0);
  assert.equal(await Notification.countDocuments({ kind: 'turno-expirado' }), 0);
});
test('guarnição em atendimento além do turno continua enviando GPS; sem atendimento, não', async () => {
  const occ = await acceptedThenExpired('EXP-6');
  const first = await patch(cmd.agent, `/crews/${crew._id}/gps`, fix);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const again = await patch(cmd.agent, `/crews/${crew._id}/gps`, { ...fix, latitude: -5.21 });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal((await post(cmd.agent, `/attendances/${occ._id}/close`, closeBody)).status, 200);
  assert.equal((await patch(cmd.agent, `/crews/${crew._id}/gps`, fix)).status, 403);
});
test('guarnição vencida sem atendimento não envia GPS', async () => {
  assert.equal((await patch(cmd.agent, `/crews/${crew._id}/gps`, fix)).status, 403);
});
test('motocicleta recebe fim às 08h e expira como viatura', async () => {
  await Crew.deleteMany({});
  await User.updateMany({}, { crew: null });
  const vehicle = await Vehicle.create({
    prefix: 'MOTO-EXP',
    plate: 'MOT1A23',
    city: city._id,
    type: 'Motocicleta',
    mileage: 50,
  });
  const bikes = await Crew.create({
    name: 'Moto expira',
    city: city._id,
    type: 'Motocicleta',
  });
  const r = await post(moto.agent, `/crews/${bikes._id}/join`, {
    driver: true,
    dutyPeriod: 'Manhã',
    motorcycle: String(vehicle._id),
    motorcycleRole: 'Piloto',
    motorcycles: [{ vehicle: String(vehicle._id), checklist: inspected(50) }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.shiftMode, 'Motocicleta');
  const window = serviceWindow();
  assert.equal(+new Date(r.body.shiftEnd), +window.end);
  const saved = await CrewShift.findById(r.body.shift);
  assert.equal(saved.dutyDay, window.day);
  assert.equal(+saved.plannedEnd, +window.end);
  await Crew.updateOne({ _id: bikes._id }, { shiftEnd: new Date(Date.now() - 1000) });
  await expireShifts();
  const row = await Crew.findById(bikes._id);
  assert.equal(row.status, 'Fora de serviço');
  assert.equal(row.members.length, 0);
});
test('saída após atendimento registra o horário real, não o fim planejado', async () => {
  const occ = await acceptedThenExpired('EXP-7');
  const planned = (await Crew.findById(crew._id)).shiftEnd;
  const before = Date.now();
  assert.equal((await post(cmd.agent, `/attendances/${occ._id}/close`, closeBody)).status, 200);
  const closed = await CrewShift.findById(shift._id);
  assert.ok(+closed.end >= before - 1000 && +closed.end <= Date.now() + 1000);
  assert.notEqual(+closed.end, +planned);
  assert.equal(+(await Crew.findById(crew._id)).shiftEnd, +closed.end);
});
test('quem atende além do turno mantém UU, chat e política de serviço; ao sair perde', async () => {
  const occ = await acceptedThenExpired('EXP-8');
  const uu = await post(cmd.agent, '/emergencies', {
    latitude: -5.2,
    longitude: -44.4,
    accuracy: 5,
  });
  assert.equal(uu.status, 201, JSON.stringify(uu.body));
  const chat = await post(cmd.agent, '/crew-chats', { name: 'Conversa do atendimento', crews: [] });
  assert.equal(chat.status, 201, JSON.stringify(chat.body));
  const user = await User.findById(cmd.user._id);
  const policy = await inactivityPolicy(user, {});
  assert.equal(policy.onDuty, true);
  assert.ok(+policy.dutyEndsAt > Date.now());
  assert.equal((await post(cmd.agent, `/attendances/${occ._id}/close`, closeBody)).status, 200);
  assert.equal(
    (await post(cmd.agent, '/emergencies', { latitude: -5.2, longitude: -44.4 })).status,
    403,
  );
  assert.equal(
    (await post(cmd.agent, '/crew-chats', { name: 'Depois de sair', crews: [] })).status,
    403,
  );
  assert.equal((await inactivityPolicy(await User.findById(cmd.user._id), {})).onDuty, false);
});
test('motocicleta legada sem fim recebe 08h mantendo o início real', async () => {
  await Crew.deleteMany({});
  await CrewShift.deleteMany({});
  const start = new Date(Date.now() - 5 * 3600000);
  const bikes = await Crew.create({
    name: 'Moto legada',
    city: city._id,
    type: 'Motocicleta',
    shiftMode: 'Motocicleta',
    members: [moto.user._id],
    status: 'Disponível',
    shiftStart: start,
    shiftEnd: null,
  });
  const legacy = await CrewShift.create({
    crew: bikes._id,
    shiftMode: 'Motocicleta',
    dutyDay: serviceWindow(start).day,
    start,
    members: [moto.user._id],
  });
  await Crew.updateOne({ _id: bikes._id }, { shift: legacy._id });
  await alignActiveShifts();
  const end = serviceWindow(start).end;
  const row = await Crew.findById(bikes._id);
  const planned = await CrewShift.findById(legacy._id);
  assert.equal(+row.shiftEnd, +end);
  assert.equal(+planned.plannedEnd, +end);
  assert.equal(+row.shiftStart, +start);
  assert.equal(+planned.start, +start);
  await alignActiveShifts();
  assert.equal(+(await Crew.findById(bikes._id)).shiftEnd, +end);
});
