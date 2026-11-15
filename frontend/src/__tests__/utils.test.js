import { describe, expect, it } from 'vitest';
import { crewType, filterCrews, gpsState } from '../utils/crewFilters';
import { isMobileDevice } from '../utils/device';
import { dutyClock, isOnDuty } from '../utils/duty';
import {
  dateKey,
  duration,
  fmtDate,
  fmtDateTime,
  fmtTime,
  initials,
  localInput,
  objectId,
  params,
} from '../utils/format';
import { formatPhone } from '../utils/phone';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const inHours = (h) => new Date(NOW + h * 3600000).toISOString();

const crew = (overrides = {}) => ({
  _id: 'c1',
  name: 'Guarnição Alfa',
  status: 'Disponível',
  shiftEnd: inHours(4),
  city: { _id: 'city1', name: 'São Luís' },
  vehicle: { prefix: 'VTR-01', type: 'Viatura' },
  members: [{ rank: 'Sd', callSign: 'Silva' }],
  location: { latitude: -2.5, longitude: -44.3, sharing: true, locatedAt: new Date(NOW - 10000) },
  ...overrides,
});

describe('format', () => {
  it('formats duration as HH:MM:SS and clamps negatives to zero', () => {
    expect(duration(3725)).toBe('01:02:05');
    expect(duration(-50)).toBe('00:00:00');
    expect(duration(undefined)).toBe('00:00:00');
  });

  it('formats dates in the Fortaleza timezone and falls back to a dash', () => {
    expect(fmtDate('2026-11-15T02:00:00Z')).toBe('14/11/2026');
    expect(fmtTime('2026-11-15T12:30:00Z')).toBe('09:30');
    expect(fmtDateTime('2026-11-15T12:30:00Z')).toBe('15/11/2026 às 09:30');
    expect(fmtDate(null)).toBe('—');
    expect(fmtTime('')).toBe('—');
    expect(fmtDateTime(undefined)).toBe('—');
  });

  it('builds a datetime-local value and a YYYY-MM-DD date key', () => {
    expect(localInput('2026-11-15T12:30:00')).toBe('2026-11-15T12:30');
    expect(dateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('drops empty values from query params', () => {
    expect(params({ a: 1, b: '', c: null, d: undefined, e: 'x y' })).toBe('a=1&e=x+y');
  });

  it('extracts object ids and initials', () => {
    expect(objectId({ _id: 'abc' })).toBe('abc');
    expect(objectId('raw')).toBe('raw');
    expect(objectId(null)).toBe('');
    expect(initials('maria  da silva')).toBe('MD');
    expect(initials(undefined)).toBe('');
  });
});

describe('formatPhone', () => {
  it('masks progressively and caps at 11 digits', () => {
    expect(formatPhone('')).toBe('');
    expect(formatPhone('9')).toBe('(9');
    expect(formatPhone('98')).toBe('(98');
    expect(formatPhone('98987')).toBe('(98)987');
    expect(formatPhone('98987654321999')).toBe('(98)98765-4321');
    expect(formatPhone('(98) 98765-4321')).toBe('(98)98765-4321');
  });
});

describe('isMobileDevice', () => {
  it('detects mobile devices from user agent data, user agent and iPadOS', () => {
    expect(isMobileDevice(null)).toBe(false);
    expect(isMobileDevice({ userAgentData: { mobile: true } })).toBe(true);
    expect(isMobileDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' })).toBe(true);
    expect(isMobileDevice({ platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isMobileDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32' })).toBe(
      false,
    );
  });
});

describe('duty', () => {
  it('is on duty only with members, a future shift end and not off duty', () => {
    expect(isOnDuty(crew(), NOW)).toBe(true);
    expect(isOnDuty(crew({ members: [] }), NOW)).toBe(false);
    expect(isOnDuty(crew({ status: 'Fora de serviço' }), NOW)).toBe(false);
    expect(isOnDuty(crew({ shiftEnd: inHours(-1) }), NOW)).toBe(false);
    expect(isOnDuty(null, NOW)).toBe(false);
  });

  it('keeps motorcycle shifts open without a shift end', () => {
    expect(isOnDuty(crew({ shiftMode: 'Motocicleta', shiftEnd: null }), NOW)).toBe(true);
  });

  it('shows remaining time for regular shifts and elapsed time for motorcycles', () => {
    expect(dutyClock(crew({ shiftEnd: inHours(2) }), NOW)).toBe('02:00:00');
    expect(
      dutyClock({ shiftMode: 'Motocicleta', dutyPeriod: 'Diurno', shiftStart: inHours(-1.5) }, NOW),
    ).toBe('Diurno · 01:30:00 em serviço');
  });
});

describe('crewFilters', () => {
  it('classifies crew type', () => {
    expect(crewType(crew())).toBe('Viatura Convencional');
    expect(crewType(crew({ shiftMode: 'Motocicleta' }))).toBe('Motocicleta');
    expect(crewType(crew({ vehicle: { type: 'Motocicleta' } }))).toBe('Motocicleta');
  });

  it('classifies GPS state as live, stale or none', () => {
    expect(gpsState(crew(), NOW)).toBe('live');
    expect(gpsState(crew({ location: { ...crew().location, sharing: false } }), NOW)).toBe('stale');
    expect(
      gpsState(crew({ location: { ...crew().location, locatedAt: new Date(NOW - 61000) } }), NOW),
    ).toBe('stale');
    expect(gpsState(crew({ location: null }), NOW)).toBe('none');
  });

  it('searches accent-insensitively across name, city, prefix and members', () => {
    const crews = [crew(), crew({ _id: 'c2', name: 'Bravo', city: { _id: 'x', name: 'Caxias' } })];
    expect(filterCrews(crews, { search: 'sao luis' }, NOW).map((c) => c._id)).toEqual(['c1']);
    expect(filterCrews(crews, { search: 'vtr-01' }, NOW)).toHaveLength(2);
    expect(filterCrews(crews, { search: 'SD SILVA' }, NOW)).toHaveLength(2);
    expect(filterCrews(crews, {}, NOW)).toHaveLength(2);
  });

  it('applies every structured filter', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ name: `M${i}` }));
    const crews = [
      crew(),
      crew({ _id: 'c2', members: five, status: 'Em atendimento', shiftEnd: inHours(-1) }),
    ];
    const ids = (filters) => filterCrews(crews, filters, NOW).map((c) => c._id);
    expect(ids({ crew: 'c2' })).toEqual(['c2']);
    expect(ids({ city: 'city1' })).toEqual(['c1', 'c2']);
    expect(ids({ duty: 'on' })).toEqual(['c1']);
    expect(ids({ duty: 'off' })).toEqual(['c2']);
    expect(ids({ count: '1' })).toEqual(['c1']);
    expect(ids({ count: '5+' })).toEqual(['c2']);
    expect(ids({ type: 'Motocicleta' })).toEqual([]);
    expect(ids({ status: 'Em atendimento' })).toEqual(['c2']);
    expect(ids({ gps: 'stale' })).toEqual(['c2']);
  });
});
