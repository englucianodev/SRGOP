import { config, requireRuntimeConfig } from '../config.js';
import { Collector } from '../lib/collector.js';
import { ApiClient } from '../lib/api.js';
import { crewAccounts, officerAccounts, crewName, slug, reloadPeople } from '../domain/roster.js';
import { assignPeople, loadPeople, savePeople } from '../domain/people.js';
import { PrepProgress } from '../lib/progress.js';
import { settingsWithCrimeTypes } from '../domain/crimes.js';

// Creates (idempotently) what the simulation needs in the published system:
// one vehicle + one crew "SIM <city>" per city, 6 Praças per city and 3 Oficiais.
requireRuntimeConfig();
if (!config.adminEmail || !config.adminPassword) {
  console.error('Defina SIM_ADMIN_EMAIL e SIM_ADMIN_PASSWORD (conta Administrativo) no .env.');
  process.exit(1);
}
const limit = Number(process.argv.find((a) => a.startsWith('--limite='))?.split('=')[1]) || Infinity;
const collector = new Collector(config.dataDir, { quiet: true });
const api = new ApiClient({ actor: 'seed', role: 'Administrativo', city: '', collector });
const idOf = (v) => String(v?._id ?? v ?? '');
const created = { vehicles: 0, crews: 0, users: 0, renamed: 0 };
const progress = new PrepProgress(config.dataDir);

async function ensureUser(users, account, cityId) {
  const existing = users.find((u) => u.email?.toLowerCase() === account.email);
  if (existing) {
    if (existing.name === account.name && existing.rank === account.rank) return progress.account(account.email, 'existente');
    // Same account, new fictitious name/rank; role, city and status stay as they are.
    await api.put(`/users/${idOf(existing)}`, { name: account.name, rank: account.rank, email: account.email, city: idOf(existing.city), role: existing.role, active: existing.active });
    created.renamed++;
    progress.account(account.email, 'atualizada');
    return;
  }
  await api.post('/users', { name: account.name, email: account.email, city: cityId, role: account.role, rank: account.rank, active: true, password: config.password });
  created.users++;
  progress.account(account.email, 'criada');
}

async function ensureUnit(city, index, { vehicles, crews, users }) {
  const prefix = `SIM-${slug(city.name).toUpperCase()}`.slice(0, 40);
  let vehicle = vehicles.find((v) => v.prefix === prefix);
  if (!vehicle) {
    const taken = new Set(vehicles.map((v) => v.plate));
    let n = index + 1;
    while (taken.has(`SIM${String(n).padStart(4, '0')}`)) n += 100;
    vehicle = await api.post('/vehicles', {
      prefix, brand: 'Chevrolet', model: 'S10', year: 2024, type: 'Caminhonete', plate: `SIM${String(n).padStart(4, '0')}`,
      city: idOf(city), mileage: 10000, status: 'Disponível', notes: `${config.tag} Viatura fictícia para o teste contínuo.`,
      latitude: city.latitude, longitude: city.longitude,
    });
    vehicles.push(vehicle);
    created.vehicles++;
  }
  const crew = crews.find((c) => c.name === crewName(city) && idOf(c.city) === idOf(city));
  if (!crew) {
    await api.post('/crews', { name: crewName(city), city: idOf(city), vehicle: idOf(vehicle), type: 'Viatura Convencional' });
    created.crews++;
  } else if (!crew.vehicle) await api.put(`/crews/${idOf(crew)}`, { name: crew.name, city: idOf(city), vehicle: idOf(vehicle), type: 'Viatura Convencional' });
  for (const account of crewAccounts(city)) await ensureUser(users, account, idOf(city));
}

try {
  await api.login(config.adminEmail, config.adminPassword);
  const settings = settingsWithCrimeTypes(await api.get('/settings'));
  if (settings) {
    await api.put('/settings', settings);
    console.log('Tipos de crime de arma de fogo cadastrados nas configurações.');
  }
  const [cities, vehicles, crews, users] = await Promise.all([api.get('/cities'), api.get('/vehicles'), api.get('/crews'), api.get('/users')]);
  const active = cities.filter((c) => c.active !== false).sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  if (!active.length) throw new Error('Nenhum município ativo cadastrado.');
  // Draws names and ranks once (kept in dados/efetivo.json) before any account is written.
  savePeople(assignPeople([...active.flatMap((city) => crewAccounts(city)), ...officerAccounts()], loadPeople()));
  reloadPeople();
  progress.start(active.map((c) => c.name), [
    ...active.flatMap((city) => crewAccounts(city).map((a) => ({ ...a, city: city.name }))),
    ...officerAccounts().map((a) => ({ ...a, city: 'CPU' })),
  ]);
  for (const [index, city] of active.entries()) {
    process.stdout.write(`• ${city.name}… `);
    progress.city(city.name, 'preparando');
    await ensureUnit(city, index, { vehicles, crews, users });
    progress.city(city.name, 'pronta');
    console.log('ok');
  }
  for (const account of officerAccounts()) await ensureUser(users, account, idOf(active[0]));
  progress.finish();
  console.log(`\nPronto: ${active.length} cidades. Criados agora: ${created.vehicles} viaturas, ${created.crews} guarnições, ${created.users} contas; ${created.renamed} conta(s) com nome/patente atualizados.`);
  console.log(`Efetivo (nomes e patentes): ${config.dataDir}/efetivo.json`);
  console.log(`Contas: ${active.length * 6} praças + 3 oficiais, todas @${config.emailDomain}, senha = SIM_PASSWORD.`);
  console.log('Próximo passo: npm run verificar');
} catch (error) {
  progress.finish(error);
  console.error(`\nFalha no seed: ${error.message}`);
  if (error.body?.origin) console.error(`Origem informada pela API: ${error.body.origin}`);
  process.exitCode = 1;
} finally {
  await api.post('/auth/logout').catch(() => {});
}
