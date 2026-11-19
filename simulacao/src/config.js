import { existsSync } from 'node:fs';
import path from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');

const env = (name, fallback = '') => (process.env[name] ?? fallback).trim();

function number(name, fallback, min, max) {
  const raw = env(name);
  const value = raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`Configuração: ${name} deve estar entre ${min} e ${max} (recebido "${raw}").`);
  return value;
}

const trimSlash = (url) => url.replace(/\/+$/, '');

export const config = Object.freeze({
  apiUrl: trimSlash(env('SRGOP_API_URL')),
  webUrl: trimSlash(env('SRGOP_WEB_URL')),
  bypassToken: env('SIMULATION_BYPASS_TOKEN'),
  password: env('SIM_PASSWORD'),
  adminEmail: env('SIM_ADMIN_EMAIL'),
  adminPassword: env('SIM_ADMIN_PASSWORD'),
  days: number('SIM_DAYS', 7, 1, 60),
  minPerHour: number('SIM_OCORRENCIAS_MIN_HORA', 1, 0, 30),
  maxPerHour: number('SIM_OCORRENCIAS_MAX_HORA', 5, 1, 30),
  otherCityRate: number('SIM_TAXA_OUTRA_CIDADE', 0.08, 0, 1),
  cpuCreatedRate: number('SIM_TAXA_CPU', 0.05, 0, 1),
  rejectRate: number('SIM_TAXA_REJEICAO', 0.05, 0, 1),
  supportRate: number('SIM_TAXA_APOIO', 0.07, 0, 1),
  gpsIntervalMs: number('SIM_GPS_INTERVALO_S', 15, 5, 600) * 1000,
  browserActors: number('SIM_ATORES_NAVEGADOR', 3, 0, 5),
  autoResume: env('SIM_AUTO_RETOMAR', 'true') !== 'false',
  // Police station and seizures on closing: only once the published backend accepts these fields.
  closeDetails: env('SIM_DETALHES_ENCERRAMENTO', 'false') === 'true',
  // The login form starts unchecked (12 h session); keep it so the report shows what officers face.
  rememberLogin: env('SIM_LEMBRAR_LOGIN', 'false') === 'true',
  slowMs: number('SIM_LENTIDAO_MS', 3000, 200, 60000),
  requestTimeoutMs: 30000,
  healthIntervalMs: 30000,
  healthFailThreshold: 4,
  healthRecoverThreshold: 3,
  // Cloudflare Workers AI (optional): fictitious reports and the report analysis.
  aiAccountId: env('CF_ACCOUNT_ID'),
  aiToken: env('CF_AI_TOKEN'),
  aiModel: env('CF_AI_MODEL', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
  // ~100 calls fit in the free 10,000 neurons/day with the default model.
  aiDailyCap: number('IA_LIMITE_DIARIO', 100, 0, 10000),
  mongoUri: env('MONGO_URI'),
  dataDir: path.resolve(env('SIM_DADOS', 'dados')),
  emailDomain: 'sim.srgop.local',
  tag: '[SIMULAÇÃO]',
});

/** Validates what the simulation needs to talk to the published system. */
export function requireRuntimeConfig() {
  const missing = ['apiUrl', 'webUrl', 'bypassToken', 'password'].filter((k) => !config[k]);
  if (missing.length)
    throw new Error(`Configuração incompleta no .env: ${missing.join(', ')}. Veja .env.example.`);
  if (config.password.length < 10) throw new Error('SIM_PASSWORD precisa de 10+ caracteres.');
  if (config.bypassToken.length < 32)
    throw new Error('SIMULATION_BYPASS_TOKEN precisa de 32+ caracteres (o backend ignora menores).');
  if (config.minPerHour > config.maxPerHour)
    throw new Error('SIM_OCORRENCIAS_MIN_HORA não pode ser maior que SIM_OCORRENCIAS_MAX_HORA.');
}
