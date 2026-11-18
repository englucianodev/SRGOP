import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { io as connect } from 'socket.io-client';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createApp } from '../app.js';
import {
  User,
  City,
  CpuShift,
  DailyOfficer,
  Notification,
  Occurrence,
  SystemSetting,
} from '../models/index.js';
import { connectDatabase } from '../config/database.js';
import { openCpuShift, currentCpu } from '../services/cpuShift.js';
import { answerChecked } from '../services/cpuTransfer.js';
import { configureSocket, deliverNotifications } from '../services/realtime.js';

let mongo, app, city, a, b, c, inactive, soldier;
let shiftA;
const origin = 'http://localhost:5173';
const password = 'PassagemCpu!2026';
const post = (agent, url, body = {}) => agent.post(`/api${url}`).set('Origin', origin).send(body);
const del = (agent, url) => agent.delete(`/api${url}`).set('Origin', origin).send();
async function account(name, role, active = true) {
  const user = await User.create({
    name,
    email: `${name.toLowerCase()}@passagem.local`,
    city: city._id,
    role,
    active,
    password: await bcrypt.hash(password, 4),
  });
  const agent = request.agent(app);
  let cookie = '';
  if (active) {
    const r = await post(agent, '/auth/login', { email: user.email, password });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    cookie = r.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
  }
  return { user, agent, cookie };
}
before(async () => {
  process.env.JWT_SECRET = 'chave_de_testes_da_passagem_do_cpu_1234567890abcdef';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectDatabase(mongo.getUri('srgop_cpu_transfer'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  city = await City.create({ name: 'Cidade da passagem', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  app = createApp();
  a = await account('PassagemA', 'Oficial');
  b = await account('PassagemB', 'Oficial');
  c = await account('PassagemC', 'Oficial');
  inactive = await account('PassagemInativo', 'Oficial', false);
  soldier = await account('PassagemPraca', 'Praça');
});
after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all([
    CpuShift.deleteMany({}),
    DailyOfficer.deleteMany({}),
    Notification.deleteMany({}),
    Occurrence.deleteMany({}),
  ]);
  shiftA = await openCpuShift(a.user._id);
});

test('aceite re-notifica o novo CPU sobre ocorrência em aberto', async () => {
  const open = await Occurrence.create({
    protocol: 'PASS-1',
    occurredAt: new Date(),
    city: city._id,
    crimeType: 'Furto',
    address: 'Rua da passagem',
    description: 'Ocorrência aguardando despacho na passagem.',
    priority: 'Alta',
    createdBy: soldier.user._id,
  });
  await post(a.agent, '/cpu/transfer', { to: b.user._id });
  await post(b.agent, '/cpu/transfer/answer', { accept: true });
  assert.ok(
    await Notification.exists({ user: b.user._id, occurrence: open._id, kind: 'pendente' }),
  );
});

test('resposta de B não vale para outra passagem enviada depois do cancelamento', async () => {
  await post(a.agent, '/cpu/transfer', { to: b.user._id });
  const original = (await currentCpu()).transfers[0]._id;
  // Interleaving: after B's recipient check, A cancels and re-requests for C.
  await del(a.agent, '/cpu/transfer');
  await post(a.agent, '/cpu/transfer', { to: c.user._id });
  await assert.rejects(() => answerChecked(b.user, true, original), { status: 409 });
  assert.equal(String((await currentCpu()).officer._id), String(a.user._id));
  assert.equal((await currentCpu()).transfers[1].status, 'Pendente');
});

test('aceite fecha o turno do remetente e abre o do destinatário', async () => {
  await post(a.agent, '/cpu/transfer', { to: b.user._id, reason: 'Consulta médica' });
  assert.equal((await post(b.agent, '/cpu/transfer/answer', { accept: true })).status, 200);
  const [old, cur] = await Promise.all([CpuShift.findById(shiftA._id), currentCpu()]);
  assert.equal(old.closeReason, 'Passagem');
  assert.ok(old.reportUntil);
  assert.equal(String(cur.officer._id), String(b.user._id));
  assert.deepEqual(cur.reportFrom, old.reportUntil);
  assert.equal(String(old.next), String(cur._id));
  assert.equal(String(cur.previous), String(old._id));
  assert.equal(old.transfers[0].status, 'Aceita');
  assert.ok(await Notification.exists({ user: a.user._id, kind: 'passagem-cpu' }));
});

test('aceite depois das 08h de turno do dia anterior: novo turno cobre o dia inteiro', async () => {
  await CpuShift.deleteMany({});
  await openCpuShift(a.user._id, { at: new Date(Date.now() - 86400000) });
  await post(a.agent, '/cpu/transfer', { to: b.user._id });
  assert.equal((await post(b.agent, '/cpu/transfer/answer', { accept: true })).status, 200);
  assert.equal((await currentCpu()).reportFrom, null);
});

test('recusa mantém tudo e avisa o remetente', async () => {
  const req = await post(a.agent, '/cpu/transfer', { to: b.user._id });
  assert.equal(req.status, 200, JSON.stringify(req.body));
  assert.ok(
    await Notification.exists({
      user: b.user._id,
      kind: 'passagem-cpu',
      title: 'Passagem do CPU',
      message: 'PassagemA quer passar o CPU para você.',
    }),
  );
  assert.equal((await post(b.agent, '/cpu/transfer/answer', { accept: false })).status, 200);
  const cur = await currentCpu();
  assert.equal(String(cur._id), String(shiftA._id));
  assert.equal(cur.transfers[0].status, 'Recusada');
  assert.ok(
    await Notification.exists({
      user: a.user._id,
      kind: 'passagem-cpu',
      message: 'PassagemB recusou a passagem do CPU.',
    }),
  );
});

test('só uma pendente; só o destinatário responde; só o remetente cancela', async () => {
  assert.equal((await post(a.agent, '/cpu/transfer', { to: b.user._id })).status, 200);
  assert.equal((await post(a.agent, '/cpu/transfer', { to: c.user._id })).status, 409);
  assert.equal((await post(c.agent, '/cpu/transfer/answer', { accept: true })).status, 403);
  assert.equal((await del(b.agent, '/cpu/transfer')).status, 403);
  assert.equal((await del(a.agent, '/cpu/transfer')).status, 200);
  assert.equal((await currentCpu()).transfers[0].status, 'Cancelada');
  assert.equal((await post(b.agent, '/cpu/transfer/answer', { accept: true })).status, 409);
});

test('destinatário inválido e ator fora do CPU são rejeitados', async () => {
  assert.equal((await post(a.agent, '/cpu/transfer', { to: a.user._id })).status, 422);
  assert.equal((await post(a.agent, '/cpu/transfer', { to: inactive.user._id })).status, 422);
  assert.equal((await post(a.agent, '/cpu/transfer', { to: soldier.user._id })).status, 422);
  assert.equal((await post(b.agent, '/cpu/transfer', { to: c.user._id })).status, 403);
  assert.equal((await post(soldier.agent, '/cpu/transfer', { to: b.user._id })).status, 403);
});

test('aceites simultâneos de duas abas: um 200 e um 409', async () => {
  await post(a.agent, '/cpu/transfer', { to: b.user._id });
  const results = await Promise.all([
    post(b.agent, '/cpu/transfer/answer', { accept: true }),
    post(b.agent, '/cpu/transfer/answer', { accept: true }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await CpuShift.countDocuments({ status: 'Aberto' }), 1);
  assert.equal(String((await currentCpu()).officer._id), String(b.user._id));
});

test('avisos do turno e da passagem do CPU não disparam dispatch:new; despacho dispara', async () => {
  const server = createServer(app);
  const io = configureSocket(server, [origin]);
  const sockets = [];
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  async function open(person) {
    const socket = connect(`http://127.0.0.1:${server.address().port}`, {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
      extraHeaders: { Origin: origin, Cookie: person.cookie },
    });
    sockets.push(socket);
    const ready = once(socket, 'connect', { signal: AbortSignal.timeout(5000) });
    socket.connect();
    await ready;
    return socket;
  }
  try {
    const [sa, sb] = [await open(a), await open(b)];
    const dispatched = [];
    const notified = [];
    for (const socket of [sa, sb]) {
      socket.on('dispatch:new', (v) => dispatched.push(v.kind));
      socket.on('notification', (v) => notified.push(v.kind));
    }
    assert.equal((await post(a.agent, '/cpu/transfer', { to: b.user._id })).status, 200);
    assert.equal((await post(b.agent, '/cpu/transfer/answer', { accept: true })).status, 200);
    const ordinary = once(sa, 'dispatch:new', { signal: AbortSignal.timeout(5000) });
    deliverNotifications([
      {
        user: a.user._id,
        kind: 'despacho',
        occurrence: new mongoose.Types.ObjectId(),
        title: 'Novo despacho',
        message: 'Nova ocorrência encaminhada à sua guarnição.',
      },
    ]);
    await ordinary;
    assert.deepEqual(notified.sort(), ['despacho', 'passagem-cpu', 'passagem-cpu', 'turno-cpu']);
    assert.deepEqual(dispatched, ['despacho']);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise((resolve) => io.close(resolve));
  }
});

test('cancelamento avisa o destinatário e marca o pedido como lido', async () => {
  await post(a.agent, '/cpu/transfer', { to: b.user._id });
  assert.equal((await del(a.agent, '/cpu/transfer')).status, 200);
  const request = await Notification.findOne({
    user: b.user._id,
    message: 'PassagemA quer passar o CPU para você.',
  });
  assert.equal(request.read, true);
  const notice = await Notification.findOne({
    user: b.user._id,
    kind: 'passagem-cpu',
    message: 'PassagemA cancelou a passagem do CPU.',
  });
  assert.ok(notice);
  assert.equal(notice.read, false);
  assert.equal(notice.title, 'Passagem do CPU');
});
