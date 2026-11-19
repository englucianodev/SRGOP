import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { config } from '../config.js';

// Removes ONLY simulation data: accounts @sim.srgop.local, crews "SIM <city>", vehicles
// "SIM-*" and everything those created. Closed occurrences cannot be deleted through the
// API, so this works on the database. Default is a dry run; pass --confirmar to delete.
const execute = process.argv.includes('--confirmar');
if (!config.mongoUri) {
  console.error('Defina MONGO_URI no .env (mesma string do backend) para limpar os dados da simulação.');
  process.exit(1);
}

// Deleting accounts under live actors would turn into a crash loop of errors.
const stateFile = path.join(config.dataDir, 'estado.json');
const status = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')).status : null;
if (execute && status && status !== 'finalizado') {
  console.error(`A simulação está "${status}". Rode "npm run encerrar", aguarde o relatório final e pare o contêiner antes de limpar.`);
  process.exit(1);
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const client = new MongoClient(config.mongoUri);
try {
  await client.connect();
  const db = client.db();
  // Shows where it is about to act (hosts only, never the credentials in the URI).
  console.log(`Banco: ${db.databaseName} em ${client.options.hosts.map(String).join(', ')}`);
  const ids = async (collection, filter) => (await db.collection(collection).find(filter, { projection: { _id: 1 } }).toArray()).map((d) => d._id);
  const users = await ids('users', { email: { $regex: `@${escapeRegex(config.emailDomain)}$`, $options: 'i' } });
  const vehicles = await ids('vehicles', { prefix: { $regex: '^SIM-' } });
  // Both the name and the SIM vehicle must match, so a real crew called "SIM …" is never touched.
  const crews = await ids('crews', { name: { $regex: '^SIM ' }, vehicle: { $in: vehicles } });
  // Every simulated occurrence is registered by a simulated account (crew or CPU).
  const occurrences = await ids('occurrences', { createdBy: { $in: users } });
  const foreignMembers = await db.collection('crews').countDocuments({ _id: { $in: crews }, members: { $elemMatch: { $nin: users } } });
  if (foreignMembers) throw new Error(`${foreignMembers} guarnição(ões) SIM têm integrantes reais em serviço. Encerre esses turnos antes da limpeza.`);
  // CPU shifts held by simulated officers; an open one left behind would block the real CPU.
  const cpuShifts = await ids('cpushifts', { officer: { $in: users } });
  const userIds = users.map(String);
  const plan = [
    ['attendances', { occurrence: { $in: occurrences } }],
    ['dispatches', { occurrence: { $in: occurrences } }],
    ['supportrequests', { occurrence: { $in: occurrences } }],
    ['attachments', { occurrence: { $in: occurrences } }],
    ['notifications', { $or: [{ user: { $in: users } }, { occurrence: { $in: occurrences } }, { cpuShift: { $in: cpuShifts } }] }],
    ['occurrences', { _id: { $in: occurrences } }],
    ['sessions', { user: { $in: users } }],
    ['dailyofficers', { officer: { $in: users } }],
    ['cpushifts', { _id: { $in: cpuShifts } }],
    ['vehiclehandovers', { $or: [{ driver: { $in: users } }, { vehicle: { $in: vehicles } }] }],
    ['crewshifts', { crew: { $in: crews } }],
    // Only what simulated accounts wrote; messages from real users are kept.
    ['crewmessages', { sender: { $in: users } }],
    ['chatmessages', { sender: { $in: users } }],
    ['profilephotos', { user: { $in: users } }],
    ['auditlogs', { $or: [{ actor: { $in: users } }, { entityId: { $in: [...userIds, ...occurrences.map(String), ...crews.map(String), ...vehicles.map(String), ...cpuShifts.map(String)] } }] }],
    ['crews', { _id: { $in: crews } }],
    ['vehicles', { _id: { $in: vehicles } }],
    ['users', { _id: { $in: users } }],
  ];
  console.log(execute ? 'Removendo dados da simulação…' : 'SIMULAÇÃO DA LIMPEZA (nada será apagado; use --confirmar):');
  for (const [collection, filter] of plan) {
    const count = await db.collection(collection).countDocuments(filter);
    if (execute && count) await db.collection(collection).deleteMany(filter);
    console.log(`  ${collection.padEnd(18)} ${count}`);
  }
  console.log('\nObservação: a numeração de protocolos continua a partir do último número usado no teste.');
} catch (error) {
  console.error(`Falha na limpeza: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
