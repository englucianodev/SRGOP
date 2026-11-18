import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { native } = vi.hoisted(() => ({ native: vi.fn(() => false) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: native } }));

const { api } = await import('../services/api');
const { keyToBytes, pushSupport, syncPush, enablePush, disablePush, READY_TIMEOUT_MS } =
  await import('../services/push');

// 65 bytes starting with 0x04, as a real uncompressed P-256 public key.
const keyBytes = Uint8Array.from({ length: 65 }, (_, i) => (i === 0 ? 4 : (i * 251) % 256));
const toKey = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const PUBLIC_KEY = toKey(keyBytes);
const OTHER_KEY = toKey(keyBytes.map((byte, i) => (i === 0 ? 4 : byte ^ 255)));

const browserSubscription = (key = PUBLIC_KEY, endpoint = 'https://fcm.googleapis.com/fcm/send/abc') => ({
  endpoint,
  options: { applicationServerKey: keyToBytes(key).buffer },
  toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
  unsubscribe: vi.fn().mockResolvedValue(true),
});
function browser({ permission = 'granted', existing = null, ready = true } = {}) {
  const created = browserSubscription(PUBLIC_KEY, 'https://fcm.googleapis.com/fcm/send/new');
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existing),
    subscribe: vi.fn().mockResolvedValue(created),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: ready ? Promise.resolve({ pushManager }) : new Promise(() => {}) },
  });
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn().mockResolvedValue(permission),
  });
  return { pushManager, created };
}

beforeEach(() => {
  native.mockReturnValue(false);
  vi.spyOn(api, 'post').mockResolvedValue({ data: { subscribed: true } });
  vi.spyOn(api, 'delete').mockResolvedValue({ data: { removed: 1 } });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete navigator.serviceWorker;
});

describe('keyToBytes', () => {
  it('decodes an unpadded base64url VAPID key', () => {
    expect(PUBLIC_KEY).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(Array.from(keyToBytes(PUBLIC_KEY))).toEqual(Array.from(keyBytes));
  });
});

describe('pushSupport', () => {
  const scope = (navigatorValue, extra = {}) => ({ navigator: navigatorValue, ...extra });
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)' };

  it('is supported when the browser has service workers, PushManager and Notification', () => {
    const value = scope({ serviceWorker: {} }, { PushManager: {}, Notification: {} });
    expect(pushSupport(value)).toBe('supported');
  });

  it('is never supported inside the native Capacitor app', () => {
    native.mockReturnValue(true);
    const value = scope({ serviceWorker: {} }, { PushManager: {}, Notification: {} });
    expect(pushSupport(value)).toBe('unsupported');
  });

  it('asks for installation on an iPhone browser tab, where PushManager does not exist', () => {
    expect(pushSupport(scope(iphone))).toBe('ios-install');
    const tab = scope(iphone, { matchMedia: () => ({ matches: false }) });
    expect(pushSupport(tab)).toBe('ios-install');
  });

  it('stays hidden on an installed iPhone app that is too old for Web Push', () => {
    expect(pushSupport(scope({ ...iphone, standalone: true }))).toBe('unsupported');
  });

  it('stays hidden on other browsers without push support', () => {
    expect(pushSupport(scope({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }))).toBe('unsupported');
  });
});

describe('syncPush', () => {
  it('reports the denied permission without touching the server', async () => {
    browser({ permission: 'denied', existing: browserSubscription() });
    expect(await syncPush(PUBLIC_KEY)).toBe('denied');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('posts an existing subscription again so it is bound to the new session', async () => {
    browser({ existing: browserSubscription() });
    expect(await syncPush(PUBLIC_KEY)).toBe('on');
    expect(api.post).toHaveBeenCalledWith(
      '/push/subscriptions',
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      },
      { quiet: true },
    );
  });

  it('never subscribes on its own when the device has no subscription', async () => {
    const { pushManager } = browser();
    expect(await syncPush(PUBLIC_KEY)).toBe('off');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not post while permission was not granted yet', async () => {
    browser({ permission: 'default', existing: browserSubscription() });
    expect(await syncPush(PUBLIC_KEY)).toBe('off');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('replaces a subscription made with a different server key', async () => {
    const stale = browserSubscription(OTHER_KEY);
    const { pushManager } = browser({ existing: stale });
    expect(await syncPush(PUBLIC_KEY)).toBe('on');
    expect(stale.unsubscribe).toHaveBeenCalled();
    const options = pushManager.subscribe.mock.calls[0][0];
    expect(options.userVisibleOnly).toBe(true);
    expect(Array.from(options.applicationServerKey)).toEqual(Array.from(keyBytes));
    expect(api.post.mock.calls[0][1].endpoint).toBe('https://fcm.googleapis.com/fcm/send/new');
  });

  it('is unavailable when no service worker becomes ready', async () => {
    vi.useFakeTimers();
    browser({ ready: false });
    const pending = syncPush(PUBLIC_KEY);
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS);
    expect(await pending).toBe('unavailable');
  });
});

describe('enablePush', () => {
  it('asks for permission and stops when it is denied or dismissed', async () => {
    const denied = browser({ permission: 'denied' });
    expect(await enablePush(PUBLIC_KEY)).toBe('denied');
    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(denied.pushManager.subscribe).not.toHaveBeenCalled();
    browser({ permission: 'default' });
    expect(await enablePush(PUBLIC_KEY)).toBe('off');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('subscribes with the server key and saves the subscription', async () => {
    const { pushManager } = browser();
    expect(await enablePush(PUBLIC_KEY)).toBe('on');
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][1]).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/new',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    });
  });

  it('propagates a server refusal so the control can explain it', async () => {
    browser();
    api.post.mockRejectedValue(new Error('recusado'));
    await expect(enablePush(PUBLIC_KEY)).rejects.toThrow('recusado');
  });
});

describe('disablePush', () => {
  it('unsubscribes the device and removes the subscription from the server', async () => {
    const existing = browserSubscription();
    browser({ existing });
    expect(await disablePush()).toBe('off');
    expect(existing.unsubscribe).toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalledWith('/push/subscriptions', {
      data: { endpoint: existing.endpoint },
      quiet: true,
    });
  });

  it('still turns the device off when the server cannot be reached', async () => {
    const existing = browserSubscription();
    browser({ existing });
    api.delete.mockRejectedValue(new Error('offline'));
    expect(await disablePush()).toBe('off');
    expect(existing.unsubscribe).toHaveBeenCalled();
  });
});
