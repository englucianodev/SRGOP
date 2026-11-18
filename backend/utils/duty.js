export const onDuty = (crew, now = Date.now()) =>
  Boolean(
    crew?.members?.length &&
    crew.status !== 'Fora de serviço' &&
    ((crew.shiftMode === 'Motocicleta' && !crew.shiftEnd) || +new Date(crew.shiftEnd) > now),
  );
export const activeDuty = () => ({
  $expr: {
    $and: [
      { $ne: ['$status', 'Fora de serviço'] },
      { $gt: [{ $size: { $ifNull: ['$members', []] } }, 0] },
      {
        $or: [
          { $gt: ['$shiftEnd', new Date()] },
          {
            $and: [
              { $eq: ['$shiftMode', 'Motocicleta'] },
              { $eq: [{ $ifNull: ['$shiftEnd', null] }, null] },
            ],
          },
        ],
      },
    ],
  },
});
export const roundHour = (date) => new Date(Math.round(+new Date(date) / 3600000) * 3600000);
/**
 * Crews on duty, or past the shift end while still holding an accepted attendance (their
 * `currentOccurrence` stays set and releaseCrew resets status when the attendance closes).
 * Dispatch and accept must keep using plain activeDuty().
 */
export const onDutyOrAttending = () => ({
  $or: [
    activeDuty(),
    { 'members.0': { $exists: true }, status: 'Em atendimento', currentOccurrence: { $ne: null } },
  ],
});
export const gpsAllowed = onDutyOrAttending;
export const attendingPastShift = (crew) =>
  Boolean(crew?.members?.length && crew.status === 'Em atendimento' && crew.currentOccurrence);
