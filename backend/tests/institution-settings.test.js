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
  Session,
  SystemSetting,
  InstitutionLogo,
  AuditLog,
} from '../models/index.js';
let mongo, app, city, admin, officer, soldier, settings, version;
const origin = 'http://localhost:5173',
  password = 'InstituicaoTeste!2026';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0eYAAAAASUVORK5CYII=',
  'base64',
);
async function user(tag, role) {
  const person = await User.create({
    name: tag,
    email: `${tag}@brand.local`,
    password: await bcrypt.hash(password, 4),
    role,
    active: true,
    city: city._id,
  });
  const agent = request.agent(app);
  assert.equal(
    (
      await agent
        .post('/api/auth/login')
        .set('Origin', origin)
        .send({ email: person.email, password })
    ).status,
    200,
  );
  return { person, agent };
}
const body = (value) => ({
  institution: settings.institution,
  inactivityMinutes: 5,
  onDutyInactivityMinutes: value,
  alertMinutes: 10,
  soundEnabled: true,
  notificationsEnabled: true,
  modules: settings.modules,
  operations: [],
  crimeTypes: settings.crimeTypes,
});
const upload = (agent, buffer = png) =>
  agent
    .put('/api/settings/logo')
    .set('Origin', origin)
    .attach('logo', buffer, { filename: 'brasao.png', contentType: 'image/png' });
before(async () => {
  process.env.JWT_SECRET = 'chave_teste_logo_institucional_parametros_123456789';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri('institution_settings'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
  city = await City.create({ name: 'Cidade institucional', latitude: -5, longitude: -44 });
  settings = await SystemSetting.create({ key: 'general' });
  admin = await user('AdminMarca', 'Administrativo');
  officer = await user('OficialMarca', 'Oficial');
  soldier = await user('PracaMarca', 'Praça');
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test('parâmetros públicos revelam somente identificação e versão da logo', async () => {
  const r = await request(app).get('/api/branding');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body).sort(), ['institution', 'logoVersion']);
  assert.equal(r.body.logoVersion, '');
  assert.equal((await request(app).get('/api/branding/logo')).status, 404);
});
test('apenas administrador configura inatividade em serviço e limites são validados', async () => {
  assert.equal(
    (await officer.agent.put('/api/settings').set('Origin', origin).send(body(120))).status,
    403,
  );
  for (const minutes of [0, 1441, 1.5])
    assert.equal(
      (await admin.agent.put('/api/settings').set('Origin', origin).send(body(minutes))).status,
      422,
    );
  const r = await admin.agent.put('/api/settings').set('Origin', origin).send(body(120));
  assert.equal(r.status, 200);
  assert.equal(r.body.onDutyInactivityMinutes, 120);
});
test('prazo configurado em serviço é aplicado à sessão existente e ao login', async () => {
  const crew = await Crew.create({
    name: 'Equipe com prazo próprio',
    city: city._id,
    members: [soldier.person._id],
    status: 'Disponível',
    shiftStart: new Date(),
    shiftEnd: new Date(Date.now() + 3600000),
  });
  await User.updateOne({ _id: soldier.person._id }, { crew: crew._id });
  await Session.updateMany(
    { user: soldier.person._id },
    { lastActivity: new Date(Date.now() - 119 * 60000) },
  );
  const r = await soldier.agent.get('/api/auth/me');
  assert.equal(r.status, 200);
  assert.equal(r.body.inactivityPolicy.inactivityMinutes, 120);
  await Session.updateMany(
    { user: soldier.person._id },
    { lastActivity: new Date(Date.now() - 121 * 60000) },
  );
  assert.equal((await soldier.agent.get('/api/auth/me')).status, 401);
  const login = await soldier.agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: soldier.person.email, password });
  assert.equal(login.status, 200);
  assert.equal(login.body.inactivityPolicy.inactivityMinutes, 120);
});
test('envio da logo exige autenticação e perfil administrativo', async () => {
  assert.equal((await upload(request(app))).status, 401);
  assert.equal((await upload(officer.agent)).status, 403);
  assert.equal((await upload(soldier.agent)).status, 403);
  assert.equal(await InstitutionLogo.countDocuments(), 0);
});
test('logo persistida é pública no login e bytes não aparecem nos parâmetros', async () => {
  const r = await upload(admin.agent);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.logoVersion);
  version = r.body.logoVersion;
  assert.equal(r.body.data, undefined);
  assert.equal((await InstitutionLogo.findOne({ key: 'general' })).data, undefined);
  const metadata = await request(app).get('/api/branding');
  assert.equal(metadata.body.logoVersion, version);
  const image = await request(app).get(`/api/branding/logo?v=${version}`);
  assert.equal(image.status, 200);
  assert.match(image.headers['content-type'], /image\/png/);
  assert.equal(image.headers['cross-origin-resource-policy'], 'cross-origin');
  assert.deepEqual(image.body, png);
  assert.equal(await AuditLog.countDocuments({ action: 'Logo institucional atualizada' }), 1);
});
test('arquivo inválido, dimensões e tamanho são recusados preservando a logo anterior', async () => {
  assert.equal(
    (await upload(admin.agent, Buffer.from('<svg><script>alert(1)</script></svg>'))).status,
    422,
  );
  const huge = Buffer.from(png);
  huge.writeUInt32BE(4097, 16);
  assert.equal((await upload(admin.agent, huge)).status, 422);
  const tooLarge = await upload(admin.agent, Buffer.alloc(2 * 1024 * 1024 + 1));
  assert.equal(tooLarge.status, 422);
  assert.match(tooLarge.body.message, /2 MB/);
  assert.equal((await SystemSetting.findOne({ key: 'general' })).logoVersion, version);
});
test('trocar logo renova versão e salvar parâmetros não apaga a imagem', async () => {
  const r = await upload(admin.agent);
  assert.equal(r.status, 200);
  assert.notEqual(r.body.logoVersion, version);
  version = r.body.logoVersion;
  const saved = await admin.agent.put('/api/settings').set('Origin', origin).send(body(180));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.logoVersion, version);
  assert.equal(saved.body.onDutyInactivityMinutes, 180);
  assert.equal((await request(app).get('/api/branding/logo')).status, 200);
});
test('remover logo exige administrador e restaura a identificação padrão sem apagar parâmetros', async () => {
  assert.equal(
    (await officer.agent.delete('/api/settings/logo').set('Origin', origin)).status,
    403,
  );
  const r = await admin.agent.delete('/api/settings/logo').set('Origin', origin);
  assert.equal(r.status, 200);
  assert.equal(r.body.logoVersion, '');
  assert.equal(r.body.onDutyInactivityMinutes, 180);
  assert.equal((await request(app).get('/api/branding')).body.logoVersion, '');
  assert.equal((await request(app).get('/api/branding/logo')).status, 404);
  assert.equal(await InstitutionLogo.countDocuments(), 0);
});
