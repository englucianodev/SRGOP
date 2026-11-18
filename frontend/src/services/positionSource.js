import { Capacitor, registerPlugin } from '@capacitor/core';

// Rules shared by every source: how often a fix is sent and how old it may be.
export const SEND_INTERVAL_MS = 10000;
export const MAX_FIX_AGE_MS = 30000;

const POLL_INTERVAL_MS = 15000;
const BROWSER_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 5000,
});
// GeolocationPositionError.PERMISSION_DENIED
const BROWSER_PERMISSION_DENIED = 1;

const NATIVE_PLUGIN = 'BackgroundGeolocation';
const NOTIFICATION_PLUGIN = 'NotificationPermission';
const NATIVE_NOT_AUTHORIZED = 'NOT_AUTHORIZED';
// Defining backgroundMessage is what makes the plugin keep a foreground
// service (with this persistent notification) while the screen is locked.
export const NATIVE_WATCHER_OPTIONS = Object.freeze({
  backgroundTitle: 'SRGOP — localização da guarnição',
  backgroundMessage: 'Enviando a posição da viatura durante o serviço.',
  requestPermissions: true,
  stale: false,
  distanceFilter: 0,
});

// Both plugins ship no JavaScript: these are lazy proxies to the native code,
// so the web bundle never depends on them.
const nativeGeolocation = registerPlugin(NATIVE_PLUGIN);
const nativeNotifications = registerPlugin(NOTIFICATION_PLUGIN);

export const toFix = ({ latitude, longitude, accuracy }, timestamp) => ({
  latitude,
  longitude,
  accuracy,
  timestamp,
});

// A fix is sent when nothing is in flight, it is recent and the interval passed.
export const shouldSend = ({ fix, lastSentAt, busy, now }) =>
  Boolean(fix) &&
  !busy &&
  now - fix.timestamp <= MAX_FIX_AGE_MS &&
  now - lastSentAt >= SEND_INTERVAL_MS;

// The native source needs the APK to contain the plugin; anything else
// (browser, PWA, an older APK) keeps using the browser geolocation API.
export const pickSourceKind = (capacitor = Capacitor) =>
  capacitor.isNativePlatform() && capacitor.isPluginAvailable(NATIVE_PLUGIN) ? 'native' : 'browser';

export function createBrowserSource(env = globalThis) {
  return {
    kind: 'browser',
    isSupported: () => Boolean(env.isSecureContext && env.navigator?.geolocation),
    start({ onFix, onError }) {
      const { geolocation } = env.navigator;
      const success = (position) => onFix(toFix(position.coords, position.timestamp));
      const failure = (error) =>
        onError(
          error.code === BROWSER_PERMISSION_DENIED
            ? { reason: 'denied', fatal: true }
            : { reason: 'unavailable', fatal: false },
        );
      const watch = geolocation.watchPosition(success, failure, BROWSER_OPTIONS);
      const timer = setInterval(
        () => geolocation.getCurrentPosition(success, failure, BROWSER_OPTIONS),
        POLL_INTERVAL_MS,
      );
      return async () => {
        clearInterval(timer);
        geolocation.clearWatch(watch);
      };
    },
  };
}

// Android 13+ only shows the persistent notification with this permission.
// Tracking works without it, so a refusal is reported but is not fatal.
async function notificationsAllowed(notifications) {
  try {
    const state = await notifications.requestPermissions();
    return state?.notifications === 'granted';
  } catch {
    return false;
  }
}

export function createNativeSource({
  plugin = nativeGeolocation,
  notifications = nativeNotifications,
} = {}) {
  return {
    kind: 'native',
    isSupported: () => true,
    start({ onFix, onError }) {
      let stopped = false;
      // Every error of the plugin means the watcher is not delivering, and it
      // may still hold the foreground service: all of them stop the tracking.
      const handle = (location, error) => {
        if (stopped) return;
        if (error) {
          onError({
            reason: error.code === NATIVE_NOT_AUTHORIZED ? 'denied' : 'failed',
            fatal: true,
          });
          return;
        }
        if (location) onFix(toFix(location, location.time ?? Date.now()));
      };
      const begin = async () => {
        const allowed = await notificationsAllowed(notifications);
        if (stopped) return null;
        if (!allowed) onError({ reason: 'notifications-blocked', fatal: false });
        return plugin.addWatcher(NATIVE_WATCHER_OPTIONS, handle);
      };
      const watcherId = begin().catch(() => {
        if (!stopped) onError({ reason: 'failed', fatal: true });
        return null;
      });
      // Removing the last background watcher is what removes the foreground
      // service and its notification. The id only exists after addWatcher
      // resolves, so stopping always waits for it.
      return async () => {
        stopped = true;
        const id = await watcherId;
        if (id) await plugin.removeWatcher({ id });
      };
    },
  };
}

export const createPositionSource = (kind = pickSourceKind()) =>
  kind === 'native' ? createNativeSource() : createBrowserSource();
