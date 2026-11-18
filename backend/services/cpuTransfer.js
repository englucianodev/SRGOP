import { CpuShift, Notification, User } from '../models/index.js';
import { AppError, requireValue } from '../utils/errors.js';
import { audit } from './audit.js';
import { closeCpuShift, currentCpu, openCpuShift } from './cpuShift.js';
import { transaction } from './operations.js';
import { notifyPendingAfterCpuChange } from './pendingDispatch.js';
import { changed, deliverNotifications, serviceChanged } from './realtime.js';

const ORIGIN = 'Passagem do CPU';

const pendingOf = (shift) => (shift?.transfers || []).find((t) => t.status === 'Pendente');

const notify = async (user, shift, message, session) => {
  const [notification] = await Notification.create(
    [{ user, kind: 'passagem-cpu', cpuShift: shift._id, title: ORIGIN, message }],
    { session },
  );
  return notification;
};

/** The open shift with its pending transfer; 409 when there is none. */
async function openWithPending(session, expectedId) {
  const open = await currentCpu(session);
  const transfer = pendingOf(open);
  requireValue(transfer, 'Não há passagem do CPU pendente.', 409, ORIGIN);
  // The transfer the caller validated must still be the pending one (cancel + re-request race).
  requireValue(
    !expectedId || String(transfer._id) === String(expectedId),
    'A passagem do CPU mudou; tente novamente.',
    409,
    ORIGIN,
  );
  return { open, transfer };
}

/** Conditionally moves the pending transfer to a final status; 409 for the race loser. */
async function settle(open, transfer, status, session) {
  const { modifiedCount } = await CpuShift.updateOne(
    {
      _id: open._id,
      status: 'Aberto',
      transfers: { $elemMatch: { _id: transfer._id, status: 'Pendente' } },
    },
    { $set: { 'transfers.$.status': status, 'transfers.$.decidedAt': new Date() } },
    { session },
  );
  requireValue(modifiedCount, 'A passagem do CPU já foi respondida.', 409, ORIGIN);
}

/** The CPU officer asks another active Oficial to take over. */
export async function requestTransfer(actor, { to, reason }) {
  const target = String(to);
  requireValue(target !== String(actor._id), 'Escolha outro Oficial.', 422, ORIGIN);
  requireValue(
    await User.exists({ _id: target, role: 'Oficial', active: true }),
    'Selecione um Oficial ativo.',
    422,
    ORIGIN,
  );
  const notification = await transaction(async (session) => {
    const open = await currentCpu(session);
    requireValue(open, 'Não há turno do CPU aberto.', 409, ORIGIN);
    requireValue(
      String(open.officer._id) === String(actor._id),
      'Você não está no CPU.',
      403,
      ORIGIN,
    );
    const { modifiedCount } = await CpuShift.updateOne(
      { _id: open._id, status: 'Aberto', 'transfers.status': { $ne: 'Pendente' } },
      { $push: { transfers: { to: target, reason } } },
      { session },
    );
    requireValue(modifiedCount, 'Já existe uma passagem do CPU pendente.', 409, ORIGIN);
    return notify(target, open, `${actor.name} quer passar o CPU para você.`, session);
  });
  deliverNotifications([notification]);
  return currentCpu();
}

/** Accepting closes the sender's shift and opens the recipient's in one transaction. */
async function accept(actor, transferId) {
  const result = await transaction(async (session) => {
    const { open, transfer } = await openWithPending(session, transferId);
    await settle(open, transfer, 'Aceita', session);
    const at = new Date();
    const closed = await closeCpuShift(open, { reason: 'Passagem', session, at, actor });
    const shift = await openCpuShift(actor._id, {
      session,
      at,
      previous: open,
      modifiedBy: actor._id,
    });
    await CpuShift.updateOne({ _id: open._id }, { next: shift._id }, { session });
    await audit(actor, 'Passagem do CPU aceita', 'CpuShift', shift._id, '', session);
    const reply = await notify(
      open.officer._id,
      shift,
      `${actor.name} aceitou a passagem do CPU.`,
      session,
    );
    return { shift, notifications: [closed.notification, reply] };
  });
  deliverNotifications(result.notifications);
  changed('cpu');
  serviceChanged();
  await notifyPendingAfterCpuChange(actor._id);
  return result.shift;
}

async function refuse(actor, transferId) {
  const notification = await transaction(async (session) => {
    const { open, transfer } = await openWithPending(session, transferId);
    await settle(open, transfer, 'Recusada', session);
    return notify(open.officer._id, open, `${actor.name} recusou a passagem do CPU.`, session);
  });
  deliverNotifications([notification]);
  return currentCpu();
}

/** Only the recipient of the pending transfer answers it. */
export async function answerTransfer(actor, acceptIt) {
  const { transfer } = await openWithPending(null);
  requireValue(
    String(transfer.to) === String(actor._id),
    'Esta passagem não é para você.',
    403,
    ORIGIN,
  );
  return answerChecked(actor, acceptIt, transfer._id);
}

/** Settles exactly the transfer whose recipient was checked; 409 if it is no longer pending. */
export const answerChecked = (actor, acceptIt, transferId) =>
  acceptIt ? accept(actor, transferId) : refuse(actor, transferId);

/** Only the sender (current CPU officer) cancels a pending transfer. */
export async function cancelTransfer(actor) {
  const { open, transfer } = await openWithPending(null);
  if (String(open.officer._id) !== String(actor._id))
    throw new AppError('Somente quem pediu a passagem pode cancelá-la.', 403, ORIGIN);
  const notification = await transaction(async (session) => {
    await settle(open, transfer, 'Cancelada', session);
    // The request no longer needs an answer.
    await Notification.updateMany(
      { user: transfer.to, kind: 'passagem-cpu', cpuShift: open._id, read: false },
      { read: true },
      { session },
    );
    return notify(transfer.to, open, `${actor.name} cancelou a passagem do CPU.`, session);
  });
  deliverNotifications([notification]);
  changed('cpu');
  return currentCpu();
}
