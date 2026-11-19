import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBody } from '../src/lib/api.js';

test('página HTML do proxy vira mensagem curta e legível', () => {
  const html = '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>502</title><style>@font-face{}</style></head><body>Bad gateway</body></html>';
  assert.equal(describeBody(html), 'página de erro do proxy/hospedagem (502), sem resposta da API');
});

test('texto comum é mantido, cortado em 200 caracteres', () => {
  assert.equal(describeBody('Service Unavailable'), 'Service Unavailable');
  assert.equal(describeBody('x'.repeat(300)).length, 200);
});
