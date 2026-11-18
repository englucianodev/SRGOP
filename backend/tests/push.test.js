import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import request from 'supertest';
import webpush from 'web-push';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import {
  User,
  City,
  Session,
  SystemSetting,
  Notification,
  Attendance,
  PushSubscription,
} from '../models/index.js';
import {
  sendPush,
  setPushTransport,
  MAX_PUSH_FAILURES,
  MAX_SUBSCRIPTIONS_PER_USER,
} from '../services/push.js';
import { deliverNotifications } from '../services/realtime.js';

let mongo, app, city, soldier, other, sent, failure;
const origin = 'http://localhost:5173';
const password = 'PushSeguro!2026';
// Ephemeral keys for this run only; the application itself never generates VAPID keys.
const vapid = webpush.generateVAPIDKeys();
const objectId = () => new mongoose.Types.ObjectId();
const post = (agent, route, body = {}) =>
  agent.post(`/api${route}`).set('Origin', origin).send(body);
const remove = (agent, route, body = {}) =>
  agent.delete(`/api${route}`).set('Origin', origin).send(body);
const subscription = (host = 'fcm.googleapis.com') => ({
  endpoint: `https://${host}/fcm/send/${randomBytes(12).toString('hex')}`,
  keys: {
    p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  },
});
function withKeys(overrides = {}) {
  Object.assign(process.env, {
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: 'mailto:suporte@srgop.local',
    ...overrides,
  });
}
function withoutKeys() {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
}
async function person(name, role) {
  const user = await User.create({
    name,
    email: `${name.toLowerCase()}@push.local`,
    password: await bcrypt.hash(password, 4),
    city: city._id,
    role,
    active: true,
  });
  const agent = request.agent(app);
  assert.equal((await post(agent, '/auth/login', { email: user.email, password })).status, 200);
  return { user, agent, session: await Session.findOne({ user: user._id }) };
}
const notify = (user, kind = 'despacho', extra = {}) =>
  Notification.create({
    user: user._id,
    title: 'Novo despacho',
    message: 'Nova ocorrência encaminhada à sua guarnição.',
    occurrence: objectId(),
    kind,
    ...extra,
  });
// The fake transport keeps every test off the network.
const fakeTransport = async (target, payload, options) => {
  if (failure) throw failure;
  sent.push({ target, payload: JSON.parse(payload), options });
};
const subscribe = async (p, body = subscription()) => {
  const response = await post(p.agent, '/push/subscriptions', body);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return body;
};

before(async () => {
  process.env.JWT_SECRET = 'chave_de_teste_para_notificacoes_push_1234567890';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(mongo.getUri('srgop_push'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
  city = await City.create({ name: 'Cidade push', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  soldier = await person('Soldado', 'Praça');
  other = await person('Colega', 'Praça');
  setPushTransport(fakeTransport);
});
beforeEach(async () => {
  sent = [];
  failure = null;
  withKeys();
  await PushSubscription.deleteMany({});
});
after(async () => {
  setPushTransport(null);
  withoutKeys();
  await mongoose.disconnect();
  await mongo?.stop();
});

test('configuração exige login e informa desativado quando falta qualquer chave VAPID', async () => {
  assert.equal((await request(app).get('/api/push/config')).status, 401);
  withoutKeys();
  const off = await soldier.agent.get('/api/push/config');
  assert.equal(off.status, 200);
  assert.deepEqual(off.body, { enabled: false, publicKey: null });
  for (const missing of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
    withKeys();
    delete process.env[missing];
    assert.equal((await soldier.agent.get('/api/push/config')).body.enabled, false, missing);
  }
});

test('configuração informa ativado e devolve somente a chave pública', async () => {
  const on = await soldier.agent.get('/api/push/config');
  assert.equal(on.status, 200);
  assert.deepEqual(on.body, { enabled: true, publicKey: vapid.publicKey });
  assert.equal(JSON.stringify(on.body).includes(vapid.privateKey), false);
});

test('chaves VAPID inválidas ou que não formam um par deixam o recurso desligado', async () => {
  withKeys({ VAPID_PUBLIC_KEY: webpush.generateVAPIDKeys().publicKey });
  assert.equal((await soldier.agent.get('/api/push/config')).body.enabled, false);
  withKeys({ VAPID_SUBJECT: 'sem-esquema' });
  assert.equal((await soldier.agent.get('/api/push/config')).body.enabled, false);
  withKeys({ VAPID_PRIVATE_KEY: 'nao-e-uma-chave' });
  assert.equal((await soldier.agent.get('/api/push/config')).body.enabled, false);
});

test('inscrição é recusada quando o servidor não tem chaves configuradas', async () => {
  withoutKeys();
  const response = await post(soldier.agent, '/push/subscriptions', subscription());
  assert.equal(response.status, 409);
  assert.equal(await PushSubscription.countDocuments(), 0);
});

test('inscrição aceita somente endpoints HTTPS de serviços de push conhecidos', async () => {
  const valid = subscription();
  const rejected = [
    valid.endpoint.replace('https:', 'http:'),
    'https://evil.example/fcm/send/abc',
    'https://fcm.googleapis.com.evil.example/fcm/send/abc',
    'https://fcm.googleapis.com@evil.example/fcm/send/abc',
    'https://evil.example\\@fcm.googleapis.com/fcm/send/abc',
    'https://evil.example/#@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://127.0.0.1/fcm/send/abc',
    'https://localhost/fcm/send/abc',
    'https://notify.windows.com.evil.example/w/abc',
    'https://evilpush.apple.com/abc',
    'ftp://fcm.googleapis.com/fcm/send/abc',
    'fcm.googleapis.com/fcm/send/abc',
    `https://fcm.googleapis.com/fcm/send/${'a'.repeat(3000)}`,
  ];
  for (const endpoint of rejected) {
    const response = await post(soldier.agent, '/push/subscriptions', { ...valid, endpoint });
    assert.equal(response.status, 422, endpoint);
  }
  assert.equal(await PushSubscription.countDocuments(), 0);
  const accepted = [
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'wns2-by3p.notify.windows.com',
    'web.push.apple.com',
    'api.push.apple.com',
  ];
  for (const host of accepted) await subscribe(soldier, subscription(host));
  assert.equal(await PushSubscription.countDocuments(), accepted.length);
});

test('inscrição recusa chaves malformadas e campos extras', async () => {
  const valid = subscription();
  const rejected = [
    { ...valid, keys: { ...valid.keys, p256dh: `${valid.keys.p256dh.slice(0, -2)}+/` } },
    { ...valid, keys: { ...valid.keys, p256dh: 'curta' } },
    { ...valid, keys: { ...valid.keys, p256dh: 'A'.repeat(500) } },
    { ...valid, keys: { ...valid.keys, auth: 'A'.repeat(200) } },
    { ...valid, keys: { ...valid.keys, auth: 'não é base64url!!' } },
    { ...valid, keys: { p256dh: valid.keys.p256dh } },
    { ...valid, keys: { ...valid.keys, extra: 'x' } },
    { ...valid, user: String(other.user._id) },
    { endpoint: valid.endpoint },
  ];
  for (const body of rejected) {
    const response = await post(soldier.agent, '/push/subscriptions', body);
    assert.equal(response.status, 422, JSON.stringify(body));
  }
  assert.equal(await PushSubscription.countDocuments(), 0);
});

test('inscrição faz upsert pelo endpoint, vinculada ao usuário e à sessão atuais', async () => {
  const body = await subscribe(soldier);
  const renewed = { ...body, keys: subscription().keys };
  const response = await post(soldier.agent, '/push/subscriptions', renewed);
  assert.equal(response.status, 201);
  assert.equal(JSON.stringify(response.body).includes(renewed.keys.auth), false);
  const rows = await PushSubscription.find();
  assert.equal(rows.length, 1);
  assert.equal(String(rows[0].user), String(soldier.user._id));
  assert.equal(String(rows[0].session), String(soldier.session._id));
  assert.equal(rows[0].keys.auth, renewed.keys.auth);
  assert.equal(rows[0].failures, 0);
});

test('endpoint que pertencia a outro usuário passa para quem está logado no aparelho', async () => {
  const body = await subscribe(soldier);
  await subscribe(other, body);
  const rows = await PushSubscription.find();
  assert.equal(rows.length, 1);
  assert.equal(String(rows[0].user), String(other.user._id));
  assert.equal(String(rows[0].session), String(other.session._id));
  await sendPush([await notify(soldier.user)]);
  assert.equal(sent.length, 0);
});

test('cada usuário mantém um número limitado de aparelhos inscritos', async () => {
  const first = await subscribe(soldier);
  for (let i = 0; i < MAX_SUBSCRIPTIONS_PER_USER; i += 1) await subscribe(soldier);
  assert.equal(
    await PushSubscription.countDocuments({ user: soldier.user._id }),
    MAX_SUBSCRIPTIONS_PER_USER,
  );
  assert.equal(await PushSubscription.exists({ endpoint: first.endpoint }), null);
});

test('remoção apaga somente a inscrição do próprio usuário', async () => {
  const body = await subscribe(soldier);
  const foreign = await remove(other.agent, '/push/subscriptions', { endpoint: body.endpoint });
  assert.equal(foreign.status, 200);
  assert.equal(await PushSubscription.countDocuments({ endpoint: body.endpoint }), 1);
  assert.equal((await remove(soldier.agent, '/push/subscriptions', {})).status, 422);
  const own = await remove(soldier.agent, '/push/subscriptions', { endpoint: body.endpoint });
  assert.equal(own.status, 200);
  assert.equal(await PushSubscription.countDocuments(), 0);
});

test('rotas de push continuam disponíveis durante um atendimento', async () => {
  const attendance = await Attendance.create({
    occurrence: objectId(),
    crew: objectId(),
    acceptedBy: soldier.user._id,
    startedAt: new Date(),
  });
  try {
    const blocked = await soldier.agent.put('/api/settings').set('Origin', origin).send({});
    assert.equal(blocked.status, 409);
    assert.equal((await soldier.agent.get('/api/push/config')).status, 200);
    const body = await subscribe(soldier);
    const gone = await remove(soldier.agent, '/push/subscriptions', { endpoint: body.endpoint });
    assert.equal(gone.status, 200);
  } finally {
    await Attendance.deleteOne({ _id: attendance._id });
  }
});

test('sendPush envia despacho somente para os aparelhos do destinatário', async () => {
  const mine = await subscribe(soldier);
  await subscribe(other);
  const row = await notify(soldier.user);
  await sendPush([row]);
  assert.equal(sent.length, 1);
  const [{ target, payload, options }] = sent;
  assert.equal(target.endpoint, mine.endpoint);
  assert.deepEqual(target.keys, mine.keys);
  assert.deepEqual(Object.keys(payload).sort(), ['body', 'kind', 'tag', 'title', 'url']);
  assert.equal(payload.title, row.title);
  assert.equal(payload.body, row.message);
  assert.equal(payload.kind, 'despacho');
  assert.equal(payload.url, '/atendimento');
  assert.equal(payload.tag, `despacho:${row.occurrence}`);
  assert.equal(options.urgency, 'high');
  assert.ok(options.TTL > 0 && options.TTL <= 3600);
  assert.equal(options.vapidDetails.publicKey, vapid.publicKey);
});

test('opções e chaves enviadas são aceitas pela biblioteca web-push real', async () => {
  await subscribe(soldier);
  let details;
  // Builds the encrypted request exactly as the real transport would, without sending it.
  setPushTransport(async (target, payload, options) => {
    details = webpush.generateRequestDetails(target, payload, options);
  });
  try {
    await sendPush([await notify(soldier.user)]);
  } finally {
    setPushTransport(fakeTransport);
  }
  assert.equal(details.method, 'POST');
  assert.equal(details.headers.Urgency, 'high');
  assert.equal(details.headers.TTL, 900);
  assert.match(details.headers.Authorization, /^vapid /);
  assert.ok(details.body.length > 0 && details.body.length < 4096);
  assert.equal((await PushSubscription.findOne()).failures, 0);
});

test('sendPush cobre apoio, urgência, pendente, turno expirado e passagem do CPU com o destino correto', async () => {
  await subscribe(soldier);
  const emergency = objectId();
  await sendPush([
    await notify(soldier.user, 'apoio'),
    await notify(soldier.user, 'urgencia', { emergency, occurrence: undefined, priority: 'Máxima' }),
    await notify(soldier.user, 'pendente'),
    await notify(soldier.user, 'turno-expirado'),
    await notify(soldier.user, 'passagem-cpu', { occurrence: undefined }),
  ]);
  const urls = Object.fromEntries(sent.map((s) => [s.payload.kind, s.payload.url]));
  assert.deepEqual(urls, {
    apoio: '/atendimento',
    urgencia: `/mapa?emergency=${emergency}`,
    pendente: '/despachos',
    'turno-expirado': '/atendimento',
    'passagem-cpu': '/dashboard',
  });
});

test('sendPush ignora chat, sistema e atendimento automático', async () => {
  await subscribe(soldier);
  await sendPush([
    await notify(soldier.user, 'chat'),
    await notify(soldier.user, 'sistema'),
    await notify(soldier.user, 'automatico'),
  ]);
  assert.equal(sent.length, 0);
});

test('sendPush não envia nada quando as chaves não estão configuradas', async () => {
  await subscribe(soldier);
  withoutKeys();
  await sendPush([await notify(soldier.user)]);
  assert.equal(sent.length, 0);
  assert.equal(await PushSubscription.countDocuments(), 1);
});

test('sendPush apaga a inscrição quando o serviço de push responde 404 ou 410', async () => {
  for (const statusCode of [410, 404]) {
    await subscribe(soldier);
    failure = Object.assign(new Error('Received unexpected response code'), { statusCode });
    await sendPush([await notify(soldier.user)]);
    assert.equal(await PushSubscription.countDocuments(), 0, String(statusCode));
  }
});

test('sendPush apaga a inscrição e não envia quando a sessão não existe mais', async () => {
  const guest = await person('Visitante', 'Praça');
  await subscribe(guest);
  await subscribe(soldier);
  assert.equal((await post(guest.agent, '/auth/logout')).status, 200);
  await sendPush([await notify(guest.user), await notify(soldier.user)]);
  assert.equal(sent.length, 1);
  assert.equal(await PushSubscription.countDocuments({ user: guest.user._id }), 0);
  assert.equal(await PushSubscription.countDocuments({ user: soldier.user._id }), 1);
});

test('sendPush trata sessão vencida como encerrada', async () => {
  const guest = await person('Vencido', 'Praça');
  await subscribe(guest);
  await Session.updateOne({ _id: guest.session._id }, { expiresAt: new Date(Date.now() - 1000) });
  await sendPush([await notify(guest.user)]);
  assert.equal(sent.length, 0);
  assert.equal(await PushSubscription.countDocuments(), 0);
});

test('sendPush não lança quando o transporte falha e preserva a inscrição', async () => {
  await subscribe(soldier);
  failure = new Error('getaddrinfo ENOTFOUND fcm.googleapis.com');
  await assert.doesNotReject(sendPush([await notify(soldier.user)]));
  failure = Object.assign(new Error('Service unavailable'), { statusCode: 503 });
  await assert.doesNotReject(sendPush([await notify(soldier.user)]));
  const row = await PushSubscription.findOne();
  assert.ok(row);
  assert.equal(row.failures, 0);
});

test('sendPush conta recusas do serviço de push e descarta a inscrição após repetidas', async () => {
  await subscribe(soldier);
  failure = Object.assign(new Error('Forbidden'), { statusCode: 403 });
  for (let i = 1; i < MAX_PUSH_FAILURES; i += 1) {
    await sendPush([await notify(soldier.user)]);
    assert.equal((await PushSubscription.findOne()).failures, i);
  }
  failure = null;
  await sendPush([await notify(soldier.user)]);
  assert.equal((await PushSubscription.findOne()).failures, 0);
  failure = Object.assign(new Error('Forbidden'), { statusCode: 403 });
  for (let i = 0; i < MAX_PUSH_FAILURES; i += 1) await sendPush([await notify(soldier.user)]);
  assert.equal(await PushSubscription.countDocuments(), 0);
});

test('sendPush revalida o endpoint gravado antes de qualquer requisição', async () => {
  await PushSubscription.create({
    user: soldier.user._id,
    session: soldier.session._id,
    endpoint: 'https://127.0.0.1/interno',
    keys: subscription().keys,
  });
  await sendPush([await notify(soldier.user)]);
  assert.equal(sent.length, 0);
  assert.equal(await PushSubscription.countDocuments(), 0);
});

test('sendPush não lança com entrada inválida', async () => {
  await assert.doesNotReject(sendPush(undefined));
  await assert.doesNotReject(sendPush([null, {}, { kind: 'despacho' }]));
});

test('deliverNotifications dispara o push sem aguardar nem lançar', async () => {
  const mine = await subscribe(soldier);
  const row = await notify(soldier.user);
  assert.equal(deliverNotifications([row]), undefined);
  for (let i = 0; i < 100 && !sent.length; i += 1) await new Promise((r) => setTimeout(r, 20));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].target.endpoint, mine.endpoint);
  failure = new Error('falha de rede simulada');
  assert.doesNotThrow(() => deliverNotifications([row]));
  await new Promise((r) => setTimeout(r, 100));
});
