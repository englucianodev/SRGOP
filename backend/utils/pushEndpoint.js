// The server sends an HTTPS POST to every stored push endpoint, so an endpoint is only accepted
// when it points at a real browser push service. Anything else would be a server-side request
// forgery vector (internal addresses, arbitrary hosts).
export const PUSH_ENDPOINT_MAX_LENGTH = 2048;
// p256dh is an uncompressed P-256 point (65 bytes) and auth is 16 bytes, both unpadded base64url.
export const PUSH_P256DH_PATTERN = /^[A-Za-z0-9_-]{87}$/;
export const PUSH_AUTH_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const EXACT_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]);
const HOST_SUFFIXES = ['.notify.windows.com', '.push.apple.com'];
// No credentials, port, backslash, fragment or whitespace: every URL parser reads the same host.
const ENDPOINT_PATTERN = /^https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/[A-Za-z0-9\-._~:/?=&%+]*$/;
const allowedHost = (host) =>
  EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
export function isAllowedPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > PUSH_ENDPOINT_MAX_LENGTH) return false;
  const host = ENDPOINT_PATTERN.exec(value)?.[1];
  if (!host || !allowedHost(host)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host && !url.port && !url.username;
  } catch {
    return false;
  }
}
