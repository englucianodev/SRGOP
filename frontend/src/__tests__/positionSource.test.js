import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_FIX_AGE_MS,
  NATIVE_WATCHER_OPTIONS,
  SEND_INTERVAL_MS,
  createBrowserSource,
  createNativeSource,
  createPositionSource,
  pickSourceKind,
  shouldSend,
  toFix,
} from '../services/positionSource';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const fix = (ageMs = 0) => ({ latitude: -2.5, longitude: -44.3, accuracy: 8, timestamp: NOW - ageMs });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.useRealTimers());

describe('shouldSend', () => {
  const ready = { fix: fix(), lastSentAt: NOW - SEND_INTERVAL_MS, busy: false, now: NOW };

  it('sends a recent fix once the interval has passed', () => {
    expect(shouldSend(ready)).toBe(true);
    expect(shouldSend({ ...ready, lastSentAt: 0 })).toBe(true);
  });

  it('waits when there is no fix or a request is still in flight', () => {
    expect(shouldSend({ ...ready, fix: undefined })).toBe(false);
    expect(shouldSend({ ...ready, busy: true })).toBe(false);
  });

  it('throttles to one position per interval', () => {
    expect(shouldSend({ ...ready, lastSentAt: NOW - SEND_INTERVAL_MS + 1 })).toBe(false);
  });

  it('ignores a fix older than the staleness limit', () => {
    expect(shouldSend({ ...ready, fix: fix(MAX_FIX_AGE_MS) })).toBe(true);
    expect(shouldSend({ ...ready, fix: fix(MAX_FIX_AGE_MS + 1) })).toBe(false);
  });
});

describe('toFix', () => {
  it('keeps only the fields sent to the API plus the timestamp', () => {
    const coords = { latitude: 1, longitude: 2, accuracy: 3, speed: 9, altitude: 4 };
    expect(toFix(coords, NOW)).toEqual({ latitude: 1, longitude: 2, accuracy: 3, timestamp: NOW });
  });
});

describe('pickSourceKind', () => {
  const capacitor = (native, available) => ({
    isNativePlatform: () => native,
    isPluginAvailable: vi.fn(() => available),
  });

  it('uses the native plugin inside the Android app', () => {
    const cap = capacitor(true, true);
    expect(pickSourceKind(cap)).toBe('native');
    expect(cap.isPluginAvailable).toHaveBeenCalledWith('BackgroundGeolocation');
  });

  it('uses the browser API on the web and when the APK lacks the plugin', () => {
    expect(pickSourceKind(capacitor(false, false))).toBe('browser');
    expect(pickSourceKind(capacitor(false, true))).toBe('browser');
    expect(pickSourceKind(capacitor(true, false))).toBe('browser');
  });

  it('defaults to the browser source in a plain browser', () => {
    expect(pickSourceKind()).toBe('browser');
    expect(createPositionSource().kind).toBe('browser');
    expect(createPositionSource('native').kind).toBe('native');
  });
});

describe('browser source', () => {
  const browser = () => {
    const geolocation = {
      watchPosition: vi.fn(() => 7),
      getCurrentPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    return { geolocation, env: { isSecureContext: true, navigator: { geolocation } } };
  };

  it('requires a secure context with geolocation', () => {
    const { env } = browser();
    expect(createBrowserSource(env).isSupported()).toBe(true);
    expect(createBrowserSource({ ...env, isSecureContext: false }).isSupported()).toBe(false);
    expect(createBrowserSource({ isSecureContext: true, navigator: {} }).isSupported()).toBe(false);
  });

  it('watches, polls every 15 s and normalises fixes and errors', () => {
    vi.useFakeTimers();
    const { env, geolocation } = browser();
    const onFix = vi.fn();
    const onError = vi.fn();

    createBrowserSource(env).start({ onFix, onError });
    const [success, failure, options] = geolocation.watchPosition.mock.calls[0];
    success({ coords: { latitude: 1, longitude: 2, accuracy: 3 }, timestamp: NOW });
    failure({ code: 1 });
    failure({ code: 3 });
    vi.advanceTimersByTime(30000);

    expect(options).toEqual({ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
    expect(onFix).toHaveBeenCalledWith({ latitude: 1, longitude: 2, accuracy: 3, timestamp: NOW });
    expect(onError).toHaveBeenNthCalledWith(1, { reason: 'denied', fatal: true });
    expect(onError).toHaveBeenNthCalledWith(2, { reason: 'unavailable', fatal: false });
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('stops the watch and the polling', async () => {
    vi.useFakeTimers();
    const { env, geolocation } = browser();

    const stop = createBrowserSource(env).start({ onFix: vi.fn(), onError: vi.fn() });
    await stop();
    vi.advanceTimersByTime(60000);

    expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });
});

describe('native source', () => {
  const native = ({ permission = 'granted', watch = () => Promise.resolve('watcher-1') } = {}) => {
    const plugin = { addWatcher: vi.fn(watch), removeWatcher: vi.fn(() => Promise.resolve()) };
    const notifications = {
      requestPermissions: vi.fn(() => Promise.resolve({ notifications: permission })),
    };
    return { plugin, notifications, source: createNativeSource({ plugin, notifications }) };
  };
  const handlers = () => ({ onFix: vi.fn(), onError: vi.fn() });

  it('starts a background watcher with the Portuguese notification', async () => {
    const { plugin, notifications, source } = native();
    const on = handlers();

    source.start(on);
    await flush();

    expect(source.isSupported()).toBe(true);
    expect(notifications.requestPermissions).toHaveBeenCalledTimes(1);
    expect(plugin.addWatcher).toHaveBeenCalledWith(NATIVE_WATCHER_OPTIONS, expect.any(Function));
    expect(NATIVE_WATCHER_OPTIONS).toMatchObject({
      backgroundTitle: 'SRGOP — localização da guarnição',
      backgroundMessage: 'Enviando a posição da viatura durante o serviço.',
      stale: false,
    });
    expect(on.onError).not.toHaveBeenCalled();
  });

  it('normalises native locations using the time of the fix', async () => {
    const { plugin, source } = native();
    const on = handlers();

    source.start(on);
    await flush();
    plugin.addWatcher.mock.calls[0][1]({ latitude: 1, longitude: 2, accuracy: 3, time: NOW });

    expect(on.onFix).toHaveBeenCalledWith({ latitude: 1, longitude: 2, accuracy: 3, timestamp: NOW });
  });

  it('treats every plugin error as fatal and tells a refusal apart', async () => {
    const { plugin, source } = native();
    const on = handlers();

    source.start(on);
    await flush();
    const callback = plugin.addWatcher.mock.calls[0][1];
    callback(null, { code: 'NOT_AUTHORIZED' });
    callback(null, { message: 'Service not running.' });

    expect(on.onError).toHaveBeenNthCalledWith(1, { reason: 'denied', fatal: true });
    expect(on.onError).toHaveBeenNthCalledWith(2, { reason: 'failed', fatal: true });
  });

  it('keeps tracking but warns when notifications are refused', async () => {
    const { plugin, source } = native({ permission: 'denied' });
    const on = handlers();

    source.start(on);
    await flush();

    expect(on.onError).toHaveBeenCalledWith({ reason: 'notifications-blocked', fatal: false });
    expect(plugin.addWatcher).toHaveBeenCalledTimes(1);
  });

  it('reports a failure to start as fatal', async () => {
    const { source } = native({ watch: () => Promise.reject(new Error('not implemented')) });
    const on = handlers();

    const stop = source.start(on);
    await flush();

    expect(on.onError).toHaveBeenCalledWith({ reason: 'failed', fatal: true });
    await expect(stop()).resolves.toBeUndefined();
  });

  it('removes the watcher, and with it the foreground service, when stopped', async () => {
    const { plugin, source } = native();
    const on = handlers();

    const stop = source.start(on);
    await flush();
    await stop();
    plugin.addWatcher.mock.calls[0][1]({ latitude: 1, longitude: 2, accuracy: 3, time: NOW });

    expect(plugin.removeWatcher).toHaveBeenCalledWith({ id: 'watcher-1' });
    expect(on.onFix).not.toHaveBeenCalled();
  });

  it('removes a watcher whose id arrives after the stop', async () => {
    let resolveId;
    const pendingId = new Promise((resolve) => (resolveId = resolve));
    const { plugin, source } = native({ watch: () => pendingId });

    const stop = source.start(handlers());
    await flush();
    const stopping = stop();
    resolveId('late-watcher');
    await stopping;

    expect(plugin.removeWatcher).toHaveBeenCalledWith({ id: 'late-watcher' });
  });

  it('never adds a watcher when stopped during the permission prompt', async () => {
    const { plugin, source } = native();

    const stop = source.start(handlers());
    await stop();
    await flush();

    expect(plugin.addWatcher).not.toHaveBeenCalled();
    expect(plugin.removeWatcher).not.toHaveBeenCalled();
  });
});
