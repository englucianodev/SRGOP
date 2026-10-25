import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../app.js';
import {
  User,
  City,
  Crew,
  Vehicle,
  Occurrence,
  DailyOfficer,
  Session,
  SystemSetting,
  Attendance,
  AuditLog,
  SupportRequest,
  CrewShift,
} from '../models/index.js';
import { connectDatabase } from '../config/database.js';
import { expireShifts } from '../services/operations.js';
let mongo,
  app,
  city,
  admin,
  officer,
  soldier,
  soldier2,
  adminAgent,
  officerAgent,
  soldierAgent,
  soldier2Agent,
  crew,
  vehicle,
  occurrence;
const password = 'TesteSeguro!2026';
const origin = 'http://localhost:5173';
const post = (agent, url, body = {}) => agent.post(`/api${url}`).set('Origin', origin).send(body);
const put = (agent, url, body) => agent.put(`/api${url}`).set('Origin', origin).send(body);
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
  await SystemSetting.create({ key: 'general' });
  const hash = await bcrypt.hash(password, 4);
  [admin, officer, soldier, soldier2] = await User.create(
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
  [adminAgent, officerAgent, soldierAgent, soldier2Agent] = [0, 1, 2, 3].map(() =>
    request.agent(app),
  );
  for (const [i, agent] of [adminAgent, officerAgent, soldierAgent, soldier2Agent].entries())
    assert.equal(
      (await post(agent, '/auth/login', { email: `teste${i}@srgop.local`, password })).status,
      200,
    );
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test('cadastro público não permite autopromoção nem login antes da aprovação', async () => {
  const r = await post(request(app), '/auth/register', {
    name: 'Novo administrador',
    email: 'novo@srgop.local',
    password,
    confirmPassword: password,
    city: String(city._id),
    role: 'Administrativo',
  });
  assert.equal(r.status, 201);
  const user = await User.findOne({ email: 'novo@srgop.local' });
  assert.equal(user.role, 'Praça');
  assert.equal(user.requestedRole, 'Administrativo');
  assert.equal(user.active, false);
  assert.equal(
    (await post(request(app), '/auth/login', { email: user.email, password })).status,
    403,
  );
});
test('sessão usa cookie HttpOnly, não retorna senha e bloqueia alterações por Praça/Oficial', async () => {
  const r = await post(request(app), '/auth/login', { email: admin.email, password });
  assert.match(r.headers['set-cookie'][0], /HttpOnly/);
  assert.equal(r.body.user.password, undefined);
  assert.equal((await soldierAgent.get('/api/users')).status, 403);
  assert.equal((await post(officerAgent, '/users', {})).status, 403);
  assert.equal(
    (await adminAgent.post('/api/cpu').set('Origin', 'https://invasor.example').send({})).status,
    403,
  );
});
test('CPU mantém apenas um responsável mesmo com requisições concorrentes', async () => {
  const results = await Promise.all([post(officerAgent, '/cpu'), post(officerAgent, '/cpu')]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await DailyOfficer.countDocuments(), 1);
  assert.equal((await post(adminAgent, '/cpu')).status, 403);
});
test('cadastro de viatura, guarnição, ingresso e motorista único', async () => {
  let r = await post(adminAgent, '/vehicles', {
    prefix: 'VTR-TESTE',
    plate: 'ABC1D23',
    city: String(city._id),
    mileage: 100,
    status: 'Disponível',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  vehicle = r.body;
  r = await post(adminAgent, '/crews', {
    name: 'Guarnição teste',
    city: String(city._id),
    vehicle: vehicle._id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  crew = r.body;
  r = await post(soldierAgent, `/crews/${crew._id}/join`, { driver: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(+new Date(r.body.shiftEnd) - +new Date(r.body.shiftStart), 86400000);
  assert.equal(
    (await post(soldier2Agent, `/crews/${crew._id}/join`, { driver: true })).status,
    409,
  );
  assert.equal(
    (await post(soldier2Agent, `/crews/${crew._id}/join`, { driver: false })).status,
    200,
  );
  assert.equal(
    (await post(soldierAgent, `/crews/${crew._id}/end-shift`, { reason: 'Motivo de teste' }))
      .status,
    403,
  );
});
test('ocorrência valida entrada, protege autor e registra histórico de edição', async () => {
  const body = {
    city: String(city._id),
    occurredAt: new Date().toISOString(),
    crimeType: 'Furto',
    address: 'Rua de teste, 100',
    description: 'Descrição suficiente da ocorrência para teste.',
    priority: 'Alta',
  };
  assert.equal(
    (await post(soldierAgent, '/occurrences', { ...body, status: 'Encerrada' })).status,
    422,
  );
  const r = await post(soldierAgent, '/occurrences', body);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  occurrence = r.body;
  assert.ok(occurrence.protocol.startsWith('OP-'));
  assert.equal(
    (
      await put(soldier2Agent, `/occurrences/${occurrence._id}`, {
        ...body,
        address: 'Rua alterada',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await put(soldierAgent, `/occurrences/${occurrence._id}`, {
        ...body,
        address: 'Rua alterada pelo autor',
      })
    ).status,
    200,
  );
  assert.equal(
    (await soldierAgent.delete(`/api/occurrences/${occurrence._id}`).set('Origin', origin)).status,
    403,
  );
});
test('despacho notifica membros ativos e impede despacho por Praça', async () => {
  const payload = { occurrence: occurrence._id, crew: crew._id };
  assert.equal((await post(soldierAgent, '/dispatches', payload)).status, 403);
  const r = await post(officerAgent, '/dispatches', payload);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'Despachada');
  assert.equal((await soldierAgent.get('/api/notifications')).body.length, 1);
  assert.equal((await soldier2Agent.get('/api/attendances')).body.length, 1);
});
test('apenas um integrante aceita a ocorrência sob concorrência e encerramento exige resumo', async () => {
  const results = await Promise.all([
    post(soldierAgent, `/attendances/${occurrence._id}/accept`),
    post(soldier2Agent, `/attendances/${occurrence._id}/accept`),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await Attendance.countDocuments({ occurrence: occurrence._id }), 1);
  const row = await Occurrence.findById(occurrence._id);
  const agent = String(row.acceptedBy) === String(soldier._id) ? soldierAgent : soldier2Agent;
  assert.equal(
    (await post(agent, `/attendances/${occurrence._id}/close`, { summary: 'curto' })).status,
    422,
  );
  assert.equal(
    (
      await post(agent, `/attendances/${occurrence._id}/notes`, {
        text: 'Equipe chegou ao endereço indicado.',
      })
    ).status,
    200,
  );
  const r = await post(agent, `/attendances/${occurrence._id}/close`, {
    summary: 'Atendimento concluído com as medidas necessárias.',
    weapons: 1,
    recoveredVehicles: 1,
    detained: 2,
    approaches: 3,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'Encerrada');
  assert.ok(r.body.durationSeconds >= 0);
  assert.equal((await Crew.findById(crew._id)).status, 'Disponível');
  const report = await officerAgent.get('/api/reports');
  assert.equal(report.status, 200, JSON.stringify(report.body));
  assert.equal(report.body.totals.weapons, 1);
  assert.equal(report.body.totals.detained, 2);
});
test('encerramento antecipado e automático liberam integrantes e impedem novos despachos', async () => {
  assert.equal(
    (
      await post(officerAgent, `/crews/${crew._id}/end-shift`, {
        reason: 'Encerramento autorizado para teste.',
      })
    ).status,
    200,
  );
  assert.equal((await User.findById(soldier._id)).crew, null);
  assert.equal((await Crew.findById(crew._id)).status, 'Fora de serviço');
  assert.equal((await post(soldierAgent, `/crews/${crew._id}/join`, { driver: true })).status, 200);
  await Crew.updateOne({ _id: crew._id }, { shiftEnd: new Date(Date.now() - 1000) });
  await expireShifts();
  assert.equal((await User.findById(soldier._id)).crew, null);
  assert.ok((await AuditLog.countDocuments({ action: 'Saída da guarnição' })) >= 2);
});
test('anexos são protegidos, formato é validado e sessões expiram por inatividade', async () => {
  assert.equal((await request(app).get(`/api/occurrences/${occurrence._id}`)).status, 401);
  const upload = await adminAgent
    .post(`/api/occurrences/${occurrence._id}/attachments`)
    .set('Origin', origin)
    .attach('file', Buffer.from('<script>teste</script>'), 'arquivo.png');
  assert.equal(upload.status, 422);
  await Session.updateMany(
    { user: soldier._id },
    { lastActivity: new Date(Date.now() - 6 * 60000) },
  );
  const r = await soldierAgent.get('/api/auth/me');
  assert.equal(r.status, 401);
  assert.equal(r.body.origin, 'Controle de sessão');
  assert.equal(r.body.redirect, '/dashboard');
});

async function createOccurrence(
  agent,
  description = 'Ocorrência de regressão para validar as regras operacionais.',
) {
  const r = await post(agent, '/occurrences', {
    city: String(city._id),
    occurredAt: new Date().toISOString(),
    crimeType: 'Furto',
    address: 'Rua de regressão, 200',
    description,
    priority: 'Alta',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

test('concluir atendimento depois da expiração não deixa integrantes presos ao turno', async () => {
  assert.equal(
    (await post(soldierAgent, '/auth/login', { email: soldier.email, password })).status,
    200,
  );
  assert.equal((await post(soldierAgent, `/crews/${crew._id}/join`, { driver: true })).status, 200);
  const row = await createOccurrence(soldierAgent);
  assert.equal(
    (await post(officerAgent, '/dispatches', { occurrence: row._id, crew: crew._id })).status,
    201,
  );
  assert.equal((await post(soldierAgent, `/attendances/${row._id}/accept`)).status, 200);
  await Crew.updateOne({ _id: crew._id }, { shiftEnd: new Date(Date.now() - 1000) });
  const r = await post(soldierAgent, `/attendances/${row._id}/close`, {
    summary: 'Resumo extenso válido. '.repeat(150),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await expireShifts();
  assert.equal((await User.findById(soldier._id)).crew, null);
  const latest = await Crew.findById(crew._id);
  assert.equal(latest.members.length, 0);
  assert.ok((await CrewShift.findById(latest.shift)).end);
});

test('despachos expirados não podem ser aceitos mesmo por Oficial', async () => {
  await post(soldierAgent, `/crews/${crew._id}/join`, { driver: false });
  const row = await createOccurrence(soldierAgent);
  await post(officerAgent, '/dispatches', { occurrence: row._id, crew: crew._id });
  await Crew.updateOne({ _id: crew._id }, { shiftEnd: new Date(Date.now() - 1000) });
  assert.equal((await post(officerAgent, `/attendances/${row._id}/accept`)).status, 409);
  await expireShifts();
  assert.equal((await Occurrence.findById(row._id)).status, 'Em aberto');
});

test('gestão de integrantes exige autorização e preserva horário do turno', async () => {
  await post(soldierAgent, `/crews/${crew._id}/join`, { driver: true });
  await post(soldier2Agent, `/crews/${crew._id}/join`, { driver: false });
  const start = (await Crew.findById(crew._id)).shiftStart;
  const body = {
    member: String(soldier2._id),
    action: 'Motorista',
    reason: 'Troca autorizada de motorista para teste.',
  };
  assert.equal((await post(soldierAgent, `/crews/${crew._id}/members`, body)).status, 403);
  assert.equal((await post(officerAgent, `/crews/${crew._id}/members`, body)).status, 200);
  assert.equal(String((await Crew.findById(crew._id)).driver), String(soldier2._id));
  assert.equal(
    (
      await post(officerAgent, `/crews/${crew._id}/members`, {
        ...body,
        member: String(soldier._id),
        action: 'Saída',
      })
    ).status,
    200,
  );
  assert.equal((await User.findById(soldier._id)).crew, null);
  assert.equal(+(await Crew.findById(crew._id)).shiftStart, +start);
});

test('apoio reserva equipe, comunicação respeita participantes e conclusão libera apoio', async () => {
  const other = await post(adminAgent, '/crews', {
    name: 'Guarnição apoio',
    city: String(city._id),
    vehicle: null,
  });
  assert.equal(other.status, 201);
  const otherId = other.body._id;
  assert.equal((await post(soldierAgent, `/crews/${otherId}/join`, { driver: false })).status, 200);
  const row = await createOccurrence(soldier2Agent);
  await post(officerAgent, '/dispatches', { occurrence: row._id, crew: crew._id });
  assert.equal((await post(soldier2Agent, `/attendances/${row._id}/accept`)).status, 200);
  const support = await post(soldier2Agent, `/attendances/${row._id}/support`, {
    targetCrew: otherId,
    reason: 'Solicito apoio da equipe mais próxima.',
  });
  assert.equal(support.status, 201);
  assert.equal(
    (await post(soldierAgent, `/attendances/support/${support.body._id}/authorize`)).status,
    403,
  );
  assert.equal(
    (await post(officerAgent, `/attendances/support/${support.body._id}/authorize`)).status,
    200,
  );
  assert.equal((await Crew.findById(otherId)).status, 'Em atendimento');
  assert.equal(
    (await soldierAgent.get('/api/attendances')).body.some((o) => o._id === row._id),
    true,
  );
  const message = await post(soldier2Agent, '/crew-messages', {
    targetCrew: otherId,
    text: 'Aguardamos a equipe no endereço informado.',
  });
  assert.equal(message.status, 201, JSON.stringify(message.body));
  assert.equal(
    (await soldierAgent.get('/api/crew-messages')).body.some((m) => m._id === message.body._id),
    true,
  );
  assert.equal(
    (
      await post(soldier2Agent, `/attendances/${row._id}/close`, {
        summary: 'Atendimento concluído com o apoio da outra equipe.',
      })
    ).status,
    200,
  );
  assert.equal((await Crew.findById(otherId)).status, 'Disponível');
  assert.equal((await SupportRequest.findById(support.body._id)).status, 'Concluído');
  await post(officerAgent, `/crews/${otherId}/end-shift`, {
    reason: 'Fim do teste de apoio e comunicação.',
  });
  assert.equal(
    (
      await post(soldierAgent, '/crew-messages', {
        targetCrew: crew._id,
        text: 'Mensagem fora do serviço',
      })
    ).status,
    403,
  );
});

test('anexo válido tem download autenticado e senha redefinida revoga sessão', async () => {
  const row = await createOccurrence(soldierAgent);
  const bytes = Buffer.from('%PDF-1.4\n% arquivo mínimo para teste de armazenamento\n%%EOF');
  const upload = await soldierAgent
    .post(`/api/occurrences/${row._id}/attachments`)
    .set('Origin', origin)
    .attach('file', bytes, 'teste.pdf');
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  const download = await soldierAgent.get(`/api/attachments/${upload.body._id}`);
  assert.equal(download.status, 200);
  assert.deepEqual(download.body, bytes);
  assert.equal((await request(app).get(`/api/attachments/${upload.body._id}`)).status, 401);
  assert.equal(
    (
      await put(adminAgent, `/users/${soldier._id}`, {
        name: soldier.name,
        email: soldier.email,
        city: String(city._id),
        role: 'Praça',
        active: true,
        password: 'NovaSenhaTeste!2026',
      })
    ).status,
    200,
  );
  assert.equal((await soldierAgent.get('/api/auth/me')).status, 401);
});

test('Dashboard contabiliza resultados pela conclusão e rejeita períodos inválidos', async () => {
  const before = (await adminAgent.get('/api/dashboard')).body.results;
  await Occurrence.create({
    protocol: 'TESTE-DIA-CONCLUSAO',
    occurredAt: new Date(Date.now() - 86400000),
    endedAt: new Date(),
    city: city._id,
    crimeType: 'Furto',
    address: 'Endereço de teste',
    description: 'Teste de conclusão em dia posterior ao fato.',
    priority: 'Baixa',
    status: 'Encerrada',
    createdBy: admin._id,
    weapons: 2,
    recoveredVehicles: 1,
  });
  const after = (await adminAgent.get('/api/dashboard')).body.results;
  assert.equal(after.closed, before.closed + 1);
  assert.equal(after.weapons, before.weapons + 2);
  assert.equal(after.recoveredVehicles, before.recoveredVehicles + 1);
  assert.equal((await adminAgent.get('/api/occurrences?from=2026-02-30')).status, 422);
  assert.equal(
    (await adminAgent.get('/api/occurrences?from=2026-09-18&to=2026-09-17')).status,
    422,
  );
});

test('guarnição com turno encerrado mantém histórico e não pode ser excluída', async () => {
  const row = await post(adminAgent, '/crews', {
    name: 'Equipe com histórico',
    city: String(city._id),
    vehicle: null,
  });
  await CrewShift.create({
    crew: row.body._id,
    start: new Date(Date.now() - 86400000),
    plannedEnd: new Date(),
    end: new Date(),
    members: [soldier._id],
  });
  const response = await adminAgent.delete(`/api/crews/${row.body._id}`).set('Origin', origin);
  assert.equal(response.status, 409, JSON.stringify(response.body));
  assert.ok(await Crew.findById(row.body._id));
});

test('Socket.IO autentica, entrega despachos e encerra apenas a sessão que saiu', async () => {
  const { createServer } = await import('node:http');
  const { io: connect } = await import('socket.io-client');
  const { configureSocket } = await import('../services/realtime.js');
  const server = createServer(app);
  const socketServer = configureSocket(server, [origin]);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  const event = (socket, name) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(name, done);
        reject(new Error(`Evento ausente: ${name}`));
      }, 5000);
      const done = (data) => {
        clearTimeout(timer);
        resolve(data);
      };
      socket.once(name, done);
    });
  const open = async (cookie) => {
    const socket = connect(url, {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
      extraHeaders: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    });
    sockets.push(socket);
    const connected = event(socket, cookie ? 'connect' : 'connect_error');
    socket.connect();
    await connected;
    return socket;
  };
  try {
    const unauthorized = await open();
    assert.equal(unauthorized.connected, false);
    const login = async (agent, user, pass) => {
      const response = await post(agent, '/auth/login', { email: user.email, password: pass });
      assert.equal(response.status, 200);
      return response.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
    };
    const anotherAgent = request.agent(app);
    const first = await open(await login(soldierAgent, soldier, 'NovaSenhaTeste!2026'));
    const second = await open(await login(anotherAgent, soldier, 'NovaSenhaTeste!2026'));
    const teammate = await open(await login(soldier2Agent, soldier2, password));
    assert.equal(
      (await post(soldierAgent, `/crews/${crew._id}/join`, { driver: false })).status,
      200,
    );
    const row = await createOccurrence(soldierAgent);
    const dispatched = [first, second, teammate].map((socket) => event(socket, 'dispatch:new'));
    assert.equal(
      (await post(officerAgent, '/dispatches', { occurrence: row._id, crew: crew._id })).status,
      201,
    );
    for (const payload of await Promise.all(dispatched))
      assert.equal(payload.occurrenceId, row._id);
    const accepted = [first, second, teammate].map((socket) => event(socket, 'attendance:changed'));
    assert.equal((await post(soldier2Agent, `/attendances/${row._id}/accept`)).status, 200);
    for (const payload of await Promise.all(accepted))
      assert.equal(payload.status, 'Em atendimento');
    const disconnected = event(first, 'disconnect');
    assert.equal((await post(soldierAgent, '/auth/logout')).status, 200);
    await disconnected;
    assert.equal(first.connected, false);
    assert.equal(second.connected, true);
    assert.equal((await anotherAgent.get('/api/auth/me')).status, 200);
    await post(soldier2Agent, `/attendances/${row._id}/close`, {
      summary: 'Encerramento do teste de comunicação em tempo real.',
    });
  } finally {
    sockets.forEach((socket) => socket.disconnect());
    await new Promise((resolve) => socketServer.close(resolve));
  }
});
