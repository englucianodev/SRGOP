import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import { createApp } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { configureSocket } from '../services/realtime.js';
import {
  User,
  City,
  Crew,
  CrewShift,
  SystemSetting,
  Attendance,
  Occurrence,
  AuditLog,
  ChatAccess,
  ChatMessage,
  Notification,
} from '../models/index.js';

let mongo,
  app,
  city,
  otherCity,
  admin,
  officer,
  first,
  teammate,
  second,
  third,
  firstCrew,
  secondCrew,
  thirdCrew,
  chat;
const origin = 'http://localhost:5173';
const password = 'FeatureTeste!2026';
const post = (agent, route, body = {}) =>
  agent.post(`/api${route}`).set('Origin', origin).send(body);
const patch = (agent, route, body) => agent.patch(`/api${route}`).set('Origin', origin).send(body);
async function account(role, name) {
  const user = await User.create({
    name,
    role,
    email: `${name}@feature.local`,
    password: await bcrypt.hash(password, 4),
    city: otherCity._id,
    active: true,
  });
  const agent = request.agent(app);
  const response = await post(agent, '/auth/login', { email: user.email, password });
  assert.equal(response.status, 200);
  return {
    user,
    agent,
    cookie: response.headers['set-cookie'].map((c) => c.split(';')[0]).join('; '),
  };
}
async function crew(name, members) {
  const row = await Crew.create({ name, city: city._id });
  for (const member of members)
    assert.equal(
      (await post(member.agent, `/crews/${row._id}/join`, { driver: false })).status,
      200,
    );
  return Crew.findById(row._id);
}
function occurrenceBody(cityId = city._id) {
  return {
    city: String(cityId),
    occurredAt: new Date().toISOString(),
    crimeType: 'Furto',
    address: 'Rua das guarnições, 100',
    description: 'Registro operacional de teste de atendimento automático.',
    priority: 'Alta',
  };
}
before(async () => {
  process.env.JWT_SECRET = 'chave_de_teste_das_novas_funcionalidades_com_32_caracteres';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectDatabase(mongo.getUri('crew_features'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await SystemSetting.create({ key: 'general' });
  city = await City.create({ name: 'Município de serviço', latitude: -5.2, longitude: -44.4 });
  otherCity = await City.create({
    name: 'Município de cadastro',
    latitude: -5.5,
    longitude: -44.7,
  });
  app = createApp();
  admin = await account('Administrativo', 'administrador');
  officer = await account('Oficial', 'oficial');
  first = await account('Praça', 'integranteum');
  teammate = await account('Praça', 'colega');
  second = await account('Praça', 'integrantedois');
  third = await account('Praça', 'integrantetres');
  firstCrew = await crew('Equipe Alfa', [first, teammate]);
  secondCrew = await crew('Equipe Bravo', [second]);
  thirdCrew = await crew('Equipe Charlie', [third]);
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('chat privado inclui a própria equipe e bloqueia pessoas externas mesmo com perfil Oficial', async () => {
  const r = await post(first.agent, '/crew-chats', {
    name: 'Operação conjunta',
    crews: [String(secondCrew._id)],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  chat = r.body;
  assert.equal(chat.memberships.length, 2);
  assert.equal(
    (await post(officer.agent, '/crew-chats', { name: 'Sem guarnição', crews: [] })).status,
    403,
  );
  assert.equal((await third.agent.get('/api/crew-chats')).body.length, 0);
  assert.equal((await officer.agent.get(`/api/crew-chats/${chat._id}/messages`)).status, 403);
  assert.equal(
    (await post(third.agent, `/crew-chats/${chat._id}/messages`, { text: 'Mensagem indevida' }))
      .status,
    403,
  );
  assert.equal(
    (await post(third.agent, `/crew-chats/${chat._id}/crews`, { crews: [String(thirdCrew._id)] }))
      .status,
    403,
  );
  const sent = await post(first.agent, `/crew-chats/${chat._id}/messages`, {
    text: 'Equipe Alfa em deslocamento.',
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const received = await second.agent.get(`/api/crew-chats/${chat._id}/messages`);
  assert.equal(received.status, 200);
  assert.equal(received.body.items[0].sender.name, first.user.name);
  assert.equal(received.body.items[0].sourceCrew.name, firstCrew.name);
  assert.equal(
    (await post(first.agent, `/crew-chats/${chat._id}/messages`, { text: '  ' })).status,
    422,
  );
});

test('mensagens geram notificações persistentes somente para integrantes participantes, sem conteúdo privado', async () => {
  const message = await ChatMessage.findOne({ chat: chat._id });
  const notices = await Notification.find({ chatMessage: message._id });
  assert.deepEqual(
    notices.map((n) => String(n.user)).sort(),
    [String(teammate.user._id), String(second.user._id)].sort(),
  );
  assert.ok(
    notices.every(
      (n) =>
        n.kind === 'chat' &&
        String(n.chat) === chat._id &&
        !n.read &&
        !n.message.includes(message.text),
    ),
  );
  const inbox = await second.agent.get('/api/notifications');
  assert.ok(inbox.body.some((n) => n.chatMessage === String(message._id)));
  assert.equal(
    (await admin.agent.get('/api/notifications')).body.filter((n) => n.kind === 'chat').length,
    0,
  );
  const notice = notices.find((n) => String(n.user) === String(second.user._id));
  assert.equal((await patch(first.agent, `/notifications/${notice._id}/read`, {})).status, 404);
  assert.equal((await patch(second.agent, `/notifications/${notice._id}/read`, {})).status, 200);
  assert.equal((await Notification.findById(notice._id)).read, true);
});

test('consulta administrativa exige motivo, é auditada e não vale para outra sessão ou conversa', async () => {
  assert.equal((await admin.agent.get(`/api/crew-chats/${chat._id}/messages`)).status, 403);
  assert.equal((await admin.agent.get('/api/crew-messages')).status, 403);
  assert.equal(
    (await post(admin.agent, `/crew-chats/${chat._id}/access`, { reason: 'curto' })).status,
    422,
  );
  const r = await post(admin.agent, `/crew-chats/${chat._id}/access`, {
    reason: 'Verificação de informações da operação conjunta.',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await admin.agent.get(`/api/crew-chats/${chat._id}/messages`)).status, 200);
  assert.ok(
    await AuditLog.exists({
      actor: admin.user._id,
      entityId: chat._id,
      action: 'Acesso administrativo ao chat',
      detail: 'Verificação de informações da operação conjunta.',
    }),
  );
  assert.ok(
    await AuditLog.exists({
      actor: admin.user._id,
      entityId: chat._id,
      action: 'Consulta administrativa de mensagens',
    }),
  );
  assert.equal(
    (
      await post(admin.agent, `/crew-chats/${chat._id}/messages`, {
        text: 'Consulta não permite enviar.',
      })
    ).status,
    403,
  );
  assert.equal(
    (await post(admin.agent, `/crew-chats/${chat._id}/crews`, { crews: [String(thirdCrew._id)] }))
      .status,
    403,
  );
  const anotherSession = request.agent(app);
  await post(anotherSession, '/auth/login', { email: admin.user.email, password });
  assert.equal((await anotherSession.get(`/api/crew-chats/${chat._id}/messages`)).status, 403);
  const anotherChat = await post(first.agent, '/crew-chats', {
    name: 'Conversa separada',
    crews: [],
  });
  assert.equal(
    (await admin.agent.get(`/api/crew-chats/${anotherChat.body._id}/messages`)).status,
    403,
  );
  await ChatAccess.updateMany({ chat: chat._id }, { expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await admin.agent.get(`/api/crew-chats/${chat._id}/messages`)).status, 403);
});

test('adição de guarnições permite conversa em grupo e leitura de histórico com paginação', async () => {
  assert.equal((await third.agent.get(`/api/crew-chats/${chat._id}/messages`)).status, 403);
  const r = await post(second.agent, `/crew-chats/${chat._id}/crews`, {
    crews: [String(thirdCrew._id)],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.memberships.length, 3);
  assert.equal(
    (
      await post(third.agent, `/crew-chats/${chat._id}/messages`, {
        text: 'Equipe Charlie integrada.',
      })
    ).status,
    201,
  );
  await ChatMessage.insertMany(
    Array.from({ length: 105 }, (_, i) => ({
      chat: chat._id,
      sender: first.user._id,
      sourceCrew: firstCrew._id,
      text: `Histórico ${i}`,
    })),
  );
  const latest = await third.agent.get(`/api/crew-chats/${chat._id}/messages`);
  assert.equal(latest.body.items.length, 100);
  assert.equal(latest.body.hasMore, true);
  const previous = await third.agent.get(
    `/api/crew-chats/${chat._id}/messages?before=${latest.body.items[0]._id}`,
  );
  assert.equal(previous.body.items.length, 7);
  assert.equal(previous.body.items[0].text, 'Equipe Alfa em deslocamento.');
  assert.equal(
    (await third.agent.get(`/api/crew-chats/${chat._id}/messages?before=invalido`)).status,
    422,
  );
});

test('remoção de integrante e troca de turno revogam o acesso ao chat', async () => {
  assert.equal((await teammate.agent.get(`/api/crew-chats/${chat._id}/messages`)).status, 200);
  assert.equal(
    (
      await post(officer.agent, `/crews/${firstCrew._id}/members`, {
        member: String(teammate.user._id),
        action: 'Saída',
        reason: 'Saída autorizada para teste de acesso.',
      })
    ).status,
    200,
  );
  assert.equal((await teammate.agent.get(`/api/crew-chats/${chat._id}/messages`)).status, 403);
  assert.equal(
    (
      await post(officer.agent, `/crews/${thirdCrew._id}/end-shift`, {
        reason: 'Encerramento do turno para teste.',
      })
    ).status,
    200,
  );
  assert.equal(
    (await post(third.agent, `/crews/${thirdCrew._id}/join`, { driver: false })).status,
    200,
  );
  assert.equal((await third.agent.get(`/api/crew-chats/${chat._id}/messages`)).status, 403);
  assert.equal(
    (await post(first.agent, `/crew-chats/${chat._id}/crews`, { crews: [String(thirdCrew._id)] }))
      .status,
    409,
  );
});

test('cadastro no município de serviço inicia atendimento e preserva cadastro, equipe e auditoria', async () => {
  const r = await post(first.agent, '/occurrences', occurrenceBody());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'Em atendimento');
  assert.equal(r.body.acceptedBy, String(first.user._id));
  assert.equal(r.body.crew, String(firstCrew._id));
  assert.ok(r.body.startedAt);
  assert.equal(
    await Attendance.countDocuments({ occurrence: r.body._id, status: 'Em atendimento' }),
    1,
  );
  assert.equal(String((await Crew.findById(firstCrew._id)).currentOccurrence), r.body._id);
  assert.ok(await AuditLog.exists({ entityId: r.body._id, action: 'Atendimento automático' }));
  const next = await post(first.agent, '/occurrences', occurrenceBody());
  assert.equal(next.status, 201);
  assert.equal(next.body.status, 'Em aberto');
  const gps = await patch(first.agent, `/crews/${firstCrew._id}/gps`, {
    enabled: true,
    latitude: -5.2,
    longitude: -44.4,
    accuracy: 7,
  });
  assert.equal(gps.status, 200, JSON.stringify(gps.body));
  assert.equal(
    (
      await post(first.agent, `/crew-chats/${chat._id}/messages`, {
        text: 'Chat disponível durante o atendimento.',
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await post(first.agent, `/attendances/${r.body._id}/close`, {
        summary: 'Atendimento automático concluído com sucesso.',
      })
    ).status,
    200,
  );
});

test('outra cidade, usuário fora de serviço e equipe indisponível mantêm ocorrência em aberto', async () => {
  assert.equal(
    (await post(first.agent, '/occurrences', occurrenceBody(otherCity._id))).body.status,
    'Em aberto',
  );
  assert.equal(
    (await post(teammate.agent, '/occurrences', occurrenceBody())).body.status,
    'Em aberto',
  );
  await Crew.updateOne({ _id: firstCrew._id }, { status: 'Indisponível' });
  assert.equal(
    (await post(first.agent, '/occurrences', occurrenceBody())).body.status,
    'Em aberto',
  );
  await Crew.updateOne({ _id: firstCrew._id }, { status: 'Disponível' });
  await Crew.updateOne({ _id: firstCrew._id }, { shiftEnd: new Date(Date.now() - 1000) });
  assert.equal(
    (await post(first.agent, '/occurrences', occurrenceBody())).body.status,
    'Em aberto',
  );
  await Crew.updateOne({ _id: firstCrew._id }, { shiftEnd: new Date(Date.now() + 3600000) });
});

test('dois cadastros simultâneos reservam apenas um atendimento', async () => {
  const rows = await Promise.all([
    post(first.agent, '/occurrences', occurrenceBody()),
    post(first.agent, '/occurrences', occurrenceBody()),
  ]);
  assert.deepEqual(
    rows.map((r) => r.status),
    [201, 201],
  );
  assert.deepEqual(rows.map((r) => r.body.status).sort(), ['Em aberto', 'Em atendimento']);
  assert.equal(
    await Attendance.countDocuments({ acceptedBy: first.user._id, status: 'Em atendimento' }),
    1,
  );
  const active = rows.find((r) => r.body.status === 'Em atendimento').body;
  await post(first.agent, `/attendances/${active._id}/close`, {
    summary: 'Atendimento concorrente encerrado corretamente.',
  });
});

test('GPS exige integrante em serviço, valida coordenadas e controla quem transmite', async () => {
  const body = { enabled: true, latitude: -5.25, longitude: -44.45, accuracy: 12 };
  assert.equal((await patch(third.agent, `/crews/${firstCrew._id}/gps`, body)).status, 403);
  assert.equal((await patch(admin.agent, `/crews/${firstCrew._id}/gps`, body)).status, 403);
  assert.equal(
    (await patch(first.agent, `/crews/${firstCrew._id}/gps`, { ...body, latitude: 91 })).status,
    422,
  );
  assert.equal((await patch(first.agent, `/crews/${firstCrew._id}/gps`, body)).status, 200);
  assert.equal(
    (await post(teammate.agent, `/crews/${firstCrew._id}/join`, { driver: false })).status,
    200,
  );
  assert.equal((await patch(teammate.agent, `/crews/${firstCrew._id}/gps`, body)).status, 409);
  assert.equal(
    (await patch(teammate.agent, `/crews/${firstCrew._id}/gps`, { enabled: false })).status,
    409,
  );
  const crews = await second.agent.get('/api/crews');
  const position = crews.body.find((c) => c._id === String(firstCrew._id)).location;
  assert.equal(position.latitude, body.latitude);
  assert.equal(position.updatedBy, String(first.user._id));
  assert.equal(position.sharing, true);
  assert.equal(
    (await patch(first.agent, `/crews/${firstCrew._id}/gps`, { enabled: false })).status,
    200,
  );
  assert.ok(await AuditLog.exists({ actor: first.user._id, action: 'GPS desativado' }));
  await Crew.updateOne({ _id: firstCrew._id }, { shiftEnd: new Date(Date.now() - 1000) });
  assert.equal((await patch(first.agent, `/crews/${firstCrew._id}/gps`, body)).status, 403);
  await Crew.updateOne({ _id: firstCrew._id }, { shiftEnd: new Date(Date.now() + 3600000) });
});

test('dois integrantes cadastrando ocorrências simultaneamente não duplicam a reserva da equipe', async () => {
  const responses = await Promise.all([
    post(first.agent, '/occurrences', occurrenceBody()),
    post(teammate.agent, '/occurrences', occurrenceBody()),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [201, 201],
  );
  assert.deepEqual(responses.map((r) => r.body.status).sort(), ['Em aberto', 'Em atendimento']);
  const active = responses.find((r) => r.body.status === 'Em atendimento').body;
  const actor = active.acceptedBy === String(first.user._id) ? first : teammate;
  assert.equal(
    (
      await post(actor.agent, `/attendances/${active._id}/close`, {
        summary: 'Encerramento da concorrência entre integrantes.',
      })
    ).status,
    200,
  );
});

test('Socket.IO entrega atualização do chat apenas às equipes participantes e GPS aos usuários autenticados', async () => {
  const server = createServer(app);
  const socketServer = configureSocket(server, [origin]);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  const open = async (person) => {
    const socket = connect(url, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Origin: origin, Cookie: person.cookie },
    });
    sockets.push(socket);
    const connected = once(socket, 'connect', { signal: AbortSignal.timeout(5000) });
    socket.connect();
    await connected;
    return socket;
  };
  try {
    const insider = await open(second);
    const outsider = await open(officer);
    const privileged = await open(admin);
    const leaks = [];
    outsider.on('notification', (event) => leaks.push(event));
    privileged.on('notification', (event) => leaks.push(event));
    insider.on('dispatch:new', (event) => leaks.push(event));
    outsider.on('chat:changed', (event) => leaks.push(event));
    privileged.on('chat:changed', (event) => leaks.push(event));
    const update = once(insider, 'chat:changed', { signal: AbortSignal.timeout(5000) });
    const notification = once(insider, 'notification', { signal: AbortSignal.timeout(5000) });
    assert.equal(
      (
        await post(first.agent, `/crew-chats/${chat._id}/messages`, {
          text: 'Mensagem restrita por socket.',
        })
      ).status,
      201,
    );
    assert.equal((await update)[0].chatId, chat._id);
    const alert = (await notification)[0];
    assert.equal(alert.kind, 'chat');
    assert.equal(alert.chat, chat._id);
    assert.ok(!alert.message.includes('Mensagem restrita por socket.'));
    const positionUpdate = once(outsider, 'crew:location', { signal: AbortSignal.timeout(5000) });
    assert.equal(
      (
        await patch(first.agent, `/crews/${firstCrew._id}/gps`, {
          enabled: true,
          latitude: -5.2,
          longitude: -44.4,
          accuracy: 5,
        })
      ).status,
      200,
    );
    assert.equal((await positionUpdate)[0].crewId, String(firstCrew._id));
    assert.deepEqual(leaks, []);
    privileged.removeAllListeners('chat:changed');
    assert.equal(
      (
        await post(admin.agent, `/crew-chats/${chat._id}/access`, {
          reason: 'Acompanhamento autorizado do chat no teste de sockets.',
        })
      ).status,
      200,
    );
    const auditedUpdate = once(privileged, 'chat:changed', { signal: AbortSignal.timeout(5000) });
    assert.equal(
      (
        await post(first.agent, `/crew-chats/${chat._id}/messages`, {
          text: 'Atualização para consulta administrativa autorizada.',
        })
      ).status,
      201,
    );
    assert.deepEqual((await auditedUpdate)[0], { chatId: chat._id });
    assert.deepEqual(leaks, []);
    // Expiration/removal of the sender prevents any further message write.
    await Crew.updateOne({ _id: firstCrew._id }, { shiftEnd: new Date(Date.now() - 1000) });
    assert.equal(
      (await post(first.agent, `/crew-chats/${chat._id}/messages`, { text: 'Turno expirado' }))
        .status,
      403,
    );
    assert.equal(
      await Occurrence.countDocuments({ crew: firstCrew._id, status: 'Em atendimento' }),
      0,
    );
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise((resolve) => socketServer.close(resolve));
  }
});

test('encerrar o turno interrompe o GPS e o próximo turno começa sem a posição anterior', async () => {
  assert.equal((await Crew.findById(firstCrew._id)).location.sharing, true);
  assert.equal(
    (
      await post(officer.agent, `/crews/${firstCrew._id}/end-shift`, {
        reason: 'Fim do teste de GPS e início de novo turno.',
      })
    ).status,
    200,
  );
  assert.equal((await Crew.findById(firstCrew._id)).location.sharing, false);
  assert.equal(
    (await post(first.agent, `/crews/${firstCrew._id}/join`, { driver: false })).status,
    200,
  );
  const crew = await Crew.findById(firstCrew._id);
  assert.equal(crew.location.latitude, undefined);
  assert.equal(crew.location.sharing, false);
  assert.equal((await first.agent.get(`/api/crew-chats/${chat._id}/messages`)).status, 403);
});
