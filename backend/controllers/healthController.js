import mongoose from 'mongoose';

const PING_TIMEOUT_MS = 3000;
const CONNECTED = 1;

async function databaseUp() {
  // Without this check a query would wait in the driver's buffer instead of failing.
  if (mongoose.connection.readyState !== CONNECTED) return false;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('ping timeout')), PING_TIMEOUT_MS);
  });
  try {
    await Promise.race([mongoose.connection.db.admin().ping(), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Process liveness only: used by the host to decide whether to restart the service. */
export const live = (req, res) => res.json({ status: 'ok', service: 'SRGOP' });

/** Readiness: answers 503 when the API is up but cannot reach MongoDB. */
export async function health(req, res) {
  const up = await databaseUp();
  res
    .status(up ? 200 : 503)
    .json({ status: up ? 'ok' : 'degraded', service: 'SRGOP', database: up ? 'ok' : 'indisponível' });
}
