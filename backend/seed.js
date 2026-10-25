import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDatabase } from './config/database.js';
import { User, City, Vehicle, Crew, Occurrence, SystemSetting } from './models/index.js';
import { dayKey } from './utils/time.js';
// Base demonstrativa editável. Não representa a circunscrição oficial validada do 18º BPM.
export const demoCities = [
  ['Presidente Dutra', -5.2898, -44.495],
  ['Tuntum', -5.2547, -44.6445],
  ['Dom Pedro', -5.035, -44.4409],
  ['Governador Eugênio Barros', -5.318, -44.246],
  ['Governador Luiz Rocha', -5.478, -44.077],
  ['Gonçalves Dias', -5.148, -44.301],
  ['Graça Aranha', -5.405, -44.335],
  ['Senador Alexandre Costa', -5.256, -44.052],
  ['São Domingos do Maranhão', -5.579, -44.382],
  ['Fortuna', -5.727, -44.157],
  ['São José dos Basílios', -5.054, -44.581],
  ['Santa Filomena do Maranhão', -5.496, -44.563],
  ['Joselândia', -4.986, -44.695],
  ['Santo Antônio dos Lopes', -4.867, -44.365],
];
export async function seed() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10)
    throw new Error('Seed: defina SEED_PASSWORD com no mínimo 10 caracteres.');
  const cities = [];
  for (const [name, latitude, longitude] of demoCities)
    cities.push(
      await City.findOneAndUpdate(
        { name },
        { $setOnInsert: { name, latitude, longitude } },
        { upsert: true, new: true },
      ),
    );
  const hash = await bcrypt.hash(password, 12);
  for (const [name, email, role] of [
    ['Administrador de demonstração', 'admin@srgop.local', 'Administrativo'],
    ['Oficial de demonstração', 'oficial@srgop.local', 'Oficial'],
    ['Praça de demonstração', 'praca@srgop.local', 'Praça'],
  ])
    await User.updateOne(
      { email },
      {
        $setOnInsert: {
          name,
          email,
          password: hash,
          city: cities[0]._id,
          role,
          requestedRole: role,
          active: true,
        },
      },
      { upsert: true },
    );
  await SystemSetting.updateOne(
    { key: 'general' },
    {
      $setOnInsert: {
        key: 'general',
        operations: [
          {
            name: 'Operação Presença',
            objective: 'Demonstração: policiamento preventivo e presença nas áreas comerciais.',
            day: dayKey(),
          },
        ],
      },
    },
    { upsert: true },
  );
  for (let i = 0; i < 5; i++) {
    const vehicle = await Vehicle.findOneAndUpdate(
      { prefix: `VTR-${1801 + i}` },
      {
        $setOnInsert: {
          prefix: `VTR-${1801 + i}`,
          plate: `DEMO${100 + i}`,
          city: cities[i]._id,
          mileage: 28450 + i * 1040,
          status: i === 4 ? 'Em manutenção' : 'Disponível',
          latitude: cities[i].latitude + 0.006,
          longitude: cities[i].longitude + 0.005,
          nextMaintenance: new Date(Date.now() + (i - 1) * 86400000 * 5),
          notes: 'Viatura fictícia para demonstração.',
        },
      },
      { upsert: true, new: true },
    );
    if (i < 4) {
      const crew = await Crew.findOneAndUpdate(
        { name: `Águia ${String(i + 1).padStart(2, '0')}` },
        {
          $setOnInsert: {
            name: `Águia ${String(i + 1).padStart(2, '0')}`,
            city: cities[i]._id,
            vehicle: vehicle._id,
          },
        },
        { upsert: true, new: true },
      );
      await Vehicle.updateOne({ _id: vehicle._id, crew: null }, { crew: crew._id });
    }
  }
  const admin = await User.findOne({ email: 'admin@srgop.local' });
  const types = [
    'Perturbação do sossego',
    'Roubo',
    'Acidente de trânsito',
    'Furto',
    'Violência doméstica',
    'Outros',
    'Tráfico de drogas',
    'Furto',
  ];
  for (let i = 0; i < types.length; i++)
    await Occurrence.updateOne(
      { protocol: `DEMO-${String(i + 1).padStart(4, '0')}` },
      {
        $setOnInsert: {
          protocol: `DEMO-${String(i + 1).padStart(4, '0')}`,
          occurredAt: new Date(Date.now() - i * 25 * 60000),
          city: cities[i % 5]._id,
          crimeType: types[i],
          address: `Rua de demonstração, ${100 + i} · Centro`,
          latitude: cities[i % 5].latitude + i * 0.001,
          longitude: cities[i % 5].longitude,
          description:
            'Registro fictício criado exclusivamente para testar os fluxos do SRGOP. Não corresponde a uma ocorrência real.',
          priority: ['Média', 'Alta', 'Baixa'][i % 3],
          status: 'Em aberto',
          createdBy: admin._id,
          history: [{ action: 'Cadastro demonstrativo', actor: admin._id }],
        },
      },
      { upsert: true },
    );
  console.info(
    'Seed concluído. Dados fictícios; contas admin@srgop.local, oficial@srgop.local e praca@srgop.local usam SEED_PASSWORD.',
  );
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/seed.js')) {
  try {
    await connectDatabase();
    await seed();
  } finally {
    await mongoose.disconnect();
  }
}
