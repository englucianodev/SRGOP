import test from 'node:test';
import assert from 'node:assert/strict';
import { OccurrenceScheduler } from '../src/engine/scheduler.js';

const HOUR = 3600000;
const sequence = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('sorteia de min a max ocorrências por hora, distribuídas na hora', () => {
  const scheduler = new OccurrenceScheduler({ min: 1, max: 5, rng: sequence(0.99, 0.1, 0.3, 0.5, 0.7, 0.9) });
  const start = 100 * HOUR;
  assert.equal(scheduler.due(start), 0);
  let total = 0;
  for (let t = start; t < start + HOUR; t += 60000) total += scheduler.due(t);
  assert.equal(total, 5);
});

test('ao reiniciar no meio da hora, só agenda o restante da hora', () => {
  const scheduler = new OccurrenceScheduler({ min: 4, max: 4, rng: sequence(0, 0.1, 0.2, 0.8, 0.9) });
  const middle = 100 * HOUR + HOUR / 2;
  let total = 0;
  for (let t = middle; t < 101 * HOUR; t += 60000) total += scheduler.due(t);
  assert.equal(total, 2);
});

test('reset descarta o plano (usado após pausa)', () => {
  const scheduler = new OccurrenceScheduler({ min: 3, max: 3, rng: () => 0.5 });
  const start = 100 * HOUR;
  scheduler.due(start);
  scheduler.reset();
  assert.equal(scheduler.pending(), 0);
});
