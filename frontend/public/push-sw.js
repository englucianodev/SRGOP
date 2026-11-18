/* Web Push handlers. Loaded by the Workbox-generated service worker (workbox.importScripts). */
const ICON = '/icon-192.png';
const URGENT_VIBRATION = [500, 200, 500, 200, 500, 200, 800];
const DEFAULT_VIBRATION = [200, 100, 200];

// Only same-origin relative paths are ever opened; anything else falls back to the home page.
function safePath(value) {
  if (typeof value !== 'string' || !/^\/(?![/\\])/.test(value)) return '/';
  try {
    const target = new URL(value, self.location.origin);
    return target.origin === self.location.origin ? target.pathname + target.search : '/';
  } catch {
    return '/';
  }
}
function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  const urgent = data.kind === 'urgencia';
  event.waitUntil(
    self.registration.showNotification(String(data.title || 'SRGOP'), {
      body: String(data.body || 'Nova notificação operacional.'),
      icon: ICON,
      badge: ICON,
      lang: 'pt-BR',
      tag: String(data.tag || 'srgop'),
      // A new alert that replaces an older one with the same tag must sound again.
      renotify: true,
      requireInteraction: urgent,
      vibrate: urgent ? URGENT_VIBRATION : DEFAULT_VIBRATION,
      data: { url: safePath(data.url) },
    }),
  );
});

async function openApp(path) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (!open) return self.clients.openWindow(path);
  const current = new URL(open.url);
  try {
    await open.focus();
    if (current.pathname + current.search !== path) await open.navigate(path);
    return open;
  } catch {
    // focus/navigate are refused for windows this worker does not control.
    return self.clients.openWindow(path);
  }
}
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openApp(safePath(event.notification.data && event.notification.data.url)));
});
