import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { randomBytes } from 'node:crypto';
import { startServer } from '../server.js';
import { seed } from '../seed.js';
const mongo = await MongoMemoryReplSet.create({
  instanceOpts: [{ launchTimeout: 60000 }],
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});
process.env.MONGO_URI = mongo.getUri('srgop_demo');
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.SEED_PASSWORD ||= 'DemoSRGOP!2026';
process.env.PORT ||= '5000';
await startServer({ initialize: seed });
console.info('DEMONSTRAÇÃO TEMPORÁRIA — dados apagados ao parar. Senha local: DemoSRGOP!2026');
process.once('SIGTERM', () => mongo.stop());
process.once('SIGINT', () => mongo.stop());
