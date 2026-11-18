import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { User, Session, PasswordReset } from '../models/index.js';
import { transaction } from '../services/operations.js';
import { audit } from '../services/audit.js';
import { disconnectUser } from '../services/realtime.js';
import { mailConfigured, sendMail } from '../services/mail.js';
import { clearLoginFailures } from '../services/loginThrottle.js';
import { AppError } from '../utils/errors.js';

const LINK_MINUTES = 30;
// A new link for the same account is not sent more often than this.
const COOLDOWN_MS = 2 * 60000;
const GENERIC_MESSAGE =
  'Se o e-mail estiver cadastrado e ativo, enviaremos as instruções para redefinir a senha.';
const hash = (token) => createHash('sha256').update(token).digest('hex');
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const appUrl = () =>
  (process.env.APP_URL || (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0])
    .trim()
    .replace(/\/+$/, '');

function resetMail(user, link) {
  const intro = `Recebemos um pedido para redefinir a senha da sua conta no SRGOP. O link vale por ${LINK_MINUTES} minutos e só pode ser usado uma vez.`;
  const outro =
    'Se você não fez este pedido, ignore este e-mail: sua senha continua a mesma. Nunca compartilhe este link.';
  return {
    to: { email: user.email, name: user.name },
    subject: 'SRGOP — redefinição de senha',
    text: `Olá, ${user.name}.\n\n${intro}\n\n${link}\n\n${outro}`,
    html: `<p>Olá, ${escapeHtml(user.name)}.</p><p>${intro}</p><p><a href="${escapeHtml(link)}">Redefinir minha senha</a></p><p>${outro}</p>`,
  };
}

async function issueReset(email) {
  const user = await User.findOne({ email: email.toLowerCase(), active: true });
  if (!user) return;
  const recent = await PasswordReset.exists({
    user: user._id,
    createdAt: { $gt: new Date(Date.now() - COOLDOWN_MS) },
  });
  if (recent) return;
  const token = randomBytes(32).toString('base64url');
  await PasswordReset.deleteMany({ user: user._id });
  await PasswordReset.create({
    user: user._id,
    tokenHash: hash(token),
    expiresAt: new Date(Date.now() + LINK_MINUTES * 60000),
  });
  // The token travels in the URL fragment, which browsers do not send to servers or logs.
  await sendMail(resetMail(user, `${appUrl()}/redefinir-senha#${token}`));
  await audit(user, 'Recuperação de senha solicitada', 'User', user._id);
}

/** What the login screen may offer before anyone is authenticated. */
export const options = (req, res) => res.json({ passwordRecovery: mailConfigured() });

export function forgot(req, res) {
  // Answered before any lookup, so neither the text nor the timing reveals an account.
  res.json({ message: GENERIC_MESSAGE });
  if (!mailConfigured()) return;
  issueReset(req.input.email).catch((error) =>
    console.error('[recuperação de senha]', error.message),
  );
}

export async function reset(req, res) {
  const invalid = new AppError(
    'Link inválido ou vencido. Solicite uma nova redefinição de senha.',
    422,
    'Recuperação de senha',
  );
  const row = await PasswordReset.findOne({
    tokenHash: hash(req.input.token),
    expiresAt: { $gt: new Date() },
  });
  if (!row) throw invalid;
  const password = await bcrypt.hash(req.input.password, 12);
  const userId = await transaction(async (session) => {
    const user = await User.findOne({ _id: row.user, active: true }).session(session);
    // Deleting inside the transaction makes a link usable only once, even if sent twice.
    const used = await PasswordReset.deleteOne({ _id: row._id }, { session });
    if (!user || !used.deletedCount) throw invalid;
    user.password = password;
    await user.save({ session });
    await Session.deleteMany({ user: user._id }, { session });
    await PasswordReset.deleteMany({ user: user._id }, { session });
    await clearLoginFailures(user.email, session);
    await audit(user, 'Senha redefinida por e-mail', 'User', user._id, 'Sessões revogadas.', session);
    return user._id;
  });
  disconnectUser(userId);
  res.json({ message: 'Senha redefinida. Entre com a nova senha.' });
}
