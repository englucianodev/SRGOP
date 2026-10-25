import { Crew, User, Vehicle, Attendance, CrewShift, CrewMessage } from '../models/index.js';
import { transaction } from './operations.js';
import { requireValue } from '../utils/errors.js';
import { audit } from './audit.js';
import { changed } from './realtime.js';

export async function manageMember(actor, crewId, input) {
  const result = await transaction(async (session) => {
    const crew = await Crew.findById(crewId).session(session);
    requireValue(crew, 'Guarnição não encontrada.', 404);
    requireValue(crew.shiftEnd && +crew.shiftEnd > Date.now(), 'O turno não está ativo.', 409);
    requireValue(
      crew.members.some((id) => String(id) === input.member),
      'O usuário não integra esta guarnição.',
      409,
    );
    const affected = [...crew.members];
    if (input.action === 'Motorista') {
      crew.driver = input.member;
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
      crew.members.pull(input.member);
      if (String(crew.driver) === input.member) crew.driver = null;
      await User.updateOne({ _id: input.member, crew: crew._id }, { crew: null }, { session });
      if (!crew.members.length) {
        crew.status = 'Fora de serviço';
        crew.shiftEnd = new Date();
        crew.endedBy = actor._id;
        crew.endReason = input.reason;
        await CrewShift.updateOne(
          { _id: crew.shift },
          { end: crew.shiftEnd, endedBy: actor._id, reason: input.reason },
          { session },
        );
        if (crew.vehicle)
          await Vehicle.updateOne(
            { _id: crew.vehicle, status: 'Em operação' },
            { status: 'Disponível' },
            { session },
          );
      }
    }
    await crew.save({ session });
    await CrewShift.updateOne(
      { _id: crew.shift },
      {
        $push: {
          changes: {
            member: input.member,
            actor: actor._id,
            action: input.action,
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
  return result.crew;
}

export async function setAvailability(actor, crewId, input) {
  const crew = await transaction(async (session) => {
    const crew = await Crew.findOne({
      _id: crewId,
      shiftEnd: { $gt: new Date() },
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
      shiftEnd: { $gt: new Date() },
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
      shiftEnd: { $gt: new Date() },
    }).session(session);
    requireValue(
      actor.role !== 'Praça' || source,
      'Ingresse em uma guarnição para enviar mensagens.',
      403,
    );
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
