import { config } from '../config.js';

const MIN_INTERVAL_MS = 3000;
const COOLDOWN_MS = 30 * 60000;
const REQUEST_TIMEOUT_MS = 90000;
const QUOTA_ERROR = /neuron|quota|limit|exceeded/i;

/** Next 00:00 UTC, when the Workers AI free allocation is renewed. */
export const nextUtcMidnight = (now = Date.now()) => {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
};

/** Reads a JSON object out of a model answer that may come wrapped in prose or code fences. */
export function parseJsonAnswer(answer) {
  if (answer && typeof answer === 'object') return answer;
  const text = String(answer ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Small Cloudflare Workers AI client used only for fictitious text. Every failure returns
 * null so the caller falls back to templates and the simulation never stops because of AI.
 * `fetcher` is injectable for tests.
 */
export class TextAI {
  constructor(collector, { fetcher = fetch, settings = config } = {}) {
    Object.assign(this, { collector, fetcher, settings });
    this.enabled = Boolean(settings.aiAccountId && settings.aiToken) && settings.aiDailyCap > 0;
    this.day = '';
    this.used = 0;
    this.nextAt = 0;
    this.blockedUntil = 0;
    this.queue = Promise.resolve();
  }

  /** The free allocation resets at 00:00 UTC, so the daily count follows the UTC date. */
  available() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) Object.assign(this, { day: today, used: 0 });
    return this.enabled && this.used < this.settings.aiDailyCap && Date.now() >= this.blockedUntil;
  }

  /** Returns a parsed JSON object or null. Calls are serialized and spaced out. */
  json(prompt, { temperature = 0.9, maxTokens = 700 } = {}) {
    return this.enqueue(async () => parseJsonAnswer(await this.call(prompt, { temperature, maxTokens })));
  }

  text(prompt, { temperature = 0.4, maxTokens = 2500 } = {}) {
    return this.enqueue(async () => {
      const answer = await this.call(prompt, { temperature, maxTokens });
      return typeof answer === 'string' ? answer.trim() || null : null;
    });
  }

  enqueue(task) {
    const run = async () => {
      if (!this.available()) return null;
      const wait = this.nextAt - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.nextAt = Date.now() + MIN_INTERVAL_MS;
      this.used++;
      return task();
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  async call(prompt, { temperature, maxTokens }) {
    const { aiAccountId, aiToken, aiModel } = this.settings;
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(aiAccountId)}/ai/run/${aiModel}`;
    try {
      const response = await this.fetcher(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${aiToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.success === false) return this.refused(response.status, body);
      return body.result?.response ?? null;
    } catch (error) {
      this.note(`Workers AI indisponível (${error.name}); usando modelos prontos.`);
      return null;
    }
  }

  refused(status, body) {
    const detail = (body.errors ?? []).map((e) => e.message).join('; ').slice(0, 200);
    const quota = status === 429 || QUOTA_ERROR.test(detail);
    if (quota) this.blockedUntil = nextUtcMidnight();
    else if (status >= 500) this.blockedUntil = Date.now() + COOLDOWN_MS;
    const until = quota ? ' até 00:00 UTC (cota diária gratuita)' : status >= 500 ? ' por 30 min' : '';
    this.note(`Workers AI respondeu ${status}${detail ? ` (${detail})` : ''}; usando modelos prontos${until}.`);
    return null;
  }

  note(message) {
    this.collector.event({ severity: 'info', category: 'simulador', message });
  }
}
