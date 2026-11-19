import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES } from '../src/domain/crimes.js';
import { ATTENDANCE_MAX_MIN, RESPONSE_DELAY_MIN, responseDelayMs } from '../src/domain/timing.js';

const MIN = 60000;

test('toda categoria dura no máximo 5 min de atendimento', () => {
  for (const [id, category] of Object.entries(CATEGORIES)) {
    const [min, max] = category.duration;
    assert.ok(min > 0 && min <= max && max <= ATTENDANCE_MAX_MIN, `${id}: ${min}-${max} min`);
  }
});

test('aceitação, despacho e autorização ficam abaixo de 1 min (contando o tick de 10 s)', () => {
  assert.ok(RESPONSE_DELAY_MIN[1] * MIN + 10000 <= MIN);
  for (let i = 0; i < 200; i++) assert.ok(responseDelayMs() <= RESPONSE_DELAY_MIN[1] * MIN);
});
