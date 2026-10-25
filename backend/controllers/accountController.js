import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { User, Session, ProfilePhoto } from '../models/index.js';
import { transaction } from '../services/operations.js';
import { audit } from '../services/audit.js';
import { changed, disconnectUser, serviceChanged } from '../services/realtime.js';
import { requireValue } from '../utils/errors.js';

export async function update(req, res) {
  await transaction(async (session) => {
    const user = await User.findById(req.user._id).select('+password').session(session);
    const { currentPassword, ...input } = req.input;
    if (input.email.toLowerCase() !== user.email)
      requireValue(
        currentPassword && (await bcrypt.compare(currentPassword, user.password)),
        'Informe a senha atual para alterar o e-mail.',
        422,
      );
    Object.assign(user, input);
    await user.save({ session });
    await audit(user, 'Atualização da própria conta', 'User', user._id, '', session);
  });
  changed('users', [req.user._id]);
  if (req.user.role === 'Oficial') serviceChanged();
  res.json({ user: await User.findById(req.user._id).populate('city', 'name') });
}
export async function password(req, res) {
  await transaction(async (session) => {
    const user = await User.findById(req.user._id).select('+password').session(session);
    requireValue(
      await bcrypt.compare(req.input.currentPassword, user.password),
      'Senha atual incorreta.',
      422,
    );
    requireValue(
      req.input.currentPassword !== req.input.password,
      'Escolha uma senha diferente da atual.',
      422,
    );
    user.password = await bcrypt.hash(req.input.password, 12);
    await user.save({ session });
    await Session.deleteMany({ user: user._id }, { session });
    await audit(
      user,
      'Alteração da própria senha',
      'User',
      user._id,
      'Sessões revogadas.',
      session,
    );
  });
  res.json({ message: 'Senha alterada. Entre novamente com a nova senha.' });
  disconnectUser(req.user._id);
}
export async function photo(req, res) {
  const photo = await ProfilePhoto.findOne({ user: req.user._id }).select('+data');
  requireValue(photo, 'Foto não cadastrada.', 404);
  res
    .set({
      'Content-Type': photo.mime,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    })
    .send(photo.data);
}
export async function savePhoto(req, res) {
  requireValue(req.file, 'Selecione uma foto JPEG ou PNG de até 2 MB.', 422);
  const bytes = req.file.buffer;
  const png =
    bytes.length >= 45 &&
    bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' &&
    bytes.subarray(12, 16).toString() === 'IHDR' &&
    bytes.subarray(-8, -4).toString() === 'IEND';
  const jpeg =
    bytes.length > 20 &&
    bytes.subarray(0, 3).toString('hex') === 'ffd8ff' &&
    bytes.subarray(-2).toString('hex') === 'ffd9';
  requireValue(png || jpeg, 'Formato de foto inválido. Envie JPEG ou PNG.', 422);
  if (png)
    requireValue(
      bytes.readUInt32BE(16) > 0 &&
        bytes.readUInt32BE(16) <= 4096 &&
        bytes.readUInt32BE(20) > 0 &&
        bytes.readUInt32BE(20) <= 4096,
      'A foto excede as dimensões permitidas.',
      422,
    );
  await transaction(async (session) => {
    await ProfilePhoto.findOneAndUpdate(
      { user: req.user._id },
      { data: bytes, mime: png ? 'image/png' : 'image/jpeg' },
      { upsert: true, session, runValidators: true },
    );
    await User.updateOne({ _id: req.user._id }, { avatarVersion: randomUUID() }, { session });
    await audit(req.user, 'Foto de perfil atualizada', 'User', req.user._id, '', session);
  });
  changed('users', [req.user._id]);
  res.json({ user: await User.findById(req.user._id).populate('city', 'name') });
}
export async function removePhoto(req, res) {
  await transaction(async (session) => {
    await ProfilePhoto.deleteOne({ user: req.user._id }, { session });
    await User.updateOne({ _id: req.user._id }, { avatarVersion: '' }, { session });
    await audit(req.user, 'Foto de perfil removida', 'User', req.user._id, '', session);
  });
  changed('users', [req.user._id]);
  res.json({ user: await User.findById(req.user._id).populate('city', 'name') });
}
