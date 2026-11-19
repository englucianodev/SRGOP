// Local HTTP server of the test panel. Listens on 127.0.0.1 only; actions need the
// "x-painel" header (a page from another site cannot send it) and a localhost Host header
// (blocks DNS rebinding). It never returns credentials: only the whitelisted settings.
import http from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS, readSettings, applySettings } from './settings.js';
import { Processes } from './processes.js';
import { PanelCamera, listPhotos, photoDir } from './capture.js';
import { isLiveRelevant, describeLiveEvent } from '../lib/live.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const STATIC = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
const EVENTS_TAIL_BYTES = 400 * 1024;
const MAX_EVENTS = 80;
const MAX_BODY = 16 * 1024;
const CAMERA_CHECK_MS = 30000;
const THEMES = new Set(['light', 'dark']);

export function requestAllowed({ method, headers }, port) {
  const host = String(headers.host ?? '');
  if (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) return false;
  if (method === 'GET') return true;
  return headers['x-painel'] === '1' && String(headers['content-type'] ?? '').startsWith('application/json');
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Last events of the current UTC day, reading only the end of the file. */
function recentEvents(dataDir) {
  const file = path.join(dataDir, 'eventos', `${new Date().toISOString().slice(0, 10)}.jsonl`);
  if (!existsSync(file)) return [];
  const size = statSync(file).size;
  const length = Math.min(size, EVENTS_TAIL_BYTES);
  const buffer = Buffer.alloc(length);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  const lines = buffer.toString('utf8').split('\n').slice(size > length ? 1 : 0);
  const rows = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (isLiveRelevant(row)) rows.push(describeLiveEvent(row));
    } catch {
      /* partial or empty line */
    }
  }
  return rows.slice(-MAX_EVENTS).reverse();
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Pedido grande demais.'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

export function createPanelServer({ root, dataDir, envFile, port, camera: cameraEnabled = true }) {
  const processes = new Processes({ root, dataDir });
  const readEnv = () => (existsSync(envFile) ? readFileSync(envFile, 'utf8') : '');
  const settings = () => readSettings(readEnv());
  const themeFile = path.join(dataDir, 'tema.json');
  const currentTheme = () => (THEMES.has(readJson(themeFile)?.tema) ? readJson(themeFile).tema : 'dark');
  const camera = cameraEnabled ? new PanelCamera({ url: `http://127.0.0.1:${port}`, dataDir, theme: currentTheme, onError: (e) => console.error(`Foto do painel falhou: ${e.message}`) }) : null;
  let cameraTimer = null;

  function overview() {
    const snapshot = readJson(path.join(dataDir, 'painel.json'));
    const state = readJson(path.join(dataDir, 'estado.json'));
    const photos = listPhotos(dataDir);
    return {
      now: Date.now(),
      process: processes.status(),
      snapshot,
      preparation: readJson(path.join(dataDir, 'preparacao.json')),
      state: state ? { status: state.status, startedAt: state.startedAt, finishedAt: state.finishedAt, activeMs: state.activeMs, plannedActiveMs: state.plannedActiveMs, pauses: state.pauses?.length ?? 0, restarts: state.restarts?.length ?? 0 } : null,
      events: recentEvents(dataDir),
      photos: { count: photos.length, last: photos.at(-1) ?? null },
      report: existsSync(path.join(dataDir, 'relatorios', 'relatorio-final.html')),
    };
  }

  const actions = {
    iniciar: () => ({ message: `Simulador iniciado (processo ${processes.start()}). Os primeiros policiais entram em instantes.` }),
    pausar: () => (processes.control('pausar'), { message: 'Pedido de pausa enviado (até 10 s).' }),
    retomar: () => (processes.control('retomar'), { message: 'Pedido para retomar enviado (até 10 s).' }),
    encerrar: () => (processes.control('encerrar'), { message: 'Encerrando agora: os atendimentos abertos são finalizados na hora, todos saem do sistema e o relatório final é gerado (cerca de 1 a 2 min).' }),
    interromper: () => (processes.interrupt(), { message: 'Processo interrompido. O estado salvo no último ciclo foi mantido.' }),
    preparar: () => (processes.seed(), { message: 'Preparando o efetivo (nomes, patentes e contas). Acompanhe em dados/preparacao.log.' }),
    'limpar-tudo': (body) => {
      if (body?.confirmacao !== 'LIMPAR') throw new Error('Digite LIMPAR para confirmar a limpeza.');
      processes.cleanAll();
      return { message: 'Limpeza iniciada: primeiro o banco, depois os arquivos locais. Acompanhe o resultado nesta aba.' };
    },
    'novo-teste': () => {
      const target = processes.archive();
      return { message: target ? `Teste anterior arquivado em ${target}.` : 'Não havia dados para arquivar.' };
    },
    foto: async () => {
      const file = camera ? await camera.take() : null;
      return { message: file ? `Foto salva: ${path.basename(file)}` : 'Não foi possível tirar a foto agora.' };
    },
    tema: (body) => {
      if (!THEMES.has(body?.tema)) throw new Error('Tema inválido.');
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(themeFile, JSON.stringify({ tema: body.tema }));
      return { message: '' };
    },
    configuracoes: (body) => {
      writeFileSync(envFile, applySettings(readEnv(), body ?? {}));
      return { message: 'Configurações salvas. Valem a partir do próximo início do simulador.', settings: settings() };
    },
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (!requestAllowed(req, port)) return send(res, 403, { message: 'Acesso permitido apenas pelo próprio computador.' });
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (req.method === 'GET' && STATIC[url.pathname]) {
        const [file, type] = STATIC[url.pathname];
        return send(res, 200, readFileSync(path.join(PUBLIC_DIR, file)), type);
      }
      if (req.method === 'GET' && url.pathname === '/api/painel') return send(res, 200, overview());
      if (req.method === 'GET' && url.pathname === '/api/configuracoes') return send(res, 200, { fields: FIELDS, values: settings() });
      if (req.method === 'GET' && url.pathname === '/api/fotos') return send(res, 200, listPhotos(dataDir));
      const photo = /^\/fotos\/([\w-]+\.jpg)$/.exec(url.pathname)?.[1];
      if (req.method === 'GET' && photo && listPhotos(dataDir).includes(photo))
        return send(res, 200, readFileSync(path.join(photoDir(dataDir), photo)), 'image/jpeg');
      const action = req.method === 'POST' && /^\/api\/acao\/([a-z-]+)$/.exec(url.pathname)?.[1];
      if (action && actions[action]) {
        const body = await readBody(req);
        return send(res, 200, await actions[action](body));
      }
      return send(res, 404, { message: 'Não encontrado.' });
    } catch (error) {
      return send(res, 400, { message: error.message });
    }
  });

  server.on('listening', () => {
    if (!camera) return;
    cameraTimer = setInterval(() => {
      const snapshot = readJson(path.join(dataDir, 'painel.json'));
      const fresh = snapshot && Date.now() - snapshot.t < 60000 && snapshot.status === 'executando';
      if (fresh) camera.consider(snapshot, settings().PAINEL_FOTO_MIN * 60000).catch(() => {});
    }, CAMERA_CHECK_MS);
  });
  server.on('close', () => {
    clearInterval(cameraTimer);
    camera?.close();
  });
  return server;
}
