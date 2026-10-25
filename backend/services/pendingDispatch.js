import { DailyOfficer, User, Notification, Occurrence } from '../models/index.js';
import { serviceWindow } from '../utils/time.js';
import { deliverNotifications } from './realtime.js';
export async function queuePendingDispatch(occurrence, session, officerId, kind = 'pendente') {
  const cpu =
    officerId ||
    (await DailyOfficer.findOne({ day: serviceWindow().day }).session(session || null))?.officer;
  let users = cpu
    ? await User.find({ _id: cpu, role: 'Oficial', active: true }).session(session || null)
    : [];
  if (!users.length)
    users = await User.find({ role: 'Administrativo', active: true }).session(session || null);
  const notifications = [];
  for (const user of users) {
    const filter = { user: user._id, occurrence: occurrence._id, kind };
    const result = await Notification.updateOne(
      filter,
      {
        $setOnInsert: {
          ...filter,
          title:
            kind === 'automatico'
              ? 'Atendimento iniciado automaticamente'
              : 'Ocorrência aguardando despacho',
          message:
            kind === 'automatico'
              ? `${occurrence.protocol}: a guarnição iniciou o atendimento sem despacho.`
              : `${occurrence.protocol}: providencie o despacho.${!cpu ? ' CPU do serviço ainda não definido.' : ''}`,
        },
      },
      { upsert: true, session },
    );
    if (result.upsertedCount)
      notifications.push(await Notification.findById(result.upsertedId).session(session || null));
  }
  return notifications;
}
export async function notifyPendingForCpu(officerId) {
  const pending = await Occurrence.find({ deleted: false, status: 'Em aberto' })
    .sort({ createdAt: -1 })
    .limit(100);
  for (const occurrence of pending)
    deliverNotifications(await queuePendingDispatch(occurrence, null, officerId));
}
