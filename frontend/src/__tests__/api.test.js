import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, downloadFile } from '../services/api';

const rejectWith = (error) => api.interceptors.response.handlers[0].rejected(error);

afterEach(() => vi.restoreAllMocks());

describe('api client', () => {
  it('sends credentials and has a timeout', () => {
    expect(api.defaults.withCredentials).toBe(true);
    expect(api.defaults.timeout).toBe(20000);
  });

  it('broadcasts server errors as srgop:error events', async () => {
    const listener = vi.fn();
    window.addEventListener('srgop:error', listener);
    const error = {
      config: { url: '/occurrences' },
      response: { status: 422, data: { message: 'Dados inválidos', origin: 'Ocorrências' } },
    };
    await expect(rejectWith(error)).rejects.toBe(error);
    window.removeEventListener('srgop:error', listener);
    expect(listener.mock.calls[0][0].detail).toEqual({
      message: 'Dados inválidos',
      origin: 'Ocorrências',
      status: 422,
    });
  });

  it('uses a connection message when there is no response and stays silent for quiet requests', async () => {
    const listener = vi.fn();
    window.addEventListener('srgop:error', listener);
    await expect(rejectWith({ config: { url: '/crews' } })).rejects.toBeDefined();
    await expect(rejectWith({ config: { quiet: true } })).rejects.toBeDefined();
    window.removeEventListener('srgop:error', listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toMatchObject({
      message: expect.stringMatching(/não foi possível conectar/i),
      origin: 'Conexão / /crews',
    });
  });

  it('downloads a blob through a temporary link', async () => {
    vi.useFakeTimers();
    const blob = new Blob(['pdf']);
    vi.spyOn(api, 'get').mockResolvedValue({ data: blob });
    URL.createObjectURL = vi.fn(() => 'blob:url');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadFile('/reports/1.pdf', 'relatorio.pdf');

    expect(api.get).toHaveBeenCalledWith('/reports/1.pdf', { responseType: 'blob' });
    expect(click).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url');
    vi.useRealTimers();
  });
});
