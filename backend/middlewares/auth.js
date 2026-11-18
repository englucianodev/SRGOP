import jwt from 'jsonwebtoken';
import { Session, User, Attendance, VehicleHandover } from '../models/index.js';
import { getGeneralSettings } from '../services/settingsCache.js';
import { AppError, asyncRoute } from '../utils/errors.js';
import { audit } from '../services/audit.js';
import { inactivityPolicy, dutySessionExpiry } from '../services/sessionPolicy.js';
export async function authenticateToken(token) {
  if (!token) throw new AppError('Entre no sistema para continuar.', 401, 'Autenticação');
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'srgop',
      audience: 'srgop-web',
    });
  } catch {
    throw new AppError('Sessão expirada. Entre novamente.', 401, 'Autenticação/JWT');
  }
  // Independent reads: one round trip to the database instead of three on every request.
  const [session, settings, user] = await Promise.all([
    Session.findById(payload.sid),
    getGeneralSettings(),
    User.findById(payload.sub).populate('city', 'name'),
  ]);
  const policy = user?.active ? await inactivityPolicy(user, settings) : null;
  if (
    !session ||
    String(session.user) !== payload.sub ||
    +session.expiresAt <= Date.now() ||
    Date.now() - +session.lastActivity >=
      (policy?.inactivityMinutes || settings?.inactivityMinutes || 5) * 60000
  ) {
    if (session) {
      const result = await Session.deleteOne({ _id: session._id });
      if (result.deletedCount)
        await audit(session.user, 'Logout por expiração ou inatividade', 'Session', session._id);
    }
    throw new AppError(
      'Sua sessão terminou por expiração ou inatividade.',
      401,
      'Controle de sessão',
    );
  }
  if (!user?.active)
    throw new AppError('Usuário inativo ou aguardando aprovação.', 401, 'Autenticação');
  // Only reached with a still-valid session: an expired one is never brought back.
  const extended = dutySessionExpiry(policy, session.expiresAt, payload.exp * 1000);
  if (extended) {
    session.expiresAt = extended;
    await Session.updateOne({ _id: session._id }, { expiresAt: extended });
  }
  return { user, session, inactivityPolicy: policy };
}
export const auth = asyncRoute(async (req, res, next) => {
  Object.assign(req, await authenticateToken(req.cookies.srgop_session));
  next();
});
export const allow =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : next(new AppError('Seu perfil não tem permissão para esta ação.', 403, 'Autorização'));
export const essentialOnly = asyncRoute(async (req, res, next) => {
  const checksHandover =
    req.method !== 'GET' && !/^\/(emergencies|vehicle-checklists)(\/|$)/.test(req.path);
  // Both lookups are independent, so they share one round trip to the database.
  const [pendingChecklist, attending] = await Promise.all([
    checksHandover &&
      VehicleHandover.exists({
        driver: req.user._id,
        closedAt: null,
        $or: [{ pendingReturn: true }, { pendingIntake: true }],
      }),
    Attendance.exists({ acceptedBy: req.user._id, status: 'Em atendimento' }),
  ]);
  if (pendingChecklist)
    throw new AppError(
      'Conclua o checklist obrigatório da viatura antes de continuar.',
      409,
      'Checklist de viatura',
    );
  const essentialRead =
    req.method === 'GET' &&
    /^\/(attendances|occurrences|attachments|crews|crew-messages|crew-chats|notifications|dashboard|cities|settings|emergencies|vehicle-checklists)(\/|$)/.test(
      req.path,
    );
  const essentialWrite =
    /^\/(attendances|occurrences|notifications|crew-messages|crew-chats|emergencies|vehicle-checklists)(\/|$)/.test(
      req.path,
    ) ||
    (req.method === 'POST' && /^\/crews\/[^/]+\/leave$/.test(req.path)) ||
    (req.method === 'POST' && /^\/crews\/[^/]+\/driver-return$/.test(req.path)) ||
    (req.method === 'PATCH' && /^\/crews\/[^/]+\/gps$/.test(req.path)) ||
    (req.method === 'PATCH' && /^\/vehicles\/[^/]+\/location$/.test(req.path));
  if (attending && !essentialRead && !essentialWrite)
    throw new AppError(
      'Conclua seu atendimento antes de acessar funções secundárias.',
      409,
      'Atendimento ativo',
    );
  next();
});
