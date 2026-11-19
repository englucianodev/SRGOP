import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { config } from '../config.js';
import { between, pick, minutes } from '../lib/random.js';
import { teamFor, officerIndexFor } from '../lib/time.js';
import { slug } from '../domain/roster.js';

const ROUTES = {
  CPU: ['/dashboard', '/ocorrencias', '/despachos', '/mapa', '/guarnicoes', '/relatorios'],
  Comandante: ['/dashboard', '/ocorrencias', '/atendimento', '/mapa', '/guarnicoes'],
};
const THROTTLE_MS = minutes(10);
const CRASH_TEXT = 'Não foi possível exibir esta página';

/** A real browser session of one officer, looking for screen, console and JS errors. */
class BrowserObserver {
  constructor({ account, role, city, browser, collector, shotsDir }) {
    Object.assign(this, { account, role, city, browser, collector, shotsDir });
    this.nextAt = Date.now() + minutes(between(3, 6)); // let the API actor log in first
    this.lastProblem = new Map();
    this.lastShot = 0;
  }

  get eventContext() {
    return { actor: `${this.account.name} (navegador)`, role: this.role, city: this.city };
  }

  async problem(severity, category, message, { shot = false } = {}) {
    const now = Date.now();
    if (now - (this.lastProblem.get(message) ?? 0) < THROTTLE_MS) return;
    this.lastProblem.set(message, now);
    let screenshot;
    if (shot && this.page && now - this.lastShot > THROTTLE_MS) {
      this.lastShot = now;
      screenshot = path.join(this.shotsDir, `${new Date(now).toISOString().replace(/[:.]/g, '-')}-${slug(this.account.name)}.png`);
      await this.page.screenshot({ path: screenshot, fullPage: true }).catch(() => (screenshot = undefined));
    }
    this.collector.event({ ...this.eventContext, severity, category, message, details: { url: this.page?.url(), screenshot } });
  }

  async open() {
    const mobile = this.role !== 'CPU';
    this.context = await this.browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
      isMobile: mobile,
      locale: 'pt-BR',
      timezoneId: 'America/Fortaleza',
    });
    await this.context.route(`${config.apiUrl}/api/**`, (route) =>
      route.continue({ headers: { ...route.request().headers(), 'x-simulation-token': config.bypassToken } }),
    );
    const page = await this.context.newPage();
    this.page = page;
    // "Failed to load resource" repeats HTTP statuses already judged by the response
    // handlers (e.g. the expected 401 session probe on the login screen).
    page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && this.problem('medio', 'interface', `Erro no console do navegador: ${m.text().slice(0, 300)}`));
    page.on('pageerror', (e) => this.problem('alto', 'interface', `Erro de JavaScript na tela: ${e.message.slice(0, 300)}`, { shot: true }));
    page.on('response', (r) => r.url().startsWith(config.apiUrl) && r.status() >= 500 && this.problem('critico', 'erro-servidor', `Tela recebeu erro ${r.status()} em ${new URL(r.url()).pathname}`, { shot: true }));
    // ERR_ABORTED = the screen was left while a request was in flight (normal navigation).
    page.on('requestfailed', (r) => r.url().startsWith(config.apiUrl) && !String(r.failure()?.errorText).includes('ERR_ABORTED') && this.problem('alto', 'rede', `Requisição da tela falhou: ${new URL(r.url()).pathname} (${r.failure()?.errorText})`));
    await this.login();
  }

  async login() {
    const started = Date.now();
    await this.page.goto(`${config.webUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.getByLabel('E-mail').fill(this.account.email);
    await this.page.getByLabel('Senha', { exact: false }).first().fill(config.password);
    await this.page.locator('form button[type="submit"]').click();
    try {
      await this.page.waitForURL(/\/dashboard/, { timeout: 60000 });
      this.collector.flow('navegador.login', `Login pela tela em ${((Date.now() - started) / 1000).toFixed(1)}s.`, this.eventContext);
    } catch {
      await this.problem('alto', 'login-interface', 'Login pela tela não chegou ao Dashboard em 60s.', { shot: true });
    }
  }

  async navigate(route) {
    const link = this.page.locator(`nav[aria-label="Menu principal"] a[href="${route}"]`).first();
    const menu = this.page.getByRole('button', { name: 'Abrir menu' });
    if (await menu.isVisible().catch(() => false)) await menu.click().catch(() => {});
    if (await link.isVisible().catch(() => false)) await link.click();
    else await this.page.goto(`${config.webUrl}${route}`, { waitUntil: 'load', timeout: 45000 });
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  }

  async step(now) {
    if (now < this.nextAt) return;
    this.nextAt = now + minutes(between(4, 8));
    if (!this.page) return this.open();
    if (this.page.url().includes('/login')) {
      await this.problem('alto', 'sessao', 'Tela voltou para o login sem o policial sair (sessão encerrada).', { shot: true });
      return this.login();
    }
    const route = pick(ROUTES[this.role]);
    const started = Date.now();
    try {
      await this.navigate(route);
    } catch (error) {
      return this.problem('medio', 'interface', `Tela ${route} não carregou: ${error.message.split('\n')[0]}`, { shot: true });
    }
    const ms = Date.now() - started;
    if (ms > config.slowMs * 2) await this.problem('medio', 'lentidao', `Tela ${route} levou ${(ms / 1000).toFixed(1)}s para carregar.`);
    if (await this.page.getByText(CRASH_TEXT).isVisible().catch(() => false))
      await this.problem('alto', 'interface', `Tela ${route} quebrou ("${CRASH_TEXT}").`, { shot: true });
    await this.page.mouse.move(between(50, 300), between(100, 600)).catch(() => {});
  }

  async close() {
    await this.context?.close().catch(() => {});
  }
}

/** Pool of real-browser observers: the CPU of the day plus commanders of random cities. */
export class BrowserObservers {
  constructor({ collector, count }) {
    Object.assign(this, { collector, count });
    this.observers = [];
    this.busy = false;
    this.shotsDir = path.join(config.dataDir, 'capturas');
    mkdirSync(this.shotsDir, { recursive: true });
  }

  assign(day, engine) {
    if (this.count) this.pending = { day, engine };
  }

  tick(now) {
    if (!this.count || this.busy) return;
    this.busy = true;
    this.step(now)
      .catch((error) => this.collector.event({ severity: 'baixo', category: 'simulador', message: `Navegador: ${error.message.split('\n')[0]}` }))
      .finally(() => {
        this.busy = false;
      });
  }

  async step(now) {
    // A Chromium crash would otherwise leave the screens unobserved until the next day.
    if (!this.pending && this.assigned && !this.browser?.isConnected()) {
      this.pending = this.assigned;
      this.collector.event({ severity: 'baixo', category: 'simulador', message: 'Navegador fechou inesperadamente; reabrindo os observadores.' });
    }
    if (this.pending) await this.reassign();
    for (const observer of this.observers) await observer.step(now).catch((e) => observer.problem('baixo', 'simulador', `Navegador: ${e.message.split('\n')[0]}`));
  }

  async reassign() {
    const { day, engine } = this.pending;
    this.assigned = this.pending;
    this.pending = null;
    await Promise.allSettled(this.observers.map((o) => o.close()));
    if (!this.browser?.isConnected()) this.browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
    const team = teamFor(day);
    const picks = [...engine.world.units].sort(() => Math.random() - 0.5).slice(0, this.count - 1);
    const people = [
      { account: engine.world.officers[officerIndexFor(day)], role: 'CPU', city: 'CPU' },
      ...picks.map((u) => ({ account: u.accounts.find((a) => a.team === team && a.duty === 'comandante'), role: 'Comandante', city: u.city.name })),
    ];
    this.observers = people.map((p) => new BrowserObserver({ ...p, browser: this.browser, collector: this.collector, shotsDir: this.shotsDir }));
  }

  async close() {
    await Promise.allSettled(this.observers.map((o) => o.close()));
    await this.browser?.close().catch(() => {});
  }
}
