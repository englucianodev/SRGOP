import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const DAY_MS = 86400000;
const VERSION = 1;

/**
 * Persistent simulation state. Only time spent "executando" counts toward the configured
 * duration, so outages (paused) and process restarts do not shorten the test.
 */
export class SimulationState {
  maxTickGapMs = 60000;

  constructor(file, data) {
    this.file = file;
    this.data = data;
  }

  static create(file, { days, now = Date.now() }) {
    return new SimulationState(file, {
      version: VERSION,
      startedAt: new Date(now).toISOString(),
      plannedActiveMs: days * DAY_MS,
      activeMs: 0,
      lastTickAt: now,
      status: 'executando',
      pause: null,
      pauses: [],
      restarts: [],
      occurrences: {},
      finishedAt: null,
    });
  }

  static load(file) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.version !== VERSION) throw new Error(`Estado ${file} tem versão incompatível.`);
    return new SimulationState(file, data);
  }

  /** After a process restart the gap while it was down must not count as test time. */
  markRestart(now = Date.now()) {
    this.data.restarts.push({ at: new Date(now).toISOString(), gapMs: now - this.data.lastTickAt });
    this.data.lastTickAt = now;
  }

  tick(now = Date.now()) {
    const delta = Math.max(0, now - this.data.lastTickAt);
    if (this.data.status === 'executando') this.data.activeMs += Math.min(delta, this.maxTickGapMs);
    this.data.lastTickAt = now;
  }

  get running() {
    return this.data.status === 'executando';
  }

  pause(reason, now = Date.now(), { automatic = false } = {}) {
    if (this.data.status !== 'executando') return false;
    this.tick(now);
    this.data.status = 'pausado';
    this.data.pause = { reason, automatic, from: new Date(now).toISOString() };
    return true;
  }

  resume(now = Date.now()) {
    if (this.data.status !== 'pausado') return null;
    const pause = this.data.pause;
    const record = { ...pause, to: new Date(now).toISOString(), durationMs: now - Date.parse(pause.from) };
    this.data.pauses.push(record);
    this.data.pause = null;
    this.data.status = 'executando';
    this.data.lastTickAt = now;
    return record;
  }

  finish(now = Date.now()) {
    this.data.status = 'finalizado';
    this.data.finishedAt = new Date(now).toISOString();
  }

  isComplete() {
    return this.data.activeMs >= this.data.plannedActiveMs;
  }

  remainingMs() {
    return Math.max(0, this.data.plannedActiveMs - this.data.activeMs);
  }

  trackOccurrence(id, info) {
    this.data.occurrences = { ...this.data.occurrences, [id]: { ...this.data.occurrences[id], ...info } };
  }

  forgetOccurrence(id) {
    const { [id]: _removed, ...rest } = this.data.occurrences;
    this.data.occurrences = rest;
  }

  /** Drops occurrences nobody will finish (rejected, redirected, lost) so the file stays small. */
  pruneOccurrences(now = Date.now(), maxAgeMs = DAY_MS) {
    const kept = Object.entries(this.data.occurrences).filter(([, o]) => !(now - Date.parse(o.createdAt) > maxAgeMs));
    if (kept.length !== Object.keys(this.data.occurrences).length) this.data.occurrences = Object.fromEntries(kept);
  }

  setWrapUp(since, reason) {
    this.data.wrapUp = { since, reason };
  }

  save() {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.data));
    renameSync(temporary, this.file);
  }
}
