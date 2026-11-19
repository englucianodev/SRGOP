import { existsSync } from 'node:fs';
import path from 'node:path';
import { config, requireRuntimeConfig } from '../config.js';
import { Collector } from '../lib/collector.js';
import { SimulationState } from '../lib/state.js';
import { TextAI } from '../lib/ai.js';
import { sleep } from '../lib/random.js';
import { loadWorld } from '../engine/world.js';
import { Simulation } from '../engine/simulation.js';
import { ScenarioFactory } from '../domain/scenarios.js';
import { BrowserObservers } from '../actors/browser.js';
import { Reports } from '../report/reports.js';
import { acquireInstanceLock } from '../lib/instance-lock.js';

const DAY_MS = 86400000;
const WORLD_RETRY_MS = 60000;

requireRuntimeConfig();
let releaseLock;
try {
  releaseLock = acquireInstanceLock(path.join(config.dataDir, 'simulador.lock'));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
process.on('exit', () => releaseLock());
const collector = new Collector(config.dataDir);
// A stray rejection in an actor or browser handler must not stop a multi-day run.
for (const kind of ['unhandledRejection', 'uncaughtException'])
  process.on(kind, (error) => {
    console.error(`${kind}:`, error);
    collector.event({ severity: 'baixo', category: 'simulador', message: `Erro não tratado (${kind}): ${error?.message ?? error}`, details: { stack: error?.stack } });
  });
const stateFile = path.join(config.dataDir, 'estado.json');
const restarted = existsSync(stateFile);
const state = restarted ? SimulationState.load(stateFile) : SimulationState.create(stateFile, { days: config.days });

if (state.data.status !== 'finalizado' && state.data.plannedActiveMs !== config.days * DAY_MS) {
  collector.event({ severity: 'info', category: 'controle', message: `Duração alterada de ${state.data.plannedActiveMs / DAY_MS} para ${config.days} dia(s) (SIM_DAYS).` });
  state.data.plannedActiveMs = config.days * DAY_MS;
}
state.save();

/** The system may be down when the container starts: keep trying instead of crashing. */
async function loadWorldPatiently() {
  for (;;) {
    try {
      return await loadWorld(collector);
    } catch (error) {
      console.error(`Não foi possível preparar a simulação: ${error.message}. Nova tentativa em 1 min.`);
      await sleep(WORLD_RETRY_MS);
    }
  }
}

const ai = new TextAI(collector);
const reports = new Reports({ collector, state, ai });
if (state.data.status === 'finalizado') {
  await new Simulation({ collector, state, reports }).run({ restarted });
  process.exit(0);
}
const world = await loadWorldPatiently();
for (const warning of world.warnings) collector.event({ severity: 'info', category: 'controle', message: warning });
if (world.missing.length) collector.event({ severity: 'info', category: 'controle', message: `Cidades sem guarnição SIM (fora da simulação): ${world.missing.join(', ')}.` });
collector.event({ severity: 'info', category: 'controle', message: `Tipos usados: ${Object.entries(world.mapping).map(([k, v]) => `${k}=${v ?? '—'}`).join('; ')}.` });

const simulation = new Simulation({
  collector,
  state,
  world,
  factory: new ScenarioFactory({ pool: world.pool, ai }),
  browsers: config.browserActors ? new BrowserObservers({ collector, count: config.browserActors }) : null,
  reports,
});
console.log(`SRGOP · simulação ${restarted ? 'retomada' : 'iniciada'}: ${world.units.length} cidades, ${config.days} dia(s). Dados em ${config.dataDir}.`);
await simulation.run({ restarted });
process.exit(0);
