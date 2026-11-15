import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { DEMO_PASSWORD } from './helpers.js';

const API_PORT = 5055;
const WEB_PORT = 5173;
const WEB_BUILD = '../e2e/.web';
const WEB_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  outputDir: 'results',
  use: {
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Fortaleza',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // In-memory MongoDB with seeded demo users; overrides the production values in backend/.env.
      command: 'npm run dev:demo --prefix ../backend',
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        NODE_ENV: 'development',
        CLIENT_URL: WEB_URL,
        COOKIE_SAME_SITE: 'lax',
        SEED_PASSWORD: DEMO_PASSWORD,
      },
    },
    {
      // Production build served by `vite preview`; built outside frontend/dist, which is versioned.
      command: `npx vite build --outDir ${WEB_BUILD} --emptyOutDir && npx vite preview --outDir ${WEB_BUILD} --port ${WEB_PORT} --strictPort`,
      cwd: path.join(import.meta.dirname, '../frontend'),
      url: WEB_URL,
      timeout: 180_000,
      reuseExistingServer: false,
      env: { VITE_API_URL: `http://localhost:${API_PORT}/api` },
    },
  ],
});
