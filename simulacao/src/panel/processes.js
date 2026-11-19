// Starts and controls the simulator for the local panel. The simulator runs as its own process,
// so closing the panel never stops a test; pause/resume/finish go through dados/controle.json,
// the same file used by "npm run pausar/retomar/encerrar".
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, openSync, readdirSync, closeSync, rmSync } from 'node:fs';
import path from 'node:path';
import { lockHolder } from '../lib/instance-lock.js';

const FRESH_SNAPSHOT_MS = 40000;
// Kept across tests: the drawn roster, the record that its accounts exist, and the archive itself.
const KEEP_ON_ARCHIVE = new Set(['efetivo.json', 'preparacao.json', 'arquivo']);
const CONTROL_COMMANDS = new Set(['pausar', 'retomar', 'encerrar']);
// Kept by the full cleanup: the roster (names are reused) and the cleanup log itself.
const KEEP_ON_CLEANUP = new Set(['efetivo.json', 'limpeza.log']);

export class Processes {
  constructor({ root, dataDir }) {
    Object.assign(this, { root, dataDir });
    this.pidFile = path.join(dataDir, 'processo.json');
    this.jobs = {}; // background runs started from the panel: preparar, limpeza
  }

  readJson(name) {
    try {
      return JSON.parse(readFileSync(path.join(this.dataDir, name), 'utf8'));
    } catch {
      return null;
    }
  }

  isAlive(pid) {
    if (!pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code === 'EPERM';
    }
  }

  /** Running if any simulator holds the lock, our child is alive, or the snapshot is fresh. */
  simulatorRunning(now = Date.now()) {
    const pid = this.readJson('processo.json')?.pid;
    const snapshot = this.readJson('painel.json');
    if (lockHolder(path.join(this.dataDir, 'simulador.lock'))) return true;
    return this.isAlive(pid) || (snapshot && now - snapshot.t < FRESH_SNAPSHOT_MS && snapshot.status !== 'finalizado');
  }

  spawnNode(script, args, logName) {
    mkdirSync(this.dataDir, { recursive: true });
    const log = openSync(path.join(this.dataDir, logName), 'a');
    try {
      const child = spawn(process.execPath, [script, ...args], { cwd: this.root, detached: true, stdio: ['ignore', log, log], windowsHide: true });
      child.unref();
      return child;
    } finally {
      closeSync(log);
    }
  }

  /** Null when the roster is ready in the published system, otherwise why the test cannot start. */
  preparationBlocker() {
    const prep = this.readJson('preparacao.json');
    if (this.jobs.preparar?.running || prep?.status === 'executando') return 'Aguarde a preparação do efetivo terminar.';
    if (!prep) return 'Prepare o efetivo antes de iniciar (aba Preparação, "Preparar efetivo").';
    if (prep.status !== 'concluida') return 'A última preparação do efetivo falhou. Rode "Preparar efetivo" de novo.';
    return null;
  }

  start() {
    if (this.simulatorRunning()) throw new Error('O simulador já está em execução.');
    const blocker = this.preparationBlocker();
    if (blocker) throw new Error(blocker);
    if (this.readJson('estado.json')?.status === 'finalizado')
      throw new Error('O teste anterior já terminou. Use "Novo teste" para arquivá-lo e começar outro.');
    const child = this.spawnNode('src/cli/run.js', [], 'simulador.log');
    writeFileSync(this.pidFile, JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString() }));
    return child.pid;
  }

  control(command) {
    if (!CONTROL_COMMANDS.has(command)) throw new Error('Comando desconhecido.');
    if (!this.simulatorRunning()) throw new Error('O simulador não está em execução.');
    const file = path.join(this.dataDir, 'controle.json');
    writeFileSync(`${file}.tmp`, JSON.stringify({ comando: command, em: new Date().toISOString() }));
    renameSync(`${file}.tmp`, file);
  }

  /** Last resort: stops the process at once. The state saved on the last tick is kept. */
  interrupt() {
    const pid = this.readJson('processo.json')?.pid;
    if (!this.isAlive(pid)) throw new Error('Não há processo do simulador iniciado pelo painel.');
    process.kill(pid);
  }

  /** Draws the roster and creates/updates accounts in the published system (npm run seed). */
  seed() {
    if (this.simulatorRunning()) throw new Error('Encerre o teste em andamento antes de preparar o efetivo.');
    this.runJob('preparar', 'src/cli/seed.js', [], 'preparacao.log');
  }

  runJob(name, script, args, logName, onSuccess = () => {}) {
    if (this.jobs[name]?.running) throw new Error(`A ${name === 'limpeza' ? 'limpeza' : 'preparação do efetivo'} já está em andamento.`);
    const job = { running: true, startedAt: Date.now(), code: null, log: logName };
    this.jobs[name] = job;
    const child = this.spawnNode(script, args, logName);
    child.on('exit', (code) => {
      try {
        if (code === 0) onSuccess();
      } catch (error) {
        Object.assign(job, { error: error.message });
      }
      Object.assign(job, { running: false, code });
    });
    child.on('error', (error) => Object.assign(job, { running: false, code: -1, error: error.message }));
  }

  /**
   * Deletes the data of every previous test: first the simulation data in the database
   * (npm run limpar -- --confirmar), then, only if that worked, the local files of all tests.
   */
  cleanAll() {
    if (this.simulatorRunning()) throw new Error('Encerre o teste em andamento antes de limpar.');
    if (this.jobs.limpeza?.running) throw new Error('A limpeza já está em andamento.');
    rmSync(path.join(this.dataDir, 'limpeza.log'), { force: true });
    this.runJob('limpeza', 'src/cli/cleanup.js', ['--confirmar'], 'limpeza.log', () => this.removeLocalRuns());
  }

  /** Local files of the current and archived tests; the roster stays so names are reused. */
  removeLocalRuns() {
    if (!existsSync(this.dataDir)) return;
    for (const name of readdirSync(this.dataDir))
      if (!KEEP_ON_CLEANUP.has(name)) rmSync(path.join(this.dataDir, name), { recursive: true, force: true });
  }

  jobLogTail(name, lines = 6) {
    const job = this.jobs[name];
    if (!job?.log) return '';
    try {
      return readFileSync(path.join(this.dataDir, job.log), 'utf8').trim().split(/\r?\n/).slice(-lines).join('\n');
    } catch {
      return '';
    }
  }

  /** Moves the previous test's files to dados/arquivo/<date>/ so a new test starts clean. */
  archive() {
    if (this.simulatorRunning()) throw new Error('Encerre o teste em andamento antes de arquivá-lo.');
    if (!existsSync(this.dataDir)) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const target = path.join(this.dataDir, 'arquivo', stamp);
    const items = readdirSync(this.dataDir).filter((name) => !KEEP_ON_ARCHIVE.has(name));
    if (!items.length) return null;
    mkdirSync(target, { recursive: true });
    for (const name of items) renameSync(path.join(this.dataDir, name), path.join(target, name));
    return target;
  }

  status() {
    return {
      running: Boolean(this.simulatorRunning()),
      startBlocker: this.preparationBlocker(),
      jobs: Object.fromEntries(
        Object.entries(this.jobs).map(([name, job]) => [name, { running: job.running, code: job.code, error: job.error ?? null, tail: job.running ? '' : this.jobLogTail(name) }]),
      ),
    };
  }
}
