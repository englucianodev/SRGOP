// Photos of the panel while attendances are open, for the final report. A headless browser
// opens the panel itself (?foto=1 hides the buttons) and saves a JPEG in dados/capturas/painel/.
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const VIEWPORT = { width: 1600, height: 900 };
const MIN_GAP_MS = 5 * 60000; // a new attendance triggers a photo, but never more than every 5 min
const MAX_PHOTOS = 400;
const RENDER_WAIT_MS = 4000; // map tiles and markers

export const photoDir = (dataDir) => path.join(dataDir, 'capturas', 'painel');

/** The panel page in photo mode, in the theme currently shown on screen. */
export const photoUrl = (url, theme) => `${url}/?foto=1&tema=${theme === 'light' ? 'light' : 'dark'}`;

export function listPhotos(dataDir) {
  try {
    return readdirSync(photoDir(dataDir)).filter((name) => /^[\w-]+\.jpg$/.test(name)).sort();
  } catch {
    return [];
  }
}

/** Decides when to take a photo: first sight of an attendance, then every `intervalMs` while any is open. */
export function shouldCapture({ openProtocols, seen, lastAt, intervalMs, now }) {
  if (!openProtocols.length) return false;
  const fresh = openProtocols.some((protocol) => !seen.has(protocol));
  return now - lastAt >= intervalMs || (fresh && now - lastAt >= MIN_GAP_MS);
}

export class PanelCamera {
  constructor({ url, dataDir, onError, theme = () => 'dark' }) {
    Object.assign(this, { url, dataDir, onError, theme });
    this.lastAt = 0;
    this.seen = new Set();
    this.busy = false;
    this.browser = null;
  }

  async consider(snapshot, intervalMs, now = Date.now()) {
    const openProtocols = (snapshot?.teams ?? []).filter((t) => t.attendance).map((t) => t.attendance.protocol);
    const due = shouldCapture({ openProtocols, seen: this.seen, lastAt: this.lastAt, intervalMs, now });
    for (const protocol of openProtocols) this.seen.add(protocol);
    if (due) await this.take();
  }

  async take() {
    if (this.busy) return null;
    if (listPhotos(this.dataDir).length >= MAX_PHOTOS) return null;
    this.busy = true;
    this.lastAt = Date.now();
    try {
      if (!this.browser?.isConnected()) this.browser = await chromium.launch({ headless: true });
      const theme = this.theme() === 'light' ? 'light' : 'dark';
      const page = await this.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: theme });
      try {
        await page.goto(photoUrl(this.url, theme), { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(RENDER_WAIT_MS);
        mkdirSync(photoDir(this.dataDir), { recursive: true });
        const file = path.join(photoDir(this.dataDir), `${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
        return file;
      } finally {
        await page.close();
      }
    } catch (error) {
      this.onError?.(error);
      return null;
    } finally {
      this.busy = false;
    }
  }

  async close() {
    await this.browser?.close().catch(() => {});
  }
}
