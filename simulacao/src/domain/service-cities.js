import { pick } from '../lib/random.js';

/**
 * Each city starts its service on its own: as soon as its crew has entered service it may
 * receive calls, whether or not the crews of the other cities are ready. A busy crew is still
 * in service, so its city keeps receiving calls (they wait in the queue for it).
 * Returns null while no city has a crew in service yet.
 */
export function pickServiceUnit(units, teamForCity, rng = Math.random) {
  const ready = units.filter((unit) => teamForCity(unit.city._id)?.phase === 'em-servico');
  return ready.length ? pick(ready, rng) : null;
}
