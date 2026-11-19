// Live view of the running simulation: occurrences, dispatches, support and attendances as they
// happen. Read-only: it only reads dados/estado.json and dados/eventos/*.jsonl, never the API.
//   npm run monitorar                 → occurrence story + serious problems, last 15 min first
//   npm run monitorar -- --tudo       → every event (logins, slowness, ...)
//   npm run monitorar -- --desde=60   → start by showing the last 60 minutes
import { existsSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { localTime } from '../lib/time.js';
import { isLiveRelevant, formatLiveEvent, openAttendances } from '../lib/live.js';

const POLL_MS = 2000;
const PANEL_EVERY_MS = 60000;
const DEFAULT_BACKLOG_MIN = 15;
const MAX_BACKLOG_MIN = 24 * 60;

const args = process.argv.slice(2);
const all = args.includes('--tudo');
const backlogArg = Number(args.find((a) => a.startsWith('--desde='))?.split('=')[1]);
const backlogMin = Number.isFinite(backlogArg) && backlogArg >= 0 ? Math.min(backlogArg, MAX_BACKLOG_MIN) : DEFAULT_BACKLOG_MIN;
const color = process.stdout.isTTY;
const stateFile = path.join(config.dataDir, 'estado.json');
const eventsFile = (date = new Date()) => path.join(config.dataDir, 'eventos', `${date.toISOString().slice(0, 10)}.jsonl`);

function readState() {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return null; // missing, or caught mid-write by the simulator: try again on the next panel
  }
}

function panel() {
  const state = readState();
  const line = '─'.repeat(78);
  if (!state) return console.log(`${line}\n[${localTime()}] Nenhuma simulação encontrada em ${stateFile}.\n${line}`);
  const now = Date.now();
  const open = openAttendances(state, now);
  const waiting = Object.values(state.occurrences ?? {}).filter((o) => o.phase !== 'atendimento').length;
  const pause = state.pause ? ` — PAUSADA: ${state.pause.reason}` : '';
  const wrapUp = state.wrapUp ? ' — ENCERRANDO' : '';
  console.log(line);
  console.log(`[${localTime()}] Situação: ${state.status}${pause}${wrapUp} | em atendimento: ${open.length} | aguardando despacho/aceite: ${waiting}`);
  for (const o of open) console.log(`   ${o.protocol}  ${(o.cityName ?? '').padEnd(28)} há ${String(o.minutes).padStart(3)} min  (${o.scenario?.crimeType ?? o.origin ?? ''})`);
  console.log(line);
}

/** Reads only the bytes appended since the last poll; keeps a partial last line for later. */
class Tail {
  constructor() {
    this.file = null;
    this.offset = 0;
    this.rest = '';
  }

  read() {
    const file = eventsFile();
    if (file !== this.file) Object.assign(this, { file, offset: 0, rest: '' }); // new UTC day
    if (!existsSync(file)) return [];
    const size = statSync(file).size;
    if (size < this.offset) this.offset = 0; // file replaced
    if (size === this.offset) return [];
    const buffer = Buffer.alloc(size - this.offset);
    const fd = openSync(file, 'r');
    try {
      readSync(fd, buffer, 0, buffer.length, this.offset);
    } finally {
      closeSync(fd);
    }
    this.offset = size;
    const lines = (this.rest + buffer.toString('utf8')).split('\n');
    this.rest = lines.pop();
    return lines.filter(Boolean).flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  }
}

function show(rows, since = 0) {
  for (const row of rows) if (Date.parse(row.t) >= since && isLiveRelevant(row, { all })) console.log(formatLiveEvent(row, { color }));
}

panel();
console.log(`Mostrando ${all ? 'todos os eventos' : 'ocorrências, despachos, apoio, atendimentos e problemas graves'} desde ${backlogMin} min atrás. Ctrl+C para sair.\n`);
const tail = new Tail();
show(tail.read(), Date.now() - backlogMin * 60000);
let nextPanel = Date.now() + PANEL_EVERY_MS;
const timer = setInterval(() => {
  try {
    show(tail.read());
    if (Date.now() >= nextPanel) {
      panel();
      nextPanel = Date.now() + PANEL_EVERY_MS;
    }
  } catch (error) {
    console.error(`Falha ao ler os eventos: ${error.message}`);
  }
}, POLL_MS);
process.once('SIGINT', () => {
  clearInterval(timer);
  console.log('\nMonitor encerrado (a simulação continua rodando).');
});
