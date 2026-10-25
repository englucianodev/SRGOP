import 'dotenv/config';
import http from 'node:http';
import mongoose from 'mongoose';
import { connectDatabase } from './config/database.js';
import { createApp, allowedOrigins } from './app.js';
import { configureSocket } from './services/realtime.js';
import { expireShifts } from './services/operations.js';
import { SystemSetting } from './models/index.js';
export async function startServer({ initialize } = {}) {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.startsWith('troque_')
  )
    throw new Error('Configuração/JWT: defina uma chave aleatória de pelo menos 32 caracteres.');
  await connectDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  if (initialize) await initialize();
  await SystemSetting.updateOne(
    { key: 'general' },
    { $setOnInsert: { key: 'general' } },
    { upsert: true },
  );
  const server = http.createServer(createApp());
  const io = configureSocket(server, allowedOrigins());
  await expireShifts();
  let expiring = false;
  const timer = setInterval(async () => {
    if (expiring) return;
    expiring = true;
    try {
      await expireShifts();
    } catch (err) {
      console.error('Turnos:', err.message);
    } finally {
      expiring = false;
    }
  }, 30000);
  const port = Number(process.env.PORT || 5000);
  await new Promise((resolve) => server.listen(port, resolve));
  console.info(`SRGOP API em http://localhost:${port}`);
  const close = async () => {
    clearInterval(timer);
    await new Promise((resolve) => io.close(resolve));
    await mongoose.disconnect();
  };
  process.once('SIGTERM', async () => {
    await close();
    process.exit(0);
  });
  process.once('SIGINT', async () => {
    await close();
    process.exit(0);
  });
  return { server, io, close };
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/server.js'))
  startServer().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
