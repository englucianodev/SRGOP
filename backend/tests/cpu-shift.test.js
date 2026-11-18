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
  CpuShift,
  Crew,
  CrewShift,
  DailyOfficer,
  Occurrence,
  Notification,
  SystemSetting,
} from '../models/index.js';
import { connectDatabase } from '../config/database.js';
import { serviceWindow } from '../utils/time.js';
import {
  openCpuShift,
  currentCpu,
  cpuView,
  closeCpuShift,
  migrateDailyOfficer,
  backfillDutyDay,
  rollOverPending,
  sweepCpuShift,
  OVERTIME_ALERT_MS,
} from '../services/cpuShift.js';
import { buildShiftReport } from '../services/cpuShiftReport.js';

let mongo, app, city, admin, o1, o2, soldier;
const origin = 'http://localhost:5173';
const password = 'TurnoCpu!2026';
const DAY_MS = 86400000;
const post = (agent, url, body = {}) => agent.post(`/api${url}`).set('Origin', origin).send(body);
const put = (agent, url, body) => agent.put(`/api${url}`).set('Origin', origin).send(body);
async function account(name, role) {
  const user = await User.create({
    name,
    email: `${name.toLowerCase()}@turno.local`,
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
const occurrence = (protocol, extra = {}) => ({
  protocol,
  occurredAt: new Date(),
  city: city._id,
  crimeType: 'Furto',
  address: 'Rua do turno',
  description: 'Ocorrência do teste do turno do CPU.',
  priority: 'Alta',
  createdBy: soldier.user._id,
  ...extra,
});
before(async () => {
  process.env.JWT_SECRET = 'chave_de_testes_do_turno_do_cpu_1234567890abcdef';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectDatabase(mongo.getUri('srgop_cpu_shift'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  city = await City.create({ name: 'Cidade do turno', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  app = createApp();
  admin = await account('Administrador', 'Administrativo');
  o1 = await account('OficialUm', 'Oficial');
  o2 = await account('OficialDois', 'Oficial');
  soldier = await account('Soldado', 'Praça');
});
beforeEach(async () => {
  await CpuShift.deleteMany({});
  await DailyOfficer.deleteMany({});
  await Occurrence.deleteMany({});
  await Notification.deleteMany({});
  await Crew.deleteMany({});
  await CrewShift.deleteMany({});
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('oficial assume e GET /cpu traz o turno aberto', async () => {
  const r = await post(o1.agent, '/cpu');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.officer.name, 'OficialUm');
  assert.equal(r.body.status, 'Aberto');
  assert.ok(r.body.handover);
  const g = await o1.agent.get('/api/cpu');
  assert.equal(g.body.officer.name, 'OficialUm');
  assert.ok(g.body.assumedAt);
  assert.deepEqual(g.body.pending, { attending: [], onDuty: [] });
  const service = await soldier.agent.get('/api/service-cpu');
  assert.equal(service.body.officer.name, 'OficialUm');
  assert.ok(!('pending' in service.body));
});
test('sem turno aberto GET /cpu devolve null', async () => {
  assert.equal((await o1.agent.get('/api/cpu')).body, null);
  assert.equal(cpuView(null), null);
  assert.equal(await currentCpu(), null);
});
test('dois oficiais assumem ao mesmo tempo: só um turno aberto', async () => {
  const [a, b] = await Promise.all([post(o1.agent, '/cpu'), post(o2.agent, '/cpu')]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.match([a, b].find((r) => r.status === 409).body.message, /ainda não fechou/);
  assert.equal(await CpuShift.countDocuments({ status: 'Aberto' }), 1);
});
test('com turno anterior aberto o próximo oficial recebe 409 com o motivo', async () => {
  const yesterday = new Date(Date.now() - DAY_MS);
  const old = await openCpuShift(o1.user._id, { at: yesterday });
  await Occurrence.create(occurrence('TC-1', { status: 'Em atendimento', dutyDay: old.day }));
  const r = await post(o2.agent, '/cpu');
  assert.equal(r.status, 409);
  assert.match(r.body.message, /1 atendimento/);
  assert.match(r.body.message, /0 guarnição/);
});
test('troca pelo Administrativo fecha o anterior e abre outro', async () => {
  const old = await openCpuShift(o1.user._id);
  const r = await put(admin.agent, '/cpu', {
    officer: String(o2.user._id),
    reason: 'Troca de teste.',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const closed = await CpuShift.findById(old._id);
  assert.equal(closed.status, 'Fechado');
  assert.equal(closed.closeReason, 'Troca administrativa');
  assert.ok(closed.reportUntil);
  const open = await CpuShift.findOne({ status: 'Aberto' });
  assert.equal(String(open.officer), String(o2.user._id));
  assert.ok(open.reportFrom);
  assert.equal(String(open.previous), String(old._id));
  assert.equal(String(closed.next), String(open._id));
  assert.equal(await Notification.countDocuments({ kind: 'turno-cpu', user: o1.user._id }), 1);
  assert.equal((await put(o1.agent, '/cpu', { officer: String(o1.user._id) })).status, 403);
});
test('troca depois das 08h com turno do dia anterior: novo turno conta o dia desde as 08h', async () => {
  const old = await openCpuShift(o1.user._id, { at: new Date(Date.now() - DAY_MS) });
  const today = serviceWindow();
  assert.notEqual(old.day, today.day);
  // Registered after 08h, before the swap: belongs to the new day and to the incoming shift.
  await Occurrence.create(
    occurrence('X8-1', { dutyDay: today.day, createdAt: today.start, occurredAt: today.start }),
  );
  const r = await put(admin.agent, '/cpu', { officer: String(o2.user._id), reason: 'Troca.' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const open = await CpuShift.findOne({ status: 'Aberto' }).lean();
  assert.equal(open.day, today.day);
  assert.equal(open.reportFrom, null);
  const report = await buildShiftReport({ day: open.day, shift: open });
  assert.equal(report.synthetic.occurrences.registered, 1);
});
test('troca sem turno aberto abre turno sem início de relatório', async () => {
  const r = await put(admin.agent, '/cpu', { officer: String(o2.user._id), reason: 'Sem CPU.' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await CpuShift.findOne({ status: 'Aberto' })).reportFrom, null);
});
test('anterior do mesmo dia passado só pelo id: relatório começa na troca', async () => {
  const old = await openCpuShift(o1.user._id);
  await closeCpuShift(old, { reason: 'Passagem' });
  const at = new Date();
  const next = await openCpuShift(o2.user._id, { at, previous: old._id });
  assert.deepEqual(next.reportFrom, at);
});
test('fechamento automático não limita o relatório', async () => {
  const shift = await openCpuShift(o1.user._id);
  await closeCpuShift(shift, { reason: 'Automático' });
  const row = await CpuShift.findById(shift._id);
  assert.equal(row.reportUntil, null);
  assert.ok(row.end);
});
test('ocorrência nova notifica o CPU do turno aberto mesmo depois das 08h', async () => {
  await openCpuShift(o1.user._id, { at: new Date(Date.now() - DAY_MS) });
  const r = await post(soldier.agent, '/occurrences', {
    city: String(city._id),
    occurredAt: new Date().toISOString(),
    crimeType: 'Furto',
    address: 'Rua do turno',
    description: 'Ocorrência nova para o CPU de ontem ainda em turno.',
    priority: 'Baixa',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const alerts = await Notification.find({ occurrence: r.body._id, kind: 'pendente' });
  assert.deepEqual(
    alerts.map((n) => String(n.user)),
    [String(o1.user._id)],
  );
});
test('oficial com turno aberto conta como em serviço na sessão', async () => {
  await openCpuShift(o1.user._id);
  const r = await o1.agent.get('/api/auth/me');
  assert.equal(r.body.inactivityPolicy.onDuty, true);
  assert.ok(+new Date(r.body.inactivityPolicy.dutyEndsAt) >= Date.now() + 3500000);
});
test('migração abre turno para DailyOfficer legado, mas não reabre turno já fechado hoje', async () => {
  await DailyOfficer.create({ day: serviceWindow().day, officer: o1.user._id });
  const opened = await migrateDailyOfficer();
  assert.equal(String(opened.officer), String(o1.user._id));
  await closeCpuShift(opened, { reason: 'Automático' });
  assert.equal(await migrateDailyOfficer(), null);
  assert.equal(await CpuShift.countDocuments({ status: 'Aberto' }), 0);
  assert.equal(await CpuShift.countDocuments(), 1);
});
test('troca administrativa entrega o aviso de turno encerrado ao oficial anterior', async () => {
  const old = await openCpuShift(o1.user._id);
  const closed = await closeCpuShift(old, { reason: 'Passagem' });
  assert.equal(closed.shift.status, 'Fechado');
  assert.equal(closed.notification.kind, 'turno-cpu');
});
test('registro grava o dia de serviço', async () => {
  const r = await post(soldier.agent, '/occurrences', {
    city: String(city._id),
    occurredAt: new Date().toISOString(),
    crimeType: 'Furto',
    address: 'Rua do turno',
    description: 'Ocorrência para gravar o dia de serviço.',
    priority: 'Baixa',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal((await Occurrence.findById(r.body._id)).dutyDay, serviceWindow().day);
});
test('às 08h só as não aceitas passam para o dia seguinte e a virada é idempotente', async () => {
  const ontem = serviceWindow(new Date(Date.now() - DAY_MS)).day;
  const [, , emAtendimento] = await Occurrence.create([
    occurrence('RO-1', { status: 'Em aberto', dutyDay: ontem }),
    occurrence('RO-2', { status: 'Despachada', dutyDay: ontem }),
    occurrence('RO-3', { status: 'Em atendimento', dutyDay: ontem }),
  ]);
  assert.equal(await rollOverPending(), 2);
  assert.equal(await rollOverPending(), 0);
  assert.equal((await Occurrence.findById(emAtendimento._id)).dutyDay, ontem);
  assert.equal(await Occurrence.countDocuments({ dutyDay: serviceWindow().day }), 2);
});
test('backfill calcula o dia pelas 08h de Fortaleza', async () => {
  const [antes, depois, jaTem] = await Occurrence.create([
    occurrence('BF-1'),
    occurrence('BF-2'),
    occurrence('BF-3', { dutyDay: '2000-01-01' }),
  ]);
  await Occurrence.collection.updateMany(
    { _id: { $in: [antes._id, depois._id] } },
    { $unset: { dutyDay: '' } },
  );
  await Occurrence.collection.updateOne(
    { _id: antes._id },
    { $set: { createdAt: new Date('2026-11-18T10:59:00Z') } },
  );
  await Occurrence.collection.updateOne(
    { _id: depois._id },
    { $set: { createdAt: new Date('2026-11-18T11:00:00Z') } },
  );
  assert.equal(await backfillDutyDay(), 2);
  assert.equal((await Occurrence.findById(antes._id)).dutyDay, '2026-11-17');
  assert.equal((await Occurrence.findById(depois._id)).dutyDay, '2026-11-18');
  assert.equal((await Occurrence.findById(jaTem._id)).dutyDay, '2000-01-01');
  assert.equal(await backfillDutyDay(), 0);
});

const HOUR_MS = 3600000;
async function crewAttending(shiftEnd, accepted = true) {
  const [occ] = await Occurrence.create([
    occurrence(`SW-${Math.random().toString(36).slice(2, 8)}`, {
      status: accepted ? 'Em atendimento' : 'Despachada',
    }),
  ]);
  const crew = await Crew.create({
    name: `GU-${Math.random().toString(36).slice(2, 8)}`,
    city: city._id,
    members: [soldier.user._id],
    status: 'Em atendimento',
    shiftEnd,
    currentOccurrence: occ._id,
  });
  return { crew, occ };
}
test('antes das 08h o turno não fecha mesmo sem pendências', async () => {
  await openCpuShift(o1.user._id);
  const result = await sweepCpuShift();
  assert.equal(result.closed, false);
  assert.equal((await currentCpu()).status, 'Aberto');
});
test('depois das 08h fecha só quando não há atendimento nem guarnição do dia em serviço', async () => {
  const shift = await openCpuShift(o1.user._id);
  const later = new Date(+shift.plannedEnd + 60000);
  const cs = await CrewShift.create({
    crew: new mongoose.Types.ObjectId(),
    dutyDay: shift.day,
    plannedEnd: shift.plannedEnd,
    start: shift.start,
  });
  assert.equal((await sweepCpuShift(later)).closed, false);
  await CrewShift.updateOne({ _id: cs._id }, { end: later });
  const [a, b] = await Promise.all([sweepCpuShift(later), sweepCpuShift(later)]);
  assert.equal([a, b].filter((r) => r.closed).length, 1);
  assert.equal(await CpuShift.countDocuments({ status: 'Aberto' }), 0);
  const notices = await Notification.find({ kind: 'turno-cpu', cpuShift: shift._id });
  assert.equal(notices.length, 1);
});
test('alerta de 30 min é enviado uma vez por guarnição', async () => {
  await openCpuShift(o1.user._id);
  const now = new Date();
  const { crew } = await crewAttending(new Date(+now - OVERTIME_ALERT_MS - 1000));
  const cs = await CrewShift.create({ crew: crew._id, dutyDay: serviceWindow().day, start: now, plannedEnd: now });
  await Crew.updateOne({ _id: crew._id }, { shift: cs._id });
  const first = await sweepCpuShift(now);
  const second = await sweepCpuShift(now);
  assert.equal(first.alerted, 1);
  assert.equal(second.alerted, 0);
  const alerts = await Notification.find({ kind: 'turno-expirado', user: o1.user._id });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, 'Guarnição além do turno');
  assert.equal(
    alerts[0].message,
    `${crew.name} segue em atendimento 30 min após o fim do turno.`,
  );
});
test('alerta ignora guarnição antes dos 30 min, sem aceite, ou sem CPU', async () => {
  const now = new Date();
  const cs = await CrewShift.create({ crew: new mongoose.Types.ObjectId(), start: now, plannedEnd: now });
  const recent = await crewAttending(new Date(+now - 10 * 60000));
  const pending = await crewAttending(new Date(+now - HOUR_MS), false);
  const late = await crewAttending(new Date(+now - HOUR_MS));
  await Crew.updateMany({}, { shift: cs._id });
  assert.deepEqual(await sweepCpuShift(now), { rolled: 0, alerted: 0, closed: false });
  await openCpuShift(o1.user._id);
  assert.equal((await sweepCpuShift(now)).alerted, 1);
  const alerts = await Notification.find({ kind: 'turno-expirado' });
  assert.match(alerts[0].message, new RegExp(late.crew.name));
  assert.ok(recent && pending);
});
test('varredura repetida após reinício não duplica nada', async () => {
  const ontem = serviceWindow(new Date(Date.now() - DAY_MS)).day;
  await Occurrence.create(occurrence('SW-R', { status: 'Em aberto', dutyDay: ontem }));
  await openCpuShift(o1.user._id);
  assert.equal((await sweepCpuShift()).rolled, 1);
  assert.deepEqual(await sweepCpuShift(), { rolled: 0, alerted: 0, closed: false });
});
test('alerta que falha para uma guarnição não impede os outros nem o fechamento', async () => {
  const shift = await openCpuShift(o1.user._id, { at: new Date(Date.now() - DAY_MS) });
  const now = new Date();
  assert.ok(now > shift.plannedEnd);
  const late = new Date(+now - HOUR_MS);
  const good = await crewAttending(late);
  const bad = await crewAttending(late);
  // A name past the notification's message limit makes this crew's alert throw.
  await Crew.collection.updateOne({ _id: bad.crew._id }, { $set: { name: 'X'.repeat(1000) } });
  for (const { crew } of [good, bad]) {
    const cs = await CrewShift.create({ crew: crew._id, start: late, plannedEnd: late });
    await Crew.updateOne({ _id: crew._id }, { shift: cs._id });
  }
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  let result;
  try {
    result = await sweepCpuShift(now);
  } finally {
    console.error = original;
  }
  assert.equal(result.alerted, 1);
  assert.equal(result.closed, true);
  assert.equal(errors.length, 1);
  const alerts = await Notification.find({ kind: 'turno-expirado' });
  assert.match(alerts[0].message, new RegExp(good.crew.name));
});
test('ocorrência do dia do turno em atendimento segura o fechamento automático', async () => {
  const shift = await openCpuShift(o1.user._id);
  const later = new Date(+shift.plannedEnd + 60000);
  const [row] = await Occurrence.create([
    occurrence('FA-1', { status: 'Em atendimento', dutyDay: shift.day }),
  ]);
  assert.equal((await sweepCpuShift(later)).closed, false);
  assert.equal((await currentCpu()).status, 'Aberto');
  await Occurrence.updateOne({ _id: row._id }, { status: 'Encerrada' });
  assert.equal((await sweepCpuShift(later)).closed, true);
  assert.equal(await CpuShift.countDocuments({ status: 'Aberto' }), 0);
});
test('fechamento com passagem pendente a cancela (troca administrativa e varredura)', async () => {
  const pendingTransfer = (shift) =>
    CpuShift.updateOne({ _id: shift._id }, { $push: { transfers: { to: o2.user._id } } });
  const swapped = await openCpuShift(o1.user._id);
  await pendingTransfer(swapped);
  assert.equal(
    (await put(admin.agent, '/cpu', { officer: String(o2.user._id), reason: 'Troca.' })).status,
    200,
  );
  const [cancelled] = (await CpuShift.findById(swapped._id)).transfers;
  assert.equal(cancelled.status, 'Cancelada');
  assert.ok(cancelled.decidedAt);
  await CpuShift.deleteMany({});
  const swept = await openCpuShift(o1.user._id);
  await pendingTransfer(swept);
  assert.equal((await sweepCpuShift(new Date(+swept.plannedEnd + 60000))).closed, true);
  const [expired] = (await CpuShift.findById(swept._id)).transfers;
  assert.equal(expired.status, 'Cancelada');
  assert.ok(expired.decidedAt);
});
test('Praça não recebe a passagem pendente nem as pendências do CPU', async () => {
  const shift = await openCpuShift(o1.user._id);
  await CpuShift.updateOne(
    { _id: shift._id },
    { $push: { transfers: { to: o2.user._id, reason: 'Motivo da passagem' } } },
  );
  for (const url of ['/api/service-cpu', '/api/dashboard']) {
    const r = await soldier.agent.get(url);
    assert.equal(r.status, 200, url);
    const cpu = url === '/api/dashboard' ? r.body.cpu : r.body;
    assert.equal(cpu.officer.name, 'OficialUm', url);
    assert.ok(!('transfer' in cpu) && !('pending' in cpu), url);
    assert.ok(!JSON.stringify(r.body).includes('Motivo da passagem'), url);
  }
  assert.equal((await o2.agent.get('/api/service-cpu')).body.transfer.reason, 'Motivo da passagem');
});
