import { intBetween } from '../lib/random.js';

const HOUR_MS = 3600000;

/** Plans each hour a random number (min..max) of occurrences at random minutes. */
export class OccurrenceScheduler {
  constructor({ min, max, rng = Math.random }) {
    Object.assign(this, { min, max, rng });
    this.reset();
  }

  reset() {
    this.hour = null;
    this.slots = [];
  }

  pending() {
    return this.slots.length;
  }

  /** How many occurrences are due at `now` (each one is returned only once). */
  due(now) {
    const hour = Math.floor(now / HOUR_MS);
    if (hour !== this.hour) {
      this.hour = hour;
      const count = intBetween(this.min, this.max, this.rng);
      this.slots = Array.from({ length: count }, () => hour * HOUR_MS + this.rng() * HOUR_MS)
        .filter((at) => at >= now)
        .sort((a, b) => a - b);
    }
    const due = this.slots.filter((at) => at <= now).length;
    this.slots = this.slots.slice(due);
    return due;
  }
}
