import { Crew, DailyOfficer } from '../models/index.js';
import { activeDuty } from '../utils/duty.js';
import { serviceWindow } from '../utils/time.js';

export async function inactivityPolicy(user, settings) {
  const offDutyInactivityMinutes = settings?.inactivityMinutes || 5;
  const duty = serviceWindow();
  const [crew, cpu] = await Promise.all([
    user.crew
      ? Crew.findOne({ _id: user.crew, members: user._id, ...activeDuty() }).select(
          'shiftMode shiftEnd',
        )
      : null,
    user.role === 'Oficial' ? DailyOfficer.exists({ officer: user._id, day: duty.day }) : null,
  ]);
  const onDuty = Boolean(crew || cpu);
  const ends = [crew?.shiftEnd, cpu ? duty.end : null].filter(Boolean);
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
