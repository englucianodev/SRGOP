import test from 'node:test';
import assert from 'node:assert/strict';
import { pickServiceUnit } from '../src/domain/service-cities.js';

const unit = (id) => ({ city: { _id: id, name: id } });
const UNITS = [unit('tuntum'), unit('dom-pedro'), unit('presidente-dutra')];
const teamsWith = (phases) => (cityId) => (phases[cityId] ? { phase: phases[cityId] } : undefined);

test('cidade cuja guarnição já entrou em serviço recebe chamados sem esperar as outras', () => {
  const teamFor = teamsWith({ tuntum: 'em-servico', 'dom-pedro': 'entrando', 'presidente-dutra': 'entrando' });
  for (const r of [0, 0.4, 0.99]) assert.equal(pickServiceUnit(UNITS, teamFor, () => r).city._id, 'tuntum');
});

test('guarnição ocupada em atendimento continua em serviço e sua cidade segue recebendo chamados', () => {
  const teamFor = teamsWith({ tuntum: 'entrando', 'dom-pedro': 'em-servico' });
  assert.equal(pickServiceUnit(UNITS, teamFor, () => 0).city._id, 'dom-pedro');
});

test('sorteia apenas entre as cidades em serviço', () => {
  const teamFor = teamsWith({ tuntum: 'em-servico', 'dom-pedro': 'saindo', 'presidente-dutra': 'em-servico' });
  assert.equal(pickServiceUnit(UNITS, teamFor, () => 0).city._id, 'tuntum');
  assert.equal(pickServiceUnit(UNITS, teamFor, () => 0.99).city._id, 'presidente-dutra');
});

test('sem nenhuma guarnição em serviço, nenhum chamado é gerado ainda', () => {
  const teamFor = teamsWith({ tuntum: 'entrando' });
  assert.equal(pickServiceUnit(UNITS, teamFor), null);
});
