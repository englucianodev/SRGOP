import { randomUUID } from 'node:crypto';
import { SystemSetting, InstitutionLogo } from '../models/index.js';
import { transaction } from '../services/operations.js';
import { audit } from '../services/audit.js';
import { changed, serviceChanged } from '../services/realtime.js';
import { requireValue } from '../utils/errors.js';
export async function metadata(req, res) {
  const settings = await SystemSetting.findOne({ key: 'general' }).select(
    'institution logoVersion -_id',
  );
  res.json({
    institution: settings?.institution || '18º Batalhão de Polícia Militar',
    logoVersion: settings?.logoVersion || '',
  });
}
export async function logo(req, res) {
  const record = await InstitutionLogo.findOne({ key: 'general' }).select('+data');
  requireValue(record, 'Logo institucional não cadastrada.', 404);
  res
    .set({
      'Content-Type': record.mime,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'public, max-age=3600',
    })
    .send(record.data);
}
export async function upload(req, res) {
  requireValue(req.file, 'Selecione uma logo JPEG ou PNG de até 2 MB.', 422);
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
  requireValue(png || jpeg, 'Formato de logo inválido. Envie JPEG ou PNG.', 422);
  if (png)
    requireValue(
      bytes.readUInt32BE(16) > 0 &&
        bytes.readUInt32BE(16) <= 4096 &&
        bytes.readUInt32BE(20) > 0 &&
        bytes.readUInt32BE(20) <= 4096,
      'A logo excede as dimensões permitidas.',
      422,
    );
  await transaction(async (session) => {
    await InstitutionLogo.findOneAndUpdate(
      { key: 'general' },
      { data: bytes, mime: png ? 'image/png' : 'image/jpeg' },
      { upsert: true, session, runValidators: true },
    );
    await SystemSetting.findOneAndUpdate(
      { key: 'general' },
      { logoVersion: randomUUID() },
      { upsert: true, session, runValidators: true },
    );
    await audit(
      req.user,
      'Logo institucional atualizada',
      'SystemSetting',
      null,
      'JPEG/PNG',
      session,
    );
  });
  changed('settings');
  serviceChanged();
  res.json(await SystemSetting.findOne({ key: 'general' }));
}
export async function remove(req, res) {
  await transaction(async (session) => {
    await InstitutionLogo.deleteOne({ key: 'general' }, { session });
    await SystemSetting.updateOne({ key: 'general' }, { logoVersion: '' }, { session });
    await audit(req.user, 'Logo institucional removida', 'SystemSetting', null, '', session);
  });
  changed('settings');
  serviceChanged();
  res.json(await SystemSetting.findOne({ key: 'general' }));
}
