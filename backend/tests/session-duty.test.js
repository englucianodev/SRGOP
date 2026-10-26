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
import { User, City, Crew, Session, SystemSetting, DailyOfficer } from '../models/index.js';
import { serviceWindow } from '../utils/time.js';
import { configureSocket } from '../services/realtime.js';
let mongo, app, city;
const origin = 'http://localhost:5173',
  password = 'InatividadeTeste!2026';
async function person(tag, role = 'Praça') {
  const user = await User.create({
    name: tag,
    email: `${tag}@session.local`,
    password: await bcrypt.hash(password, 4),
    role,
    active: true,
    city: city._id,
  });
  const agent = request.agent(app);
  const r = await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: user.email, password });
  assert.equal(r.status, 200);
  const session = await Session.findOne({ user: user._id });
  return {
    user,
    agent,
    session,
    cookie: r.headers['set-cookie'].map((v) => v.split(';')[0]).join('; '),
  };
}
async function duty(person, mode = 'Regular') {
  const crew = await Crew.create({
    name: `Equipe ${person.user.name}`,
    city: city._id,
    type: mode === 'Motocicleta' ? 'Motocicleta' : 'Viatura Convencional',
    shiftMode: mode,
    members: [person.user._id],
    status: 'Disponível',
    shiftStart: new Date(),
    shiftEnd: mode === 'Motocicleta' ? null : new Date(Date.now() + 8 * 3600000),
  });
  await User.updateOne({ _id: person.user._id }, { crew: crew._id });
  return crew;
}
const idle = (p, minutes) =>
  Session.updateOne(
    { _id: p.session._id },
    { lastActivity: new Date(Date.now() - minutes * 60000) },
  );
before(async () => {
  process.env.JWT_SECRET = 'chave_teste_seis_horas_em_servico_1234567890';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri('session_duty'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
  city = await City.create({ name: 'Cidade do plantão', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general', inactivityMinutes: 5 });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('serviço convencional mantém sessão após 5h59 e encerra ao atingir seis horas de inatividade', async () => {
  const p = await person('PlantaoRegular');
  const crew = await duty(p);
  await idle(p, 359);
  let r = await p.agent.get('/api/auth/me');
  assert.equal(r.status, 200);
  assert.equal(r.body.inactivityPolicy.onDuty, true);
  assert.equal(r.body.inactivityPolicy.inactivityMinutes, 360);
  assert.equal(r.body.inactivityPolicy.offDutyInactivityMinutes, 5);
  assert.equal(r.body.inactivityPolicy.dutyEndsAt, crew.shiftEnd.toISOString());
  await idle(p, 360);
  r = await p.agent.get('/api/auth/me');
  assert.equal(r.status, 401);
  assert.equal(await Session.countDocuments({ _id: p.session._id }), 0);
});
test('motocicletas sem prazo fixo usam seis horas para todos os policiais em serviço', async () => {
  const p = await person('PlantaoMoto');
  await duty(p, 'Motocicleta');
  await idle(p, 180);
  const r = await p.agent.get('/api/auth/me');
  assert.equal(r.status, 200);
  assert.equal(r.body.inactivityPolicy.inactivityMinutes, 360);
  assert.equal(r.body.inactivityPolicy.dutyEndsAt, null);
});
test('fora de serviço continua usando o prazo configurado e vínculo sem integrante não concede seis horas', async () => {
  await SystemSetting.updateOne({ key: 'general' }, { inactivityMinutes: 10 });
  const p = await person('ForaDeServico');
  await idle(p, 6);
  let r = await p.agent.get('/api/auth/me');
  assert.equal(r.status, 200);
  assert.equal(r.body.inactivityPolicy.inactivityMinutes, 10);
  assert.equal(r.body.inactivityPolicy.onDuty, false);
  await idle(p, 10);
  assert.equal((await p.agent.get('/api/auth/me')).status, 401);
  await SystemSetting.updateOne({ key: 'general' }, { inactivityMinutes: 5 });
  const q = await person('VinculoAntigo');
  const crew = await duty(q);
  await Crew.updateOne({ _id: crew._id }, { members: [] });
  await idle(q, 6);
  assert.equal((await q.agent.get('/api/auth/me')).status, 401);
});
test('encerramento do serviço volta imediatamente ao prazo comum sem renovar atividade automaticamente', async () => {
  const p = await person('FimDoPlantao');
  const crew = await duty(p);
  await idle(p, 7);
  assert.equal((await p.agent.get('/api/auth/me')).status, 200);
  await Crew.updateOne({ _id: crew._id }, { shiftEnd: new Date(Date.now() - 1000) });
  assert.equal((await p.agent.get('/api/auth/me')).status, 401);
});
test('CPU do serviço também recebe seis horas e perde a extensão quando deixa a escala atual', async () => {
  const p = await person('CPUDoPlantao', 'Oficial');
  await DailyOfficer.create({ day: serviceWindow().day, officer: p.user._id });
  await idle(p, 60);
  let r = await p.agent.get('/api/auth/me');
  assert.equal(r.status, 200);
  assert.equal(r.body.inactivityPolicy.inactivityMinutes, 360);
  assert.equal(r.body.inactivityPolicy.dutyEndsAt, serviceWindow().end.toISOString());
  await DailyOfficer.deleteMany({ officer: p.user._id });
  assert.equal((await p.agent.get('/api/auth/me')).status, 401);
});
test('login e atividade retornam o mesmo prazo e somente atividade renova o relógio', async () => {
  const p = await person('AtividadePlantao');
  await duty(p);
  await idle(p, 120);
  const before = await Session.findById(p.session._id);
  const me = await p.agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(+new Date(me.body.lastActivity), +before.lastActivity);
  const r = await p.agent.post('/api/auth/activity').set('Origin', origin).send({});
  assert.equal(r.status, 200);
  assert.equal(r.body.inactivityPolicy.inactivityMinutes, 360);
  assert.ok(Date.now() - +new Date(r.body.lastActivity) < 5000);
  const login = await p.agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: p.user.email, password });
  assert.equal(login.status, 200);
  assert.equal(login.body.inactivityPolicy.inactivityMinutes, 360);
});
test('a extensão por serviço não ignora o vencimento absoluto da sessão', async () => {
  const p = await person('VencimentoAbsoluto');
  await duty(p);
  await Session.updateOne({ _id: p.session._id }, { expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await p.agent.get('/api/auth/me')).status, 401);
});
test('Socket.IO aceita sessão em serviço após duas horas e rejeita inatividade fora de serviço', async () => {
  const p = await person('SocketPlantao');
  await duty(p);
  await idle(p, 120);
  const q = await person('SocketFora');
  await idle(q, 6);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const io = configureSocket(server, [origin]);
  const sockets = [];
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const a = connect(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      autoConnect: false,
      extraHeaders: { Cookie: p.cookie, Origin: origin },
    });
    sockets.push(a);
    const connected = once(a, 'connect');
    a.connect();
    await connected;
    const b = connect(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      autoConnect: false,
      extraHeaders: { Cookie: q.cookie, Origin: origin },
    });
    sockets.push(b);
    const rejected = once(b, 'connect_error');
    b.connect();
    await rejected;
    assert.equal(b.connected, false);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise((resolve) => io.close(resolve));
  }
});
