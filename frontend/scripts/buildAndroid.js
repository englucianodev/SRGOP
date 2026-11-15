import { build, loadEnv } from 'vite';
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
