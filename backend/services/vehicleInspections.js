import { Vehicle, VehicleHandover, Crew } from '../models/index.js';
import { requireValue } from '../utils/errors.js';
import { audit } from './audit.js';
import { inspectionSchema } from '../middlewares/validation.js';
import { mileageFilter } from '../utils/mileage.js';
export async function recordIntake(actor, crew, checklist, session) {
  const parsed = inspectionSchema.safeParse(checklist);
  requireValue(
    parsed.success,
    'O motorista deve preencher todo o checklist de recebimento e informar o KM atual. Alterações C/A exigem observação.',
    422,
  );
  requireValue(
    !(await VehicleHandover.exists({ vehicle: crew.vehicle, closedAt: null }).session(session)),
    'A entrega anterior da viatura ainda está pendente.',
    409,
  );
  const vehicle = await Vehicle.findOneAndUpdate(
    {
      _id: crew.vehicle,
      provisional: { $ne: true },
      inspectionHold: { $ne: true },
      ...mileageFilter(actor, parsed.data.mileage),
    },
    { mileage: parsed.data.mileage, lastDriver: actor._id },
    { new: true, session },
  );
  requireValue(
    vehicle,
    'Viatura provisória, com entrega pendente ou KM menor que o último registro.',
    409,
  );
  const [record] = await VehicleHandover.create(
    [
      {
        crew: crew._id,
        shift: crew.shift,
        vehicle: crew.vehicle,
        driver: actor._id,
        intake: parsed.data,
      },
    ],
    { session },
  );
  await audit(
    actor,
    'Recebimento de viatura',
    'VehicleHandover',
    record._id,
    `${vehicle.prefix}: ${parsed.data.mileage} km`,
    session,
  );
  return record;
}
export async function requireDriverReturn(
  crew,
  reason,
  session,
  driver = crew.driver,
  vehicleId = crew.vehicle,
) {
  if (crew.shiftMode === 'Motocicleta' && arguments.length < 5) {
    const records = await VehicleHandover.find({
      crew: crew._id,
      closedAt: null,
      ...(arguments.length >= 4 ? { driver } : {}),
    }).session(session);
    for (const record of records)
      await requireDriverReturn(crew, reason, session, record.driver, record.vehicle);
    return;
  }
  if (!vehicleId || !driver) return;
  let record = await VehicleHandover.findOne({
    crew: crew._id,
    driver,
    vehicle: vehicleId,
    closedAt: null,
  }).session(session);
  if (record?.pendingIntake && !record.intake) {
    record.pendingIntake = false;
    record.closedAt = new Date();
    record.reason = 'Designação encerrada antes do recebimento da viatura.';
    await record.save({ session });
    crew.inspectionBlocked = Boolean(
      await VehicleHandover.exists({
        vehicle: vehicleId,
        closedAt: null,
        pendingReturn: true,
      }).session(session),
    );
    await refreshInspectionHold(vehicleId, session);
    return;
  }
  if (!record)
    [record] = await VehicleHandover.create(
      [
        {
          crew: crew._id,
          shift: crew.shift,
          vehicle: vehicleId,
          driver,
          reason: 'Motorista anterior à implantação do checklist.',
        },
      ],
      { session },
    );
  record.pendingReturn = true;
  record.pendingIntake = false;
  record.reason = reason;
  await record.save({ session });
  crew.inspectionBlocked = true;
  await Vehicle.updateOne(
    { _id: vehicleId },
    { inspectionHold: true, status: 'Indisponível' },
    { session },
  );
}
export async function refreshInspectionHold(vehicleId, session) {
  const pending = await VehicleHandover.exists({
    vehicle: vehicleId,
    closedAt: null,
    $or: [{ pendingReturn: true }, { pendingIntake: true }],
  }).session(session);
  if (pending) return;
  const linked = await Vehicle.findById(vehicleId).session(session);
  const linkedCrews = await Crew.find({
    $or: [{ vehicle: vehicleId }, ...(linked?.crew ? [{ _id: linked.crew }] : [])],
  }).session(session);
  for (const linkedCrew of linkedCrews) {
    const crewPending = await VehicleHandover.exists({
      crew: linkedCrew._id,
      closedAt: null,
      $or: [{ pendingReturn: true }, { pendingIntake: true }],
    }).session(session);
    if (!crewPending)
      await Crew.updateOne({ _id: linkedCrew._id }, { inspectionBlocked: false }, { session });
  }
  const activeRecord = await VehicleHandover.findOne({
    vehicle: vehicleId,
    closedAt: null,
  }).session(session);
  const crew = await Crew.findOne({
    $or: [{ vehicle: vehicleId }, ...(activeRecord ? [{ _id: activeRecord.crew }] : [])],
    'members.0': { $exists: true },
    status: { $ne: 'Fora de serviço' },
  }).session(session);
  await Vehicle.updateOne(
    { _id: vehicleId, inspectionHold: true },
    { inspectionHold: false, status: crew ? 'Em operação' : 'Disponível' },
    { session },
  );
  if (linked?.type === 'Motocicleta') {
    const open = await VehicleHandover.exists({ vehicle: vehicleId, closedAt: null }).session(
      session,
    );
    if (!open && !(await Crew.exists({ vehicle: vehicleId }).session(session)))
      await Vehicle.updateOne(
        { _id: vehicleId },
        { crew: null, status: 'Disponível', inspectionHold: false },
        { session },
      );
  }
}
