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
  CpuShift,
  Emergency,
  Occurrence,
  SupportRequest,
  SystemSetting,
} from '../models/index.js';
import { connectDatabase } from '../config/database.js';
import {
  buildShiftReport,
  shiftOccurrenceFilter,
  analyticCsv,
} from '../services/cpuShiftReport.js';

let mongo, app, city, crew, officerA, officerB, soldier, shiftA, shiftB;
const origin = 'http://localhost:5173';
const password = 'RelatorioCpu!2026';
const D = '2026-03-10';
const D2 = '2026-03-12';
const at = (day, time) => new Date(`${day}T${time}:00-03:00`);
const get = (agent, url) => agent.get(`/api${url}`).set('Origin', origin);
async function account(name, role) {
  const user = await User.create({
    name,
    email: `${name.toLowerCase()}@relatorio.local`,
    city: city._id,
    role,
    active: true,
    password: await bcrypt.hash(password, 4),
  });
  const agent = request.agent(app);
  const r = await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: user.email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { user, agent };
}
let seq = 0;
const occurrence = (createdAt, dutyDay, extra = {}) =>
  Occurrence.create({
    protocol: `REL-${++seq}`,
    occurredAt: createdAt,
    createdAt,
    dutyDay,
    city: city._id,
    crimeType: 'Furto',
    address: 'Rua Reservada, 99',
    description: 'Descrição reservada do fato.',
    summary: 'Resumo reservado do fato.',
    involved: [{ role: 'Vítima', name: 'Vítima Fulano de Tal' }],
    priority: 'Alta',
    createdBy: soldier.user._id,
    ...extra,
  });

before(async () => {
  process.env.JWT_SECRET = 'chave_de_testes_do_relatorio_do_cpu_1234567890abcdef';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectDatabase(mongo.getUri('srgop_cpu_report'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  city = await City.create({ name: 'Cidade do relatório', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  app = createApp();
  officerA = await account('RelatorioA', 'Oficial');
  officerB = await account('RelatorioB', 'Oficial');
  soldier = await account('RelatorioPraca', 'Praça');
  crew = await Crew.create({ name: 'GU Relatório', city: city._id, members: [soldier.user._id] });
});
after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all(
    [CpuShift, CrewShift, Emergency, Occurrence, SupportRequest].map((m) => m.deleteMany({})),
  );
  // Day D: A holds the CPU until 14h, then hands over to B.
  shiftA = await CpuShift.create({
    officer: officerA.user._id,
    day: D,
    start: at(D, '08:00'),
    plannedEnd: at(D, '20:00'),
    end: at(D, '14:00'),
    status: 'Fechado',
    closeReason: 'Passagem',
    reportUntil: at(D, '14:00'),
    transfers: [
      {
        to: officerB.user._id,
        reason: 'Consulta médica',
        status: 'Aceita',
        requestedAt: at(D, '13:55'),
        decidedAt: at(D, '14:00'),
      },
    ],
  });
  shiftB = await CpuShift.create({
    officer: officerB.user._id,
    day: D,
    start: at(D, '14:00'),
    plannedEnd: at(D, '20:00'),
    reportFrom: at(D, '14:00'),
    previous: shiftA._id,
  });
});

test('turno conta só as ocorrências do seu dia e janela', async () => {
  await occurrence(at('2026-03-09', '22:00'), D);
  await occurrence(at(D, '10:00'), D);
  await occurrence(at(D, '15:00'), D);
  await occurrence(at('2026-03-11', '09:00'), '2026-03-11');
  const ra = await buildShiftReport({ day: D, shift: shiftA });
  assert.equal(ra.synthetic.occurrences.registered, 2);
  const rb = await buildShiftReport({ day: D, shift: shiftB });
  assert.equal(rb.synthetic.occurrences.registered, 1);
  assert.equal((await buildShiftReport({ day: D })).synthetic.occurrences.registered, 3);
  assert.equal(ra.header.officer, 'RelatorioA');
  assert.equal(ra.header.closeReason, 'Passagem');
  assert.equal(shiftOccurrenceFilter(shiftA).createdAt.$gte, undefined);
  assert.deepEqual(
    Object.keys(shiftOccurrenceFilter({ day: D, reportFrom: null, reportUntil: null })),
    ['deleted', 'dutyDay'],
  );
});

test('resultados somam delegacia, detidos, veículos, armas e apreensões por tipo', async () => {
  const base = { status: 'Encerrada', crew: crew._id };
  await occurrence(at(D2, '09:00'), D2, {
    ...base,
    detained: 2,
    weapons: 1,
    recoveredVehicles: 1,
    approaches: 3,
    startedAt: at(D2, '09:10'),
    durationSeconds: 1200,
    policeStation: '1º DP',
    seizures: [
      { kind: 'Droga', quantity: 1 },
      { kind: 'Outro', quantity: 1 },
    ],
  });
  await occurrence(at(D2, '11:00'), D2, {
    ...base,
    detained: 1,
    recoveredVehicles: 2,
    approaches: 1,
    startedAt: at(D2, '11:20'),
    durationSeconds: 600,
    policeStation: '2º DP',
    seizures: [{ kind: 'Droga', quantity: 2 }],
  });
  await occurrence(at(D2, '12:00'), D2, { status: 'Cancelada' });
  const { synthetic, analytic } = await buildShiftReport({ day: D2 });
  assert.deepEqual(synthetic.occurrences, {
    registered: 3,
    attended: 2,
    inProgress: 0,
    waiting: 0,
    cancelled: 1,
    averageMinutes: 15,
  });
  assert.equal(synthetic.results.detained, 3);
  assert.equal(synthetic.results.weapons, 1);
  assert.equal(synthetic.results.recoveredVehicles, 3);
  assert.equal(synthetic.results.approaches, 4);
  assert.equal(synthetic.results.policeStation, 2);
  assert.deepEqual(synthetic.results.seizures, { Droga: 2, Outro: 1 });
  assert.equal(synthetic.byCity['Cidade do relatório'], 3);
  assert.equal(synthetic.byCrimeType.Furto, 3);
  assert.equal(analytic.occurrences[0].responseMinutes, 10);
  assert.equal(analytic.occurrences[0].durationMinutes, 20);
});

test('analítico traz guarnições, passagem, urgência e apoio da janela', async () => {
  await CrewShift.create({
    crew: crew._id,
    crewName: crew.name,
    dutyDay: D,
    cityName: 'Cidade do relatório',
    members: [soldier.user._id],
    start: at(D, '08:00'),
    plannedEnd: at(D, '20:00'),
  });
  await Emergency.create({
    actor: soldier.user._id,
    actorName: 'Praça',
    crewName: crew.name,
    createdAt: at(D, '10:30'),
    resolvedAt: at(D, '10:40'),
  });
  await SupportRequest.create({
    occurrence: new mongoose.Types.ObjectId(),
    targetCrew: crew._id,
    requestedBy: soldier.user._id,
    reason: 'Motivo reservado',
    status: 'Autorizado',
    startedAt: at(D, '16:00'),
  });
  const ra = await buildShiftReport({ day: D, shift: shiftA });
  const rb = await buildShiftReport({ day: D, shift: shiftB });
  assert.equal(ra.synthetic.staff.crews, 1);
  assert.equal(ra.analytic.crews[0].name, crew.name);
  assert.equal(ra.analytic.transfers[0].from, 'RelatorioA');
  assert.equal(ra.analytic.transfers[0].to, 'RelatorioB');
  assert.deepEqual(
    ra.analytic.events.map((e) => e.kind),
    ['Urgência'],
  );
  assert.deepEqual(
    rb.analytic.events.map((e) => e.kind),
    ['Apoio'],
  );
  // B also shows the accepted transfer that opened its shift.
  assert.equal(rb.analytic.transfers.length, 1);
  assert.ok(!JSON.stringify(rb).includes('Motivo reservado'));
});

test('analítico não traz dados pessoais', async () => {
  await occurrence(at(D, '10:00'), D, { seizures: [{ kind: 'Droga', quantity: 2 }] });
  const report = await buildShiftReport({ day: D, shift: shiftA });
  const text = JSON.stringify(report) + analyticCsv(report);
  for (const t of [
    'Rua Reservada, 99',
    'Vítima Fulano de Tal',
    'Resumo reservado',
    'Descrição reservada',
  ])
    assert.ok(!text.includes(t), t);
});

test('dia sem CPU tem relatório por data; CSV baixa com cabeçalho', async () => {
  await occurrence(at(D2, '10:00'), D2);
  const r = await get(officerA.agent, `/reports/duty-days/${D2}?format=csv`);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/csv/);
  assert.match(r.headers['content-disposition'], /attachment/);
  assert.ok(r.text.startsWith('﻿'));
  assert.match(r.text, /Protocolo;/);
  const json = await get(officerA.agent, `/reports/duty-days/${D2}`);
  assert.equal(json.body.synthetic.occurrences.registered, 1);
  assert.equal(json.body.header.officer, null);
});

test('listagem e relatório por id validam parâmetros', async () => {
  const list = await get(officerA.agent, `/reports/cpu-shifts?from=${D}&to=${D}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 2);
  assert.equal(list.body[0].officer, 'RelatorioB');
  assert.equal((await get(officerA.agent, '/reports/cpu-shifts?from=ontem')).status, 422);
  assert.equal((await get(officerA.agent, '/reports/cpu-shifts/xyz')).status, 422);
  assert.equal(
    (await get(officerA.agent, `/reports/cpu-shifts/${new mongoose.Types.ObjectId()}`)).status,
    404,
  );
  assert.equal((await get(officerA.agent, '/reports/duty-days/2026-13-45')).status, 422);
  const one = await get(officerA.agent, `/reports/cpu-shifts/${shiftA._id}`);
  assert.equal(one.status, 200);
  assert.equal(one.body.header.officer, 'RelatorioA');
  const csv = await get(officerA.agent, `/reports/cpu-shifts/${shiftA._id}?format=csv`);
  assert.match(csv.text, /Protocolo;/);
});

test('Praça não acessa relatórios de turno', async () => {
  for (const url of [
    '/reports/cpu-shifts',
    `/reports/cpu-shifts/${shiftA._id}`,
    `/reports/duty-days/${D}`,
  ])
    assert.equal((await get(soldier.agent, url)).status, 403, url);
});

test('atendimentos são contados por turno da guarnição, não pelo total da guarnição', async () => {
  const common = { crew: crew._id, crewName: crew.name, dutyDay: D, plannedEnd: at(D, '20:00') };
  await CrewShift.create({ ...common, start: at(D, '08:00'), end: at(D, '12:00') });
  await CrewShift.create({ ...common, start: at(D, '12:00') });
  await occurrence(at(D, '09:00'), D, { crew: crew._id, startedAt: at(D, '09:05') });
  await occurrence(at(D, '13:00'), D, { crew: crew._id, startedAt: at(D, '13:05') });
  const { analytic } = await buildShiftReport({ day: D });
  assert.deepEqual(
    analytic.crews.map((item) => item.attendances),
    [1, 1],
  );
});

test('fechamento automático depois das 08h não traz eventos do dia seguinte', async () => {
  const next = '2026-03-11';
  const shift = await CpuShift.create({
    officer: officerA.user._id,
    day: D,
    start: at(D, '08:00'),
    plannedEnd: at(next, '08:00'),
    end: at(next, '09:30'),
    status: 'Fechado',
    closeReason: 'Automático',
  });
  const urgency = (crewName, createdAt) => ({
    actor: soldier.user._id,
    actorName: 'Praça',
    crewName,
    createdAt,
    resolvedAt: new Date(+createdAt + 60000),
  });
  await Emergency.create(urgency('GU D', at(D, '20:00')));
  await Emergency.create(urgency('GU D+1', at(next, '08:30')));
  const report = await buildShiftReport({ day: D, shift: shift.toObject() });
  assert.deepEqual(
    report.analytic.events.map((e) => e.label),
    ['Guarnição GU D'],
  );
});
