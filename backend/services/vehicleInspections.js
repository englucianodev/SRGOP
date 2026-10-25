import { Vehicle, VehicleHandover, Crew } from '../models/index.js';
import { requireValue } from '../utils/errors.js';
import { audit } from './audit.js';
import { inspectionSchema } from '../middlewares/validation.js';
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
      mileage: { $lte: parsed.data.mileage },
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
export async function requireDriverReturn(crew, reason, session, driver = crew.driver) {
  if (!crew.vehicle || !driver) return;
  let record = await VehicleHandover.findOne({ crew: crew._id, driver, closedAt: null }).session(
    session,
  );
  if (record?.pendingIntake && !record.intake) {
    record.pendingIntake = false;
    record.closedAt = new Date();
    record.reason = 'Designação encerrada antes do recebimento da viatura.';
    await record.save({ session });
    crew.inspectionBlocked = Boolean(
      await VehicleHandover.exists({
        vehicle: crew.vehicle,
        closedAt: null,
        pendingReturn: true,
      }).session(session),
    );
    await refreshInspectionHold(crew.vehicle, session);
    return;
  }
  if (!record)
    [record] = await VehicleHandover.create(
      [
        {
          crew: crew._id,
          shift: crew.shift,
          vehicle: crew.vehicle,
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
    { _id: crew.vehicle },
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
  await Crew.updateMany({ vehicle: vehicleId }, { inspectionBlocked: false }, { session });
  const crew = await Crew.findOne({
    vehicle: vehicleId,
    'members.0': { $exists: true },
    status: { $ne: 'Fora de serviço' },
  }).session(session);
  await Vehicle.updateOne(
    { _id: vehicleId, inspectionHold: true },
    { inspectionHold: false, status: crew ? 'Em operação' : 'Disponível' },
    { session },
  );
}
