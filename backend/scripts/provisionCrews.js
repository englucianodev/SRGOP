import 'dotenv/config';
import mongoose from 'mongoose';
import { provisionDefaultFleet } from '../services/defaultFleet.js';
import { provisionDemoCrews } from '../services/demoCrews.js';
try {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const fleet = await provisionDefaultFleet(null);
  console.info(JSON.stringify({ fleet, ...(await provisionDemoCrews()) }));
} catch (error) {
  console.error(
    `Cadastro não concluído: ${error.name}. ${error.status ? error.message : 'Confira a conexão e os vínculos existentes.'}`,
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
