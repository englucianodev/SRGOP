import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { localDateTime } from '../lib/time.js';

const [command] = process.argv.slice(2);
const stateFile = path.join(config.dataDir, 'estado.json');

function status() {
  if (!existsSync(stateFile)) return console.log('Nenhuma simulação iniciada ainda (dados/estado.json não existe).');
  const s = JSON.parse(readFileSync(stateFile, 'utf8'));
  const hours = (ms) => (ms / 3600000).toFixed(1);
  const percent = ((s.activeMs / s.plannedActiveMs) * 100).toFixed(1);
  console.log(`Situação:      ${s.status}${s.pause ? ` — ${s.pause.reason} (desde ${localDateTime(new Date(s.pause.from))})` : ''}`);
  console.log(`Iniciada em:   ${localDateTime(new Date(s.startedAt))}`);
  console.log(`Tempo testado: ${hours(s.activeMs)}h de ${hours(s.plannedActiveMs)}h (${percent}%)`);
  console.log(`Pausas:        ${s.pauses.length} (${s.pauses.filter((p) => p.automatic).length} por indisponibilidade)`);
  console.log(`Reinícios:     ${s.restarts.length}`);
  console.log(`Em atendimento agora: ${Object.values(s.occurrences).filter((o) => o.phase === 'atendimento').length}`);
  const today = path.join(config.dataDir, 'eventos', `${new Date().toISOString().slice(0, 10)}.jsonl`);
  if (!existsSync(today)) return;
  const counts = {};
  for (const line of readFileSync(today, 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.severity !== 'info' && row.category !== 'simulador') counts[row.severity] = (counts[row.severity] ?? 0) + 1;
  }
  console.log(`Problemas hoje (UTC): ${JSON.stringify(counts)}`);
}

const COMMANDS = { pausar: 'pausada', retomar: 'retomada', encerrar: 'encerrada (com relatório final)' };
if (command === 'status' || !command) status();
else if (COMMANDS[command]) {
  mkdirSync(config.dataDir, { recursive: true });
  const file = path.join(config.dataDir, 'controle.json');
  writeFileSync(`${file}.tmp`, JSON.stringify({ comando: command, em: new Date().toISOString() }));
  renameSync(`${file}.tmp`, file); // atomic: the simulator never reads half a command
  console.log(`Pedido registrado: a simulação será ${COMMANDS[command]} em até 10 segundos.`);
} else {
  console.error('Uso: node src/cli/control.js status|pausar|retomar|encerrar');
  process.exitCode = 1;
}
