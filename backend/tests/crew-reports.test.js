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
  Occurrence,
  Attendance,
  SupportRequest,
  SystemSetting,
} from '../models/index.js';
let mongo,
  app,
  admin,
  officer,
  soldier,
  city,
  alice,
  bob,
  carl,
  dana,
  current,
  crewA,
  crewB,
  boundary,
  shiftA,
  shiftNext;
const origin = 'http://localhost:5173',
  password = 'ReportTeste!2026';
const d = (value) => new Date(`${value}-03:00`);
const post = (agent, route, body) => agent.post(`/api${route}`).set('Origin', origin).send(body);
const report = (agent = admin, extra = '') =>
  agent.get(`/api/reports/crews?from=2026-10-21&to=2026-10-21${extra}`);
async function user(name, role = 'Praça') {
  return User.create({
    name,
    role,
    email: `${name}@report.local`,
    password: await bcrypt.hash(password, 4),
    city: city._id,
    active: true,
  });
}
async function login(person) {
  const agent = request.agent(app);
  assert.equal((await post(agent, '/auth/login', { email: person.email, password })).status, 200);
  return agent;
}
async function occurrence(protocol, crew, startedAt, endedAt) {
  return Occurrence.create({
    protocol,
    crew: crew._id,
    city: city._id,
    crimeType: 'Furto',
    address: 'Rua de teste de rastreabilidade',
    description: 'Descrição de ocorrência para rastreabilidade de turnos.',
    priority: 'Alta',
    status: 'Encerrada',
    occurredAt: d('2026-10-01T12:00:00'),
    startedAt: d(startedAt),
    endedAt: d(endedAt),
    createdBy: alice._id,
  });
}
before(async () => {
  process.env.JWT_SECRET = 'chave_de_teste_dos_relatorios_de_guarnicoes_123456789';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(mongo.getUri('crew_reports'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
  city = await City.create({ name: 'Cidade histórica', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  alice = await user('Alice');
  bob = await user('Bruno');
  carl = await user('Carlos');
  dana = await user('Diana');
  current = await user('IntegranteAtual');
  admin = await login(await user('Administrador', 'Administrativo'));
  officer = await login(await user('Oficial', 'Oficial'));
  soldier = await login(current);
  crewA = await Crew.create({ name: 'Alfa atual', city: city._id, members: [current._id] });
  crewB = await Crew.create({ name: 'Bravo', city: city._id });
  boundary = await Crew.create({ name: 'Sem serviço no dia', city: city._id });
  const change = (member, action, at) => ({
    member: member._id,
    memberName: member.name,
    actor: alice._id,
    actorName: 'Operador histórico',
    action,
    at: d(at),
    reason: 'Movimentação registrada para teste',
  });
  shiftA = await CrewShift.create({
    crew: crewA._id,
    crewName: 'Alfa histórica',
    city: city._id,
    cityName: 'Cidade histórica',
    start: d('2026-10-20T20:00:00'),
    plannedEnd: d('2026-10-21T20:00:00'),
    end: d('2026-10-21T20:00:00'),
    members: [alice._id, bob._id, carl._id],
    changes: [
      change(alice, 'Ingresso', '2026-10-20T20:00:00'),
      change(carl, 'Ingresso', '2026-10-20T20:00:00'),
      change(carl, 'Saída', '2026-10-20T22:00:00'),
      change(alice, 'Saída', '2026-10-21T08:00:00'),
      change(bob, 'Ingresso', '2026-10-21T09:00:00'),
      change(alice, 'Ingresso', '2026-10-21T10:00:00'),
      change(alice, 'Motorista', '2026-10-21T11:00:00'),
      change(alice, 'Saída', '2026-10-21T18:00:00'),
      change(bob, 'Saída', '2026-10-21T20:00:00'),
    ],
  });
  shiftNext = await CrewShift.create({
    crew: crewA._id,
    crewName: 'Alfa no segundo turno',
    start: d('2026-10-21T20:00:00'),
    plannedEnd: d('2026-10-22T20:00:00'),
    end: d('2026-10-22T20:00:00'),
    members: [dana._id],
    changes: [change(dana, 'Ingresso', '2026-10-21T20:00:00')],
  });
  const shiftB = await CrewShift.create({
    crew: crewB._id,
    start: d('2026-10-21T08:00:00'),
    plannedEnd: d('2026-10-21T20:00:00'),
    end: d('2026-10-21T20:00:00'),
    members: [carl._id],
  });
  await CrewShift.create([
    {
      crew: boundary._id,
      start: d('2026-10-20T12:00:00'),
      plannedEnd: d('2026-10-21T00:00:00'),
      end: d('2026-10-21T00:00:00'),
      members: [dana._id],
    },
    {
      crew: boundary._id,
      start: d('2026-10-22T00:00:00'),
      plannedEnd: d('2026-10-23T00:00:00'),
      end: d('2026-10-23T00:00:00'),
      members: [dana._id],
    },
  ]);
  const old = await occurrence('LEGADO-ALFA', crewA, '2026-10-21T07:00:00', '2026-10-21T09:00:00');
  const recent = await occurrence(
    'ALFA-SNAPSHOT',
    crewA,
    '2026-10-21T11:00:00',
    '2026-10-21T12:00:00',
  );
  const support = await occurrence(
    'BRAVO-COM-APOIO',
    crewB,
    '2026-10-21T12:00:00',
    '2026-10-21T15:00:00',
  );
  const missing = await occurrence(
    'SEM-TURNO',
    crewA,
    '2026-10-20T15:00:00',
    '2026-10-21T01:00:00',
  );
  const continued = await occurrence(
    'CONTINUA-OUTRO-DIA',
    crewA,
    '2026-10-21T19:00:00',
    '2026-10-22T02:00:00',
  );
  await Attendance.create([
    {
      occurrence: old._id,
      crew: crewA._id,
      acceptedBy: alice._id,
      startedAt: old.startedAt,
      endedAt: old.endedAt,
      status: 'Encerrada',
    },
    {
      occurrence: recent._id,
      crew: crewA._id,
      shift: shiftA._id,
      members: [alice._id, bob._id],
      acceptedBy: alice._id,
      startedAt: recent.startedAt,
      endedAt: recent.endedAt,
      status: 'Encerrada',
    },
    {
      occurrence: support._id,
      crew: crewB._id,
      shift: shiftB._id,
      members: [carl._id],
      acceptedBy: carl._id,
      startedAt: support.startedAt,
      endedAt: support.endedAt,
      status: 'Encerrada',
    },
    {
      occurrence: missing._id,
      crew: crewA._id,
      acceptedBy: alice._id,
      startedAt: missing.startedAt,
      endedAt: missing.endedAt,
      status: 'Encerrada',
    },
    {
      occurrence: continued._id,
      crew: crewA._id,
      shift: shiftA._id,
      members: [bob._id],
      acceptedBy: bob._id,
      startedAt: continued.startedAt,
      endedAt: continued.endedAt,
      status: 'Encerrada',
    },
  ]);
  await SupportRequest.create({
    occurrence: support._id,
    targetCrew: crewA._id,
    shift: shiftA._id,
    members: [bob._id],
    requestedBy: carl._id,
    authorizedBy: alice._id,
    status: 'Concluído',
    reason: 'Apoio operacional autorizado',
    startedAt: d('2026-10-21T13:00:00'),
    endedAt: support.endedAt,
    createdAt: d('2026-10-21T12:30:00'),
  });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('histórico ambíguo não atribui atendimento legado a um turno arbitrário', async () => {
  const overlapping = await CrewShift.create({
    crew: crewA._id,
    start: d('2026-10-20T18:00:00'),
    plannedEnd: d('2026-10-21T18:00:00'),
    end: d('2026-10-21T18:00:00'),
    members: [alice._id],
  });
  try {
    const response = await report(admin, `&crews=${crewA._id}`);
    assert.equal(response.status, 200);
    const crew = response.body.crews[0];
    assert.ok(crew.unmatchedAttendances.some((a) => a.protocol === 'LEGADO-ALFA'));
    assert.ok(
      crew.shifts
        .find((s) => s._id === String(shiftA._id))
        .attendances.some((a) => a.protocol === 'ALFA-SNAPSHOT'),
    );
  } finally {
    await overlapping.deleteOne();
  }
});

test('seleção múltipla respeita guarnições, sobreposição dos turnos e dias sem duplicação', async () => {
  const response = await report(admin, `&crews=${crewA._id},${crewB._id}`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(
    response.body.crews.map((c) => c._id).sort(),
    [String(crewA._id), String(crewB._id)].sort(),
  );
  const alfa = response.body.crews.find((c) => c._id === String(crewA._id));
  assert.deepEqual(alfa.workedDays, ['2026-10-21']);
  assert.equal(alfa.shifts.length, 2);
  assert.equal(alfa.occurrenceCount, 5);
  assert.equal(alfa.shifts[0].crewName, 'Alfa histórica');
  assert.equal(alfa.shifts[0].city, 'Cidade histórica');
  const all = await report();
  const none = all.body.crews.find((c) => c._id === String(boundary._id));
  assert.equal(none.shifts.length, 0);
  assert.deepEqual(none.workedDays, []);
});
test('composição vem de ingressos e saídas históricos, inclusive reingresso e integrante desativado', async () => {
  await User.updateOne({ _id: bob._id }, { active: false });
  const response = await report(admin, `&crews=${crewA._id}`);
  const shift = response.body.crews[0].shifts.find((s) => s._id === String(shiftA._id));
  assert.deepEqual(shift.members.map((m) => m.name).sort(), ['Alice', 'Alice', 'Bruno']);
  assert.equal(
    shift.members.some((m) => m.name === current.name || m.name === carl.name),
    false,
  );
  const intervals = shift.members.filter((m) => m.name === alice.name);
  assert.equal(intervals[0].leftAt, d('2026-10-21T08:00:00').toISOString());
  assert.equal(intervals[1].joinedAt, d('2026-10-21T10:00:00').toISOString());
  assert.ok(
    shift.changes.some((c) => c.action === 'Motorista' && c.actor === 'Operador histórico'),
  );
});
test('atendimentos usam o período de execução e incluem apoio, responsáveis e composição do início', async () => {
  const response = await report(admin, `&crews=${crewA._id}`);
  const team = response.body.crews[0],
    shift = team.shifts.find((s) => s._id === String(shiftA._id));
  const old = shift.attendances.find((a) => a.protocol === 'LEGADO-ALFA');
  assert.ok(old);
  assert.deepEqual(
    old.members.map((m) => m.name),
    ['Alice'],
  );
  assert.equal(old.responsible, 'Alice');
  const snapshot = shift.attendances.find((a) => a.protocol === 'ALFA-SNAPSHOT');
  assert.deepEqual(snapshot.members.map((m) => m.name).sort(), ['Alice', 'Bruno']);
  const support = shift.attendances.find((a) => a.type === 'Apoio');
  assert.equal(support.protocol, 'BRAVO-COM-APOIO');
  assert.deepEqual(
    support.members.map((m) => m.name),
    ['Bruno'],
  );
  assert.deepEqual(
    team.unmatchedAttendances.map((a) => a.protocol),
    ['SEM-TURNO'],
  );
});
test('atendimento após fim do turno continua vinculado ao turno de origem', async () => {
  const response = await admin.get(
    `/api/reports/crews?from=2026-10-22&to=2026-10-22&crews=${crewA._id}`,
  );
  assert.equal(response.status, 200);
  const team = response.body.crews[0];
  assert.equal(team.occurrenceCount, 1);
  assert.deepEqual(team.workedDays, ['2026-10-22']);
  const original = team.shifts.find((s) => s._id === String(shiftA._id));
  assert.deepEqual(original.workedDays, []);
  assert.deepEqual(original.members, []);
  assert.equal(original.attendances[0].protocol, 'CONTINUA-OUTRO-DIA');
  assert.equal(team.shifts.find((s) => s._id === String(shiftNext._id)).attendances.length, 0);
});
test('registros antigos sem movimentação são apresentados como estimativa', async () => {
  const response = await report(admin, `&crews=${crewB._id}`);
  const shift = response.body.crews[0].shifts[0];
  assert.equal(shift.members[0].name, 'Carlos');
  assert.equal(shift.members[0].estimated, true);
  assert.equal(shift.city, null);
});
test('CSV contém turnos, integrantes e atendimentos das equipes selecionadas', async () => {
  const response = await report(admin, `&crews=${crewA._id}&format=csv`);
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /text\/csv/);
  assert.match(response.text, /Alfa histórica/);
  assert.match(response.text, /Alice/);
  assert.match(response.text, /LEGADO-ALFA/);
  assert.match(response.text, /"Apoio"/);
  assert.match(response.text, /2026-10-21/);
  assert.doesNotMatch(response.text, /"Bravo"/);
});
test('datas e identificadores inválidos são rejeitados e perfil Praça não pode emitir', async () => {
  assert.equal((await report(soldier)).status, 403);
  assert.equal((await report(officer, `&crews=${crewA._id}`)).status, 200);
  assert.equal((await admin.get('/api/reports/crews')).status, 422);
  assert.equal((await admin.get('/api/reports/crews?from=2026-02-30&to=2026-03-01')).status, 422);
  assert.equal((await admin.get('/api/reports/crews?from=2026-10-22&to=2026-10-21')).status, 422);
  assert.equal((await report(admin, '&crews=invalido')).status, 422);
  assert.equal((await report(admin, `&crews=${new mongoose.Types.ObjectId()}`)).status, 422);
});
test('novos turnos e atendimentos automáticos gravam metadados históricos e vínculo explícito', async () => {
  const team = await Crew.create({ name: 'Equipe nova com histórico', city: city._id });
  assert.equal((await post(soldier, `/crews/${team._id}/join`, { driver: true })).status, 200);
  const active = await Crew.findById(team._id),
    shift = await CrewShift.findById(active.shift);
  assert.equal(shift.crewName, team.name);
  assert.equal(shift.cityName, city.name);
  assert.equal(shift.changes[0].memberName, current.name);
  const response = await post(soldier, '/occurrences', {
    city: String(city._id),
    occurredAt: new Date().toISOString(),
    crimeType: 'Furto',
    address: 'Rua do teste operacional',
    description: 'Teste do vínculo histórico do atendimento automático.',
    priority: 'Alta',
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const attendance = await Attendance.findOne({ occurrence: response.body._id });
  assert.equal(String(attendance.shift), String(shift._id));
  assert.deepEqual(attendance.members.map(String), [String(current._id)]);
  const future = await admin.get(
    `/api/reports/crews?from=2099-01-01&to=2099-01-02&crews=${team._id}`,
  );
  assert.equal(future.status, 200);
  assert.equal(future.body.crews[0].occurrenceCount, 0);
  assert.deepEqual(future.body.crews[0].workedDays, []);
});
