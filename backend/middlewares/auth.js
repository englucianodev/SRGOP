import jwt from 'jsonwebtoken';
import { Session, User, SystemSetting, Attendance } from '../models/index.js';
import { AppError, asyncRoute } from '../utils/errors.js';
import { audit } from '../services/audit.js';
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
  const session = await Session.findById(payload.sid);
  const settings = await SystemSetting.findOne({ key: 'general' });
  if (
    !session ||
    String(session.user) !== payload.sub ||
    +session.expiresAt <= Date.now() ||
    Date.now() - +session.lastActivity >= (settings?.inactivityMinutes || 5) * 60000
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
  const user = await User.findById(payload.sub).populate('city', 'name');
  if (!user?.active)
    throw new AppError('Usuário inativo ou aguardando aprovação.', 401, 'Autenticação');
  return { user, session };
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
  const attending = await Attendance.exists({ acceptedBy: req.user._id, status: 'Em atendimento' });
  const essentialRead =
    req.method === 'GET' &&
    /^\/(attendances|occurrences|attachments|crews|crew-messages|notifications|dashboard|cities|settings)(\/|$)/.test(
      req.path,
    );
  const essentialWrite =
    /^\/(attendances|occurrences|notifications|crew-messages)(\/|$)/.test(req.path) ||
    (req.method === 'PATCH' && /^\/vehicles\/[^/]+\/location$/.test(req.path));
  if (attending && !essentialRead && !essentialWrite)
    throw new AppError(
      'Conclua seu atendimento antes de acessar funções secundárias.',
      409,
      'Atendimento ativo',
    );
  next();
});
