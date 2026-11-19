// Only one simulator may run per data folder: two of them log in with the same officers,
// end each other's sessions and overwrite each other's panel snapshot.
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

const readPid = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')).pid ?? null;
  } catch {
    return null;
  }
};

/** PID of the live simulator holding the lock, or null. */
export function lockHolder(file, isAlive = pidAlive) {
  const pid = readPid(file);
  return pid && isAlive(pid) ? pid : null;
}

/** Takes the lock (or a stale one); throws if another live simulator holds it. Returns the release function. */
export function acquireInstanceLock(file, { pid = process.pid, isAlive = pidAlive } = {}) {
  mkdirSync(path.dirname(file), { recursive: true });
  const body = JSON.stringify({ pid, startedAt: new Date().toISOString() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(file, body, { flag: 'wx' });
      return () => {
        if (readPid(file) === pid) rmSync(file, { force: true });
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const holder = lockHolder(file, isAlive);
      if (holder && holder !== pid) throw new Error(`Outro simulador já está em execução (processo ${holder}). Encerre-o antes de iniciar outro.`);
      rmSync(file, { force: true }); // stale lock from a process that died
    }
  }
  throw new Error('Não foi possível obter a trava do simulador.');
}
