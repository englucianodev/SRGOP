import test from 'node:test';
import assert from 'node:assert/strict';
import { photoTime, choosePhotos } from '../src/report/photos.js';

test('lê a hora da foto pelo nome do arquivo', () => {
  assert.equal(photoTime('2026-11-18T12-30-05-123Z.jpg'), Date.parse('2026-11-18T12:30:05.123Z'));
  assert.equal(photoTime('qualquer.jpg'), null);
});

test('escolhe fotos do período espalhadas no tempo, no máximo N', () => {
  const names = Array.from({ length: 30 }, (_, i) => `2026-11-18T${String(i % 24).padStart(2, '0')}-00-00-000Z.jpg`).slice(0, 24);
  const from = Date.parse('2026-11-18T02:00:00Z');
  const to = Date.parse('2026-11-18T20:00:00Z');
  const chosen = choosePhotos(names, { from, to, max: 6 });
  assert.equal(chosen.length, 6);
  assert.ok(chosen.every((n) => photoTime(n) >= from && photoTime(n) <= to));
  assert.equal(chosen[0], '2026-11-18T02-00-00-000Z.jpg');
  assert.equal(chosen.at(-1), '2026-11-18T20-00-00-000Z.jpg');
  assert.deepEqual(choosePhotos(names.slice(0, 2), { from: 0, to: Infinity, max: 6 }), names.slice(0, 2));
});
