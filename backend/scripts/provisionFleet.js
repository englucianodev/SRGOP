import 'dotenv/config';
import mongoose from 'mongoose';
import { provisionDefaultFleet } from '../services/defaultFleet.js';
try {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI não configurada.');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.info(JSON.stringify(await provisionDefaultFleet(null)));
} catch (error) {
  console.error(
    `Cadastro não executado: ${error.name}. Confira a configuração e a conexão do MongoDB.`,
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
