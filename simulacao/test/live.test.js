import test from 'node:test';
import assert from 'node:assert/strict';
import { isLiveRelevant, formatLiveEvent, openAttendances } from '../src/lib/live.js';

const flow = (code, extra = {}) => ({ t: '2026-11-17T23:10:00.000Z', severity: 'info', category: 'fluxo', message: 'm', city: 'Dom Pedro', actor: 'SIM Cmt A Dom Pedro', details: { code }, ...extra });

test('mostra ocorrências, despachos, apoio e atendimentos; esconde login e lentidão comum', () => {
  for (const code of ['ocorrencia.criada', 'despacho.enviado', 'despacho.aceito', 'apoio.solicitado', 'atendimento.encerrado', 'cpu.notificado'])
    assert.equal(isLiveRelevant(flow(code)), true, code);
  assert.equal(isLiveRelevant(flow('login')), false);
  assert.equal(isLiveRelevant({ severity: 'medio', category: 'lentidao', message: 'lento' }), false);
  assert.equal(isLiveRelevant({ severity: 'alto', category: 'encerramento', message: 'falhou' }), true);
  assert.equal(isLiveRelevant(flow('login'), { all: true }), true);
});

test('formata hora local, tipo, cidade e mensagem numa linha', () => {
  const line = formatLiveEvent(flow('despacho.enviado', { message: 'Despachou 00004 para Dom Pedro.' }), { color: false });
  assert.match(line, /^20:10:00 +DESPACHO +Dom Pedro +Despachou 00004 para Dom Pedro\.$/);
});

test('lista atendimentos abertos do estado ordenados pelo início', () => {
  const state = { occurrences: {
    b: { protocol: '00005', cityName: 'Capinzal', origin: 'cpu', createdAt: '2026-11-17T22:50:00Z', phase: 'atendimento' },
    a: { protocol: '00004', cityName: 'Dom Pedro', origin: 'guarnicao', createdAt: '2026-11-17T22:47:00Z', phase: 'atendimento' },
    c: { protocol: '00006', cityName: 'X', createdAt: '2026-11-17T22:40:00Z', phase: 'despacho' },
  } };
  assert.deepEqual(openAttendances(state, Date.parse('2026-11-17T23:17:00Z')).map((o) => [o.protocol, o.minutes]), [['00004', 30], ['00005', 27]]);
});

test('descreve o evento em campos para o painel web', async () => {
  const { describeLiveEvent } = await import('../src/lib/live.js');
  assert.deepEqual(describeLiveEvent(flow('despacho.aceito', { message: 'Aceitou.' })), {
    t: '2026-11-17T23:10:00.000Z', time: '20:10:00', label: 'ACEITO', kind: 'fluxo', city: 'Dom Pedro', actor: 'SIM Cmt A Dom Pedro', message: 'Aceitou.',
  });
  assert.equal(describeLiveEvent({ t: '2026-11-17T23:10:00.000Z', severity: 'alto', category: 'erro-servidor', message: 'x' }).kind, 'alto');
});
