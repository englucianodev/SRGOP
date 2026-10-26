import test from 'node:test';
import assert from 'node:assert/strict';
import { schemas } from '../middlewares/validation.js';
import { formatPhone } from '../../frontend/src/utils/phone.js';
const account = { name: 'Policial Teste', email: 'telefone@teste.local' };
test('telefone aceita número completo e persiste o padrão solicitado', () => {
  for (const phone of ['98999991234', '(98)99999-1234', '(98) 99999-1234']) {
    assert.equal(schemas.account.parse({ ...account, phone }).phone, '(98)99999-1234');
  }
  assert.equal(schemas.account.parse({ ...account, phone: '' }).phone, '');
  assert.equal(schemas.account.parse(account).phone, undefined);
});
test('telefone incompleto, excessivo ou com letras é recusado', () => {
  for (const phone of [
    '999991234',
    '9899991234',
    '989999912345',
    '+5598999991234',
    '(98)abcde-1234',
  ]) {
    assert.equal(schemas.account.safeParse({ ...account, phone }).success, false);
  }
});
test('máscara permite digitar e apagar o telefone', () => {
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone('9'), '(9');
  assert.equal(formatPhone('98999'), '(98)999');
  assert.equal(formatPhone('98999991234'), '(98)99999-1234');
  assert.equal(formatPhone('(98) 99999-1234'), '(98)99999-1234');
});
