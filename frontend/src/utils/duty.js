import { duration } from './format';
export const isOnDuty = (crew, now = Date.now()) =>
  Boolean(
    crew?.members?.length &&
    crew.status !== 'Fora de serviço' &&
    ((crew.shiftMode === 'Motocicleta' && !crew.shiftEnd) || +new Date(crew.shiftEnd) > now),
  );
export const dutyClock = (crew, now = Date.now()) =>
  crew?.shiftMode === 'Motocicleta'
    ? `${crew.dutyPeriod || 'Motocicleta'} · ${duration((now - +new Date(crew.shiftStart)) / 1000)} em serviço`
    : duration((+new Date(crew?.shiftEnd) - now) / 1000);
