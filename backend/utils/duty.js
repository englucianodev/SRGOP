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
