import { timingSafeEqual } from 'node:crypto';

// Load simulations send every robot from a single VPS IP. Real officers each use their own
// device, so the per-IP limits would report false failures. The bypass is off unless
// SIMULATION_BYPASS_TOKEN is set (only during an authorized test) and must be long enough
// not to be guessed.
const MIN_TOKEN_LENGTH = 32;
export const SIMULATION_HEADER = 'x-simulation-token';

const SIMULATION_EMAIL = /@sim\.srgop\.local$/i;

export function isSimulationRequest(req) {
  const expected = Buffer.from((process.env.SIMULATION_BYPASS_TOKEN || '').trim());
  const received = Buffer.from(req.get(SIMULATION_HEADER) || '');
  if (expected.length < MIN_TOKEN_LENGTH || received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

// Authentication limits are the only brute-force protection, so even a leaked token
// must not lift them for real accounts: only simulated (@sim.srgop.local) logins skip.
export function isSimulationLogin(req) {
  return SIMULATION_EMAIL.test(String(req.body?.email ?? '')) && isSimulationRequest(req);
}
