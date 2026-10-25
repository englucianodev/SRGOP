import { mileageFilter } from '../utils/mileage.js';
import { activeDuty, onDuty } from '../utils/duty.js';
import {
  Crew,
  User,
  Vehicle,
  Attendance,
  CrewShift,
  CrewMessage,
  VehicleHandover,
} from '../models/index.js';
import { requireDriverReturn, refreshInspectionHold } from './vehicleInspections.js';
import { roundHour } from '../utils/duty.js';
import { transaction } from './operations.js';
import { requireValue } from '../utils/errors.js';
import { audit } from './audit.js';
import { changed, crewLocationChanged } from './realtime.js';

export async function manageMember(actor, crewId, input) {
  const result = await transaction(async (session) => {
    const crew = await Crew.findById(crewId).session(session);
    requireValue(crew, 'Guarnição não encontrada.', 404);
    requireValue(onDuty(crew), 'O turno não está ativo.', 409);
    requireValue(
      crew.members.some((id) => String(id) === input.member),
      'O usuário não integra esta guarnição.',
      409,
    );
    const affected = [...crew.members];
    const leavingSeat = crew.motorcycleSeats.find((s) => String(s.member) === input.member);
    if (input.action === 'Motorista') {
      requireValue(
        crew.shiftMode !== 'Motocicleta',
        'O condutor de motocicleta deve escolher as motos e ingressar com sua própria conta.',
        422,
      );
      requireValue(String(crew.driver) !== input.member, 'O integrante já é o motorista.', 409);
      await requireDriverReturn(crew, input.reason, session);
      crew.driver = input.member;
      if (crew.vehicle) {
        await VehicleHandover.create(
          [
            {
              crew: crew._id,
              shift: crew.shift,
              vehicle: crew.vehicle,
              driver: input.member,
              pendingIntake: true,
            },
          ],
          { session },
        );
        crew.inspectionBlocked = true;
        await Vehicle.updateOne(
          { _id: crew.vehicle },
          { inspectionHold: true, status: 'Indisponível' },
          { session },
        );
      }
      if (crew.vehicle)
        await Vehicle.updateOne({ _id: crew.vehicle }, { lastDriver: input.member }, { session });
    } else {
      requireValue(
        !(await Attendance.exists({ acceptedBy: input.member, status: 'Em atendimento' }).session(
          session,
        )),
        'O integrante precisa concluir seu atendimento antes de sair.',
        409,
      );
      requireValue(
        crew.members.length > 1 || !crew.currentOccurrence,
        'A guarnição está designada a uma ocorrência. Não é possível retirar o último integrante.',
        409,
      );
      const records = await VehicleHandover.find({
        crew: crew._id,
        driver: input.member,
        closedAt: null,
      }).session(session);
      if (records.length) {
        if (String(actor._id) === input.member && (input.checklist || input.checklists)) {
          for (const record of records) {
            const checklist =
              input.checklists?.find((c) => c.vehicle === String(record.vehicle))?.checklist ||
              (records.length === 1 ? input.checklist : null);
            requireValue(
              checklist && !record.pendingIntake,
              'Preencha o checklist de entrega de cada motocicleta recebida.',
              422,
            );
            requireValue(
              await Vehicle.findOneAndUpdate(
                { _id: record.vehicle, ...mileageFilter(actor, checklist.mileage) },
                { mileage: checklist.mileage },
                { session },
              ),
              'O KM atual não pode diminuir.',
              409,
            );
            record.delivery = checklist;
            record.closedAt = new Date();
            record.pendingReturn = false;
            await record.save({ session });
            await audit(
              actor,
              'Entrega de viatura',
              'VehicleHandover',
              record._id,
              `${checklist.mileage} km`,
              session,
            );
          }
        } else await requireDriverReturn(crew, input.reason, session, input.member);
      } else if (String(crew.driver) === input.member && crew.vehicle)
        await requireDriverReturn(crew, input.reason, session, input.member);
      crew.members.pull(input.member);
      crew.motorcycleSeats = crew.motorcycleSeats.filter((s) => String(s.member) !== input.member);
      if (String(crew.location?.updatedBy) === input.member) crew.location.sharing = false;
      if (String(crew.driver) === input.member)
        crew.driver = crew.motorcycleSeats.find((s) => s.role === 'Piloto')?.member || null;
      await User.updateOne({ _id: input.member, crew: crew._id }, { crew: null }, { session });
      if (!crew.members.length) {
        crew.status = 'Fora de serviço';
        crew.shiftEnd = new Date();
        crew.endedBy = actor._id;
        crew.endReason = input.reason;
        await CrewShift.updateOne(
          { _id: crew.shift },
          {
            end: crew.shiftEnd,
            roundedEnd: crew.shiftMode === 'Motocicleta' ? roundHour(crew.shiftEnd) : undefined,
            endedBy: actor._id,
            reason: input.reason,
          },
          { session },
        );
        if (crew.vehicle)
          await Vehicle.updateOne(
            { _id: crew.vehicle, status: 'Em operação' },
            { status: crew.inspectionBlocked ? 'Indisponível' : 'Disponível' },
            { session },
          );
      }
    }
    await crew.save({ session });
    const vehicleIds = await VehicleHandover.distinct('vehicle', {
      crew: crew._id,
      driver: input.member,
    }).session(session);
    if (leavingSeat && input.action === 'Saída') vehicleIds.push(leavingSeat.vehicle);
    for (const vehicleId of vehicleIds) await refreshInspectionHold(vehicleId, session);
    if (crew.vehicle) await refreshInspectionHold(crew.vehicle, session);
    await CrewShift.updateOne(
      { _id: crew.shift },
      {
        $push: {
          changes: {
            member: input.member,
            memberName: (await User.findById(input.member).session(session))?.name,
            actor: actor._id,
            actorName: actor.name,
            action: input.action,
            ...(leavingSeat
              ? { vehicle: leavingSeat.vehicle, motorcycleRole: leavingSeat.role }
              : {}),
            roundedAt: crew.shiftMode === 'Motocicleta' ? roundHour(new Date()) : undefined,
            reason: input.reason,
          },
        },
      },
      { session },
    );
    await audit(
      actor,
      input.action === 'Motorista' ? 'Troca de motorista' : 'Saída autorizada de integrante',
      'Crew',
      crew._id,
      `${input.member}: ${input.reason}`,
      session,
    );
    return { crew, affected };
  });
  changed('crews', result.affected);
  crewLocationChanged(result.crew);
  return result.crew;
}

export async function setAvailability(actor, crewId, input) {
  const crew = await transaction(async (session) => {
    const crew = await Crew.findOne({
      _id: crewId,
      ...activeDuty(),
      currentOccurrence: null,
      'members.0': { $exists: true },
    }).session(session);
    requireValue(
      crew,
      'Só é possível alterar a disponibilidade de uma guarnição em turno e sem ocorrência atribuída.',
      409,
    );
    crew.status = input.status;
    await crew.save({ session });
    await audit(
      actor,
      'Disponibilidade de guarnição',
      'Crew',
      crew._id,
      `${input.status}: ${input.reason}`,
      session,
    );
    return crew;
  });
  changed('crews', crew.members);
  return crew;
}

export async function sendCrewMessage(actor, input) {
  const message = await transaction(async (session) => {
    const target = await Crew.findOne({
      _id: input.targetCrew,
      ...activeDuty(),
      'members.0': { $exists: true },
    }).session(session);
    requireValue(
      target,
      'A guarnição de destino não está em serviço.',
      409,
      'Comunicação entre guarnições',
    );
    const source = await Crew.findOne({
      members: actor._id,
      ...activeDuty(),
    }).session(session);
    requireValue(source, 'Ingresse em uma guarnição para enviar mensagens.', 403);
    const participants = [
      ...new Set([
        String(actor._id),
        ...target.members.map(String),
        ...(source?.members.map(String) || []),
      ]),
    ];
    const [message] = await CrewMessage.create(
      [
        {
          sender: actor._id,
          sourceCrew: source?._id,
          targetCrew: target._id,
          participants,
          text: input.text,
        },
      ],
      { session },
    );
    await audit(
      actor,
      'Mensagem operacional',
      'CrewMessage',
      message._id,
      `Destino: ${target.name}`,
      session,
    );
    return message;
  });
  changed('messages', message.participants);
  return message;
}
