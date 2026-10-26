import { activeDuty, onDuty } from '../utils/duty.js';
import { mileageFilter } from '../utils/mileage.js';
import bcrypt from 'bcryptjs';
import {
  User,
  City,
  Crew,
  Vehicle,
  Session,
  AuditLog,
  Occurrence,
  SystemSetting,
  DailyOfficer,
  SupportRequest,
  Notification,
  Attendance,
  CrewShift,
  Dispatch,
  VehicleHandover,
} from '../models/index.js';
import { requireValue } from '../utils/errors.js';
import { audit } from '../services/audit.js';
import { changed, disconnectUser, serviceChanged } from '../services/realtime.js';
import { transaction } from '../services/operations.js';
import { dayKey, dayRange, serviceWindow } from '../utils/time.js';
import { notifyPendingForCpu } from '../services/pendingDispatch.js';
const validCity = async (city, session) =>
  requireValue(
    await City.exists({ _id: city, active: true }).session(session || null),
    'Município não cadastrado ou inativo.',
    422,
  );
export async function listUsers(req, res) {
  res.json(
    await User.find()
      .populate('city', 'name')
      .populate('crew', 'name')
      .sort({ createdAt: -1 })
      .limit(1000),
  );
}
export async function saveUser(req, res) {
  const result = await transaction(async (session) => {
    const v = { ...req.input };
    await validCity(v.city, session);
    let user = req.params.id ? await User.findById(req.params.id).session(session) : null;
    if (req.params.id) requireValue(user, 'Usuário não encontrado.', 404);
    requireValue(
      !user ||
        String(user._id) !== String(req.user._id) ||
        (v.active && v.role === 'Administrativo'),
      'Não é permitido desativar ou remover seu próprio acesso administrativo.',
      409,
    );
    requireValue(
      !user?.crew || (v.active && v.role === user.role && String(v.city) === String(user.city)),
      'Encerre o turno antes de alterar perfil, cidade ou ativação do integrante.',
      409,
    );
    if (user && (!v.active || v.role !== user.role))
      requireValue(
        !(await Attendance.exists({ acceptedBy: user._id, status: 'Em atendimento' }).session(
          session,
        )),
        'Conclua o atendimento do usuário antes de alterar seu acesso.',
        409,
      );
    if (v.password) v.password = await bcrypt.hash(v.password, 12);
    else requireValue(user, 'Informe uma senha de ao menos dez caracteres.', 422);
    if (user) {
      Object.assign(user, v);
      await user.save({ session });
      await Session.deleteMany({ user: user._id }, { session });
    } else {
      [user] = await User.create([v], { session });
    }
    await audit(
      req.user,
      req.params.id ? 'Edição de usuário' : 'Cadastro de usuário',
      'User',
      user._id,
      `Perfil: ${v.role}; ativo: ${v.active}`,
      session,
    );
    return user;
  });
  disconnectUser(result._id);
  changed('users');
  if (result.role === 'Oficial') serviceChanged();
  res.status(req.params.id ? 200 : 201).json(result);
}
export async function removeUser(req, res) {
  requireValue(
    req.params.id !== String(req.user._id),
    'Você não pode excluir seu próprio usuário.',
    409,
  );
  await transaction(async (session) => {
    const row = await User.findById(req.params.id).session(session);
    requireValue(row, 'Usuário não encontrado.', 404);
    requireValue(!row.crew, 'Encerre o turno antes de excluir este usuário.', 409);
    requireValue(
      !(await Attendance.exists({ acceptedBy: row._id, status: 'Em atendimento' }).session(
        session,
      )),
      'Conclua o atendimento antes de desativar o usuário.',
      409,
    );
    row.active = false;
    await row.save({ session });
    await Session.deleteMany({ user: row._id }, { session });
    await audit(req.user, 'Exclusão lógica de usuário', 'User', row._id, '', session);
  });
  disconnectUser(req.params.id);
  changed('users');
  res.json({ message: 'Usuário desativado; vínculos históricos preservados.' });
}
export async function listCrews(req, res) {
  const crews = await Crew.find()
    .populate('city', 'name latitude longitude')
    .populate(
      'vehicle',
      'prefix plate latitude longitude brand model year type mileage provisional',
    )
    .populate('members driver', 'name role rank callSign')
    .populate('motorcycleSeats.member', 'name rank callSign')
    .populate('motorcycleSeats.vehicle', 'prefix plate mileage type')
    .sort({ name: 1 })
    .lean();
  const records = await VehicleHandover.find({ closedAt: null, intake: { $exists: true } })
    .populate('driver', 'name rank callSign')
    .populate('vehicle', 'prefix mileage type')
    .lean();
  res.json(
    crews.map((c) => ({
      ...c,
      motorcycleDrivers: records
        .filter((r) => String(r.crew) === String(c._id) && r.vehicle?.type === 'Motocicleta')
        .map((r) => ({ driver: r.driver, vehicle: r.vehicle })),
    })),
  );
}
export async function motorcycles(req, res) {
  const crew = await Crew.findById(req.params.id);
  requireValue(crew, 'Guarnição não encontrada.', 404);
  const records = await VehicleHandover.find({ closedAt: null }).select(
    'crew driver vehicle intake',
  );
  const outside = records.filter((r) => String(r.crew) !== String(crew._id)).map((r) => r.vehicle);
  const seats = [...crew.motorcycleSeats];
  for (const r of records.filter(
    (r) =>
      String(r.crew) === String(crew._id) &&
      r.intake &&
      crew.members.some((m) => String(m) === String(r.driver)),
  ))
    if (!seats.some((s) => String(s.member) === String(r.driver)))
      seats.push({ member: r.driver, vehicle: r.vehicle, role: 'Piloto' });
  const vehicles = await Vehicle.find({
    city: crew.city,
    type: 'Motocicleta',
    provisional: { $ne: true },
    inspectionHold: { $ne: true },
    status: { $in: ['Disponível', 'Em operação'] },
    _id: { $nin: outside },
    $or: [{ crew: null }, { crew: crew._id }],
  })
    .select('prefix plate mileage brand model')
    .lean();
  res.json(
    vehicles.map((v) => {
      const occupants = seats.filter((s) => String(s.vehicle) === String(v._id));
      return {
        ...v,
        pilotOccupied: occupants.some((s) => s.role === 'Piloto'),
        passengerOccupied: occupants.some((s) => s.role === 'Garupa'),
        occupants: occupants.length,
      };
    }),
  );
}
export async function correctMileage(req, res) {
  await transaction(async (session) => {
    const vehicle = await Vehicle.findById(req.params.id).session(session);
    requireValue(vehicle, 'Viatura não encontrada.', 404);
    const previous = vehicle.mileage;
    vehicle.mileage = req.input.mileage;
    await vehicle.save({ session });
    await audit(
      req.user,
      'Correção administrativa de KM',
      'Vehicle',
      vehicle._id,
      `${previous} → ${vehicle.mileage} km`,
      session,
    );
  });
  changed('vehicles');
  res.json({ message: 'Quilometragem corrigida.' });
}
export async function saveCrew(req, res) {
  const crew = await transaction(async (session) => {
    await validCity(req.input.city, session);
    let row = req.params.id ? await Crew.findById(req.params.id).session(session) : new Crew();
    requireValue(row, 'Guarnição não encontrada.', 404);
    requireValue(
      !row.currentOccurrence && !row.members.length,
      'Encerre o turno e os atendimentos antes de editar a guarnição.',
      409,
    );
    if (req.input.vehicle === undefined)
      req.input.vehicle = row.vehicle ? String(row.vehicle) : null;
    const selected = req.input.vehicle
      ? await Vehicle.findById(req.input.vehicle).session(session)
      : null;
    requireValue(!req.input.vehicle || selected, 'Viatura não encontrada.', 404);
    const previousVehicle = row.vehicle ? String(row.vehicle) : null;
    const previousCity = row.city ? String(row.city) : null;
    const changedVehicle = previousVehicle !== req.input.vehicle;
    requireValue(
      !previousVehicle || previousCity === req.input.city || !req.input.vehicle,
      'Desassocie e salve a viatura antes de mudar a guarnição para outro município.',
      409,
    );
    const affectedVehicles = [previousVehicle, req.input.vehicle].filter(Boolean);
    requireValue(
      !affectedVehicles.length ||
        !(await VehicleHandover.exists({
          vehicle: { $in: affectedVehicles },
          closedAt: null,
        }).session(session)),
      'Conclua os checklists de recebimento e entrega antes de alterar o vínculo da viatura.',
      409,
    );
    const crewType =
      req.input.type || (selected?.type === 'Motocicleta' ? 'Motocicleta' : row.type);
    requireValue(
      !selected || (crewType === 'Motocicleta') === (selected.type === 'Motocicleta'),
      'O tipo da viatura deve corresponder ao tipo da guarnição.',
      422,
    );
    req.input.type = crewType;
    if (selected) {
      requireValue(
        !selected.crew || String(selected.crew) === String(row._id),
        'Desassocie a viatura da guarnição atual antes de vinculá-la a outra.',
        409,
      );
      requireValue(
        !(await Crew.exists({ _id: { $ne: row._id }, vehicle: selected._id }).session(session)),
        'Esta viatura já está associada a outra guarnição.',
        409,
      );
      requireValue(
        String(selected.city) === req.input.city || (!selected.crew && changedVehicle),
        'Desassocie a viatura antes de transferi-la para outro município.',
        409,
      );
    }
    if (previousVehicle && changedVehicle) {
      const old = await Vehicle.findOneAndUpdate(
        { _id: previousVehicle, crew: row._id },
        { crew: null },
        { new: true, session },
      );
      requireValue(
        old,
        'Vínculo atual da viatura inconsistente. Revise o cadastro antes de trocar.',
        409,
      );
      await audit(
        req.user,
        'Viatura desassociada',
        'Vehicle',
        old._id,
        `${old.prefix} / ${row.name}`,
        session,
      );
    }
    if (req.input.vehicle && changedVehicle) {
      const vehicle = await Vehicle.findOneAndUpdate(
        { _id: req.input.vehicle, crew: null, inspectionHold: { $ne: true } },
        {
          $set: { crew: row._id, city: req.input.city },
          ...(String(selected.city) !== req.input.city
            ? { $unset: { latitude: 1, longitude: 1, locatedAt: 1 } }
            : {}),
        },
        { session },
      );
      requireValue(vehicle, 'Viatura indisponível ou já vinculada a outra guarnição.', 409);
      await audit(
        req.user,
        'Viatura associada',
        'Vehicle',
        vehicle._id,
        `${vehicle.prefix} / ${req.input.name} / município ${selected.city} → ${req.input.city}`,
        session,
      );
    }
    if (previousCity && previousCity !== req.input.city) row.location = { sharing: false };
    Object.assign(row, req.input);
    await row.save({ session });
    await audit(
      req.user,
      req.params.id ? 'Edição' : 'Cadastro',
      'Crew',
      row._id,
      row.name,
      session,
    );
    return row;
  });
  changed('crews');
  res.status(req.params.id ? 200 : 201).json(crew);
}
export async function removeCrew(req, res) {
  await transaction(async (session) => {
    const row = await Crew.findById(req.params.id).session(session);
    requireValue(row, 'Guarnição não encontrada.', 404);
    requireValue(
      !row.members.length && !row.currentOccurrence,
      'Encerre o turno e o atendimento antes de excluir.',
      409,
    );
    requireValue(
      !(
        (await Occurrence.exists({ crew: row._id }).session(session)) ||
        (await CrewShift.exists({ crew: row._id }).session(session)) ||
        (await Dispatch.exists({ crew: row._id }).session(session))
      ),
      'Guarnição possui ocorrências históricas; mantenha-a fora de serviço.',
      409,
    );
    await Vehicle.updateMany({ crew: row._id }, { crew: null }, { session });
    await row.deleteOne({ session });
    await audit(req.user, 'Exclusão', 'Crew', row._id, row.name, session);
  });
  changed('crews');
  res.json({ message: 'Guarnição excluída.' });
}
export async function listVehicles(req, res) {
  res.json(
    await Vehicle.find()
      .populate('city', 'name')
      .populate('crew', 'name')
      .populate('lastDriver', 'name')
      .sort({ prefix: 1 }),
  );
}
export async function saveVehicle(req, res) {
  const row = await transaction(async (session) => {
    await validCity(req.input.city, session);
    requireValue(
      (req.input.latitude === undefined) === (req.input.longitude === undefined),
      'Informe latitude e longitude juntas.',
      422,
    );
    let row = req.params.id
      ? await Vehicle.findById(req.params.id).session(session)
      : new Vehicle();
    requireValue(row, 'Viatura não encontrada.', 404);
    const linkedCrew = await Crew.findOne({
      $or: [{ vehicle: row._id }, ...(row.crew ? [{ _id: row.crew }] : [])],
    }).session(session);
    requireValue(
      !linkedCrew || String(row.city) === req.input.city,
      'Desassocie a viatura da guarnição antes de alterar o município.',
      409,
    );
    requireValue(
      !linkedCrew || (req.input.type || row.type) === row.type,
      'Desassocie a viatura antes de alterar seu tipo.',
      409,
    );
    requireValue(
      !(await VehicleHandover.exists({
        vehicle: row._id,
        closedAt: null,
        $or: [{ pendingReturn: true }, { pendingIntake: true }],
      }).session(session)),
      'Finalize os checklists pendentes antes de editar a viatura.',
      409,
    );
    if (row.provisional && req.input.provisional === false)
      requireValue(
        req.input.year && !req.input.plate.startsWith('P-'),
        'Informe ano e placa reais para concluir o cadastro provisório.',
        422,
      );
    requireValue(
      req.user.role === 'Administrativo' || !req.params.id || req.input.mileage >= row.mileage,
      'A quilometragem não pode diminuir.',
      422,
    );
    requireValue(
      !row.crew ||
        !(await Crew.exists({ _id: row.crew, 'members.0': { $exists: true } }).session(session)),
      'Viatura em turno ativo. Encerre o turno para editar.',
      409,
    );
    requireValue(
      req.input.status !== 'Em operação' || row.crew,
      'Associe uma guarnição antes de colocar a viatura em operação.',
    );
    Object.assign(row, req.input);
    await row.save({ session });
    await audit(
      req.user,
      req.params.id ? 'Edição' : 'Cadastro',
      'Vehicle',
      row._id,
      row.prefix,
      session,
    );
    return row;
  });
  changed('vehicles');
  res.status(req.params.id ? 200 : 201).json(row);
}
export async function removeVehicle(req, res) {
  await transaction(async (session) => {
    const row = await Vehicle.findById(req.params.id).session(session);
    requireValue(row, 'Viatura não encontrada.', 404);
    requireValue(!row.crew, 'Desassocie a viatura antes de excluir.', 409);
    requireValue(
      !(await VehicleHandover.exists({ vehicle: row._id }).session(session)),
      'A viatura possui checklists históricos; mantenha o cadastro indisponível.',
      409,
    );
    requireValue(
      !(await Occurrence.exists({ vehicle: row._id }).session(session)),
      'Viatura possui histórico. Use o status Indisponível.',
      409,
    );
    await row.deleteOne({ session });
    await audit(req.user, 'Exclusão', 'Vehicle', row._id, row.prefix, session);
  });
  changed('vehicles');
  res.json({ message: 'Viatura excluída.' });
}
export async function location(req, res) {
  const row = await Vehicle.findById(req.params.id);
  requireValue(row, 'Viatura não encontrada.', 404);
  requireValue(
    req.user.role !== 'Praça' ||
      (req.user.crew &&
        String(req.user.crew) === String(row.crew) &&
        (await Crew.exists({
          _id: row.crew,
          members: req.user._id,
          ...activeDuty(),
        }))),
    'Somente a guarnição ativa pode atualizar a localização desta viatura.',
    403,
  );
  const vehicle = await Vehicle.findOneAndUpdate(
    {
      _id: row._id,
      ...(req.input.mileage !== undefined ? mileageFilter(req.user, req.input.mileage) : {}),
    },
    { ...req.input, locatedAt: new Date() },
    { new: true, runValidators: true },
  );
  requireValue(vehicle, 'A quilometragem não pode diminuir.', 409);
  await audit(req.user, 'Localização atualizada', 'Vehicle', row._id);
  changed('vehicles');
  res.json(vehicle);
}
export async function saveCity(req, res) {
  const row = req.params.id
    ? await City.findByIdAndUpdate(req.params.id, req.input, { new: true, runValidators: true })
    : await City.create(req.input);
  requireValue(row, 'Cidade não encontrada.', 404);
  await audit(req.user, req.params.id ? 'Edição' : 'Cadastro', 'City', row._id, row.name);
  changed('cities');
  res.json(row);
}
export async function removeCity(req, res) {
  await transaction(async (session) => {
    const city = await City.findOne({ _id: req.params.id, deleted: { $ne: true } }).session(
      session,
    );
    requireValue(city, 'Município não encontrado.', 404);
    requireValue(
      !(await Crew.exists({ city: city._id, ...activeDuty() }).session(session)),
      'Encerre os serviços deste município antes de excluí-lo.',
      409,
    );
    city.active = false;
    city.set('deleted', true);
    await city.save({ session });
    await audit(req.user, 'Exclusão de município atendido', 'City', city._id, city.name, session);
  });
  changed('cities');
  res.json({
    message: 'Município excluído dos atendidos. Os vínculos históricos foram preservados.',
  });
}
export async function settings(req, res) {
  res.json(await SystemSetting.findOne({ key: 'general' }));
}
export async function saveSettings(req, res) {
  const row = await SystemSetting.findOneAndUpdate({ key: 'general' }, req.input, {
    new: true,
    runValidators: true,
    upsert: true,
  });
  await audit(req.user, 'Configurações alteradas', 'SystemSetting', row._id);
  changed('settings');
  serviceChanged();
  res.json(row);
}
export async function cpu(req, res) {
  res.json(
    await DailyOfficer.findOne({ day: serviceWindow().day }).populate(
      'officer',
      'name callSign rank phone',
    ),
  );
}
export async function assumeCpu(req, res) {
  const row = await DailyOfficer.create({ day: serviceWindow().day, officer: req.user._id });
  await audit(req.user, 'Assumiu CPU', 'DailyOfficer', row._id);
  changed('cpu');
  await notifyPendingForCpu(req.user._id);
  serviceChanged();
  res.status(201).json(await row.populate('officer', 'name'));
}
export async function updateCpu(req, res) {
  requireValue(
    await User.exists({ _id: req.input.officer, role: 'Oficial', active: true }),
    'Selecione um Oficial ativo.',
    422,
  );
  const row = await DailyOfficer.findOneAndUpdate(
    { day: serviceWindow().day },
    {
      officer: req.input.officer,
      reason: req.input.reason,
      modifiedBy: req.user._id,
      assumedAt: new Date(),
    },
    { new: true, upsert: true, runValidators: true },
  );
  await audit(req.user, 'CPU administrado', 'DailyOfficer', row._id, req.input.reason);
  changed('cpu');
  await notifyPendingForCpu(req.input.officer);
  serviceChanged();
  res.json(row);
}
export async function dashboard(req, res) {
  const today = dayRange();
  const match = { deleted: false, occurredAt: today };
  const [counts, crews, recent, cpu, settings, support, myAttendance, completedToday] =
    await Promise.all([
      Occurrence.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            weapons: { $sum: '$weapons' },
            recoveredVehicles: { $sum: '$recoveredVehicles' },
          },
        },
      ]),
      Crew.find()
        .populate('motorcycleSeats.member', 'name rank callSign')
        .populate('motorcycleSeats.vehicle', 'prefix')
        .populate('city', 'name')
        .populate('vehicle', 'prefix')
        .populate('members driver', 'name rank callSign'),
      Occurrence.find({ deleted: false })
        .populate('city', 'name')
        .populate('crew', 'name')
        .sort({ createdAt: -1 })
        .limit(6),
      DailyOfficer.findOne({ day: serviceWindow().day }).populate(
        'officer',
        'name callSign rank phone',
      ),
      SystemSetting.findOne({ key: 'general' }),
      SupportRequest.countDocuments({ status: 'Pendente' }),
      Attendance.findOne({ acceptedBy: req.user._id, status: 'Em atendimento' }),
      Occurrence.aggregate([
        { $match: { deleted: false, status: 'Encerrada', endedAt: today } },
        {
          $group: {
            _id: null,
            closed: { $sum: 1 },
            weapons: { $sum: '$weapons' },
            recoveredVehicles: { $sum: '$recoveredVehicles' },
          },
        },
      ]),
    ]);
  const ongoing = await Occurrence.find({
    ...match,
    status: { $in: ['Despachada', 'Em atendimento'] },
  })
    .populate('city', 'name')
    .select('city crimeType priority status protocol');
  const alerts = await Occurrence.countDocuments({
    deleted: false,
    status: 'Em aberto',
  });
  res.json({
    counts,
    results: completedToday[0] || { closed: 0, weapons: 0, recoveredVehicles: 0 },
    crews,
    recent,
    cpu,
    operations: settings?.operations.filter((o) => o.day === dayKey()) || [],
    ongoing,
    alerts,
    support,
    myAttendance,
    day: dayKey(),
    serviceDay: serviceWindow().day,
  });
}
export async function auditLogs(req, res) {
  const filter = {};
  if (req.query.user) filter.actor = req.query.user;
  res.json(
    await AuditLog.find(filter).populate('actor', 'name').sort({ createdAt: -1 }).limit(200),
  );
}
export async function notifications(req, res) {
  res.json(await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50));
}
export async function markNotification(req, res) {
  const row = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { read: true },
    { new: true },
  );
  requireValue(row, 'Notificação não encontrada.', 404);
  res.json(row);
}
