import { chromium } from 'playwright';
import { config, requireRuntimeConfig } from '../config.js';
import { Collector } from '../lib/collector.js';
import { ApiClient } from '../lib/api.js';
import { connectSocket } from '../lib/socket.js';
import { TextAI } from '../lib/ai.js';
import { loadWorld } from '../engine/world.js';
import { officerAccounts } from '../domain/roster.js';

// Pre-flight before starting a multi-day test: every dependency is checked once.
const results = [];
const ok = (message) => results.push(`✔ ${message}`);
const fail = (message) => results.push(`✖ ${message}`);
const warn = (message) => results.push(`! ${message}`);

async function checkHealthAndBypass() {
  const call = (headers) => fetch(`${config.apiUrl}/api/health`, { headers, signal: AbortSignal.timeout(20000) });
  const plain = await call({});
  if (!plain.ok) return fail(`API não respondeu em ${config.apiUrl}/api/health (${plain.status}).`);
  ok(`API publicada respondendo (${config.apiUrl}).`);
  const bypassed = await call({ 'x-simulation-token': config.bypassToken });
  if (bypassed.headers.get('ratelimit')) fail('O backend ainda aplica limite às requisições do simulador: configure SIMULATION_BYPASS_TOKEN no Render com o mesmo valor e faça o deploy desta versão.');
  else if (plain.headers.get('ratelimit')) ok('Isenção de limite por token ativa no backend.');
  else warn('Não foi possível confirmar a isenção (o backend não enviou cabeçalhos de limite).');
}

async function checkLoginAndSocket(collector) {
  const api = new ApiClient({ actor: 'verificação', role: 'Simulador', city: '', collector });
  try {
    await api.login(officerAccounts()[0].email, config.password);
  } catch (error) {
    if (error.status === 403) return fail(`Login recusado por origem: SRGOP_WEB_URL (${config.webUrl}) precisa estar em CLIENT_URL do backend.`);
    if (error.status === 401) return fail('Contas da simulação não existem ou a senha difere de SIM_PASSWORD: rode "npm run seed".');
    return fail(`Login falhou: ${error.message}`);
  }
  ok('Login de conta simulada funcionando (cookie de sessão recebido).');
  const socket = connectSocket({ api });
  const connected = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 20000);
    socket.once('connect', () => (clearTimeout(timer), resolve(true)));
  });
  socket.disconnect();
  if (connected) ok('Conexão em tempo real (Socket.IO) funcionando.');
  else fail('Socket.IO não conectou em 20s.');
  await api.post('/auth/logout').catch(() => {});
}

async function checkWorld(collector) {
  try {
    const world = await loadWorld(collector);
    ok(`${world.units.length} cidade(s) com guarnição SIM e viatura.`);
    if (world.missing.length) warn(`Sem guarnição SIM: ${world.missing.join(', ')} (rode "npm run seed").`);
    for (const [category, type] of Object.entries(world.mapping)) (type ? ok : warn)(`Categoria ${category} → ${type ?? 'nenhum tipo cadastrado (peso vai para "outros")'}`);
    for (const [category, types] of Object.entries(world.extras ?? {})) if (types.length) ok(`Categoria ${category} também usa → ${types.join(', ')}`);
    if (world.others.length) ok(`Demais tipos sorteados: ${world.others.join(', ')}`);
  } catch (error) {
    fail(error.message);
  }
}

async function checkAi(collector) {
  if (!config.aiAccountId || !config.aiToken)
    return warn('CF_ACCOUNT_ID ou CF_AI_TOKEN vazio: relatos e relatório usarão modelos prontos.');
  const answer = await new TextAI(collector).json('Responda somente com o JSON {"ok": true}');
  if (answer?.ok) ok(`Workers AI respondendo (${config.aiModel}).`);
  else fail('Workers AI não respondeu; confira CF_ACCOUNT_ID, CF_AI_TOKEN (permissão Workers AI) e CF_AI_MODEL. O código do erro está em dados/eventos.');
}

async function checkBrowser() {
  if (!config.browserActors) return warn('SIM_ATORES_NAVEGADOR=0: sem atores em navegador real.');
  try {
    const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.goto(`${config.webUrl}/login`, { timeout: 60000 });
    ok(`Navegador real abriu a tela de login (${config.webUrl}).`);
    await browser.close();
  } catch (error) {
    fail(`Navegador (Playwright) falhou: ${error.message.split('\n')[0]}`);
  }
}

try {
  requireRuntimeConfig();
  ok('Configuração do .env completa.');
  const collector = new Collector(config.dataDir, { quiet: true });
  await checkHealthAndBypass();
  await checkLoginAndSocket(collector);
  await checkWorld(collector);
  await checkAi(collector);
  await checkBrowser();
} catch (error) {
  fail(error.message);
}
console.log(results.join('\n'));
const failed = results.some((r) => r.startsWith('✖'));
console.log(failed ? '\nCorrija os itens ✖ antes de iniciar.' : '\nTudo pronto: npm start (ou docker compose up -d).');
process.exit(failed ? 1 : 0);
