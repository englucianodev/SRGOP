import { describe, expect, it, vi } from 'vitest';
import { isServerWaking, whenServerReady } from '../services/startup';

const httpError = (status) => Object.assign(new Error('falha'), { response: { status } });
const networkError = () => new Error('Network Error');
const noSleep = () => Promise.resolve();

describe('isServerWaking', () => {
  it('trata falha de rede, tempo esgotado e 502/503/504 como servidor iniciando', () => {
    expect(isServerWaking(networkError())).toBe(true);
    expect([502, 503, 504].every((status) => isServerWaking(httpError(status)))).toBe(true);
  });
  it('não confunde respostas reais do servidor com inicialização', () => {
    expect([400, 401, 403, 422, 429, 500].some((status) => isServerWaking(httpError(status)))).toBe(
      false,
    );
  });
});

describe('whenServerReady', () => {
  it('repete até o servidor responder e avisa a cada tentativa', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValue('pronto');
    const onWaiting = vi.fn();
    await expect(whenServerReady(request, { onWaiting, sleep: noSleep })).resolves.toBe('pronto');
    expect(request).toHaveBeenCalledTimes(3);
    expect(onWaiting.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2]);
  });
  it('devolve na hora um erro que não é de inicialização, como 401', async () => {
    const request = vi.fn().mockRejectedValue(httpError(401));
    await expect(whenServerReady(request, { sleep: noSleep })).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('desiste depois do número máximo de tentativas, quando informado', async () => {
    const request = vi.fn().mockRejectedValue(networkError());
    await expect(whenServerReady(request, { maxAttempts: 3, sleep: noSleep })).rejects.toThrow(
      'Network Error',
    );
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('para de repetir quando é cancelado', async () => {
    const control = new AbortController();
    const request = vi.fn().mockImplementation(() => {
      control.abort();
      return Promise.reject(networkError());
    });
    await expect(
      whenServerReady(request, { signal: control.signal, sleep: noSleep }),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('espera cada vez mais entre as tentativas, com teto', async () => {
    const sleep = vi.fn(noSleep);
    const request = vi.fn().mockRejectedValue(networkError());
    await whenServerReady(request, { maxAttempts: 8, sleep }).catch(() => {});
    const waits = sleep.mock.calls.map(([ms]) => ms);
    expect(waits[0]).toBeLessThan(waits[2]);
    expect(Math.max(...waits)).toBeLessThanOrEqual(6000);
  });
});
