import { Attendance } from '../models/index.js';
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
