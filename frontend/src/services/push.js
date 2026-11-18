import { Capacitor } from '@capacitor/core';
import { api } from './api';

// The service worker is registered only in production builds; without it there is no push.
export const READY_TIMEOUT_MS = 4000;

export function keyToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
const bytesToKey = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

// 'supported' | 'ios-install' | 'unsupported'. The Android APK (Capacitor WebView) has no Web Push.
export function pushSupport(scope = globalThis) {
  if (Capacitor.isNativePlatform()) return 'unsupported';
  const device = scope.navigator;
  if (device && 'serviceWorker' in device && 'PushManager' in scope && 'Notification' in scope)
    return 'supported';
  const ios =
    /iPhone|iPad|iPod/i.test(device?.userAgent || '') ||
    (device?.platform === 'MacIntel' && device?.maxTouchPoints > 1);
  const installed =
    device?.standalone === true ||
    Boolean(scope.matchMedia?.('(display-mode: standalone)').matches);
  // Safari only exposes PushManager to a web app opened from the home screen.
  return ios && !installed ? 'ios-install' : 'unsupported';
}

function readyWorker() {
  const timeout = new Promise((resolve) => setTimeout(resolve, READY_TIMEOUT_MS, null));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}
function madeWithKey(subscription, publicKey) {
  const current = subscription.options?.applicationServerKey;
  return !current || bytesToKey(current) === publicKey;
}
// A subscription made with another server key (rotated keys) can never be delivered to.
async function subscriptionFor(worker, publicKey) {
  const existing = await worker.pushManager.getSubscription();
  if (existing && madeWithKey(existing, publicKey)) return existing;
  if (existing) await existing.unsubscribe();
  return worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyToBytes(publicKey),
  });
}
function save(subscription) {
  const { endpoint, keys } = subscription.toJSON();
  return api.post(
    '/push/subscriptions',
    { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    { quiet: true },
  );
}

// After login: binds a subscription this device already has to the new session. Never prompts.
export async function syncPush(publicKey) {
  if (Notification.permission === 'denied') return 'denied';
  const worker = await readyWorker();
  if (!worker) return 'unavailable';
  const existing = await worker.pushManager.getSubscription();
  if (!existing || Notification.permission !== 'granted') return 'off';
  await save(await subscriptionFor(worker, publicKey));
  return 'on';
}
// Must be called straight from a click: browsers only show the permission prompt on a gesture.
export async function enablePush(publicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const worker = await readyWorker();
  if (!worker) return 'unavailable';
  await save(await subscriptionFor(worker, publicKey));
  return 'on';
}
export async function disablePush() {
  const worker = await readyWorker();
  const existing = await worker?.pushManager.getSubscription();
  if (!existing) return 'off';
  await existing.unsubscribe();
  // If this request is lost the push service answers 410 and the server drops the row itself.
  await api
    .delete('/push/subscriptions', { data: { endpoint: existing.endpoint }, quiet: true })
    .catch(() => {});
  return 'off';
}
