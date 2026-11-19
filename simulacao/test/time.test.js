import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceDay, serviceStart, nextServiceStart, teamFor, TEAMS } from '../src/lib/time.js';

test('o dia de serviço vira às 8h no horário de Fortaleza (UTC-3)', () => {
  assert.equal(serviceDay(new Date('2026-11-16T10:59:59Z')), '2026-11-15'); // 07:59 local
  assert.equal(serviceDay(new Date('2026-11-16T11:00:00Z')), '2026-11-16'); // 08:00 local
  assert.equal(serviceDay(new Date('2026-11-17T02:30:00Z')), '2026-11-16'); // 23:30 local
});

test('início e próximo início do serviço', () => {
  assert.equal(serviceStart('2026-11-16').toISOString(), '2026-11-16T11:00:00.000Z');
  assert.equal(
    nextServiceStart(new Date('2026-11-16T20:00:00Z')).toISOString(),
    '2026-11-17T11:00:00.000Z',
  );
});

test('as equipes revezam A → B → C → A em dias consecutivos', () => {
  const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'];
  const teams = days.map(teamFor);
  assert.deepEqual(new Set(teams.slice(0, 3)), new Set(TEAMS));
  assert.equal(teams[3], teams[0]);
  assert.notEqual(teams[0], teams[1]);
});
