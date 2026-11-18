import axios from 'axios';

// Automatic retry policy for the HTTP client (transient network/gateway failures).
export const RETRY_DELAYS_MS = [1000, 2000, 4000];
export const MAX_RETRY_AFTER_MS = 10000;
const RETRY_STATUSES = [502, 503, 504, 429];
const JITTER_MS = 250;

export function shouldRetry(error) {
  const config = error?.config;
  if (!config || config.retry === false) return false;
  if (axios.isCancel(error) || config.signal?.aborted) return false;
  if (config.method !== 'get' && config.retry !== true) return false;
  const status = error.response?.status;
  if (status !== undefined && !RETRY_STATUSES.includes(status)) return false;
  return (config.__attempt || 0) < RETRY_DELAYS_MS.length;
}

export function retryDelay(error, attempt) {
  const headers = error?.response?.headers || {};
  const raw = String(headers['retry-after'] ?? headers['Retry-After'] ?? '').trim();
  const seconds = Number(raw);
  if (raw !== '' && Number.isFinite(seconds) && seconds >= 0)
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const base = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
  return base + Math.random() * JITTER_MS;
}
