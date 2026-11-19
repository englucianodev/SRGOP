import { config } from '../config.js';

const SESSION_COOKIE = 'srgop_session';
const LONG_SESSION_MS = 11.5 * 3600000;

export class ApiError extends Error {
  constructor(status, message, { method, route, body } = {}) {
    super(message);
    this.status = status;
    this.method = method;
    this.route = route;
    this.body = body;
  }
}

/** Groups "/occurrences/6650…/notes" as "/occurrences/:id/notes" in metrics and reports. */
export const routeOf = (urlPath) => urlPath.split('?')[0].replace(/[a-f\d]{24}/gi, ':id');

/** Non-JSON bodies: a proxy's HTML error page is summarized instead of dumped into the report. */
export function describeBody(text) {
  const body = String(text ?? '');
  if (/^\s*<(!doctype|html)/i.test(body)) {
    const title = body.match(/<title>([^<]{1,80})<\/title>/i)?.[1]?.trim();
    return `página de erro do proxy/hospedagem${title ? ` (${title})` : ''}, sem resposta da API`;
  }
  return body.slice(0, 200);
}

function classify(status, tolerated) {
  if (tolerated) return { severity: 'info', category: 'recusa-esperada' };
  if (status === 0) return { severity: 'alto', category: 'rede' };
  if (status >= 500) return { severity: 'critico', category: 'erro-servidor' };
  if (status === 401) return { severity: 'alto', category: 'sessao' };
  if (status === 429) return { severity: 'alto', category: 'limite-requisicoes' };
  return { severity: 'medio', category: 'regra-negocio' };
}

/** HTTP client for one simulated person: own cookie session, timing and error capture. */
export class ApiClient {
  constructor({ actor, role, city, collector }) {
    Object.assign(this, { actor, role, city, collector });
    this.cookie = null;
    this.loggedAt = null;
  }

  get context() {
    return { actor: this.actor, role: this.role, city: this.city };
  }

  headers(hasBody) {
    return {
      accept: 'application/json',
      origin: config.webUrl,
      'x-simulation-token': config.bypassToken,
      'user-agent': 'SRGOP-Simulacao/1.0',
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(this.cookie ? { cookie: `${SESSION_COOKIE}=${this.cookie}` } : {}),
    };
  }

  storeCookie(response) {
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attributes] = line.split(';');
      const [name, ...value] = pair.trim().split('=');
      if (name !== SESSION_COOKIE) continue;
      const cleared = !value.join('=') || attributes.some((a) => /expires=thu, 01 jan 1970/i.test(a));
      this.cookie = cleared ? null : value.join('=');
    }
  }

  async request(method, urlPath, body, { tolerate = [] } = {}) {
    const route = routeOf(urlPath);
    const started = performance.now();
    let response;
    let text;
    // The body read is inside the same guard: a connection dropped mid-response is a
    // network failure of the system, not of the simulator.
    try {
      response = await fetch(`${config.apiUrl}/api${urlPath}`, {
        method,
        headers: this.headers(body !== undefined),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
      this.storeCookie(response);
      text = await response.text();
    } catch (error) {
      const ms = performance.now() - started;
      this.collector.request({ method, route, status: 0, ms });
      const message = error.name === 'TimeoutError' ? `Sem resposta em ${config.requestTimeoutMs / 1000}s` : `Falha de rede: ${error.cause?.code || error.message}`;
      this.collector.event({ ...this.context, ...classify(0), message: `${method} ${route}: ${message}`, details: { method, route, ms: Math.round(ms) } });
      throw new ApiError(0, message, { method, route });
    }
    const ms = performance.now() - started;
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body (e.g. proxy error page) is kept as text */
    }
    this.collector.request({ method, route, status: response.status, ms });
    if (ms > config.slowMs) {
      this.collector.markSlow(method, route);
      this.collector.event({ ...this.context, severity: 'medio', category: 'lentidao', message: `${method} ${route} levou ${(ms / 1000).toFixed(1)}s`, details: { method, route, ms: Math.round(ms), status: response.status } });
    }
    if (response.ok) return data;
    const serverMessage = typeof data === 'object' && data?.message ? data.message : describeBody(text);
    const tolerated = tolerate.includes(response.status);
    const kind = classify(response.status, tolerated);
    const sessionAge = this.loggedAt ? Date.now() - this.loggedAt : 0;
    const message =
      response.status === 401 && !tolerated && sessionAge > LONG_SESSION_MS
        ? `Sessão expirou após ${(sessionAge / 3600000).toFixed(1)}h logado, no meio do turno de 24h`
        : `${method} ${route} → ${response.status}: ${serverMessage}`;
    this.collector.event({ ...this.context, ...kind, message, details: { method, route, status: response.status, origin: data?.origin, ms: Math.round(ms) } });
    throw new ApiError(response.status, serverMessage, { method, route, body: data });
  }

  get(urlPath, options) {
    return this.request('GET', urlPath, undefined, options);
  }
  post(urlPath, body = {}, options) {
    return this.request('POST', urlPath, body, options);
  }
  put(urlPath, body, options) {
    return this.request('PUT', urlPath, body, options);
  }
  patch(urlPath, body, options) {
    return this.request('PATCH', urlPath, body, options);
  }

  async login(email, password, remember = false) {
    this.cookie = null;
    const data = await this.post('/auth/login', { email, password, remember });
    if (!this.cookie) throw new ApiError(0, 'Login sem cookie de sessão (verifique HTTPS/SameSite).');
    this.loggedAt = Date.now();
    return data;
  }
}
