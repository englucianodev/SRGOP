import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquireInstanceLock, lockHolder } from '../src/lib/instance-lock.js';

const fresh = () => path.join(mkdtempSync(path.join(tmpdir(), 'lock-')), 'simulador.lock');

test('segundo simulador é recusado enquanto o primeiro está vivo', () => {
  const file = fresh();
  acquireInstanceLock(file, { pid: 111, isAlive: () => true });
  assert.throws(() => acquireInstanceLock(file, { pid: 222, isAlive: () => true }), /já está em execução.*111/);
});

test('trava de processo morto é assumida pelo novo simulador', () => {
  const file = fresh();
  writeFileSync(file, JSON.stringify({ pid: 111 }));
  const release = acquireInstanceLock(file, { pid: 222, isAlive: (pid) => pid === 222 });
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).pid, 222);
  release();
  assert.equal(existsSync(file), false);
});

test('lockHolder informa o PID vivo que segura a trava', () => {
  const file = fresh();
  assert.equal(lockHolder(file, () => true), null);
  acquireInstanceLock(file, { pid: 333, isAlive: () => true });
  assert.equal(lockHolder(file, () => true), 333);
  assert.equal(lockHolder(file, () => false), null);
});
