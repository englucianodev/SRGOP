import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldCapture } from '../src/panel/capture.js';

const MIN = 60000;
const base = { seen: new Set(['00001']), intervalMs: 15 * MIN, now: 100 * MIN };

test('sem atendimento aberto não fotografa', () => {
  assert.equal(shouldCapture({ ...base, openProtocols: [], lastAt: 0 }), false);
});

test('fotografa no intervalo enquanto houver atendimento', () => {
  assert.equal(shouldCapture({ ...base, openProtocols: ['00001'], lastAt: base.now - 16 * MIN }), true);
  assert.equal(shouldCapture({ ...base, openProtocols: ['00001'], lastAt: base.now - 10 * MIN }), false);
});

test('atendimento novo antecipa a foto, mas respeita 5 minutos entre fotos', () => {
  assert.equal(shouldCapture({ ...base, openProtocols: ['00001', '00002'], lastAt: base.now - 6 * MIN }), true);
  assert.equal(shouldCapture({ ...base, openProtocols: ['00001', '00002'], lastAt: base.now - 2 * MIN }), false);
});

test('foto abre o painel no tema atual do ambiente', async () => {
  const { photoUrl } = await import('../src/panel/capture.js');
  assert.equal(photoUrl('http://127.0.0.1:4300', 'light'), 'http://127.0.0.1:4300/?foto=1&tema=light');
  assert.equal(photoUrl('http://127.0.0.1:4300', 'dark'), 'http://127.0.0.1:4300/?foto=1&tema=dark');
  assert.equal(photoUrl('http://127.0.0.1:4300', 'qualquer'), 'http://127.0.0.1:4300/?foto=1&tema=dark');
});
