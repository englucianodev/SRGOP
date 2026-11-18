import { LoginThrottle } from '../models/index.js';
import { AppError } from '../utils/errors.js';

export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCK_MS = 15 * 60000;
// Failures older than this no longer count towards a lock.
const FAILURE_WINDOW_MS = 30 * 60000;
const key = (email) => String(email).trim().toLowerCase();

/** Refuses the login while the e-mail is locked, before any password is checked. */
export async function assertLoginAllowed(email) {
  const row = await LoginThrottle.findOne({ email: key(email) }).lean();
  if (row?.lockedUntil && +row.lockedUntil > Date.now())
    throw new AppError(
      'Muitas tentativas incorretas. Aguarde 15 minutos ou peça ao Administrativo para redefinir sua senha.',
      429,
      'Proteção de autenticação',
    );
}

/** Counts a wrong password or code; the fifth one in a row locks the e-mail. */
export async function registerLoginFailure(email) {
  const now = Date.now();
  const row = await LoginThrottle.findOneAndUpdate(
    { email: key(email) },
    { $inc: { failures: 1 }, $set: { expiresAt: new Date(now + FAILURE_WINDOW_MS) } },
    { upsert: true, new: true },
  );
  if (row.failures < MAX_LOGIN_FAILURES) return;
  await LoginThrottle.updateOne(
    { _id: row._id },
    { failures: 0, lockedUntil: new Date(now + LOGIN_LOCK_MS), expiresAt: new Date(now + LOGIN_LOCK_MS) },
  );
}

/** Called after a successful login or when the password is redefined. */
export const clearLoginFailures = (email, session) =>
  LoginThrottle.deleteOne({ email: key(email) }, session ? { session } : undefined);
