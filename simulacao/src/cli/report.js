import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { Collector } from '../lib/collector.js';
import { SimulationState } from '../lib/state.js';
import { TextAI } from '../lib/ai.js';
import { writeReport } from '../report/reports.js';

// Generates the full report at any moment (also while the simulation is running).
// Flags: --sem-ia (rule-based text only), --sem-pdf.
const stateFile = path.join(config.dataDir, 'estado.json');
if (!existsSync(stateFile)) {
  console.error('Sem dados: a simulação ainda não foi iniciada.');
  process.exit(1);
}
const state = SimulationState.load(stateFile);
const collector = new Collector(config.dataDir, { quiet: true });
const ai = process.argv.includes('--sem-ia') ? null : new TextAI(collector);
const final = state.data.status === 'finalizado';
const file = await writeReport({
  state,
  ai,
  from: new Date(state.data.startedAt),
  to: new Date(),
  name: final ? 'relatorio-final' : `relatorio-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`,
  partial: !final,
  pdf: !process.argv.includes('--sem-pdf'),
});
console.log(`Relatório gerado: ${file}`);
