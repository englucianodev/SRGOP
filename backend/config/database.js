import mongoose from 'mongoose';
export async function connectDatabase(uri = process.env.MONGO_URI) {
  if (!uri) throw new Error('Configuração/MongoDB: defina MONGO_URI no backend/.env.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.info('MongoDB conectado.');
}
