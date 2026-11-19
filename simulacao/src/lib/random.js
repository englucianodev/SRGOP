export const between = (min, max, rng = Math.random) => min + rng() * (max - min);
export const intBetween = (min, max, rng = Math.random) =>
  Math.floor(between(min, max + 1, rng));
export const chance = (probability, rng = Math.random) => rng() < probability;
export const pick = (items, rng = Math.random) => items[Math.floor(rng() * items.length)];

/** Picks one entry proportionally to `entry.weight`. */
export function weightedPick(entries, rng = Math.random) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let target = rng() * total;
  for (const entry of entries) {
    target -= entry.weight;
    if (target < 0) return entry;
  }
  return entries[entries.length - 1];
}

// Test-only acceleration (e.g. 0.05 turns 20 min into 1 min). Always 1 in real runs.
const TIME_SCALE = Math.min(1, Math.max(0.001, Number(process.env.SIM_ESCALA_TEMPO) || 1));
export const minutes = (value) => value * 60000 * TIME_SCALE;

/** Sleeps, resolving early (without error) if the signal aborts. */
export function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, Math.max(0, ms));
    function done() {
      signal?.removeEventListener('abort', done);
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}
