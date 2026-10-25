export const mileageFilter = (actor, value) =>
  actor.role === 'Administrativo' ? {} : { mileage: { $lte: value } };
