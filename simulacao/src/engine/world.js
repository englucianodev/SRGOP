import { existsSync, readFileSync } from 'node:fs';
import { config } from '../config.js';
import { ApiClient } from '../lib/api.js';
import { crewAccounts, crewName, officerAccounts } from '../domain/roster.js';
import { mapCrimeTypes, buildCategoryPool } from '../domain/crimes.js';

const OVERRIDES_FILE = 'config/tipos.json';
const idOf = (value) => String(value?._id ?? value ?? '');

function readOverrides() {
  if (!existsSync(OVERRIDES_FILE)) return {};
  try {
    return JSON.parse(readFileSync(OVERRIDES_FILE, 'utf8'));
  } catch (error) {
    throw new Error(`${OVERRIDES_FILE} inválido: ${error.message}`);
  }
}

/** Reads cities, the "SIM <city>" crews and crime types from the published system. */
export async function loadWorld(collector) {
  const api = new ApiClient({ actor: 'preparação', role: 'Simulador', city: '', collector });
  await api.login(officerAccounts()[0].email, config.password);
  try {
    const [cities, crews, settings] = await Promise.all([api.get('/cities'), api.get('/crews'), api.get('/settings')]);
    const units = [];
    const missing = [];
    for (const city of cities.filter((c) => c.active !== false)) {
      const crew = crews.find((c) => c.name === crewName(city) && idOf(c.city) === idOf(city));
      if (!crew?.vehicle) {
        missing.push(city.name);
        continue;
      }
      units.push({
        city: { _id: idOf(city), name: city.name, latitude: city.latitude, longitude: city.longitude },
        crewId: idOf(crew),
        vehicleId: idOf(crew.vehicle),
        accounts: crewAccounts(city),
      });
    }
    if (!units.length) throw new Error('Nenhuma guarnição "SIM <cidade>" com viatura encontrada. Rode "npm run seed".');
    const { mapping, extras, others, warnings } = mapCrimeTypes(settings?.crimeTypes ?? [], readOverrides());
    return { units, missing, officers: officerAccounts(), mapping, extras, others, warnings, pool: buildCategoryPool(mapping, others, extras) };
  } finally {
    await api.post('/auth/logout').catch(() => {});
  }
}
