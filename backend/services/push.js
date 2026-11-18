import { createECDH } from 'node:crypto';
import webpush from 'web-push';
import { PushSubscription, Session } from '../models/index.js';
import { isAllowedPushEndpoint } from '../utils/pushEndpoint.js';

// Only alerts that need the officer immediately leave the app; chat and system notes do not.
export const PUSH_KINDS = [
  'despacho',
  'apoio',
  'urgencia',
  'pendente',
  'turno-expirado',
  'passagem-cpu',
];
export const MAX_PUSH_FAILURES = 5;
export const MAX_SUBSCRIPTIONS_PER_USER = 10;
// A dispatch delivered much later than this is stale; the app shows the current state on open.
const PUSH_TTL_SECONDS = 15 * 60;
const PUSH_TIMEOUT_MS = 10000;
const TITLE_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 300;
const GONE_STATUSES = [404, 410];
const RATE_LIMITED_STATUS = 429;
const ENV_NAMES = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
const DISABLED = Object.freeze({ enabled: false, publicKey: null, vapidDetails: null });
const PUSH_URLS = {
  despacho: () => '/atendimento',
  apoio: () => '/atendimento',
  pendente: () => '/despachos',
  'turno-expirado': () => '/atendimento',
  'passagem-cpu': () => '/dashboard',
  urgencia: (row) => (row.emergency ? `/mapa?emergency=${row.emergency}` : '/mapa'),
};

const defaultTransport = (target, payload, options) =>
  webpush.sendNotification(target, payload, options);
let transport = defaultTransport;
// Tests replace the transport so no request ever leaves the process.
export function setPushTransport(fn) {
  transport = fn || defaultTransport;
}

function isKeyPair(publicKey, privateKey) {
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
  return ecdh.getPublicKey().equals(Buffer.from(publicKey, 'base64url'));
}
function readConfig(publicKey, privateKey, subject) {
  if (!publicKey || !privateKey || !subject) return DISABLED;
  try {
    // Signing a throwaway header makes web-push validate the three values.
    webpush.getVapidHeaders(
      'https://fcm.googleapis.com',
      subject,
      publicKey,
      privateKey,
      'aes128gcm',
    );
    if (!isKeyPair(publicKey, privateKey)) throw new Error('chaves não formam um par');
    return { enabled: true, publicKey, vapidDetails: { subject, publicKey, privateKey } };
  } catch {
    // A broken configuration turns the feature off instead of failing every delivery.
    console.error('Push: variáveis VAPID inválidas; notificações push desativadas.');
    return DISABLED;
  }
}
let cached = { signature: '', config: DISABLED };
function resolveConfig() {
  const values = ENV_NAMES.map((name) => (process.env[name] || '').trim());
  const signature = values.join('\n');
  if (signature !== cached.signature) cached = { signature, config: readConfig(...values) };
  return cached.config;
}
export function pushConfig() {
  const { enabled, publicKey } = resolveConfig();
  return { enabled, publicKey };
}

export async function saveSubscription(user, session, input) {
  // The endpoint identifies the device, so it follows whoever is logged in on it now.
  await PushSubscription.findOneAndUpdate(
    { endpoint: input.endpoint },
    {
      $set: {
        user: user._id,
        session: session._id,
        transport: 'webpush',
        keys: { p256dh: input.keys.p256dh, auth: input.keys.auth },
        failures: 0,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  // Bounds the outbound requests a single account can make the server send per notification.
  const excess = await PushSubscription.find({ user: user._id })
    .sort({ updatedAt: -1, _id: -1 })
    .skip(MAX_SUBSCRIPTIONS_PER_USER)
    .select('_id')
    .lean();
  if (excess.length)
    await PushSubscription.deleteMany({ _id: { $in: excess.map((row) => row._id) } });
}
export async function removeSubscription(user, endpoint) {
  const result = await PushSubscription.deleteOne({ endpoint, user: user._id });
  return result.deletedCount;
}

const clip = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
// Carries nothing beyond what the stored notification already shows its recipient.
function payloadFor(row) {
  return JSON.stringify({
    title: clip(row.title, TITLE_MAX_LENGTH),
    body: clip(row.message, BODY_MAX_LENGTH),
    tag: `${row.kind}:${row.occurrence || row.emergency || row._id}`,
    kind: row.kind,
    url: PUSH_URLS[row.kind](row),
  });
}

// Drops subscriptions whose login ended, so logout and expiry stop pushes without auth changes.
async function liveSubscriptions(subscriptions) {
  const sessions = await Session.find({
    _id: { $in: subscriptions.map((s) => s.session) },
    expiresAt: { $gt: new Date() },
  })
    .select('user')
    .lean();
  const owners = new Map(sessions.map((s) => [String(s._id), String(s.user)]));
  const usable = (s) =>
    owners.get(String(s.session)) === String(s.user) && isAllowedPushEndpoint(s.endpoint);
  const stale = subscriptions.filter((s) => !usable(s));
  if (stale.length) await PushSubscription.deleteMany({ _id: { $in: stale.map((s) => s._id) } });
  return subscriptions.filter(usable);
}

async function recordFailure(subscription, error) {
  const status = Number(error?.statusCode) || 0;
  if (GONE_STATUSES.includes(status)) return PushSubscription.deleteOne({ _id: subscription._id });
  // The endpoint is a capability URL and is never written to the log.
  console.error('Push:', status ? `serviço de push respondeu ${status}` : error?.message);
  // Network errors, rate limits and 5xx are temporary; only a refusal counts against the device.
  const refused = status >= 400 && status < 500 && status !== RATE_LIMITED_STATUS;
  if (!refused) return null;
  const updated = await PushSubscription.findOneAndUpdate(
    { _id: subscription._id },
    { $inc: { failures: 1 } },
    { new: true },
  );
  if (updated?.failures >= MAX_PUSH_FAILURES)
    await PushSubscription.deleteOne({ _id: subscription._id });
  return null;
}
async function deliver(subscription, row, vapidDetails) {
  try {
    await transport(
      { endpoint: subscription.endpoint, keys: { ...subscription.keys } },
      payloadFor(row),
      { vapidDetails, TTL: PUSH_TTL_SECONDS, urgency: 'high', timeout: PUSH_TIMEOUT_MS },
    );
    if (subscription.failures)
      await PushSubscription.updateOne({ _id: subscription._id }, { failures: 0 });
  } catch (error) {
    await recordFailure(subscription, error);
  }
}

// Called without await from deliverNotifications: it must never reject into the request path.
export async function sendPush(rows) {
  try {
    const { enabled, vapidDetails } = resolveConfig();
    if (!enabled) return;
    const wanted = (Array.isArray(rows) ? rows : []).filter(
      (row) => row?.user && PUSH_KINDS.includes(row.kind),
    );
    if (!wanted.length) return;
    const found = await PushSubscription.find({
      user: { $in: wanted.map((row) => row.user) },
      transport: 'webpush',
    }).lean();
    if (!found.length) return;
    const live = await liveSubscriptions(found);
    await Promise.all(
      wanted.flatMap((row) =>
        live
          .filter((s) => String(s.user) === String(row.user))
          .map((s) => deliver(s, row, vapidDetails)),
      ),
    );
  } catch (error) {
    console.error('Push:', error.message);
  }
}
