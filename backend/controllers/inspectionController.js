import { VehicleHandover, Vehicle, Crew } from '../models/index.js';
import { transaction, expireShifts } from '../services/operations.js';
import { refreshInspectionHold } from '../services/vehicleInspections.js';
import { audit } from '../services/audit.js';
import { changed } from '../services/realtime.js';
import { requireValue } from '../utils/errors.js';
import { mileageFilter } from '../utils/mileage.js';
import mongoose from 'mongoose';
export async function defaults(req, res) {
  requireValue(mongoose.isValidObjectId(req.query.vehicle), 'Viatura inválida.', 422);
  const vehicle = await Vehicle.findById(req.query.vehicle);
  requireValue(vehicle, 'Viatura não encontrada.', 404);
  const [received, delivered] = await Promise.all([
    VehicleHandover.findOne({ vehicle: vehicle._id, 'intake.at': { $exists: true } })
      .sort({ 'intake.at': -1 })
      .select('intake'),
    VehicleHandover.findOne({ vehicle: vehicle._id, 'delivery.at': { $exists: true } })
      .sort({ 'delivery.at': -1 })
      .select('delivery'),
  ]);
  const latest = [received?.intake, delivered?.delivery]
    .filter(Boolean)
    .sort((a, b) => +b.at - +a.at)[0];
  res.json({ mileage: vehicle.mileage, inspection: latest || null });
}
export async function pending(req, res) {
  await expireShifts();
  res.json(
    await VehicleHandover.find({
      driver: req.user._id,
      closedAt: null,
      $or: [{ pendingReturn: true }, { pendingIntake: true }],
    })
      .populate('vehicle', 'prefix plate mileage brand model')
      .populate('crew', 'name')
      .sort({ createdAt: 1 }),
  );
}
export async function complete(req, res) {
  await transaction(async (session) => {
    const record = await VehicleHandover.findOne({
      _id: req.params.id,
      driver: req.user._id,
      closedAt: null,
    }).session(session);
    requireValue(
      record && (record.pendingReturn || record.pendingIntake),
      'Checklist pendente não encontrado para este motorista.',
      404,
    );
    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: record.vehicle, ...mileageFilter(req.user, req.input.mileage) },
      { mileage: req.input.mileage },
      { new: true, session },
    );
    requireValue(vehicle, 'O KM atual deve ser maior ou igual ao último KM registrado.', 409);
    if (record.pendingIntake) {
      requireValue(
        !(await VehicleHandover.exists({
          vehicle: record.vehicle,
          _id: { $ne: record._id },
          pendingReturn: true,
          closedAt: null,
        }).session(session)),
        'Aguarde o motorista anterior registrar a entrega.',
        409,
      );
      record.intake = req.input;
      record.pendingIntake = false;
    } else {
      record.delivery = req.input;
      record.pendingReturn = false;
      record.closedAt = new Date();
      await Crew.updateOne(
        { _id: record.crew, driver: req.user._id },
        { driver: null },
        { session },
      );
    }
    await record.save({ session });
    await refreshInspectionHold(record.vehicle, session);
    await audit(
      req.user,
      record.closedAt ? 'Entrega de viatura' : 'Recebimento de viatura',
      'VehicleHandover',
      record._id,
      `${req.input.mileage} km`,
      session,
    );
  });
  const record = await VehicleHandover.findById(req.params.id);
  const crew = await Crew.findById(record.crew);
  changed('crews', [req.user._id, ...(crew?.members || [])]);
  res.json({ message: 'Checklist registrado.' });
}
export async function history(req, res) {
  res.json(
    await VehicleHandover.find({ vehicle: req.params.id })
      .populate('driver', 'name callSign rank')
      .populate('crew', 'name')
      .sort({ createdAt: -1 })
      .limit(100),
  );
}
