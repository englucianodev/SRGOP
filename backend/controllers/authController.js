import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, City, Session } from '../models/index.js';
import { getGeneralSettings } from '../services/settingsCache.js';
import { requireValue } from '../utils/errors.js';
import { audit } from '../services/audit.js';
import { disconnectSession } from '../services/realtime.js';
import { inactivityPolicy, SESSION_MAX_MS, SESSION_DEFAULT_MS } from '../services/sessionPolicy.js';
import {
  assertLoginAllowed,
  registerLoginFailure,
  clearLoginFailures,
} from '../services/loginThrottle.js';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.COOKIE_SAME_SITE || 'lax',
  path: '/',
});
const REGISTER_MESSAGE = 'Cadastro recebido. Aguarde a aprovação do Administrativo para entrar.';
// Compared against when the e-mail does not exist, so response time does not reveal accounts.
const DUMMY_HASH = bcrypt.hashSync('srgop-conta-inexistente', 12);
export async function register(req, res) {
  const v = req.input;
  requireValue(
    await City.exists({ _id: v.city, active: true }),
    'Município não está disponível.',
    422,
  );
  // Same answer for an existing e-mail, so registration does not reveal accounts.
  if (await User.exists({ email: v.email.toLowerCase() })) {
    await bcrypt.hash(v.password, 12);
    return res.status(201).json({ message: REGISTER_MESSAGE });
  }
  const user = await User.create({
    callSign: v.callSign,
    rank: v.rank,
    serviceNumber: v.serviceNumber,
    registration: v.registration,
    phone: v.phone,
    name: v.name,
    email: v.email,
    password: await bcrypt.hash(v.password, 12),
    city: v.city,
    role: 'Praça',
    requestedRole: v.role,
    active: false,
  });
  await audit(user, 'Cadastro solicitado', 'User', user._id);
  res.status(201).json({ message: REGISTER_MESSAGE });
}
export async function login(req, res) {
  const email = req.input.email.toLowerCase();
  await assertLoginAllowed(email);
  const user = await User.findOne({ email }).select('+password');
  const valid = await bcrypt.compare(req.input.password, user?.password || DUMMY_HASH);
  if (!user || !valid) await registerLoginFailure(email);
  requireValue(user && valid, 'E-mail ou senha incorretos.', 401, 'Login');
  requireValue(user.active, 'Cadastro aguardando aprovação ou desativado.', 403, 'Login');
  await clearLoginFailures(email);
  const lifetime = req.input.remember ? SESSION_MAX_MS : SESSION_DEFAULT_MS;
  const session = await Session.create({
    user: user._id,
    expiresAt: new Date(Date.now() + lifetime),
  });
  // The Session document decides when the login ends (12 h, 7 days or the end of the
  // shift); the token only carries the upper bound so a shift can extend the session.
  const token = jwt.sign({ sid: String(session._id) }, process.env.JWT_SECRET, {
    subject: String(user._id),
    expiresIn: Math.floor(SESSION_MAX_MS / 1000),
    issuer: 'srgop',
    audience: 'srgop-web',
  });
  await audit(user, 'Login', 'Session', session._id);
  res.cookie('srgop_session', token, {
    ...cookieOptions(),
    ...(req.input.remember ? { maxAge: lifetime } : {}),
  });
  const settings = await getGeneralSettings();
  res.json({
    user: await User.findById(user._id).populate('city', 'name'),
    settings,
    lastActivity: session.lastActivity,
    inactivityPolicy: await inactivityPolicy(user, settings),
  });
}
export async function me(req, res) {
  res.json({
    user: req.user,
    settings: await getGeneralSettings(),
    lastActivity: req.session.lastActivity,
    inactivityPolicy: req.inactivityPolicy,
  });
}
export async function activity(req, res) {
  // Clicking "Sair do sistema" also counts as activity, so this request can race the logout
  // and find its session already deleted; that is an ended session, not a server failure.
  const lastActivity = new Date();
  const { matchedCount } = await Session.updateOne({ _id: req.session._id }, { lastActivity });
  requireValue(matchedCount, 'Sessão encerrada. Entre novamente.', 401, 'Controle de sessão');
  res.json({ lastActivity, inactivityPolicy: req.inactivityPolicy });
}
export async function logout(req, res) {
  await req.session.deleteOne();
  await audit(req.user, 'Logout', 'Session', req.session._id);
  disconnectSession(req.session._id);
  res.clearCookie('srgop_session', cookieOptions()).json({ message: 'Sessão encerrada.' });
}
