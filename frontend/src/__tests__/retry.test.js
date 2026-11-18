import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services/api';
import { MAX_RETRY_AFTER_MS, retryDelay, shouldRetry } from '../services/retry';

afterEach(() => vi.useRealTimers());

describe('retry policy', () => {
  it('reenvia GET sem resposta e 503, nunca POST', () => {
    expect(shouldRetry({ config: { method: 'get', __attempt: 0 } })).toBe(true);
    expect(shouldRetry({ config: { method: 'get' } })).toBe(true);
    expect(shouldRetry({ config: { method: 'get', __attempt: 0 }, response: { status: 503 } })).toBe(true);
    expect(shouldRetry({ config: { method: 'post', __attempt: 0 } })).toBe(false);
    expect(shouldRetry({ config: { method: 'patch', retry: true, __attempt: 0 } })).toBe(true);
    expect(shouldRetry({ config: { method: 'get', __attempt: 0 }, response: { status: 422 } })).toBe(false);
    expect(shouldRetry({ config: { method: 'get', __attempt: 3 } })).toBe(false);
  });

  it('nunca reenvia requisição cancelada nem com retry: false', () => {
    const controller = new AbortController();
    controller.abort();
    const canceled = new axios.CanceledError('canceled', { method: 'get' });
    expect(shouldRetry({ ...canceled, __CANCEL__: true, config: { method: 'get' } })).toBe(false);
    expect(shouldRetry({ config: { method: 'get', signal: controller.signal } })).toBe(false);
    expect(shouldRetry({ config: { method: 'get', retry: false } })).toBe(false);
  });

  it('ignora Retry-After vazio e usa o atraso escalonado', () => {
    expect(retryDelay({ response: { headers: { 'retry-after': '' } } }, 0)).toBeGreaterThanOrEqual(1000);
  });

  it('respeita Retry-After com teto de 10 s', () => {
    const e = { response: { status: 429, headers: { 'retry-after': '60' } } };
    expect(retryDelay(e, 0)).toBe(MAX_RETRY_AFTER_MS);
    expect(retryDelay({ response: { headers: { 'retry-after': '3' } } }, 0)).toBe(3000);
  });

  it('usa o atraso escalonado com jitter sem Retry-After', () => {
    const d = retryDelay({}, 1);
    expect(d).toBeGreaterThanOrEqual(2000);
    expect(d).toBeLessThan(2250);
  });

  it('emite srgop:error uma vez só depois de esgotar os reenvios', async () => {
    vi.useFakeTimers();
    const adapter = vi.fn((config) => Promise.reject({ config, message: 'Network Error' }));
    const listener = vi.fn();
    window.addEventListener('srgop:error', listener);
    const result = api.get('/crews', { adapter }).catch((e) => e);
    await vi.runAllTimersAsync();
    await result;
    window.removeEventListener('srgop:error', listener);
    expect(adapter).toHaveBeenCalledTimes(4);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
