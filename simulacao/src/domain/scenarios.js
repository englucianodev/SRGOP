import { config } from '../config.js';
import { CATEGORIES } from './crimes.js';
import { TEMPLATES, STREETS, DISTRICTS } from './templates.js';
import { between, intBetween, pick, weightedPick, chance, minutes } from '../lib/random.js';

const clean = (text, min, max) =>
  typeof text === 'string' && text.trim().length >= min ? text.trim().slice(0, max) : null;

function priorityOf(category, rng) {
  const entries = Object.entries(category.priority).map(([id, weight]) => ({ id, weight }));
  return weightedPick(entries.filter((e) => e.weight > 0), rng).id;
}

function aiPrompt({ category, crimeType, city, local, priority }) {
  return `Você gera ocorrências policiais FICTÍCIAS para testar um sistema da Polícia Militar do Maranhão.
Tipo: ${crimeType} (${category.label}). Município: ${city}. Local: ${local}. Prioridade: ${priority}.
Regras: português do Brasil, linguagem de registro policial objetiva, sem nomes de pessoas, CPF, placas ou telefones.
Responda SOMENTE com JSON: {"descricao": "relato inicial do solicitante, 2 a 4 frases",
"observacoes": ["2 ou 3 atualizações curtas da guarnição durante o atendimento"],
"resumo": "resumo do encerramento, 2 a 3 frases, coerente com o relato"}`;
}

/** Builds fictitious but plausible occurrences for a city. */
export class ScenarioFactory {
  constructor({ pool, ai, rng = Math.random }) {
    Object.assign(this, { pool, ai, rng });
  }

  async create(city) {
    const rng = this.rng;
    const entry = weightedPick(this.pool, rng);
    const category = CATEGORIES[entry.id];
    const templates = TEMPLATES[entry.id];
    const local = `${pick(STREETS, rng)}, ${intBetween(10, 1999, rng)} · ${pick(DISTRICTS, rng)}`;
    const priority = priorityOf(category, rng);
    const ai = await this.ai?.json(aiPrompt({ category, crimeType: entry.crimeType, city: city.name, local, priority }));
    const description = clean(ai?.descricao, 10, 3000) ?? pick(templates.descriptions, rng).replace('{local}', local);
    const summary = clean(ai?.resumo, 10, 3000) ?? pick(templates.summaries, rng);
    const aiNotes = Array.isArray(ai?.observacoes) ? ai.observacoes.map((n) => clean(n, 3, 500)).filter(Boolean) : [];
    const notes = aiNotes.length ? aiNotes.slice(0, 3) : templates.notes;
    const [minDuration, maxDuration] = category.duration;
    return {
      category: entry.id,
      categoryLabel: category.label,
      crimeType: entry.crimeType,
      priority,
      address: `${local} · ${city.name}`,
      latitude: Number((city.latitude + between(-0.015, 0.015, rng)).toFixed(6)),
      longitude: Number((city.longitude + between(-0.015, 0.015, rng)).toFixed(6)),
      description: `${config.tag} ${description}`,
      summary,
      notes,
      durationMs: minutes(between(minDuration, maxDuration, rng)),
      wantsSupport: chance(config.supportRate * (entry.id === 'acidenteFatal' || entry.id === 'cadaver' ? 3 : 1), rng),
      results: { weapons: 0, recoveredVehicles: 0, detained: 0, approaches: 0, ...category.results(rng) },
      generatedBy: ai ? 'ia' : 'modelo',
    };
  }
}
