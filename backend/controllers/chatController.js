import { activeDuty, onDuty } from '../utils/duty.js';
import { Crew, CrewChat, ChatMessage, ChatAccess, User, Notification } from '../models/index.js';
import { requireValue } from '../utils/errors.js';
import { transaction } from '../services/operations.js';
import { audit } from '../services/audit.js';
import { crewChatChanged, deliverNotifications } from '../services/realtime.js';
import { id } from '../middlewares/validation.js';

const activeCrew = (actor, session) =>
  Crew.findOne({
    _id: actor.crew,
    members: actor._id,
    ...activeDuty(),
    status: { $ne: 'Fora de serviço' },
  }).session(session || null);
const belongs = (chat, crew) =>
  crew &&
  chat.memberships.some(
    (m) => String(m.crew) === String(crew._id) && String(m.shift) === String(crew.shift),
  );
async function getChat(chatId, session) {
  const chat = await CrewChat.findById(chatId).session(session || null);
  requireValue(chat, 'Conversa não encontrada.', 404);
  return chat;
}
async function member(actor, chat, session) {
  const crew = await activeCrew(actor, session);
  requireValue(
    belongs(chat, crew),
    'Apenas integrantes em serviço das guarnições participantes podem acessar esta conversa.',
    403,
  );
  return crew;
}
async function activeMemberships(crewIds, session) {
  const ids = [...new Set(crewIds.map(String))];
  const crews = await Crew.find({
    _id: { $in: ids },
    ...activeDuty(),
    shift: { $ne: null },
    'members.0': { $exists: true },
    status: { $ne: 'Fora de serviço' },
  }).session(session);
  requireValue(
    crews.length === ids.length,
    'Selecione guarnições com integrantes em serviço.',
    409,
  );
  await Crew.updateMany({ _id: { $in: ids } }, { $set: { updatedAt: new Date() } }, { session });
  return crews.map((c) => ({ crew: c._id, shift: c.shift }));
}
export async function list(req, res) {
  const crew = await activeCrew(req.user);
  if (req.user.role !== 'Administrativo' && !crew) return res.json([]);
  const filter =
    req.user.role === 'Administrativo'
      ? {}
      : { memberships: { $elemMatch: { crew: crew._id, shift: crew.shift } } };
  const chats = await CrewChat.find(filter)
    .populate('memberships.crew', 'name')
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  // Metadata contains no message preview. Administrative content access is always justified.
  res.json(
    chats.map((chat) => ({
      ...chat,
      canParticipate: Boolean(
        crew &&
        chat.memberships.some(
          (m) => String(m.crew?._id) === String(crew._id) && String(m.shift) === String(crew.shift),
        ),
      ),
    })),
  );
}
export async function create(req, res) {
  const chat = await transaction(async (session) => {
    const crew = await activeCrew(req.user, session);
    requireValue(crew, 'Ingresse em uma guarnição em serviço para criar uma conversa.', 403);
    const memberships = await activeMemberships([crew._id, ...req.input.crews], session);
    const [chat] = await CrewChat.create(
      [{ name: req.input.name, createdBy: req.user._id, memberships }],
      { session },
    );
    await audit(req.user, 'Criação de chat', 'CrewChat', chat._id, req.input.name, session);
    return chat;
  });
  await crewChatChanged(chat);
  res.status(201).json(chat);
}
export async function addCrews(req, res) {
  const chat = await transaction(async (session) => {
    const chat = await getChat(req.params.id, session);
    const actorCrew = await member(req.user, chat, session);
    await Crew.updateOne({ _id: actorCrew._id }, { $set: { updatedAt: new Date() } }, { session });
    const memberships = await activeMemberships(req.input.crews, session);
    for (const entry of memberships) {
      const previous = chat.memberships.find((m) => String(m.crew) === String(entry.crew));
      if (previous)
        requireValue(
          String(previous.shift) === String(entry.shift),
          'Esta conversa pertence a um turno anterior. Crie outra conversa.',
          409,
        );
      else chat.memberships.push(entry);
    }
    requireValue(chat.memberships.length <= 20, 'Limite de vinte guarnições por conversa.', 422);
    await chat.save({ session });
    await audit(
      req.user,
      'Inclusão de guarnições no chat',
      'CrewChat',
      chat._id,
      req.input.crews.join(', '),
      session,
    );
    return chat;
  });
  await crewChatChanged(chat);
  res.json(chat);
}
export async function access(req, res) {
  const expiresAt = new Date(Date.now() + 15 * 60000);
  await transaction(async (session) => {
    await getChat(req.params.id, session);
    await ChatAccess.findOneAndUpdate(
      { chat: req.params.id, actor: req.user._id, session: req.session._id },
      { reason: req.input.reason, expiresAt },
      { upsert: true, runValidators: true, session },
    );
    await audit(
      req.user,
      'Acesso administrativo ao chat',
      'CrewChat',
      req.params.id,
      req.input.reason,
      session,
    );
  });
  res.json({ expiresAt });
}
export async function messages(req, res) {
  const chat = await getChat(req.params.id);
  if (req.user.role === 'Administrativo') {
    const grant = await ChatAccess.findOne({
      chat: chat._id,
      actor: req.user._id,
      session: req.session._id,
      expiresAt: { $gt: new Date() },
    });
    requireValue(
      grant,
      'Informe uma justificativa para consultar esta conversa. A autorização dura quinze minutos nesta sessão.',
      403,
    );
    await audit(
      req.user,
      'Consulta administrativa de mensagens',
      'CrewChat',
      chat._id,
      grant.reason,
    );
  } else await member(req.user, chat);
  if (req.query.before)
    requireValue(id.safeParse(req.query.before).success, 'Cursor inválido.', 422);
  const rows = await ChatMessage.find({
    chat: chat._id,
    ...(req.query.before ? { _id: { $lt: req.query.before } } : {}),
  })
    .populate('sender', 'name')
    .populate('sourceCrew', 'name')
    .sort({ _id: -1 })
    .limit(100);
  res.json({ items: rows.reverse(), hasMore: rows.length === 100 });
}
export async function send(req, res) {
  const result = await transaction(async (session) => {
    const chat = await getChat(req.params.id, session);
    const crew = await member(req.user, chat, session);
    // Serialize membership/shift changes with sending so a removed member cannot race a send.
    await Crew.updateOne({ _id: crew._id }, { $set: { updatedAt: new Date() } }, { session });
    const [message] = await ChatMessage.create(
      [{ chat: chat._id, sender: req.user._id, sourceCrew: crew._id, text: req.input.text }],
      { session },
    );
    chat.updatedAt = new Date();
    await chat.save({ session });
    const crews = await Crew.find({
      $or: chat.memberships.map((m) => ({ _id: m.crew, shift: m.shift })),
      ...activeDuty(),
      status: { $ne: 'Fora de serviço' },
    }).session(session);
    const recipients = await User.find({
      _id: { $ne: req.user._id },
      active: true,
      $or: crews.map((c) => ({ _id: { $in: c.members }, crew: c._id })),
    }).session(session);
    const notifications = recipients.length
      ? await Notification.insertMany(
          recipients.map((user) => ({
            user: user._id,
            kind: 'chat',
            chat: chat._id,
            chatMessage: message._id,
            title: 'Nova mensagem no chat operacional',
            message: `Nova mensagem na conversa ${chat.name}. Abra o chat para consultar.`,
          })),
          { session },
        )
      : [];
    return { chat, message, notifications };
  });
  await crewChatChanged(result.chat);
  deliverNotifications(result.notifications);
  res.status(201).json(result.message);
}
