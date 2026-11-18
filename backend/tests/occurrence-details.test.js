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
  Vehicle,
  Occurrence,
  SystemSetting,
  Attendance,
  AuditLog,
} from '../models/index.js';
import { connectDatabase } from '../config/database.js';
import { inspected } from './inspection-fixture.js';
import {
  averageResponseTimes,
  describeChanges,
  involvedCounts,
  responseTimes,
  seizuresText,
} from '../utils/occurrenceDetails.js';
let mongo, app, city, otherCity, crew, adminAgent, officerAgent, memberAgent, outsiderAgent;
const password = 'TesteSeguro!2026';
const origin = 'http://localhost:5173';
// Distinctive values, so any leak into history or audit entries is easy to detect.
const secret = {
  name: 'Fulano Sigiloso de Tal',
  document: '123.456.789-00',
  phone: '(98)98888-7777',
  notes: 'Relatou ameaça anterior do vizinho',
};
const victim = { role: 'Vítima', ...secret };
const witness = { role: 'Testemunha', name: 'Beltrana Reservada' };
const author = { role: 'Autor', name: 'Sicrano Oculto', document: '987.654.321-00' };
// Pending vehicle checklists block the other routes, so the helper completes them first.
const post = async (agent, url, body = {}) => {
  if (!url.startsWith('/auth/')) {
    const pending = await agent.get('/api/vehicle-checklists/pending');
    if (pending.status === 200)
      for (const record of pending.body) {
        const response = await agent
          .post(`/api/vehicle-checklists/${record._id}`)
          .set('Origin', origin)
          .send(inspected(record.vehicle.mileage));
        assert.equal(response.status, 200, JSON.stringify(response.body));
      }
  }
  if (/\/crews\/[^/]+\/join$/.test(url) && body.driver) {
    const joined = await Crew.findById(url.split('/')[2]);
    const vehicle = joined?.vehicle ? await Vehicle.findById(joined.vehicle) : null;
    if (vehicle) body = { ...body, checklist: inspected(vehicle.mileage) };
  }
  return agent.post(`/api${url}`).set('Origin', origin).send(body);
};
const put = (agent, url, body) => agent.put(`/api${url}`).set('Origin', origin).send(body);
const occurrenceBody = (cityId, extra = {}) => ({
  city: String(cityId),
  occurredAt: new Date().toISOString(),
  crimeType: 'Furto',
  address: 'Rua de teste, 100',
  description: 'Descrição suficiente da ocorrência para teste.',
  priority: 'Alta',
  ...extra,
});
const closeBody = (extra = {}) => ({
  summary: 'Atendimento concluído com as medidas necessárias.',
  ...extra,
});
// Registering in the crew's service city starts the attendance automatically.
async function startAttendance(extra) {
  const r = await post(memberAgent, '/occurrences', occurrenceBody(city._id, extra));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'Em atendimento');
  return r.body;
}
// Outside the crew's city the occurrence stays open, waiting for dispatch.
async function openOccurrence(extra) {
  const r = await post(memberAgent, '/occurrences', occurrenceBody(otherCity._id, extra));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'Em aberto');
  return r.body;
}
const close = (id, extra) => post(memberAgent, `/attendances/${id}/close`, closeBody(extra));
const arrive = (agent, id) => post(agent, `/attendances/${id}/arrive`);
before(async () => {
  process.env.JWT_SECRET = 'uma_chave_de_testes_com_mais_de_32_caracteres_e_segura';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectDatabase(mongo.getUri('srgop_test'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  city = await City.create({ name: 'Cidade teste', latitude: -5.2, longitude: -44.4 });
  otherCity = await City.create({ name: 'Outra cidade', latitude: -5.4, longitude: -44.6 });
  await SystemSetting.create({ key: 'general' });
  const hash = await bcrypt.hash(password, 4);
  await User.create(
    ['Administrativo', 'Oficial', 'Praça', 'Praça'].map((role, i) => ({
      name: `Usuário de teste ${i}`,
      email: `teste${i}@srgop.local`,
      password: hash,
      city: city._id,
      role,
      active: true,
    })),
  );
  app = createApp();
  [adminAgent, officerAgent, memberAgent, outsiderAgent] = [0, 1, 2, 3].map(() =>
    request.agent(app),
  );
  for (const [i, agent] of [adminAgent, officerAgent, memberAgent, outsiderAgent].entries())
    assert.equal(
      (await post(agent, '/auth/login', { email: `teste${i}@srgop.local`, password })).status,
      200,
    );
  let r = await post(adminAgent, '/vehicles', {
    prefix: 'VTR-DETALHE',
    plate: 'ABC1D23',
    city: String(city._id),
    mileage: 100,
    status: 'Disponível',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  r = await post(adminAgent, '/crews', {
    name: 'Guarnição detalhe',
    city: String(city._id),
    vehicle: r.body._id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  crew = r.body;
  r = await post(memberAgent, `/crews/${crew._id}/join`, { driver: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test('chegada ao local registra horário, histórico e recusa repetição', async () => {
  const started = await startAttendance();
  assert.equal(started.arrivedAt, undefined);
  const refused = await arrive(outsiderAgent, started._id);
  assert.equal(refused.status, 403, JSON.stringify(refused.body));
  const r = await arrive(memberAgent, started._id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'Em atendimento');
  assert.ok(+new Date(r.body.arrivedAt) >= +new Date(r.body.startedAt));
  const attendance = await Attendance.findOne({ occurrence: started._id });
  assert.equal(+attendance.arrivedAt, +new Date(r.body.arrivedAt));
  const saved = await Occurrence.findById(started._id);
  assert.equal(saved.history.filter((h) => h.action === 'Chegada ao local').length, 1);
  assert.equal(
    await AuditLog.countDocuments({ action: 'Chegada ao local', entityId: started._id }),
    1,
  );
  const again = await arrive(memberAgent, started._id);
  assert.equal(again.status, 409);
  assert.equal(again.body.message, 'Chegada ao local já registrada.');
  assert.equal(+(await Occurrence.findById(started._id)).arrivedAt, +saved.arrivedAt);
  const closed = await close(started._id);
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.ok(closed.body.arrivedAt);
});
test('chegada exige atendimento em andamento', async () => {
  const open = await openOccurrence();
  assert.equal((await arrive(officerAgent, open._id)).status, 409);
  const started = await startAttendance();
  assert.equal((await close(started._id)).status, 200);
  const late = await arrive(memberAgent, started._id);
  assert.equal(late.status, 409, JSON.stringify(late.body));
  assert.equal((await Occurrence.findById(started._id)).arrivedAt, undefined);
  assert.equal((await arrive(memberAgent, 'nao-e-um-id')).status, 422);
});
test('encerramento sem chegada e com o payload antigo continua funcionando', async () => {
  const started = await startAttendance();
  const r = await close(started._id, { weapons: 1, recoveredVehicles: 0, detained: 2 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'Encerrada');
  assert.equal(r.body.arrivedAt, undefined);
  assert.equal(r.body.weapons, 1);
  assert.deepEqual(r.body.involved, []);
  assert.deepEqual(r.body.seizures, []);
  assert.equal(r.body.policeStation, undefined);
  assert.equal((await Attendance.findOne({ occurrence: started._id })).arrivedAt, undefined);
});
test('relatório separa deslocamento e permanência apenas onde há chegada', async () => {
  const timed = [];
  for (const [travel, onScene] of [
    [120, 300],
    [240, 600],
  ]) {
    const started = await startAttendance({ crimeType: 'Roubo' });
    assert.equal((await arrive(memberAgent, started._id)).status, 200);
    assert.equal((await close(started._id)).status, 200);
    const startedAt = new Date('2026-03-10T12:00:00.000Z');
    const arrivedAt = new Date(+startedAt + travel * 1000);
    await Occurrence.updateOne(
      { _id: started._id },
      { startedAt, arrivedAt, endedAt: new Date(+arrivedAt + onScene * 1000) },
    );
    timed.push(started);
  }
  const withoutArrival = await startAttendance({ crimeType: 'Roubo' });
  assert.equal((await close(withoutArrival._id)).status, 200);
  const report = await officerAgent.get('/api/reports?crimeType=Roubo');
  assert.equal(report.status, 200, JSON.stringify(report.body));
  assert.equal(report.body.totals.closed, 3);
  assert.equal(report.body.totals.averageTravelSeconds, 180);
  assert.equal(report.body.totals.averageOnSceneSeconds, 450);
  const empty = await officerAgent.get('/api/reports?crimeType=Outros');
  assert.equal(empty.body.totals.averageTravelSeconds, null);
  assert.equal(empty.body.totals.averageOnSceneSeconds, null);
  const csv = await officerAgent.get('/api/reports?crimeType=Roubo&format=csv');
  assert.equal(csv.status, 200);
  const [header, ...lines] = csv.text.split('\r\n');
  for (const column of ['Chegada ao local', 'Deslocamento (min)', 'No local (min)'])
    assert.ok(header.includes(`"${column}"`), column);
  const first = lines.find((l) => l.includes(timed[0].protocol));
  assert.ok(first.includes('"2026-03-10T12:02:00.000Z";"2,0";"5,0"'), first);
  const bare = lines.find((l) => l.includes(withoutArrival.protocol));
  assert.ok(bare.includes('"";"";""'), bare);
});
test('médias ignoram ocorrências sem chegada e permanência ainda em aberto', () => {
  const at = (seconds) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds));
  assert.deepEqual(responseTimes({ startedAt: at(0), endedAt: at(50) }), {
    travelSeconds: null,
    onSceneSeconds: null,
  });
  assert.deepEqual(responseTimes({ startedAt: at(0), arrivedAt: at(90) }), {
    travelSeconds: 90,
    onSceneSeconds: null,
  });
  assert.deepEqual(
    averageResponseTimes([
      { startedAt: at(0), arrivedAt: at(60), endedAt: at(160) },
      { startedAt: at(0), arrivedAt: at(120) },
      { startedAt: at(0), endedAt: at(900) },
    ]),
    { averageTravelSeconds: 90, averageOnSceneSeconds: 100 },
  );
  assert.deepEqual(averageResponseTimes([]), {
    averageTravelSeconds: null,
    averageOnSceneSeconds: null,
  });
});
test('envolvidos são validados no cadastro e opcionais para clientes antigos', async () => {
  const send = (involved) =>
    post(memberAgent, '/occurrences', occurrenceBody(otherCity._id, { involved }));
  assert.equal((await send([{ role: 'Suspeito', name: 'Nome válido' }])).status, 422);
  assert.equal((await send([{ role: 'Autor', name: 'A' }])).status, 422);
  assert.equal((await send([{ role: 'Autor', name: 'N'.repeat(121) }])).status, 422);
  assert.equal((await send([{ ...witness, document: '1'.repeat(41) }])).status, 422);
  assert.equal((await send([{ ...witness, phone: '9'.repeat(31) }])).status, 422);
  assert.equal((await send([{ ...witness, notes: 'n'.repeat(301) }])).status, 422);
  assert.equal((await send([{ ...witness, address: 'Campo desconhecido' }])).status, 422);
  assert.equal((await send(Array.from({ length: 21 }, () => witness))).status, 422);
  const r = await send([victim, witness]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.involved, [victim, witness]);
  const legacy = await openOccurrence();
  assert.deepEqual(legacy.involved, []);
  const detail = await memberAgent.get(`/api/occurrences/${r.body._id}`);
  assert.deepEqual(detail.body.involved, [victim, witness]);
});
test('edição registra apenas a quantidade de envolvidos no histórico', async () => {
  const created = await openOccurrence({ involved: [victim] });
  const base = occurrenceBody(otherCity._id, { occurredAt: created.occurredAt });
  let r = await put(memberAgent, `/occurrences/${created._id}`, {
    ...base,
    address: 'Rua alterada, 200',
    involved: [victim, author],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.involved, [victim, author]);
  let detail = r.body.history.at(-1).detail;
  assert.match(detail, /Envolvidos atualizados \(2\)/);
  assert.match(detail, /address: Rua de teste, 100 → Rua alterada, 200/);
  assert.ok(!detail.includes('[object Object]'), detail);
  // Omitting the list keeps it, and resending it unchanged is not reported as a change.
  r = await put(memberAgent, `/occurrences/${created._id}`, { ...base, priority: 'Baixa' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.involved, [victim, author]);
  assert.ok(!r.body.history.at(-1).detail.includes('Envolvidos'));
  r = await put(memberAgent, `/occurrences/${created._id}`, {
    ...base,
    priority: 'Baixa',
    involved: [victim, author],
  });
  assert.ok(!r.body.history.at(-1).detail.includes('Envolvidos'));
  r = await put(memberAgent, `/occurrences/${created._id}`, { ...base, involved: [] });
  assert.deepEqual(r.body.involved, []);
  detail = r.body.history.at(-1).detail;
  assert.match(detail, /Envolvidos atualizados \(0\)/);
});
test('registro de alterações nunca expõe dados pessoais nem [object Object]', () => {
  const row = { address: 'Rua A', priority: 'Alta', involved: [victim] };
  const log = describeChanges(row, {
    address: 'Rua B',
    priority: 'Alta',
    involved: [victim, author],
  });
  assert.equal(log, 'address: Rua A → Rua B; Envolvidos atualizados (2)');
  assert.equal(describeChanges(row, { address: 'Rua A', involved: [{ ...victim }] }), '');
  assert.equal(
    describeChanges(row, { involved: [{ ...victim, phone: '(98)90000-0000' }] }),
    'Envolvidos atualizados (1)',
  );
  assert.equal(describeChanges({ address: 'Rua A' }, { involved: [] }), '');
});
test('encerramento valida apreensões e delegacia', async () => {
  const started = await startAttendance();
  const send = (extra) => close(started._id, extra);
  const drug = { kind: 'Droga', description: 'Maconha prensada', quantity: 2.5, unit: 'kg' };
  assert.equal((await send({ seizures: [{ ...drug, kind: 'Arma' }] })).status, 422);
  assert.equal((await send({ seizures: [{ ...drug, quantity: -1 }] })).status, 422);
  assert.equal((await send({ seizures: [{ ...drug, quantity: '2' }] })).status, 422);
  assert.equal((await send({ seizures: [{ ...drug, description: 'd'.repeat(201) }] })).status, 422);
  assert.equal((await send({ seizures: [{ ...drug, unit: 'u'.repeat(21) }] })).status, 422);
  assert.equal((await send({ seizures: [{ kind: 'Outro', quantity: 1 }] })).status, 422);
  assert.equal((await send({ seizures: [{ ...drug, owner: 'Campo extra' }] })).status, 422);
  assert.equal((await send({ seizures: Array.from({ length: 31 }, () => drug) })).status, 422);
  assert.equal((await send({ policeStation: 'D'.repeat(161) })).status, 422);
  assert.equal((await send({ involved: [{ role: 'Réu', name: 'Nome válido' }] })).status, 422);
  assert.equal((await Occurrence.findById(started._id)).status, 'Em atendimento');
  assert.equal((await send()).status, 200);
});
test('encerramento substitui envolvidos e grava apreensões e delegacia', async () => {
  const started = await startAttendance({ involved: [witness] });
  assert.deepEqual(started.involved, [witness]);
  const seizures = [
    { kind: 'Droga', description: 'Maconha prensada', quantity: 2.5, unit: 'kg' },
    { kind: 'Dinheiro', quantity: 350, unit: 'R$' },
    { kind: 'Munição', description: 'Calibre .38', quantity: 12, unit: 'un' },
  ];
  const r = await close(started._id, {
    detained: 1,
    involved: [victim, { ...victim, name: 'Segunda Vítima Protegida' }, author],
    seizures,
    policeStation: '=2ª Delegacia Regional',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(
    r.body.involved.map((p) => p.role),
    ['Vítima', 'Vítima', 'Autor'],
  );
  assert.deepEqual(r.body.involved[0], victim);
  assert.deepEqual(r.body.seizures, [
    seizures[0],
    { kind: 'Dinheiro', description: '', quantity: 350, unit: 'R$' },
    seizures[2],
  ]);
  assert.equal(r.body.policeStation, '=2ª Delegacia Regional');
  const extras = r.body.history.find((h) => h.action === 'Dados do encerramento');
  assert.match(extras.detail, /Envolvidos atualizados \(3\)/);
  assert.match(extras.detail, /Apreensões registradas \(3\)/);
  // A closing that keeps the list untouched sends nothing and must preserve it.
  const kept = await startAttendance({ involved: [witness] });
  const plain = await close(kept._id);
  assert.deepEqual(plain.body.involved, [witness]);
  assert.ok(!plain.body.history.some((h) => h.action === 'Dados do encerramento'));
  const csv = await officerAgent.get('/api/reports?format=csv');
  const [header, ...lines] = csv.text.split('\r\n');
  for (const column of [
    'Vítimas',
    'Autores',
    'Testemunhas',
    'Material apreendido',
    'Delegacia de destino',
  ])
    assert.ok(header.includes(`"${column}"`), column);
  const line = lines.find((l) => l.includes(started.protocol));
  assert.ok(
    line.endsWith(
      '"2";"1";"0";"Droga: Maconha prensada (2,5 kg) | Dinheiro (350 R$) | Munição: Calibre .38 (12 un)";"\'=2ª Delegacia Regional"',
    ),
    line,
  );
  for (const value of ['Sigiloso', 'Protegida', 'Oculto', 'Reservada', secret.document])
    assert.ok(!csv.text.includes(value), value);
});
test('contagem por papel e texto das apreensões', () => {
  assert.deepEqual(involvedCounts([victim, author, victim]), {
    Vítima: 2,
    Autor: 1,
    Testemunha: 0,
  });
  assert.deepEqual(involvedCounts(undefined), { Vítima: 0, Autor: 0, Testemunha: 0 });
  assert.equal(seizuresText(undefined), '');
  assert.equal(
    seizuresText([{ kind: 'Outro', description: 'Celular', quantity: 1, unit: '' }]),
    'Outro: Celular (1)',
  );
});
test('histórico e auditoria não guardam nomes, documentos, telefones nem observações', async () => {
  const histories = JSON.stringify(
    (await Occurrence.find().select('history')).map((o) => o.history),
  );
  const audits = JSON.stringify(await AuditLog.find().select('action detail'));
  assert.ok(await Occurrence.exists({ 'involved.name': secret.name }));
  assert.ok(histories.includes('Envolvidos atualizados'));
  for (const value of [
    ...Object.values(secret),
    witness.name,
    author.name,
    author.document,
    'Segunda Vítima Protegida',
  ]) {
    assert.ok(!histories.includes(value), `histórico contém ${value}`);
    assert.ok(!audits.includes(value), `auditoria contém ${value}`);
  }
  assert.ok(!histories.includes('[object Object]'));
  assert.ok(!audits.includes('[object Object]'));
});
