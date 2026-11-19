import { chance, intBetween, pick } from '../lib/random.js';

const ITEMS = ['body', 'electrical', 'suspension', 'tires', 'brakes', 'engine'];
const FINDINGS = {
  body: 'Pequeno amassado no para-choque traseiro.',
  electrical: 'Luz de placa traseira queimada.',
  suspension: 'Ruído na suspensão dianteira em pista irregular.',
  tires: 'Pneu dianteiro esquerdo com desgaste acentuado.',
  brakes: 'Pedal de freio levemente baixo.',
  engine: 'Nível de óleo próximo do mínimo.',
};

/** Vehicle checklist as the driver fills it: mostly "S/A", sometimes one finding "C/A". */
export function buildChecklist(mileage, rng = Math.random) {
  const flagged = chance(0.08, rng) ? pick(ITEMS, rng) : null;
  return {
    mileage: Math.round(mileage),
    ...Object.fromEntries(
      ITEMS.map((item) => [
        item,
        item === flagged ? { state: 'C/A', observation: FINDINGS[item] } : { state: 'S/A', observation: '' },
      ]),
    ),
  };
}

/** Kilometres driven in a 24 h shift in the interior of Maranhão. */
export const shiftDistance = (rng = Math.random) => intBetween(40, 220, rng);
