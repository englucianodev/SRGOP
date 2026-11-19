import { config } from '../config.js';
import { ApiClient } from '../lib/api.js';
import { officerAccounts } from '../domain/roster.js';

const DEGRADED_MIN_REQUESTS = 10;
const DEGRADED_RATE = 0.7;

async function healthEndpoint() {
  try {
    const response = await fetch(`${config.apiUrl}/api/health`, {
      headers: { 'x-simulation-token': config.bypassToken },
      signal: AbortSignal.timeout(15000),
    });
    return response.ok ? null : `/api/health respondeu ${response.status}`;
  } catch (error) {
    return `/api/health sem resposta (${error.cause?.code || error.name})`;
  }
}

/**
 * Detects unavailability (health endpoint down, or most requests failing — /api/health does
 * not touch the database) and recovery (health up AND an authenticated read working).
 */
export class HealthMonitor {
  constructor({ collector, onDown, onUp }) {
    Object.assign(this, { collector, onDown, onUp });
    this.reset();
  }

  reset() {
    this.nextAt = 0;
    this.failures = 0;
    this.successes = 0;
    this.down = false;
  }

  async check(now) {
    if (now < this.nextAt) return;
    this.nextAt = now + config.healthIntervalMs;
    const endpointProblem = await healthEndpoint();
    if (!this.down) {
      const recent = this.collector.recentFailure();
      const degraded = recent.total >= DEGRADED_MIN_REQUESTS && recent.rate >= DEGRADED_RATE;
      const problem = endpointProblem ?? (degraded ? `${Math.round(recent.rate * 100)}% das requisições falharam nos últimos 2 min` : null);
      this.failures = problem ? this.failures + 1 : 0;
      if (this.failures >= config.healthFailThreshold) {
        this.down = true;
        this.successes = 0;
        await this.onDown(problem);
      }
      return;
    }
    this.successes = !endpointProblem && (await this.authenticatedProbe()) ? this.successes + 1 : 0;
    if (this.successes >= config.healthRecoverThreshold) {
      this.down = false;
      this.failures = 0;
      await this.onUp();
    }
  }

  async authenticatedProbe() {
    const api = new ApiClient({ actor: 'monitor', role: 'Simulador', city: '', collector: { request() {}, markSlow() {}, event() {} } });
    try {
      await api.login(officerAccounts()[0].email, config.password);
      await api.get('/settings');
      await api.post('/auth/logout');
      return true;
    } catch {
      return false;
    }
  }
}
