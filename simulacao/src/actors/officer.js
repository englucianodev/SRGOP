import { config } from '../config.js';
import { ApiClient } from '../lib/api.js';
import { connectSocket } from '../lib/socket.js';

const ROLE_LABEL = { comandante: 'Comandante', motorista: 'Motorista', cpu: 'CPU' };

/** One simulated person: own login, cookie session and real-time connection. */
export class Officer {
  constructor(account, { collector, cityName }) {
    this.account = account;
    this.collector = collector;
    this.api = new ApiClient({ actor: account.name, role: ROLE_LABEL[account.duty], city: cityName, collector });
    this.handlers = {};
    this.user = null;
    this.socket = null;
  }

  get id() {
    return this.user?._id;
  }

  get context() {
    return this.api.context;
  }

  on(event, handler) {
    this.handlers[event] = handler;
  }

  async login() {
    const data = await this.api.login(this.account.email, config.password, config.rememberLogin);
    this.user = data.user;
    this.openSocket();
    this.collector.flow('login', 'Entrou no sistema.', this.context);
  }

  openSocket() {
    this.socket?.disconnect();
    this.socket = connectSocket({ api: this.api, handlers: this.handlers });
  }

  /** Confirms the session is still valid; logs in again (as the officer would) if not. */
  async ensureSession() {
    if (!this.api.cookie) return this.login();
    try {
      await this.api.get('/auth/me', { tolerate: [401] });
      if (!this.socket?.connected) this.openSocket();
    } catch (error) {
      if (error.status !== 401) throw error;
      this.collector.event({ ...this.context, severity: 'alto', category: 'sessao', message: 'Sessão encerrada sem ação do policial; foi preciso entrar novamente.' });
      await this.login();
    }
  }

  /** Handles a 401 raised in the middle of a task by logging in again. */
  async recover(error) {
    if (error?.status !== 401) return false;
    await this.login();
    return true;
  }

  ping() {
    return this.api.post('/auth/activity');
  }

  async logout() {
    // Close our side first: the server drops the socket on logout, which must not
    // be reported as a real-time failure.
    this.socket?.disconnect();
    this.socket = null;
    try {
      if (this.api.cookie) await this.api.post('/auth/logout', {}, { tolerate: [401] });
    } catch {
      /* already recorded by the client */
    }
    this.api.cookie = null;
    this.collector.flow('logout', 'Saiu do sistema.', this.context);
  }
}
