import test from 'node:test';
import assert from 'node:assert/strict';
import { assignPeople, COMMANDER_RANKS, DRIVER_RANKS } from '../src/domain/people.js';

const accounts = Array.from({ length: 30 }, (_, c) => [
  { email: `cmt${c}@x`, duty: 'comandante' },
  { email: `mot${c}@x`, duty: 'motorista' },
]).flat().concat([{ email: 'of1@x', duty: 'cpu' }]);

test('cada policial recebe nome distinto e patente compatível com a função', () => {
  const people = assignPeople(accounts, {});
  const names = Object.values(people).map((p) => p.name);
  assert.equal(new Set(names).size, accounts.length, 'nomes repetidos');
  for (const a of accounts) {
    const { rank, name } = people[a.email];
    assert.match(name, /^\S+ \S+/);
    if (a.duty === 'comandante') assert.ok(COMMANDER_RANKS.includes(rank), rank);
    if (a.duty === 'motorista') assert.ok(DRIVER_RANKS.includes(rank), rank);
    if (a.duty === 'cpu') assert.equal(rank, '1º Tenente');
  }
});

test('quem já tem nome mantém; só os novos são sorteados, sem repetir os existentes', () => {
  const first = assignPeople(accounts.slice(0, 10), {});
  const second = assignPeople(accounts, first);
  for (const a of accounts.slice(0, 10)) assert.deepEqual(second[a.email], first[a.email]);
  assert.equal(new Set(Object.values(second).map((p) => p.name)).size, accounts.length);
});

test('patentes usam exatamente os valores aceitos pelo SRGOP', () => {
  assert.deepEqual(COMMANDER_RANKS, ['1º Sargento', '2ª Sargento', '3º Sargento']);
  assert.deepEqual(DRIVER_RANKS, ['Soldado', 'Cabo']);
});
