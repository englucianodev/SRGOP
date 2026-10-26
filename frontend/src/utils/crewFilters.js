import { isOnDuty } from './duty';
export const crewType = (crew) =>
  crew.type === 'Motocicleta' ||
  crew.shiftMode === 'Motocicleta' ||
  crew.vehicle?.type === 'Motocicleta'
    ? 'Motocicleta'
    : 'Viatura Convencional';
export const gpsState = (crew, now = Date.now()) =>
  !Number.isFinite(crew.location?.latitude) || !Number.isFinite(crew.location?.longitude)
    ? 'none'
    : isOnDuty(crew, now) &&
        crew.location?.sharing &&
        now - +new Date(crew.location.locatedAt) < 60000
      ? 'live'
      : 'stale';
const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function filterCrews(crews, filters = {}, now = Date.now()) {
  return crews.filter((c) => {
    const count = c.members.length;
    return (
      (!filters.search ||
        normalize(
          [
            c.name,
            c.city?.name,
            c.vehicle?.prefix,
            ...c.members.map((m) => `${m.rank || ''} ${m.callSign || m.name}`),
          ].join(' '),
        ).includes(normalize(filters.search))) &&
      (!filters.crew || c._id === filters.crew) &&
      (!filters.city || c.city?._id === filters.city) &&
      (!filters.duty || (filters.duty === 'on') === isOnDuty(c, now)) &&
      (!filters.count || (filters.count === '5+' ? count >= 5 : count === Number(filters.count))) &&
      (!filters.type || crewType(c) === filters.type) &&
      (!filters.status || c.status === filters.status) &&
      (!filters.gps || gpsState(c, now) === filters.gps)
    );
  });
}
