import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import {
  User,
  City,
  Crew,
  CrewShift,
  Session,
  DailyOfficer,
  Notification,
  Attendance,
  AuditLog,
  SystemSetting,
} from '../models/index.js';
import { serviceWindow } from '../utils/time.js';
import { expireShifts, alignActiveShifts } from '../services/operations.js';
import { configureSocket } from '../services/realtime.js';
let mongo, app, city, otherCity, admin, operator, cpu, otherOfficer, team;
const origin = 'http://localhost:5173',
  initialPassword = 'AccountTeste!2026';
const post = (agent, route, body = {}) =>
  agent.post(`/api${route}`).set('Origin', origin).send(body);
const put = (agent, route, body) => agent.put(`/api${route}`).set('Origin', origin).send(body);
async function person(name, role) {
  const user = await User.create({
    name,
    email: `${name}@account.local`,
    password: await bcrypt.hash(initialPassword, 4),
    city: city._id,
    role,
    active: true,
  });
  const agent = request.agent(app),
    login = await post(agent, '/auth/login', { email: user.email, password: initialPassword });
  assert.equal(login.status, 200);
  return {
    user,
    agent,
    cookie: login.headers['set-cookie'].map((v) => v.split(';')[0]).join('; '),
  };
}
const body = (cityId = city._id) => ({
  city: String(cityId),
  occurredAt: new Date(Date.now() - 86400000).toISOString(),
  crimeType: 'Furto',
  address: 'Rua do teste de CPU',
  description: 'Descrição de ocorrência para validar os alertas de despacho.',
  priority: 'Baixa',
});
before(async () => {
  process.env.JWT_SECRET = 'chave_aleatoria_de_teste_para_conta_e_escala_12345678';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(mongo.getUri('account_duty'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
  city = await City.create({ name: 'Cidade do serviço', latitude: -5.2, longitude: -44.4 });
  otherCity = await City.create({ name: 'Outra cidade', latitude: -5.3, longitude: -44.5 });
  await SystemSetting.create({ key: 'general' });
  admin = await person('Administrador', 'Administrativo');
  operator = await person('Operador', 'Praça');
  cpu = await person('OficialCPU', 'Oficial');
  otherOfficer = await person('OutroOficial', 'Oficial');
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('serviço usa 8h de Fortaleza e pertence ao dia anterior antes das 8h', () => {
  const before = serviceWindow(new Date('2026-10-25T07:59:59-03:00')),
    after = serviceWindow(new Date('2026-10-25T08:00:00-03:00'));
  assert.equal(before.day, '2026-10-24');
  assert.equal(before.end.toISOString(), '2026-10-25T11:00:00.000Z');
  assert.equal(after.day, '2026-10-25');
  assert.equal(after.start.toISOString(), '2026-10-25T11:00:00.000Z');
  assert.equal(after.end.toISOString(), '2026-10-26T11:00:00.000Z');
});
test('própria conta aceita os dados pessoais sem permitir promoção de acesso', async () => {
  const profile = {
    name: 'Nome completo do Operador',
    email: operator.user.email,
    callSign: 'Silva',
    rank: 'Cabo',
    serviceNumber: '123/45',
    registration: '0001234',
    phone: '(98) 99999-1234',
  };
  assert.equal(
    (await put(operator.agent, '/auth/me', { ...profile, role: 'Administrativo' })).status,
    422,
  );
  assert.equal(
    (await put(operator.agent, '/auth/me', { ...profile, rank: 'General' })).status,
    422,
  );
  const response = await put(operator.agent, '/auth/me', profile);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.user.callSign, 'Silva');
  assert.equal(response.body.user.registration, '0001234');
  assert.equal(response.body.user.role, 'Praça');
  assert.equal(response.body.user.password, undefined);
  assert.equal((await operator.agent.get('/api/auth/me')).body.user.rank, 'Cabo');
});
test('alterar e-mail exige senha atual e não aceita e-mail já utilizado', async () => {
  const profile = { name: 'Nome completo do Operador', email: 'novo@account.local' };
  assert.equal((await put(operator.agent, '/auth/me', profile)).status, 422);
  assert.equal(
    (await put(operator.agent, '/auth/me', { ...profile, currentPassword: 'incorreta' })).status,
    422,
  );
  assert.equal(
    (
      await put(operator.agent, '/auth/me', {
        ...profile,
        email: admin.user.email,
        currentPassword: initialPassword,
      })
    ).status,
    409,
  );
  assert.equal(
    (await put(operator.agent, '/auth/me', { ...profile, currentPassword: initialPassword }))
      .status,
    200,
  );
  operator.user.email = profile.email;
});
test('foto é autenticada, restrita à própria conta, atualizável e removível', async () => {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
    'base64',
  );
  assert.equal((await request(app).get('/api/auth/me/photo')).status, 401);
  const upload = await operator.agent
    .put('/api/auth/me/photo')
    .set('Origin', origin)
    .attach('photo', bytes, 'perfil.png');
  assert.equal(upload.status, 200, JSON.stringify(upload.body));
  assert.ok(upload.body.user.avatarVersion);
  const photo = await operator.agent.get('/api/auth/me/photo');
  assert.equal(photo.status, 200);
  assert.equal(photo.headers['content-type'], 'image/png');
  assert.deepEqual(photo.body, bytes);
  assert.equal((await otherOfficer.agent.get('/api/auth/me/photo')).status, 404);
  const invalid = await operator.agent
    .put('/api/auth/me/photo')
    .set('Origin', origin)
    .attach('photo', Buffer.from('<svg><script>teste</script></svg>'), 'perfil.jpg');
  assert.equal(invalid.status, 422);
  const oversized = await operator.agent
    .put('/api/auth/me/photo')
    .set('Origin', origin)
    .attach('photo', Buffer.alloc(2 * 1024 * 1024 + 1), 'foto.png');
  assert.equal(oversized.status, 422);
  assert.match(oversized.body.message, /2 MB/);
  assert.equal(
    (await operator.agent.delete('/api/auth/me/photo').set('Origin', origin)).status,
    200,
  );
  assert.equal((await operator.agent.get('/api/auth/me/photo')).status, 404);
  assert.equal((await User.findById(operator.user._id)).avatarVersion, '');
});
test('cadastro e administração aceitam novos campos e preservam a aprovação de acesso', async () => {
  const response = await post(request(app), '/auth/register', {
    name: 'Policial Cadastrado',
    email: 'cadastro@account.local',
    password: initialPassword,
    confirmPassword: initialPassword,
    city: String(city._id),
    role: 'Administrativo',
    callSign: 'Souza',
    rank: 'Soldado',
    registration: '0123',
    serviceNumber: '12/34',
    phone: '98999991234',
  });
  assert.equal(response.status, 201);
  const user = await User.findOne({ email: 'cadastro@account.local' });
  assert.equal(user.active, false);
  assert.equal(user.role, 'Praça');
  assert.equal(user.callSign, 'Souza');
  const edited = await put(admin.agent, `/users/${user._id}`, {
    name: user.name,
    email: user.email,
    city: String(city._id),
    role: 'Praça',
    active: true,
    callSign: 'Souza',
    rank: '3º Sargento',
    registration: '0123',
    phone: '98999991234',
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.rank, '3º Sargento');
});
test('ingresso tardio respeita a janela fixa e encerramento automático registra o horário previsto', async () => {
  team = await Crew.create({ name: 'Guarnição das oito', city: city._id });
  const duty = serviceWindow();
  const response = await post(operator.agent, `/crews/${team._id}/join`, { driver: false });
  assert.equal(response.status, 200);
  assert.equal(response.body.shiftStart, duty.start.toISOString());
  assert.equal(response.body.shiftEnd, duty.end.toISOString());
  const shift = await CrewShift.findById(response.body.shift);
  assert.equal(shift.dutyDay, duty.day);
  assert.ok(+shift.changes[0].at >= +shift.start);
  const scheduled = new Date(Date.now() - 1000);
  await Crew.updateOne({ _id: team._id }, { shiftEnd: scheduled });
  await expireShifts();
  assert.equal(+(await CrewShift.findById(shift._id)).end, +scheduled);
  assert.equal((await User.findById(operator.user._id)).crew, null);
});
test('turnos ativos antigos são adequados uma vez sem alterar o horário de ingresso', async () => {
  const start = new Date(Date.now() - 3600000);
  const legacy = await Crew.create({
    name: 'Turno legado',
    city: city._id,
    status: 'Disponível',
    members: [otherOfficer.user._id],
    shiftStart: start,
    shiftEnd: new Date(+start + 86400000),
  });
  const shift = await CrewShift.create({
    crew: legacy._id,
    start,
    plannedEnd: legacy.shiftEnd,
    members: legacy.members,
    changes: [
      {
        member: otherOfficer.user._id,
        actor: otherOfficer.user._id,
        action: 'Ingresso',
        at: start,
      },
    ],
  });
  legacy.shift = shift._id;
  await legacy.save();
  await alignActiveShifts();
  await alignActiveShifts();
  const updated = await CrewShift.findById(shift._id);
  assert.equal(+updated.plannedEnd, +serviceWindow(start).end);
  assert.equal(+updated.changes[0].at, +start);
  assert.equal(
    await AuditLog.countDocuments({
      action: 'Adequação do turno às 8h',
      entityId: String(legacy._id),
    }),
    1,
  );
});
test('ocorrência aberta avisa somente o CPU do serviço e entra nos alertas independentemente da data do fato', async () => {
  await DailyOfficer.create({ day: serviceWindow().day, officer: cpu.user._id });
  const response = await post(operator.agent, '/occurrences', body());
  assert.equal(response.status, 201);
  assert.equal(response.body.status, 'Em aberto');
  const alerts = await Notification.find({ occurrence: response.body._id, kind: 'pendente' });
  assert.deepEqual(
    alerts.map((n) => String(n.user)),
    [String(cpu.user._id)],
  );
  assert.ok((await cpu.agent.get('/api/dashboard')).body.alerts >= 1);
  await put(cpu.agent, '/auth/me', {
    name: cpu.user.name,
    email: cpu.user.email,
    callSign: 'Pontes',
    rank: 'Capitão',
    phone: '98988881234',
  });
  const contact = await operator.agent.get('/api/service-cpu');
  assert.equal(contact.status, 200);
  assert.equal(contact.body.officer.phone, '(98)98888-1234');
  assert.equal(contact.body.officer.callSign, 'Pontes');
  assert.equal(contact.body.officer.email, undefined);
});
test('atendimento automático dispensa alerta de despacho e Minha conta funciona durante atendimento', async () => {
  assert.equal(
    (await post(operator.agent, `/crews/${team._id}/join`, { driver: false })).status,
    200,
  );
  const response = await post(operator.agent, '/occurrences', body());
  assert.equal(response.status, 201);
  assert.equal(response.body.status, 'Em atendimento');
  assert.equal(
    await Notification.countDocuments({ occurrence: response.body._id, kind: 'pendente' }),
    0,
  );
  assert.equal(
    (
      await put(operator.agent, '/auth/me', {
        name: 'Nome completo do Operador',
        email: operator.user.email,
        callSign: 'Silva',
        rank: 'Cabo',
        phone: '98999991234',
      })
    ).status,
    200,
  );
  assert.ok(await Attendance.exists({ acceptedBy: operator.user._id, status: 'Em atendimento' }));
});
test('sem CPU o Administrativo recebe aviso e o novo CPU recupera as pendências', async () => {
  await DailyOfficer.deleteMany({});
  const response = await post(operator.agent, '/occurrences', body(otherCity._id));
  assert.equal(response.status, 201);
  const alerts = await Notification.find({ occurrence: response.body._id, kind: 'pendente' });
  assert.deepEqual(
    alerts.map((n) => String(n.user)),
    [String(admin.user._id)],
  );
  assert.equal((await post(cpu.agent, '/cpu')).status, 201);
  assert.equal(
    await Notification.countDocuments({
      occurrence: response.body._id,
      user: cpu.user._id,
      kind: 'pendente',
    }),
    1,
  );
});
test('Socket.IO notifica o CPU sem emitir despacho para uma guarnição', async () => {
  const server = createServer(app),
    sockets = [],
    io = configureSocket(server, [origin]);
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
    const target = await open(cpu),
      outside = await open(otherOfficer),
      leaked = [];
    target.on('dispatch:new', (v) => leaked.push(v));
    outside.on('notification', (v) => leaked.push(v));
    const notice = once(target, 'notification', { signal: AbortSignal.timeout(5000) });
    const response = await post(operator.agent, '/occurrences', body(otherCity._id));
    assert.equal(response.status, 201);
    assert.equal((await notice)[0].kind, 'pendente');
    assert.deepEqual(leaked, []);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise((resolve) => io.close(resolve));
  }
});
test('senha própria exige confirmação, revoga todas as sessões e aceita apenas a nova senha', async () => {
  const another = request.agent(app);
  assert.equal(
    (await post(another, '/auth/login', { email: operator.user.email, password: initialPassword }))
      .status,
    200,
  );
  const input = {
    currentPassword: initialPassword,
    password: 'NovaSenhaConta!2026',
    confirmPassword: 'NovaSenhaConta!2026',
  };
  assert.equal(
    (await post(operator.agent, '/auth/me/password', { ...input, currentPassword: 'errada' }))
      .status,
    422,
  );
  assert.equal(
    (
      await post(operator.agent, '/auth/me/password', {
        ...input,
        confirmPassword: 'DiferenteSenha2026',
      })
    ).status,
    422,
  );
  assert.equal((await post(operator.agent, '/auth/me/password', input)).status, 200);
  assert.equal(await Session.countDocuments({ user: operator.user._id }), 0);
  assert.equal((await another.get('/api/auth/me')).status, 401);
  assert.equal(
    (
      await post(operator.agent, '/auth/login', {
        email: operator.user.email,
        password: initialPassword,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await post(operator.agent, '/auth/login', {
        email: operator.user.email,
        password: input.password,
      })
    ).status,
    200,
  );
  assert.ok(
    await AuditLog.exists({ actor: operator.user._id, action: 'Alteração da própria senha' }),
  );
});
