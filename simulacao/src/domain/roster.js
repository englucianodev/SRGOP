import { config } from '../config.js';
import { normalize } from './crimes.js';
import { TEAMS } from '../lib/time.js';
import { loadPeople } from './people.js';

export const OFFICER_COUNT = 3;
export const slug = (name) => normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const crewName = (city) => `SIM ${city.name}`;
export const vehiclePrefix = (index) => `SIM-${String(index + 1).padStart(2, '0')}`;
export const vehiclePlate = (index) => `SIM${String(index + 1).padStart(4, '0')}`;
export const isSimulationEmail = (email) => email?.toLowerCase().endsWith(`@${config.emailDomain}`);

let people = null;
/** Name and rank drawn by the seed (dados/efetivo.json); the fixed labels are only a fallback. */
const withPerson = (account) => ({ ...account, ...((people ??= loadPeople())[account.email] ?? {}) });
export const reloadPeople = () => {
  people = null;
};

/** Commander and driver of each of the three teams (A, B, C) of a city. */
export function crewAccounts(city) {
  const base = slug(city.name);
  return baseCrewAccounts(base, city).map(withPerson);
}

const baseCrewAccounts = (base, city) =>
  TEAMS.flatMap((team) => [
    {
      email: `sim.${base}.${team.toLowerCase()}.cmt@${config.emailDomain}`,
      name: `SIM Cmt ${team} ${city.name}`,
      rank: '3º Sargento',
      role: 'Praça',
      duty: 'comandante',
      team,
    },
    {
      email: `sim.${base}.${team.toLowerCase()}.mot@${config.emailDomain}`,
      name: `SIM Mot ${team} ${city.name}`,
      rank: 'Soldado',
      role: 'Praça',
      duty: 'motorista',
      team,
    },
  ]);

export const officerAccounts = () =>
  Array.from({ length: OFFICER_COUNT }, (_, i) => withPerson({
    email: `sim.oficial${i + 1}@${config.emailDomain}`,
    name: `SIM Oficial CPU ${i + 1}`,
    rank: '1º Tenente',
    role: 'Oficial',
    duty: 'cpu',
  }));
