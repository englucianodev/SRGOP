// Fictitious names and ranks for the simulated officers. The roster is drawn once, saved in
// dados/efetivo.json and reused, so a restart keeps the same people and the same accounts.
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

// Exactly as the SRGOP rank list spells them (the system stores "2ª Sargento").
export const COMMANDER_RANKS = Object.freeze(['1º Sargento', '2ª Sargento', '3º Sargento']);
export const DRIVER_RANKS = Object.freeze(['Soldado', 'Cabo']);
export const CPU_RANK = '1º Tenente';

const FIRST_NAMES = [
  'Ana', 'Antônio', 'Adriana', 'Alexandre', 'Aline', 'André', 'Beatriz', 'Bruno', 'Camila', 'Carlos',
  'Cláudia', 'Daniel', 'Débora', 'Diego', 'Eduardo', 'Elaine', 'Fábio', 'Fernanda', 'Felipe', 'Francisco',
  'Gabriel', 'Gabriela', 'Gustavo', 'Helena', 'Henrique', 'Igor', 'Isabela', 'Jéssica', 'João', 'José',
  'Juliana', 'Leandro', 'Letícia', 'Lucas', 'Luana', 'Luiz', 'Marcelo', 'Márcia', 'Marcos', 'Mariana',
  'Mateus', 'Natália', 'Paulo', 'Patrícia', 'Pedro', 'Rafael', 'Raimundo', 'Renata', 'Ricardo', 'Rodrigo',
  'Rosana', 'Samuel', 'Sandra', 'Sérgio', 'Simone', 'Thiago', 'Vanessa', 'Vinícius', 'Wagner', 'Wellington',
];
const SURNAMES = [
  'Almeida', 'Alves', 'Araújo', 'Barbosa', 'Barros', 'Batista', 'Cardoso', 'Carvalho', 'Castro', 'Costa',
  'Cunha', 'Dias', 'Duarte', 'Farias', 'Ferreira', 'Freitas', 'Gomes', 'Lima', 'Lopes', 'Macedo',
  'Machado', 'Martins', 'Medeiros', 'Melo', 'Mendes', 'Monteiro', 'Moraes', 'Moreira', 'Nascimento', 'Nogueira',
  'Oliveira', 'Pereira', 'Pinheiro', 'Pinto', 'Ramos', 'Reis', 'Ribeiro', 'Rocha', 'Rodrigues', 'Santana',
  'Santos', 'Silva', 'Soares', 'Sousa', 'Teixeira', 'Vieira', 'Brito', 'Coelho', 'Correia', 'Fonseca',
];
const MAX_TRIES = 10000;

const pickFrom = (list, random) => list[Math.floor(random() * list.length)];

function rankFor(duty, random) {
  if (duty === 'comandante') return pickFrom(COMMANDER_RANKS, random);
  if (duty === 'motorista') return pickFrom(DRIVER_RANKS, random);
  return CPU_RANK;
}

/**
 * Keeps whoever already has a name and draws a distinct name and a rank matching the duty for
 * the others. Returns a new object; `existing` is not changed.
 */
export function assignPeople(accounts, existing = {}, random = Math.random) {
  const people = { ...existing };
  const used = new Set(Object.values(people).map((p) => p.name));
  for (const { email, duty } of accounts) {
    if (people[email]) continue;
    let name = '';
    for (let tries = 0; tries < MAX_TRIES && (!name || used.has(name)); tries++) {
      const [first, second] = [pickFrom(SURNAMES, random), pickFrom(SURNAMES, random)];
      if (first !== second) name = `${pickFrom(FIRST_NAMES, random)} ${first} ${second}`;
    }
    if (used.has(name)) throw new Error('Não foi possível sortear um nome distinto para o efetivo.');
    used.add(name);
    people[email] = { name, rank: rankFor(duty, random) };
  }
  return people;
}

export const rosterFile = () => path.join(config.dataDir, 'efetivo.json');

export function loadPeople() {
  try {
    return existsSync(rosterFile()) ? JSON.parse(readFileSync(rosterFile(), 'utf8')) : {};
  } catch {
    return {};
  }
}

export function savePeople(people) {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(`${rosterFile()}.tmp`, JSON.stringify(people, null, 2));
  renameSync(`${rosterFile()}.tmp`, rosterFile());
}
