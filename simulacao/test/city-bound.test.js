import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/engine/simulation.js';

const team = (id, latitude, available = true) => ({ city: { _id: id, latitude, longitude: 0 }, available });

test('apoio pode vir de outra cidade: escolhe a guarnição livre mais próxima', () => {
  const asking = team('A', 0);
  const near = team('B', 0.1);
  const engine = { teams: new Map([['A', asking], ['C', team('C', 0.5)], ['B', near], ['D', team('D', 0.05, false)]]) };
  assert.equal(Simulation.prototype.supportCandidate.call(engine, asking), near);
});

test('despacho comum não escolhe guarnição de outra cidade', () => {
  assert.equal(Simulation.prototype.nearestAvailable, undefined);
});
