import { intBetween, chance } from '../lib/random.js';

export const normalize = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const has = (n, ...words) => words.some((w) => n.includes(w));

/**
 * Operational profile requested for the 18º BPM simulation. `weight` is the share of
 * occurrences; durations are minutes on scene; `results` feed the closing form.
 */
export const CATEGORIES = Object.freeze({
  mariaPenha: {
    label: 'Violência doméstica / Maria da Penha',
    weight: 0.22,
    match: (n) => has(n, 'maria da penha', 'violencia domestica', 'domestica'),
    priority: { Alta: 0.6, Média: 0.4, Baixa: 0 },
    duration: [3, 5],
    results: (rng) => ({ detained: chance(0.55, rng) ? 1 : 0, approaches: intBetween(1, 2, rng) }),
  },
  briga: {
    label: 'Briga de família ou de vizinhos',
    weight: 0.18,
    match: (n) => has(n, 'briga', 'vias de fato', 'desentendimento', 'vizinh', 'familiar'),
    priority: { Alta: 0.15, Média: 0.6, Baixa: 0.25 },
    duration: [2, 4],
    results: (rng) => ({ detained: chance(0.15, rng) ? 1 : 0, approaches: intBetween(1, 4, rng) }),
  },
  acidenteMaterial: {
    label: 'Acidente de trânsito com danos materiais',
    weight: 0.14,
    match: (n) => has(n, 'acidente') && has(n, 'material', 'materiais', 'sem vitima', 'danos'),
    fallback: (n) => has(n, 'acidente'),
    priority: { Alta: 0.05, Média: 0.55, Baixa: 0.4 },
    duration: [2, 4],
    results: (rng) => ({ approaches: intBetween(2, 3, rng) }),
  },
  mandado: {
    label: 'Cumprimento de mandado de prisão',
    weight: 0.12,
    match: (n) => has(n, 'mandado'),
    priority: { Alta: 0.3, Média: 0.6, Baixa: 0.1 },
    duration: [3, 5],
    results: (rng) => ({
      detained: chance(0.85, rng) ? 1 : 0,
      approaches: 1,
      ...(chance(0.2, rng) ? { seizures: [{ kind: 'Droga', description: 'Substância análoga à maconha', quantity: intBetween(5, 200, rng), unit: 'g' }] } : {}),
    }),
  },
  veiculo: {
    label: 'Recuperação de veículo roubado',
    weight: 0.1,
    match: (n) =>
      has(n, 'veiculo', 'carro', 'moto') && has(n, 'recupera', 'roubado', 'furtado', 'localiza'),
    priority: { Alta: 0.2, Média: 0.6, Baixa: 0.2 },
    duration: [3, 5],
    results: (rng) => ({
      recoveredVehicles: 1,
      detained: chance(0.25, rng) ? 1 : 0,
      approaches: intBetween(0, 2, rng),
    }),
  },
  armaFogo: {
    label: 'Apreensão de arma de fogo',
    // Half of the stolen-vehicle recoveries, as requested for the simulation profile.
    weight: 0.05,
    // Several registered types may describe it (porte, posse...): they all share this weight.
    shareMatches: true,
    match: (n) => has(n, 'porte ilegal de arma de fogo', 'posse de arma de fogo'),
    priority: { Alta: 0.5, Média: 0.4, Baixa: 0.1 },
    duration: [3, 5],
    results: (rng) => ({
      weapons: 1,
      detained: chance(0.7, rng) ? 1 : 0,
      approaches: intBetween(1, 3, rng),
      ...(chance(0.6, rng)
        ? { seizures: [{ kind: 'Munição', description: 'Munições intactas', quantity: intBetween(2, 12, rng), unit: 'un' }] }
        : {}),
    }),
  },
  acidenteFatal: {
    label: 'Acidente de trânsito com vítima fatal',
    weight: 0.05,
    match: (n) => has(n, 'acidente') && has(n, 'fatal', 'obito', 'morte', 'com vitima'),
    fallback: (n) => has(n, 'acidente'),
    priority: { Alta: 1, Média: 0, Baixa: 0 },
    duration: [4, 5],
    results: (rng) => ({ approaches: intBetween(1, 3, rng) }),
  },
  cadaver: {
    label: 'Achado de cadáver',
    weight: 0.03,
    match: (n) => has(n, 'cadaver', 'ossada', 'encontro de corpo', 'achado de corpo'),
    priority: { Alta: 0.8, Média: 0.2, Baixa: 0 },
    duration: [4, 5],
    results: () => ({}),
  },
  outros: {
    label: 'Demais tipos cadastrados',
    weight: 0.11,
    match: () => false,
    priority: { Alta: 0.2, Média: 0.5, Baixa: 0.3 },
    duration: [2, 4],
    results: (rng) => ({ detained: chance(0.2, rng) ? 1 : 0, approaches: intBetween(0, 3, rng) }),
  },
});

const MAIN = Object.keys(CATEGORIES).filter((id) => id !== 'outros');

/** Maps each category to a crime type that already exists in the published system. */
export function mapCrimeTypes(systemTypes, overrides = {}) {
  const mapping = {};
  const warnings = [];
  const taken = new Set(Object.values(overrides));
  for (const id of MAIN) {
    const forced = overrides[id];
    if (forced !== undefined) {
      if (!systemTypes.includes(forced))
        throw new Error(`config/tipos.json: o tipo "${forced}" (categoria ${id}) não existe no sistema.`);
      mapping[id] = forced;
      continue;
    }
    const category = CATEGORIES[id];
    // A type serves one category; only the generic accident fallback may be shared.
    const found =
      systemTypes.find((t) => !taken.has(t) && category.match(normalize(t))) ??
      (category.fallback && systemTypes.find((t) => category.fallback(normalize(t))));
    if (found) taken.add(found);
    mapping[id] = found ?? null;
    if (!found)
      warnings.push(
        `Nenhum tipo cadastrado corresponde à categoria ${id} (${category.label}); o peso dela irá para "outros".`,
      );
  }
  const used = new Set(Object.values(mapping).filter(Boolean));
  const extras = {};
  for (const id of MAIN.filter((key) => mapping[key] && CATEGORIES[key].shareMatches && !overrides[key])) {
    extras[id] = systemTypes.filter((t) => !used.has(t) && CATEGORIES[id].match(normalize(t)));
    extras[id].forEach((t) => used.add(t));
  }
  const others = systemTypes.filter((t) => !used.has(t));
  return { mapping, extras, others, warnings };
}

/** Weighted entries `{ id, crimeType, weight }` used by the scenario generator. */
export function buildCategoryPool(mapping, others, extras = {}) {
  const pool = [];
  let unassigned = CATEGORIES.outros.weight;
  for (const id of MAIN) {
    if (mapping[id]) {
      const types = [mapping[id], ...(extras[id] ?? [])];
      pool.push(...types.map((crimeType) => ({ id, crimeType, weight: CATEGORIES[id].weight / types.length })));
    }
    else unassigned += CATEGORIES[id].weight;
  }
  if (others.length)
    return [
      ...pool,
      ...others.map((crimeType) => ({ id: 'outros', crimeType, weight: unassigned / others.length })),
    ];
  const mapped = pool.reduce((sum, e) => sum + e.weight, 0);
  if (!mapped) throw new Error('Nenhum tipo de crime cadastrado pôde ser usado na simulação.');
  return pool.map((e) => ({ ...e, weight: e.weight + (unassigned * e.weight) / mapped }));
}

/** Crime types the simulation needs in the published system (weapon seizures). */
export const REQUIRED_CRIME_TYPES = Object.freeze(['Porte ilegal de arma de fogo', 'Posse de arma de fogo']);

/**
 * Body for PUT /settings adding the missing required crime types, or null when all exist.
 * The route takes the whole settings object (strict), so every editable field is copied back.
 */
export function settingsWithCrimeTypes(settings, required = REQUIRED_CRIME_TYPES) {
  const current = settings?.crimeTypes ?? [];
  const known = new Set(current.map(normalize));
  const missing = required.filter((type) => !known.has(normalize(type)));
  if (!missing.length) return null;
  const { institution, inactivityMinutes, onDutyInactivityMinutes, alertMinutes, soundEnabled, notificationsEnabled, modules } = settings;
  return {
    institution, inactivityMinutes, onDutyInactivityMinutes, alertMinutes, soundEnabled, notificationsEnabled, modules,
    crimeTypes: [...current, ...missing],
    operations: (settings.operations ?? []).map(({ name, objective, day }) => ({ name, objective, day: String(day).slice(0, 10) })),
  };
}
