import { Crew } from '../models/index.js';
import { onDutyOrAttending } from '../utils/duty.js';
import { CpuShift } from '../models/index.js';
import { cpuDutyEnd } from './cpuShift.js';

const HOUR_MS = 3600000;
/** Longest a session can ever last; also the lifetime of the signed token. */
export const SESSION_MAX_MS = 7 * 24 * HOUR_MS;
export const SESSION_DEFAULT_MS = 12 * HOUR_MS;
// Time after the shift to hand over the vehicle and finish the checklist.
const DUTY_GRACE_MS = HOUR_MS;
// Shifts without a fixed end (motorcycles) slide: renewed when less than 6 h remain.
const OPEN_SHIFT_RENEW_BELOW_MS = 6 * HOUR_MS;
const OPEN_SHIFT_RENEW_TO_MS = 12 * HOUR_MS;

/**
 * New expiry for the session of someone on duty, so a 24 h shift is not cut by the 12 h
 * session. Returns null when there is nothing to extend; it never shortens a session.
 */
export function dutySessionExpiry(policy, expiresAt, limit, now = Date.now()) {
  if (!policy?.onDuty) return null;
  const open = +expiresAt - now < OPEN_SHIFT_RENEW_BELOW_MS ? now + OPEN_SHIFT_RENEW_TO_MS : 0;
  const target = Math.min(policy.dutyEndsAt ? +policy.dutyEndsAt + DUTY_GRACE_MS : open, limit);
  return target > +expiresAt ? new Date(target) : null;
}

const openCpu = (user) =>
  CpuShift.findOne({ status: 'Aberto', officer: user._id }).select('plannedEnd');

export async function inactivityPolicy(user, settings) {
  const offDutyInactivityMinutes = settings?.inactivityMinutes || 5;
  const [crew, cpu] = await Promise.all([
    user.crew
      ? Crew.findOne({ _id: user.crew, members: user._id, ...onDutyOrAttending() }).select(
          'shiftMode shiftEnd',
        )
      : null,
    user.role === 'Oficial' ? openCpu(user) : null,
  ]);
  const onDuty = Boolean(crew || cpu);
  // Attending past the shift end: keep the session alive for another hour, renewed on each check.
  const crewEnd =
    crew?.shiftEnd && +crew.shiftEnd <= Date.now()
      ? new Date(Date.now() + DUTY_GRACE_MS)
      : crew?.shiftEnd;
  const ends = [crewEnd, cpu ? cpuDutyEnd(cpu) : null].filter(Boolean);
  const dutyEndsAt =
    crew?.shiftMode === 'Motocicleta' && !crew.shiftEnd
      ? null
      : ends.length
        ? new Date(Math.max(...ends.map((value) => +value)))
        : null;
  return {
    onDuty,
    inactivityMinutes: onDuty ? settings?.onDutyInactivityMinutes || 360 : offDutyInactivityMinutes,
    offDutyInactivityMinutes,
    dutyEndsAt,
  };
}
