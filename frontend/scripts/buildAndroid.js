import { build, loadEnv } from 'vite';
import { rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
const env = { ...loadEnv('android', process.cwd(), ''), ...process.env };
for (const key of ['VITE_API_URL', 'VITE_SOCKET_URL']) {
  let url;
  try {
    url = new URL(env[key]);
  } catch {
    throw new Error(`${key}: configure a URL pública HTTPS em .env.android.local.`);
  }
  if (
    url.protocol !== 'https:' ||
    ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
  ) {
    throw new Error(`${key}: o Android precisa de um servidor público HTTPS.`);
  }
}
await build({ mode: 'android' });
// O instalador é distribuído pela web, nunca dentro do próprio aplicativo.
const downloadsDir = resolve('dist/downloads');
if (!downloadsDir.startsWith(process.cwd() + sep)) throw new Error('Diret�rio de sa�da inv�lido.');
rmSync(downloadsDir, { recursive: true, force: true });
