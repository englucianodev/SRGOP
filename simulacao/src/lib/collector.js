import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { localTime } from './time.js';

export const SEVERITIES = Object.freeze(['critico', 'alto', 'medio', 'baixo', 'info']);
const SECRET_KEYS = /pass|senha|token|cookie|authorization|secret|key/i;
const MAX_TEXT = 600;
const WINDOW_MS = 120000;

function sanitize(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (typeof value === 'string') return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !SECRET_KEYS.test(k))
        .map(([k, v]) => [k, sanitize(v, depth + 1)]),
    );
  return value;
}

const percentile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;

/** Records every simulation event (JSONL per day) and aggregates request metrics per minute. */
export class Collector {
  constructor(dataDir, { quiet = false } = {}) {
    this.eventsDir = path.join(dataDir, 'eventos');
    this.metricsDir = path.join(dataDir, 'metricas');
    mkdirSync(this.eventsDir, { recursive: true });
    mkdirSync(this.metricsDir, { recursive: true });
    this.quiet = quiet;
    this.endpoints = new Map();
    this.recent = [];
  }

  event({ severity = 'info', category, message, actor, role, city, details } = {}) {
    if (!SEVERITIES.includes(severity)) severity = 'info';
    const row = { t: new Date().toISOString(), severity, category, message, actor, role, city };
    if (details) row.details = sanitize(details);
    this.append(path.join(this.eventsDir, `${row.t.slice(0, 10)}.jsonl`), row);
    if (!this.quiet && severity !== 'info')
      console.log(`[${localTime()}] ${severity.toUpperCase()} ${category}: ${message}${actor ? ` (${actor})` : ''}`);
    return row;
  }

  /** A full or broken disk must not crash a multi-day run; stderr still shows it. */
  append(file, row) {
    try {
      appendFileSync(file, `${JSON.stringify(row)}\n`);
    } catch (error) {
      console.error(`Falha ao gravar ${file}: ${error.message}`);
    }
  }

  /** Lifecycle step of the simulated operation, counted in the report. */
  flow(code, message, context = {}, details = {}) {
    return this.event({ ...context, severity: 'info', category: 'fluxo', message, details: { code, ...details } });
  }

  request({ method, route, status, ms }) {
    const key = `${method} ${route}`;
    const row = this.endpoints.get(key) ?? { count: 0, serverErrors: 0, clientErrors: 0, network: 0, slow: 0, durations: [] };
    row.count++;
    if (status === 0) row.network++;
    else if (status >= 500) row.serverErrors++;
    else if (status >= 400) row.clientErrors++;
    if (row.durations.length < 5000) row.durations.push(ms);
    this.endpoints.set(key, row);
    const now = Date.now();
    this.recent.push({ at: now, failed: status === 0 || status >= 500 });
    while (this.recent.length && this.recent[0].at < now - WINDOW_MS) this.recent.shift();
  }

  /** Called on resume so failures from before the pause do not re-trigger a pause. */
  resetRecent() {
    this.recent = [];
  }

  markSlow(method, route) {
    const row = this.endpoints.get(`${method} ${route}`);
    if (row) row.slow++;
  }

  /** Share of failed requests (network or 5xx) in the last two minutes. */
  recentFailure() {
    const failed = this.recent.filter((r) => r.failed).length;
    return { total: this.recent.length, failed, rate: this.recent.length ? failed / this.recent.length : 0 };
  }

  flushMetrics() {
    if (!this.endpoints.size) return;
    const t = new Date().toISOString();
    const endpoints = [...this.endpoints.entries()].map(([key, r]) => {
      const sorted = [...r.durations].sort((a, b) => a - b);
      return {
        key,
        count: r.count,
        serverErrors: r.serverErrors,
        clientErrors: r.clientErrors,
        network: r.network,
        slow: r.slow,
        p50: Math.round(percentile(sorted, 0.5)),
        p95: Math.round(percentile(sorted, 0.95)),
        max: Math.round(sorted.at(-1) ?? 0),
      };
    });
    this.append(path.join(this.metricsDir, `${t.slice(0, 10)}.jsonl`), { t, endpoints });
    this.endpoints = new Map();
  }
}
