import { describe, it, expect } from 'vitest';
import { crewSituation, operationCounters } from '../utils/operation';

const now = Date.parse('2026-11-18T12:00:00Z');
const end = '2026-11-19T11:00:00Z';
describe('operation utils', () => {
  it.each([
    [{ members: [], status: 'Disponível' }, 'fora'],
    [{ members: ['a'], status: 'Fora de serviço', shiftEnd: end }, 'fora'],
    [{ members: ['a'], status: 'Em atendimento', shiftEnd: '2026-11-18T11:00:00Z' }, 'expirado'],
    [{ members: ['a'], status: 'Em atendimento', shiftEnd: end }, 'atendimento'],
    [{ members: ['a'], status: 'Disponível', shiftStart: '2026-11-18T11:50:00Z', shiftEnd: end }, 'entrando'],
    [{ members: ['a'], status: 'Disponível', shiftStart: '2026-11-18T08:00:00Z', shiftEnd: end }, 'livre'],
  ])('situação %#', (crew, expected) => expect(crewSituation(crew, now)).toBe(expected));

  it('conta em serviço, em atendimento, livres e expirados', () => {
    const crews = [
      { members: [], status: 'Disponível' },
      { members: ['a'], status: 'Em atendimento', shiftEnd: '2026-11-18T11:00:00Z' },
      { members: ['a'], status: 'Em atendimento', shiftEnd: end },
      { members: ['a'], status: 'Disponível', shiftStart: '2026-11-18T11:50:00Z', shiftEnd: end },
      { members: ['a'], status: 'Disponível', shiftStart: '2026-11-18T08:00:00Z', shiftEnd: end },
    ];
    expect(operationCounters(crews, now)).toEqual({
      emServico: 4,
      emAtendimento: 1,
      livres: 1,
      expirados: 1,
    });
  });
});
