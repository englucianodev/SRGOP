import { activeDuty, onDuty, roundHour } from '../utils/duty.js';
import mongoose from 'mongoose';
import {
  Occurrence,
  Crew,
  User,
  Vehicle,
  Dispatch,
  Attendance,
  CrewShift,
  SupportRequest,
  City,
  VehicleHandover,
} from '../models/index.js';
import { requireValue } from '../utils/errors.js';
import { serviceWindow } from '../utils/time.js';
import { recordIntake, requireDriverReturn } from './vehicleInspections.js';
import { audit } from './audit.js';
import {
  changed,
  attendanceChanged,
  queueCrewNotifications,
  deliverNotifications,
  crewLocationChanged,
} from './realtime.js';
export const history = (actor, action, detail = '') => ({
  actor: actor._id,
  action,
  detail,
  at: new Date(),
});
export const transaction = (fn) => mongoose.connection.transaction(fn);
export async function getOccurrence(id, session) {
  const row = await Occurrence.findOne({ _id: id, deleted: false }).session(session || null);
  requireValue(row, 'Ocorrência não encontrada.', 404);
  return row;
}
export async function canAttend(user, row, session) {
  if (['Oficial', 'Administrativo'].includes(user.role)) return;
  const crew = await Crew.findOne({
    _id: row.crew,
    members: user._id,
    ...activeDuty(),
  }).session(session || null);
  requireValue(
    crew || String(row.acceptedBy) === String(user._id),
    'Esta ocorrência não está disponível para sua guarnição.',
    403,
    'Atendimento',
  );
}
export async function dispatchOccurrence(actor, input) {
  const row = await transaction(async (session) => {
    const occurrence = await getOccurrence(input.occurrence, session);
    requireValue(
      ['Em aberto', 'Despachada'].includes(occurrence.status),
      'Somente ocorrências abertas ou despachadas podem ser encaminhadas.',
      409,
    );
    requireValue(
      String(occurrence.crew) !== input.crew,
      'A ocorrência já está nesta guarnição.',
      409,
    );
    if (occurrence.crew)
      requireValue(input.reason?.length >= 5, 'Informe o motivo do reencaminhamento.');
    const crew = await Crew.findOneAndUpdate(
      {
        _id: input.crew,
        status: 'Disponível',
        inspectionBlocked: { $ne: true },
        ...activeDuty(),
        'members.0': { $exists: true },
        currentOccurrence: null,
      },
      { $set: { status: 'Em atendimento', currentOccurrence: occurrence._id } },
      { new: true, session },
    );
    requireValue(
      crew,
      'Guarnição sem turno ativo, sem integrantes ou indisponível.',
      409,
      'Despacho',
    );
    const previousMembers = [...occurrence.assignedMembers];
    if (occurrence.crew) await releaseCrew(occurrence.crew, occurrence._id, session);
    occurrence.crew = crew._id;
    occurrence.vehicle = crew.vehicle;
    occurrence.assignedMembers = crew.members;
    occurrence.status = 'Despachada';
    occurrence.dispatchedAt = new Date();
    occurrence.history.push(history(actor, 'Despacho', input.reason || crew.name));
    await occurrence.save({ session });
    await Dispatch.create(
      [
        {
          occurrence: occurrence._id,
          crew: crew._id,
          dispatchedBy: actor._id,
          reason: input.reason,
        },
      ],
      { session },
    );
    await audit(actor, 'Despacho', 'Occurrence', occurrence._id, crew.name, session);
    const notifications = await queueCrewNotifications(crew._id, occurrence, session);
    return { occurrence, previousMembers, notifications };
  });
  attendanceChanged({
    _id: row.occurrence._id,
    assignedMembers: row.previousMembers,
    status: 'Reencaminhada',
  });
  attendanceChanged(row.occurrence);
  deliverNotifications(row.notifications);
  return row.occurrence;
}
async function releaseCrew(crewId, occurrenceId, session) {
  const crew = await Crew.findOne({ _id: crewId, currentOccurrence: occurrenceId }).session(
    session,
  );
  if (!crew) return;
  crew.currentOccurrence = null;
  crew.status = onDuty(crew) ? 'Disponível' : 'Fora de serviço';
  await crew.save({ session });
}
export async function acceptOccurrence(actor, id) {
  const occurrence = await transaction(async (session) => {
    const row = await getOccurrence(id, session);
    await canAttend(actor, row, session);
    requireValue(
      row.status === 'Despachada',
      'Esta ocorrência já foi aceita ou não está despachada.',
      409,
      'Aceite',
    );
    const reservedCrew = await Crew.findOneAndUpdate(
      {
        _id: row.crew,
        currentOccurrence: row._id,
        ...activeDuty(),
        'members.0': { $exists: true },
      },
      { $set: { updatedAt: new Date() } },
      { session },
    );
    requireValue(
      reservedCrew,
      'O turno da guarnição expirou. O despacho deve retornar à central.',
      409,
      'Aceite',
    );
    requireValue(
      !(await Attendance.exists({ acceptedBy: actor._id, status: 'Em atendimento' }).session(
        session,
      )),
      'Você já possui um atendimento em andamento.',
      409,
    );
    // Writes to the user also serialize two concurrent accept requests for different occurrences.
    await User.updateOne({ _id: actor._id }, { $set: { updatedAt: new Date() } }, { session });
    row.status = 'Em atendimento';
    row.acceptedBy = actor._id;
    row.startedAt = new Date();
    row.history.push(history(actor, 'Aceite'));
    await row.save({ session });
    await Attendance.create(
      [
        {
          occurrence: row._id,
          crew: row.crew,
          shift: reservedCrew.shift,
          members: reservedCrew.members,
          acceptedBy: actor._id,
          startedAt: row.startedAt,
        },
      ],
      { session },
    );
    await audit(actor, 'Aceite', 'Occurrence', row._id, '', session);
    return row;
  });
  attendanceChanged(occurrence);
  return occurrence;
}
export async function rejectOccurrence(actor, id, reason) {
  const row = await transaction(async (session) => {
    const occurrence = await getOccurrence(id, session);
    await canAttend(actor, occurrence, session);
    requireValue(
      occurrence.status === 'Despachada',
      'Apenas despachos pendentes podem ser rejeitados.',
      409,
    );
    await releaseCrew(occurrence.crew, occurrence._id, session);
    occurrence.status = 'Em aberto';
    occurrence.crew = undefined;
    occurrence.vehicle = undefined;
    occurrence.history.push(history(actor, 'Despacho rejeitado', reason));
    await occurrence.save({ session });
    await audit(actor, 'Rejeição', 'Occurrence', id, reason, session);
    return occurrence;
  });
  attendanceChanged(row);
  return row;
}
export async function closeOccurrence(actor, id, input) {
  const row = await transaction(async (session) => {
    const occurrence = await getOccurrence(id, session);
    await canAttend(actor, occurrence, session);
    requireValue(
      occurrence.status === 'Em atendimento',
      'Não há atendimento ativo para encerrar.',
      409,
    );
    requireValue(
      actor.role !== 'Praça' || String(occurrence.acceptedBy) === String(actor._id),
      'Somente o responsável pode encerrar o atendimento.',
      403,
    );
    const endedAt = new Date();
    const durationSeconds = Math.max(0, Math.floor((endedAt - occurrence.startedAt) / 1000));
    Object.assign(occurrence, input, { status: 'Encerrada', endedAt, durationSeconds });
    occurrence.history.push(history(actor, 'Encerramento', input.summary));
    await occurrence.save({ session });
    await Attendance.updateOne(
      { occurrence: id, status: 'Em atendimento' },
      { $set: { summary: input.summary, endedAt, durationSeconds, status: 'Encerrada' } },
      { session, runValidators: true },
    );
    await releaseCrew(occurrence.crew, occurrence._id, session);
    const supports = await SupportRequest.find({
      occurrence: id,
      status: { $in: ['Autorizado', 'Pendente'] },
    }).session(session);
    const supportMembers = [];
    for (const support of supports) {
      const crew = await Crew.findById(support.targetCrew).session(session);
      if (support.status === 'Autorizado') {
        supportMembers.push(...(crew?.members || []));
        await releaseCrew(support.targetCrew, occurrence._id, session);
      }
      support.status = 'Concluído';
      support.endedAt = endedAt;
      await support.save({ session });
    }
    await audit(actor, 'Encerramento', 'Occurrence', id, input.summary.slice(0, 1900), session);
    return { occurrence, supportMembers };
  });
  attendanceChanged(row.occurrence);
  attendanceChanged({ ...row.occurrence.toObject(), assignedMembers: row.supportMembers });
  return row.occurrence;
}
export async function joinCrew(actor, id, driver, input = {}) {
  const crew = await transaction(async (session) => {
    requireValue(
      !(await VehicleHandover.exists({
        driver: actor._id,
        pendingReturn: true,
        closedAt: null,
      }).session(session)),
      'Conclua o checklist de entrega pendente antes de iniciar novo serviço.',
      409,
    );
    const row = await Crew.findById(id).session(session);
    requireValue(row, 'Guarnição não encontrada.', 404);
    requireValue(
      !row.currentOccurrence && row.status !== 'Indisponível',
      'A guarnição não está disponível para ingresso.',
      409,
    );
    requireValue(
      onDuty(row) || !row.members.length || row.status === 'Fora de serviço',
      'O turno expirou. Aguarde o encerramento automático.',
      409,
    );
    const member = await User.findOneAndUpdate(
      { _id: actor._id, crew: null, active: true },
      { crew: row._id },
      { new: true, session },
    );
    requireValue(
      member,
      'Você já integra uma guarnição. O desligamento exige autorização durante o turno.',
      409,
    );
    requireValue(!driver || !row.driver, 'Esta guarnição já possui motorista.', 409);
    const assignedVehicle = row.vehicle
      ? await Vehicle.findById(row.vehicle).session(session)
      : null;
    const motorcycle = assignedVehicle?.type === 'Motocicleta';
    if (motorcycle)
      requireValue(
        input.dutyPeriod && ['Manhã', 'Tarde', 'Noite'].includes(input.dutyPeriod),
        'Selecione o turno da motocicleta: Manhã, Tarde ou Noite.',
        422,
      );
    if (motorcycle && row.members.length)
      requireValue(
        input.dutyPeriod === row.dutyPeriod,
        'Selecione o mesmo turno da equipe em serviço.',
        409,
      );
    if (!onDuty(row)) {
      requireValue(
        row.members.length === 0,
        'Encerre o turno anterior antes de iniciar outro.',
        409,
      );
      const duty = serviceWindow();
      row.shiftMode = motorcycle ? 'Motocicleta' : 'Regular';
      row.dutyPeriod = motorcycle ? input.dutyPeriod : '';
      row.shiftStart = motorcycle ? new Date() : duty.start;
      row.location = { sharing: false };
      row.shiftEnd = motorcycle ? null : duty.end;
      const [shift] = await CrewShift.create(
        [
          {
            crew: row._id,
            dutyDay: duty.day,
            shiftMode: row.shiftMode,
            dutyPeriod: row.dutyPeriod,
            roundedStart: motorcycle ? roundHour(row.shiftStart) : undefined,
            crewName: row.name,
            city: row.city,
            cityName: (await City.findById(row.city).session(session))?.name,
            vehicle: row.vehicle,
            vehiclePrefix: row.vehicle
              ? (await Vehicle.findById(row.vehicle).session(session))?.prefix
              : undefined,
            start: row.shiftStart,
            plannedEnd: row.shiftEnd,
          },
        ],
        { session },
      );
      row.shift = shift._id;
    }
    row.members.addToSet(actor._id);
    row.status = 'Disponível';
    if (driver) row.driver = actor._id;
    await row.save({ session });
    await CrewShift.updateOne(
      { _id: row.shift },
      {
        $addToSet: { members: actor._id },
        $push: {
          changes: {
            member: actor._id,
            actor: actor._id,
            memberName: actor.name,
            actorName: actor.name,
            action: 'Ingresso',
            roundedAt: motorcycle ? roundHour(new Date()) : undefined,
          },
        },
      },
      { session },
    );
    if (row.vehicle) {
      const vehicle = await Vehicle.findOneAndUpdate(
        { _id: row.vehicle, status: { $in: ['Disponível', 'Em operação'] } },
        { status: 'Em operação', ...(driver ? { lastDriver: actor._id } : {}) },
        { session },
      );
      requireValue(vehicle, 'A viatura associada está indisponível ou em manutenção.', 409);
      requireValue(
        !vehicle.provisional && !vehicle.inspectionHold,
        'Complete o cadastro da viatura e as entregas pendentes antes do serviço.',
        409,
      );
      if (driver) await recordIntake(actor, row, input.checklist, session);
    }
    await audit(
      actor,
      'Ingresso na guarnição',
      'Crew',
      id,
      driver ? 'Motorista' : 'Integrante',
      session,
    );
    return row;
  });
  changed('crews', crew.members);
  return crew;
}
export async function endShift(id, actor, reason = 'Encerramento automático às 8h') {
  const result = await transaction(async (session) => {
    const crew = await Crew.findById(id).session(session);
    requireValue(crew, 'Guarnição não encontrada.', 404);
    requireValue(
      crew.members.length || crew.status !== 'Fora de serviço',
      'Turno já encerrado.',
      409,
    );
    if (!actor)
      requireValue(
        crew.shiftMode !== 'Motocicleta' && crew.shiftEnd && +crew.shiftEnd <= Date.now(),
        'Este turno não tem encerramento automático ou já foi renovado.',
        409,
      );
    const members = [...crew.members];
    const endedAt =
      crew.shiftMode !== 'Motocicleta' && crew.shiftEnd && +crew.shiftEnd <= Date.now()
        ? crew.shiftEnd
        : new Date();
    await requireDriverReturn(crew, reason, session);
    const pending = await Occurrence.findOne({ crew: id, status: 'Despachada' }).session(session);
    if (pending) {
      pending.status = 'Em aberto';
      pending.crew = undefined;
      pending.vehicle = undefined;
      pending.history.push({
        action: 'Retorno à fila por encerramento do turno',
        actor: actor?._id,
        detail: reason,
      });
      await pending.save({ session });
    }
    await User.updateMany({ crew: id }, { crew: null }, { session });
    if (crew.vehicle)
      await Vehicle.updateOne(
        { _id: crew.vehicle, status: 'Em operação' },
        { status: crew.inspectionBlocked ? 'Indisponível' : 'Disponível' },
        { session },
      );
    const memberNames = await User.find({ _id: { $in: members } })
      .select('name')
      .session(session);
    await CrewShift.updateOne(
      { _id: crew.shift, end: null },
      {
        $set: {
          end: endedAt,
          roundedEnd: crew.shiftMode === 'Motocicleta' ? roundHour(endedAt) : undefined,
          endedBy: actor?._id,
          reason,
        },
        $push: {
          changes: {
            $each: members.map((member) => ({
              member,
              memberName: memberNames.find((u) => String(u._id) === String(member))?.name,
              actor: actor?._id,
              actorName: actor?.name,
              action: 'Saída',
              reason,
            })),
          },
        },
      },
      { session },
    );
    crew.members = [];
    if (crew.location) crew.location.sharing = false;
    crew.driver = null;
    crew.status = 'Fora de serviço';
    crew.shiftEnd = endedAt;
    crew.endedBy = actor?._id;
    crew.endReason = reason;
    if (
      pending ||
      !(await Occurrence.exists({ _id: crew.currentOccurrence, status: 'Em atendimento' }).session(
        session,
      ))
    )
      crew.currentOccurrence = null;
    await crew.save({ session });
    await audit(actor, 'Encerramento de turno', 'Crew', id, reason, session);
    for (const member of members)
      await audit(member, 'Saída da guarnição', 'Crew', id, reason, session);
    return { crew, members, pending };
  });
  changed('crews', result.members);
  crewLocationChanged(result.crew);
  if (result.pending) attendanceChanged(result.pending);
  return result.crew;
}
export async function expireShifts() {
  const rows = await Crew.find({
    shiftMode: { $ne: 'Motocicleta' },
    shiftEnd: { $lte: new Date() },
    $or: [{ status: { $ne: 'Fora de serviço' } }, { 'members.0': { $exists: true } }],
  }).select('_id');
  for (const row of rows) {
    try {
      await endShift(row._id, null);
    } catch (e) {
      if (e.status !== 409) console.error('Turnos:', e.message);
    }
  }
}
export async function alignActiveShifts() {
  const rows = await Crew.find({
    'members.0': { $exists: true },
    status: { $ne: 'Fora de serviço' },
  }).select('_id');
  for (const row of rows)
    await transaction(async (session) => {
      const crew = await Crew.findById(row._id).session(session);
      const shift = crew?.shift ? await CrewShift.findById(crew.shift).session(session) : null;
      if (!crew || crew.shiftMode === 'Motocicleta' || shift?.dutyDay || shift?.end) return;
      const duty = serviceWindow(new Date(shift?.start || crew.shiftStart || Date.now()));
      crew.shiftStart = duty.start;
      crew.shiftEnd = duty.end;
      await crew.save({ session });
      if (shift) {
        shift.start = duty.start;
        shift.plannedEnd = duty.end;
        shift.dutyDay = duty.day;
        await shift.save({ session });
      }
      await audit(null, 'Adequação do turno às 8h', 'Crew', crew._id, duty.day, session);
    });
}
export async function authorizeSupport(actor, id, approved) {
  const result = await transaction(async (session) => {
    const support = await SupportRequest.findOne({ _id: id, status: 'Pendente' }).session(session);
    requireValue(support, 'Pedido já processado ou não encontrado.', 409);
    const occurrence = await getOccurrence(support.occurrence, session);
    requireValue(occurrence.status === 'Em atendimento', 'O atendimento não está mais ativo.', 409);
    if (approved) {
      const crew = await Crew.findOneAndUpdate(
        {
          _id: support.targetCrew,
          status: 'Disponível',
          inspectionBlocked: { $ne: true },
          currentOccurrence: null,
          ...activeDuty(),
          'members.0': { $exists: true },
        },
        { status: 'Em atendimento', currentOccurrence: occurrence._id },
        { new: true, session },
      );
      requireValue(crew, 'A guarnição de apoio não está disponível.', 409);
      support.shift = crew.shift;
      support.members = crew.members;
      support.startedAt = new Date();
      occurrence.history.push(history(actor, 'Apoio autorizado', crew.name));
      await occurrence.save({ session });
    }
    support.status = approved ? 'Autorizado' : 'Recusado';
    support.authorizedBy = actor._id;
    await support.save({ session });
    await audit(
      actor,
      `Apoio ${support.status.toLowerCase()}`,
      'SupportRequest',
      id,
      support.reason,
      session,
    );
    const notifications = approved
      ? await queueCrewNotifications(
          support.targetCrew,
          occurrence,
          session,
          'apoio',
          support.reason,
        )
      : [];
    return { support, occurrence, notifications };
  });
  deliverNotifications(result.notifications);
  changed('support', result.occurrence.assignedMembers);
  return result.support;
}
