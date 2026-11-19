import test from 'node:test';
import assert from 'node:assert/strict';
import { TextAI, parseJsonAnswer, nextUtcMidnight } from '../src/lib/ai.js';

const settings = { aiAccountId: 'conta123', aiToken: 'token-de-teste', aiModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', aiDailyCap: 5 };
const collector = () => ({ events: [], event(e) { this.events.push(e); } });
const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

test('envia a conversa ao endpoint da conta com o token e devolve o texto', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ success: true, result: { response: ' Análise pronta. ' } }) };
  };
  const ai = new TextAI(collector(), { fetcher, settings });
  assert.equal(await ai.text('Escreva'), 'Análise pronta.');
  assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/accounts/conta123/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(calls[0].init.headers.authorization, 'Bearer token-de-teste');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'Escreva' }]);
  assert.ok(body.max_tokens > 256, 'o padrão de 256 tokens cortaria a análise');
});

test('lê JSON mesmo com texto ou cercas em volta, e aceita resposta já em objeto', () => {
  assert.deepEqual(parseJsonAnswer('Claro! ```json\n{"descricao": "x"}\n```'), { descricao: 'x' });
  assert.deepEqual(parseJsonAnswer({ descricao: 'y' }), { descricao: 'y' });
  assert.equal(parseJsonAnswer('sem json'), null);
  assert.equal(parseJsonAnswer('{quebrado'), null);
});

test('cota esgotada pausa a IA até 00:00 UTC e o simulador segue com modelos prontos', async () => {
  const c = collector();
  const ai = new TextAI(c, { fetcher: reply(429, { success: false, errors: [{ message: 'daily free allocation of neurons exceeded' }] }), settings });
  assert.equal(await ai.json('x'), null);
  assert.equal(ai.blockedUntil, nextUtcMidnight());
  assert.equal(ai.available(), false);
  assert.match(c.events[0].message, /00:00 UTC/);
});

test('sem conta ou token a IA fica desligada e nada é chamado', async () => {
  let called = false;
  const ai = new TextAI(collector(), { fetcher: async () => { called = true; }, settings: { ...settings, aiToken: '' } });
  assert.equal(await ai.text('x'), null);
  assert.equal(called, false);
});

test('respeita o limite diário de chamadas', async () => {
  const ai = new TextAI(collector(), { fetcher: reply(200, { success: true, result: { response: 'ok' } }), settings: { ...settings, aiDailyCap: 1 } });
  assert.equal(await ai.text('a'), 'ok');
  assert.equal(await ai.text('b'), null);
});

test('falha de rede não derruba a simulação', async () => {
  const c = collector();
  const ai = new TextAI(c, { fetcher: async () => { throw new TypeError('fetch failed'); }, settings });
  assert.equal(await ai.json('x'), null);
  assert.match(c.events[0].message, /indisponível/);
});
