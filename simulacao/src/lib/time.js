// Same rule as backend/utils/time.js: the service runs from 08:00 to 08:00 in
// America/Fortaleza (UTC-3, no daylight saving time).
const OFFSET_MS = -3 * 3600000;
const SHIFT_START_MS = 8 * 3600000;
const DAY_MS = 86400000;

export const TEAMS = Object.freeze(['A', 'B', 'C']);

/** Day ("YYYY-MM-DD") of the service that is running at `date`. */
export function serviceDay(date = new Date()) {
  return new Date(+date + OFFSET_MS - SHIFT_START_MS).toISOString().slice(0, 10);
}

export const serviceStart = (day) => new Date(`${day}T08:00:00-03:00`);

export const nextServiceStart = (date = new Date()) =>
  new Date(+serviceStart(serviceDay(date)) + DAY_MS);

/** Rotation A → B → C → A, fixed by the calendar so that a restart keeps the same team. */
export function teamFor(day) {
  const index = Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS) % TEAMS.length;
  return TEAMS[(index + TEAMS.length) % TEAMS.length];
}

export const officerIndexFor = (day) => TEAMS.indexOf(teamFor(day));

export const localTime = (date = new Date()) =>
  new Date(+date + OFFSET_MS).toISOString().slice(11, 16);

export const localDateTime = (date = new Date()) =>
  new Date(+date + OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
