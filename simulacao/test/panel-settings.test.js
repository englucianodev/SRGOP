import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, readSettings, applySettings } from '../src/panel/settings.js';

const ENV = '# comentário\nSRGOP_API_URL=https://x\nSIM_PASSWORD=segredo-nao-mostrar\nSIM_DAYS=7\nSIM_TAXA_APOIO=0.07\n';

test('lê só os campos editáveis, com padrão quando ausentes, sem segredos', () => {
  const values = readSettings(ENV);
  assert.equal(values.SIM_DAYS, 7);
  assert.equal(values.SIM_GPS_INTERVALO_S, 15);
  assert.ok(!('SIM_PASSWORD' in values));
  assert.ok(FIELDS.every((f) => !/PASSWORD|TOKEN|URI|KEY/.test(f.key)));
});

test('grava mudanças válidas preservando o resto do arquivo', () => {
  const text = applySettings(ENV, { SIM_DAYS: 2, SIM_GPS_INTERVALO_S: 20 });
  assert.match(text, /^SIM_DAYS=2$/m);
  assert.match(text, /^SIM_GPS_INTERVALO_S=20$/m);
  assert.match(text, /^SIM_PASSWORD=segredo-nao-mostrar$/m);
  assert.match(text, /^# comentário$/m);
});

test('recusa chave desconhecida, valor fora do limite e mínimo maior que máximo', () => {
  assert.throws(() => applySettings(ENV, { SIM_PASSWORD: 'x' }), /não pode ser alterad/);
  assert.throws(() => applySettings(ENV, { SIM_DAYS: 99 }), /entre 1 e 60/);
  assert.throws(() => applySettings(ENV, { SIM_OCORRENCIAS_MIN_HORA: 9, SIM_OCORRENCIAS_MAX_HORA: 3 }), /mínimo/);
  assert.throws(() => applySettings(ENV, { SIM_DAYS: 'abc' }), /entre 1 e 60/);
});
