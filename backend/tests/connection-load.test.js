import test, { before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createApp } from '../app.js';
import { User, City, Crew, Vehicle, SystemSetting } from '../models/index.js';
import { connectDatabase } from '../config/database.js';
import { getGeneralSettings, invalidateGeneralSettings } from '../services/settingsCache.js';

let mongo, app, city, admin, member, outsider, crew;
const password = 'ConexaoSegura!2026';
const origin = 'http://localhost:5173';
const HOUR = 3600000;
const put = (agent, url, body) => agent.put(`/api${url}`).set('Origin', origin).send(body);
const patch = (agent, url, body) => agent.patch(`/api${url}`).set('Origin', origin).send(body);
const settingsBody = (extra = {}) => ({
  institution: 'Instituição de teste',
  inactivityMinutes: 5,
  onDutyInactivityMinutes: 360,
  alertMinutes: 10,
  soundEnabled: true,
  notificationsEnabled: true,
  modules: ['Alertas'],
  operations: [],
  crimeTypes: ['Furto'],
  ...extra,
});
async function account(name, role = 'Praça') {
  const user = await User.create({
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@conexao.local`,
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
before(async () => {
  process.env.JWT_SECRET = 'chave_de_testes_da_carga_de_conexao_1234567890';
  process.env.CLIENT_URL = origin;
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectDatabase(mongo.getUri('srgop_connection_load'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  city = await City.create({ name: 'Cidade da conexão', latitude: -5.2, longitude: -44.4 });
  await SystemSetting.create({ key: 'general' });
  app = createApp();
  admin = await account('Administrador conexao', 'Administrativo');
  member = await account('Integrante conexao');
  outsider = await account('Fora da guarnicao');
  const vehicle = await Vehicle.create({ prefix: 'VTR-CONEXAO', plate: 'CON1A23', city: city._id });
  crew = await Crew.create({
    name: 'Guarnição conexão',
    city: city._id,
    vehicle: vehicle._id,
    members: [member.user._id],
    driver: member.user._id,
    status: 'Disponível',
    shiftStart: new Date(Date.now() - HOUR),
    shiftEnd: new Date(Date.now() + 8 * HOUR),
  });
  await User.updateOne({ _id: member.user._id }, { crew: crew._id });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test('configurações gerais vêm do cache e mudam logo após salvar', async () => {
  invalidateGeneralSettings();
  const spy = mock.method(SystemSetting, 'findOne');
  await getGeneralSettings();
  await getGeneralSettings();
  assert.equal(spy.mock.callCount(), 1);
  spy.mock.restore();
  const saved = await put(admin.agent, '/settings', settingsBody({ inactivityMinutes: 9 }));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal((await getGeneralSettings()).inactivityMinutes, 9);
  await SystemSetting.updateOne({ key: 'general' }, { inactivityMinutes: 11 }); // model hook
  assert.equal((await getGeneralSettings()).inactivityMinutes, 11);
});
test('ausência de configuração não fica guardada no cache', async () => {
  await SystemSetting.deleteOne({ key: 'general' });
  assert.equal(await getGeneralSettings(), null);
  await SystemSetting.create({ key: 'general', inactivityMinutes: 7 });
  assert.equal((await getGeneralSettings()).inactivityMinutes, 7);
});
test('documento esparso recebe os padrões do esquema e não expõe __v', async () => {
  await SystemSetting.collection.updateOne(
    { key: 'general' },
    { $unset: { crimeTypes: '', modules: '', alertMinutes: '' } },
  );
  invalidateGeneralSettings();
  const settings = await getGeneralSettings();
  assert.ok(settings.crimeTypes.includes('Furto'));
  assert.ok(settings.modules.length > 0);
  assert.equal(settings.alertMinutes, 10);
  assert.equal('__v' in settings, false);
  assert.ok(Object.isFrozen(settings));
});
test('GPS com o mesmo ponto em menos de 10 s não grava de novo', async () => {
  const body = { enabled: true, latitude: -5.1, longitude: -44.3, accuracy: 8 };
  assert.equal((await patch(member.agent, `/crews/${crew._id}/gps`, body)).status, 200);
  const before = (await Crew.findById(crew._id)).location.locatedAt;
  assert.equal((await patch(member.agent, `/crews/${crew._id}/gps`, body)).status, 200);
  assert.deepEqual((await Crew.findById(crew._id)).location.locatedAt, before);
  await patch(member.agent, `/crews/${crew._id}/gps`, { ...body, latitude: -5.2 });
  assert.equal((await Crew.findById(crew._id)).location.latitude, -5.2);
});
test('GPS repetido de quem não é integrante continua recusado', async () => {
  const body = { enabled: true, latitude: -5.2, longitude: -44.3, accuracy: 8 };
  assert.equal((await patch(outsider.agent, `/crews/${crew._id}/gps`, body)).status, 403);
  assert.equal((await patch(outsider.agent, `/crews/${crew._id}/gps`, body)).status, 403);
});
