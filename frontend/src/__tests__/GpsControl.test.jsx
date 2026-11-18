import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  appNow: Date.now(),
  patch: vi.fn(),
  stop: vi.fn(),
  start: vi.fn(),
  source: { kind: 'browser', supported: true },
  crews: [],
}));

vi.mock('../services/api', () => ({ api: { patch: mocks.patch } }));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({ user: { _id: 'u1' }, now: mocks.appNow }),
}));
vi.mock('../hooks/useData', () => ({ useData: () => ({ data: mocks.crews }) }));
vi.mock('../services/positionSource', async (original) => ({
  ...(await original()),
  createPositionSource: () => ({
    kind: mocks.source.kind,
    isSupported: () => mocks.source.supported,
    start: mocks.start,
  }),
}));

const { default: GpsControl } = await import('../components/GpsControl');

const NOW = mocks.appNow;
const crew = (overrides = {}) => ({
  _id: 'c1',
  name: 'Guarnição Alfa',
  status: 'Disponível',
  shift: 's1',
  shiftEnd: new Date(NOW + 3600000).toISOString(),
  members: [{ _id: 'u1' }],
  ...overrides,
});
const fix = () => ({ latitude: -2.5, longitude: -44.3, accuracy: 8, timestamp: Date.now() });
const handlers = () => mocks.start.mock.calls.at(-1)[0];
const turnOn = async () => {
  const view = render(<GpsControl />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Ligar GPS' }));
  return view;
};
const disabledCalls = () =>
  mocks.patch.mock.calls.filter(([, body]) => body.enabled === false).length;

beforeEach(() => {
  mocks.patch.mockReset().mockResolvedValue({});
  mocks.stop.mockReset().mockResolvedValue();
  mocks.start.mockReset().mockReturnValue(mocks.stop);
  mocks.source.kind = 'browser';
  mocks.source.supported = true;
  mocks.crews = [crew()];
});

describe('GpsControl', () => {
  it('renders nothing for someone who is not on duty', () => {
    mocks.crews = [crew({ status: 'Fora de serviço' })];
    const { container } = render(<GpsControl />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tells browser users that a locked screen needs the Android app', () => {
    render(<GpsControl />);
    expect(screen.getByText(/tela bloqueada o envio é interrompido/i)).toBeInTheDocument();
    expect(screen.getByText(/use o aplicativo Android/i)).toBeInTheDocument();
  });

  it('explains in the app that sending continues with the screen locked', () => {
    mocks.source.kind = 'native';
    render(<GpsControl />);
    expect(screen.getByText(/continua com a tela bloqueada/i)).toBeInTheDocument();
    expect(screen.queryByText(/use o aplicativo Android/i)).not.toBeInTheDocument();
  });

  it('does not start when the source is not supported', async () => {
    mocks.source.supported = false;
    await turnOn();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/exige HTTPS/i);
  });

  it('sends the position of the crew on duty', async () => {
    await turnOn();
    act(() => handlers().onFix(fix()));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        '/crews/c1/gps',
        { enabled: true, latitude: -2.5, longitude: -44.3, accuracy: 8 },
        { quiet: true, retry: true },
      ),
    );
    expect(await screen.findByText(/GPS compartilhado às/)).toBeInTheDocument();
  });

  it('stops the source and reports it when the user turns the GPS off', async () => {
    await turnOn();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Desligar GPS' }));
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(disabledCalls()).toBe(1));
    expect(screen.getByRole('status')).toHaveTextContent('Compartilhamento encerrado.');
  });

  it.each([401, 403, 409])('stops the source when the API answers %i', async (status) => {
    mocks.patch.mockRejectedValueOnce({ response: { status, data: { message: 'Recusado' } } });
    await turnOn();
    act(() => handlers().onFix(fix()));
    await waitFor(() => expect(mocks.stop).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Ligar GPS' })).toBeInTheDocument();
  });

  it('keeps going after a temporary network failure', async () => {
    mocks.patch.mockRejectedValueOnce(new Error('offline'));
    await turnOn();
    act(() => handlers().onFix(fix()));
    expect(await screen.findByText(/Tentando reconectar/)).toBeInTheDocument();
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it('stops the source on a fatal source error but not on a warning', async () => {
    mocks.source.kind = 'native';
    await turnOn();
    act(() => handlers().onError({ reason: 'notifications-blocked', fatal: false }));
    expect(screen.getByRole('status')).toHaveTextContent(/Notificações bloqueadas/);
    expect(mocks.stop).not.toHaveBeenCalled();

    act(() => handlers().onError({ reason: 'denied', fatal: true }));
    await waitFor(() => expect(mocks.stop).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toHaveTextContent(/Localização negada/);
  });

  it('stops the source when the shift ends or the crew changes', async () => {
    const view = await turnOn();
    mocks.crews = [crew({ shift: 's2' })];
    view.rerender(<GpsControl />);
    expect(await screen.findByRole('button', { name: 'Ligar GPS' })).toBeInTheDocument();
    // The effect restarts once before the reset lands: every start is stopped.
    const started = mocks.start.mock.calls.length;
    expect(mocks.stop).toHaveBeenCalledTimes(started);

    mocks.crews = [];
    view.rerender(<GpsControl />);
    expect(view.container).toBeEmptyDOMElement();
    expect(mocks.start).toHaveBeenCalledTimes(started);
  });

  it('stops the source when the user leaves the crew while sharing', async () => {
    const view = await turnOn();
    mocks.crews = [];
    view.rerender(<GpsControl />);
    expect(view.container).toBeEmptyDOMElement();
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });

  it('stops without sending when a fix arrives after the shift ended', async () => {
    await turnOn();
    // The interface clock (app.now) is frozen, as with a throttled WebView,
    // while the real clock is already past the end of the shift.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW + 2 * 3600000);
    act(() => handlers().onFix(fix()));
    clock.mockRestore();
    await waitFor(() => expect(mocks.stop).toHaveBeenCalledTimes(1));
    expect(mocks.patch.mock.calls.some(([, body]) => body.enabled === true)).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('Serviço encerrado.');
  });

  it('stops the source on logout, when the control is unmounted', async () => {
    const view = await turnOn();
    view.unmount();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(disabledCalls()).toBe(1));
  });

  it('warns when the native source could not be stopped', async () => {
    mocks.source.kind = 'native';
    mocks.stop.mockRejectedValue(new Error('remove failed'));
    await turnOn();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Desligar GPS' }));
    expect(await screen.findByText(/Não foi possível encerrar o GPS/)).toBeInTheDocument();
  });
});
