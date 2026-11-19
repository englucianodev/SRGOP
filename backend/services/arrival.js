import { Attendance, Occurrence } from '../models/index.js';
import { requireValue } from '../utils/errors.js';
import { audit } from './audit.js';
import { attendanceChanged } from './realtime.js';
import { getOccurrence, canAttend, history, transaction } from './operations.js';
// Registers the arrival at the scene, splitting travel time from on-scene time in the reports.
// It is optional: an attendance can be closed without it.
export async function arriveOccurrence(actor, id) {
  const occurrence = await transaction(async (session) => {
    const row = await getOccurrence(id, session);
    await canAttend(actor, row, session);
    requireValue(
      row.status === 'Em atendimento',
      'Atendimento não está ativo.',
      409,
      'Atendimento',
    );
    requireValue(!row.arrivedAt, 'Chegada ao local já registrada.', 409, 'Atendimento');
    row.arrivedAt = new Date();
    row.history.push(history(actor, 'Chegada ao local'));
    await row.save({ session });
    await Attendance.updateOne(
      { occurrence: row._id, status: 'Em atendimento' },
      { $set: { arrivedAt: row.arrivedAt } },
      { session, runValidators: true },
    );
    await audit(actor, 'Chegada ao local', 'Occurrence', row._id, '', session);
    return row;
  });
  attendanceChanged(occurrence);
  return occurrence;
}

export const ARRIVAL_RADIUS_M = 150;
// Fixes less precise than this could place a crew still on the way "at the scene".
export const MAX_ARRIVAL_ACCURACY_M = 100;
const EARTH_RADIUS_M = 6371000;
const rad = (degrees) => (degrees * Math.PI) / 180;

/** Great-circle (haversine) distance in meters between two { latitude, longitude } points. */
export function distanceMeters(a, b) {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Registers the arrival by itself when the crew's shared GPS reaches the scene of its active
 * attendance. Returns the occurrence when it registered the arrival, null otherwise.
 */
export async function arriveByGps(actor, crew) {
  const point = crew.location;
  if (!point?.sharing || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))
    return null;
  if (!(point.accuracy <= MAX_ARRIVAL_ACCURACY_M)) return null;
  const row = await Occurrence.findOne({
    crew: crew._id,
    status: 'Em atendimento',
    deleted: false,
    arrivedAt: null,
    latitude: { $ne: null },
    longitude: { $ne: null },
  });
  if (!row) return null;
  const meters = distanceMeters(row, point);
  if (meters > ARRIVAL_RADIUS_M) return null;
  const arrivedAt = new Date();
  const detail = `Registrada automaticamente pelo GPS da guarnição (${Math.round(meters)} m do local).`;
  // Conditional update: a manual arrival or a concurrent point registered first wins.
  const occurrence = await Occurrence.findOneAndUpdate(
    { _id: row._id, status: 'Em atendimento', arrivedAt: null },
    { $set: { arrivedAt }, $push: { history: history(actor, 'Chegada ao local', detail) } },
    { new: true },
  );
  if (!occurrence) return null;
  await Attendance.updateOne(
    { occurrence: row._id, status: 'Em atendimento' },
    { $set: { arrivedAt } },
    { runValidators: true },
  );
  await audit(actor, 'Chegada ao local', 'Occurrence', row._id, detail);
  attendanceChanged(occurrence);
  return occurrence;
}
