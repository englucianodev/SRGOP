import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, City, Session, SystemSetting } from '../models/index.js';
import { requireValue } from '../utils/errors.js';
import { audit } from '../services/audit.js';
import { disconnectSession } from '../services/realtime.js';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.COOKIE_SAME_SITE || 'lax',
  path: '/',
});
export async function register(req, res) {
  const v = req.input;
  requireValue(
    await City.exists({ _id: v.city, active: true }),
    'Município não está disponível.',
    422,
  );
  const user = await User.create({
    name: v.name,
    email: v.email,
    password: await bcrypt.hash(v.password, 12),
    city: v.city,
    role: 'Praça',
    requestedRole: v.role,
    active: false,
  });
  await audit(user, 'Cadastro solicitado', 'User', user._id);
  res
    .status(201)
    .json({ message: 'Cadastro recebido. Aguarde a aprovação do Administrativo para entrar.' });
}
export async function login(req, res) {
  const user = await User.findOne({ email: req.input.email.toLowerCase() }).select('+password');
  requireValue(
    user && (await bcrypt.compare(req.input.password, user.password)),
    'E-mail ou senha incorretos.',
    401,
    'Login',
  );
  requireValue(user.active, 'Cadastro aguardando aprovação ou desativado.', 403, 'Login');
  const lifetime = req.input.remember ? 7 * 86400000 : 12 * 3600000;
  const session = await Session.create({
    user: user._id,
    expiresAt: new Date(Date.now() + lifetime),
  });
  const token = jwt.sign({ sid: String(session._id) }, process.env.JWT_SECRET, {
    subject: String(user._id),
    expiresIn: Math.floor(lifetime / 1000),
    issuer: 'srgop',
    audience: 'srgop-web',
  });
  await audit(user, 'Login', 'Session', session._id);
  res.cookie('srgop_session', token, {
    ...cookieOptions(),
    ...(req.input.remember ? { maxAge: lifetime } : {}),
  });
  res.json({
    user: await User.findById(user._id).populate('city', 'name'),
    settings: await SystemSetting.findOne({ key: 'general' }),
    lastActivity: session.lastActivity,
  });
}
export async function me(req, res) {
  res.json({
    user: req.user,
    settings: await SystemSetting.findOne({ key: 'general' }),
    lastActivity: req.session.lastActivity,
  });
}
export async function activity(req, res) {
  req.session.lastActivity = new Date();
  await req.session.save();
  res.json({ lastActivity: req.session.lastActivity });
}
export async function logout(req, res) {
  await req.session.deleteOne();
  await audit(req.user, 'Logout', 'Session', req.session._id);
  disconnectSession(req.session._id);
  res.clearCookie('srgop_session', cookieOptions()).json({ message: 'Sessão encerrada.' });
}
