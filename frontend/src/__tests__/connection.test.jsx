import axios from 'axios';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, probeApi } from '../services/api';
import {
  RECONNECT_SHOW_DELAY_MS,
  connection,
  createConnectionMonitor,
  isNetworkFailure,
} from '../services/connection';
import ConnectionStatus from '../components/ConnectionStatus';

function makeClock() {
  let time = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, at: time + ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      const target = time + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        time = due[1].at;
        due[1].fn();
      }
      time = target;
    },
  };
}
const seen = (m) => {
  const states = ['online'];
  m.subscribe((s) => states.push(s));
  return states;
};

describe('connection monitor', () => {
  it('não mostra nada em oscilação menor que 3 s', () => {
    const clock = makeClock();
    const m = createConnectionMonitor(clock);
    const states = seen(m);
    m.setSocketOnline(false);
    clock.advance(2000);
    m.setSocketOnline(true);
    clock.advance(5000);
    expect(states).toEqual(['online']);
  });

  it('mostra reconectando após 3 s e restabelecida ao voltar', () => {
    const clock = makeClock();
    const m = createConnectionMonitor(clock);
    const states = seen(m);
    m.setSocketOnline(false);
    clock.advance(3000);
    m.setSocketOnline(true);
    clock.advance(2500);
    expect(states).toEqual(['online', 'reconectando', 'restabelecida', 'online']);
  });

  it('falha de rede sem sucesso depois conta como offline', () => {
    const clock = makeClock();
    const m = createConnectionMonitor(clock);
    m.requestFailed();
    clock.advance(3000);
    expect(m.state()).toBe('reconectando');
    m.requestSucceeded();
    expect(m.state()).toBe('restabelecida');
  });

  it('anuncia um único erro de rede por queda e nenhum durante reconectando', () => {
    const clock = makeClock();
    const m = createConnectionMonitor(clock);
    m.requestFailed();
    expect(m.announceNetworkError()).toBe(true);
    m.requestFailed();
    expect(m.announceNetworkError()).toBe(false);
    m.requestSucceeded();
    m.requestFailed();
    expect(m.announceNetworkError()).toBe(true);
    clock.advance(3000);
    expect(m.announceNetworkError()).toBe(false);
  });

  it('com o socket no ar, uma falha isolada é testada em silêncio e o aviso some', () => {
    const clock = makeClock();
    let m;
    const probe = vi.fn(() => m.requestSucceeded());
    m = createConnectionMonitor({ ...clock, probe });
    const states = seen(m);
    m.setSocketOnline(true);
    m.requestFailed();
    clock.advance(RECONNECT_SHOW_DELAY_MS);
    expect(m.state()).toBe('reconectando');
    expect(probe).not.toHaveBeenCalled();
    clock.advance(RECONNECT_SHOW_DELAY_MS);
    expect(probe).toHaveBeenCalledTimes(1);
    clock.advance(5000);
    expect(states).toEqual(['online', 'reconectando', 'restabelecida', 'online']);
  });

  it('teste silencioso repete enquanto falha e não roda com o socket fora', () => {
    const clock = makeClock();
    const probe = vi.fn();
    const m = createConnectionMonitor({ ...clock, probe });
    m.setSocketOnline(false);
    m.requestFailed();
    clock.advance(10 * RECONNECT_SHOW_DELAY_MS);
    expect(m.state()).toBe('reconectando');
    expect(probe).not.toHaveBeenCalled();
    m.setSocketOnline(true);
    clock.advance(3 * RECONNECT_SHOW_DELAY_MS);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(m.state()).toBe('reconectando');
  });

  it('502, 503 e 504 contam como falha de rede; outros status não', () => {
    expect(isNetworkFailure(undefined)).toBe(true);
    for (const status of [502, 503, 504]) expect(isNetworkFailure(status)).toBe(true);
    for (const status of [400, 401, 409, 422, 429, 500])
      expect(isNetworkFailure(status)).toBe(false);
  });

  it('ConnectionStatus mostra "Reconectando…" com status acessível', () => {
    const clock = makeClock();
    const m = createConnectionMonitor(clock);
    const { container } = render(<ConnectionStatus monitor={m} />);
    expect(container).toBeEmptyDOMElement();
    act(() => {
      m.setSocketOnline(false);
      clock.advance(3000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Reconectando');
    act(() => m.setSocketOnline(true));
    expect(screen.getByRole('status')).toHaveTextContent('Conexão restabelecida');
  });
});

describe('api and the connection monitor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    connection.requestSucceeded();
  });

  it('requisição cancelada não emite srgop:error nem conta como falha de rede', async () => {
    const failed = vi.spyOn(connection, 'requestFailed');
    const listener = vi.fn();
    window.addEventListener('srgop:error', listener);
    const canceled = new axios.CanceledError('canceled', { method: 'get' });
    await expect(api.interceptors.response.handlers[0].rejected(canceled)).rejects.toBe(canceled);
    window.removeEventListener('srgop:error', listener);
    expect(listener).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it('cancelada durante a espera do reenvio rejeita sem avisar', async () => {
    vi.useFakeTimers();
    const failed = vi.spyOn(connection, 'requestFailed');
    const controller = new AbortController();
    const adapter = vi.fn((config) => Promise.reject({ config, message: 'Network Error' }));
    const listener = vi.fn();
    window.addEventListener('srgop:error', listener);
    const result = api.get('/crews', { adapter, signal: controller.signal }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.runAllTimersAsync();
    const error = await result;
    window.removeEventListener('srgop:error', listener);
    expect(axios.isCancel(error)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it('503 final da hospedagem informa o monitor; 500 não', async () => {
    vi.useFakeTimers();
    const failed = vi.spyOn(connection, 'requestFailed');
    const respond = (status) =>
      vi.fn((config) =>
        Promise.reject({ config, response: { status, data: {}, headers: {} }, message: 'HTTP' }),
      );
    const unavailable = api.get('/crews', { adapter: respond(503), quiet: true }).catch((e) => e);
    await vi.runAllTimersAsync();
    await unavailable;
    expect(failed).toHaveBeenCalledTimes(1);
    const broken = api.get('/crews', { adapter: respond(500), quiet: true }).catch((e) => e);
    await vi.runAllTimersAsync();
    await broken;
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('o teste silencioso do app usa /health/live, quieto e sem reenvio', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(new Error('offline'));
    await expect(probeApi()).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledWith('/health/live', { quiet: true, retry: false });
  });

  it('falha de rede final informa o monitor; resposta OK informa sucesso', async () => {
    vi.useFakeTimers();
    const failed = vi.spyOn(connection, 'requestFailed');
    const succeeded = vi.spyOn(connection, 'requestSucceeded');
    const bad = vi.fn((config) => Promise.reject({ config, message: 'Network Error' }));
    const result = api.get('/crews', { adapter: bad, quiet: true }).catch((e) => e);
    await vi.runAllTimersAsync();
    await result;
    expect(failed).toHaveBeenCalledTimes(1);
    const good = (config) => Promise.resolve({ data: [], status: 200, statusText: 'OK', headers: {}, config });
    await api.get('/crews', { adapter: good });
    expect(succeeded).toHaveBeenCalled();
  });
});
