import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationWatch } from '../src/engine/watch.js';

const fakeCollector = () => {
  const rows = [];
  return { rows, flow: (code, message, ctx, details) => rows.push({ code, details }), event: (e) => rows.push(e) };
};

test('aviso de despacho que chega antes da resposta HTTP não vira falso alerta', () => {
  const collector = fakeCollector();
  const watch = new NotificationWatch(collector);
  const now = Date.now();
  watch.noteDispatchReceived('occ1', 'tempo-real');
  watch.watchDispatch('occ1', '00001', now);
  watch.check(now + 120000);
  assert.equal(collector.rows.filter((r) => r.category === 'tempo-real').length, 0);
  assert.equal(collector.rows.filter((r) => r.code === 'despacho.recebido').length, 1);
});

test('aviso ao CPU que chega antes do registro é casado depois', () => {
  const collector = fakeCollector();
  const watch = new NotificationWatch(collector);
  const now = Date.now();
  watch.noteCpuNotice('occ2');
  watch.expectCpuNotice('occ2', '00002', now);
  watch.check(now + 120000);
  assert.equal(collector.rows.filter((r) => r.category === 'tempo-real').length, 0);
});

test('aviso que nunca chega ainda é denunciado após 90 s', () => {
  const collector = fakeCollector();
  const watch = new NotificationWatch(collector);
  const now = Date.now();
  watch.watchDispatch('occ3', '00003', now);
  watch.check(now + 91000);
  assert.equal(collector.rows.filter((r) => r.category === 'tempo-real').length, 1);
});
