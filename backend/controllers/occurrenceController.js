import { randomUUID } from 'node:crypto';
import {
  Occurrence,
  City,
  SystemSetting,
  Attachment,
  Attendance,
  SupportRequest,
  Crew,
} from '../models/index.js';
import { requireValue } from '../utils/errors.js';
import { dayRange } from '../utils/time.js';
import { audit } from '../services/audit.js';
import { changed } from '../services/realtime.js';
import { getOccurrence, history, transaction, canAttend } from '../services/operations.js';
import { id as idSchema } from '../middlewares/validation.js';
import { z } from 'zod';
export const populateOccurrence = (query) =>
  query
    .populate('city', 'name latitude longitude')
    .populate('crew', 'name')
    .populate('vehicle', 'prefix plate')
    .populate('createdBy acceptedBy', 'name')
    .populate('history.actor', 'name');
export function occurrenceFilter(query = {}) {
  const filter = { deleted: false };
  for (const key of ['city', 'crew', 'vehicle', 'createdBy'])
    if (query[key]) {
      requireValue(idSchema.safeParse(query[key]).success, `Filtro ${key} inválido.`, 422);
      filter[key] = query[key];
    }
  for (const key of ['priority', 'status', 'crimeType'])
    if (typeof query[key] === 'string' && query[key].length <= 100) filter[key] = query[key];
  if (query.from || query.to) {
    filter.occurredAt = {};
    if (query.from) {
      requireValue(z.iso.date().safeParse(query.from).success, 'Data inicial inválida.', 422);
      filter.occurredAt.$gte = dayRange(query.from).$gte;
    }
    if (query.to) {
      requireValue(z.iso.date().safeParse(query.to).success, 'Data final inválida.', 422);
      filter.occurredAt.$lt = dayRange(query.to).$lt;
    }
    requireValue(
      !query.from || !query.to || query.from <= query.to,
      'A data final deve ser igual ou posterior à data inicial.',
      422,
    );
  }
  if (typeof query.search === 'string' && query.search.trim()) {
    const escaped = query.search.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['protocol', 'description', 'address', 'crimeType'].map((k) => ({
      [k]: { $regex: escaped, $options: 'i' },
    }));
  }
  return filter;
}
export async function list(req, res) {
  const filter = occurrenceFilter(req.query);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const [items, total] = await Promise.all([
    populateOccurrence(
      Occurrence.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ),
    Occurrence.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}
export async function detail(req, res) {
  const row = await populateOccurrence(Occurrence.findOne({ _id: req.params.id, deleted: false }));
  requireValue(row, 'Ocorrência não encontrada.', 404);
  const [attachments, attendance, supports] = await Promise.all([
    Attachment.find({ occurrence: row._id }).select('-data'),
    Attendance.findOne({ occurrence: row._id }).populate('notes.actor', 'name'),
    SupportRequest.find({ occurrence: row._id })
      .populate('targetCrew', 'name')
      .populate('requestedBy', 'name'),
  ]);
  res.json({ ...row.toJSON(), attachments, attendance, supports });
}
async function references(input) {
  requireValue(
    await City.exists({ _id: input.city, active: true }),
    'Município não disponível.',
    422,
  );
  const settings = await SystemSetting.findOne({ key: 'general' });
  requireValue(
    settings?.crimeTypes.includes(input.crimeType),
    'Tipo de crime não cadastrado.',
    422,
  );
  requireValue(
    new Date(input.occurredAt).getTime() <= Date.now() + 60000,
    'Data e hora não podem estar no futuro.',
    422,
  );
  requireValue(
    (input.latitude === undefined) === (input.longitude === undefined),
    'Informe latitude e longitude juntas.',
    422,
  );
}
export async function create(req, res) {
  await references(req.input);
  const row = await transaction(async (session) => {
    const [created] = await Occurrence.create(
      [
        {
          ...req.input,
          protocol: `OP-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          createdBy: req.user._id,
          history: [history(req.user, 'Cadastro')],
        },
      ],
      { session },
    );
    await audit(req.user, 'Cadastro', 'Occurrence', created._id, created.protocol, session);
    return created;
  });
  changed('occurrences');
  res.status(201).json(row);
}
export async function update(req, res) {
  await references(req.input);
  const row = await transaction(async (session) => {
    const row = await getOccurrence(req.params.id, session);
    requireValue(
      req.user.role !== 'Praça' || String(row.createdBy) === String(req.user._id),
      'Praça pode alterar somente ocorrências que cadastrou.',
      403,
    );
    requireValue(
      !['Encerrada', 'Cancelada'].includes(row.status),
      'Ocorrências finalizadas preservam seu histórico e não podem ser editadas.',
      409,
    );
    const changes = Object.keys(req.input)
      .filter((k) => String(row[k]) !== String(req.input[k]))
      .map((k) => `${k}: ${String(row[k] ?? '—')} → ${String(req.input[k])}`)
      .join('; ');
    Object.assign(row, req.input);
    row.history.push(history(req.user, 'Alteração', changes));
    await row.save({ session });
    await audit(req.user, 'Edição', 'Occurrence', row._id, changes.slice(0, 1900), session);
    return row;
  });
  changed('occurrences', row.assignedMembers);
  res.json(row);
}
export async function remove(req, res) {
  const row = await transaction(async (session) => {
    const row = await getOccurrence(req.params.id, session);
    requireValue(
      ['Em aberto', 'Cancelada'].includes(row.status),
      'Somente ocorrências abertas ou canceladas podem ser excluídas.',
      409,
    );
    row.deleted = true;
    row.history.push(history(req.user, 'Exclusão lógica'));
    await row.save({ session });
    await audit(req.user, 'Exclusão lógica', 'Occurrence', row._id, '', session);
    return row;
  });
  changed('occurrences');
  res.json({ message: 'Ocorrência removida da listagem. Histórico preservado.', id: row._id });
}
export async function cancel(req, res) {
  const row = await transaction(async (session) => {
    const row = await getOccurrence(req.params.id, session);
    requireValue(
      row.status === 'Em aberto',
      'Apenas ocorrências em aberto podem ser canceladas.',
      409,
    );
    row.status = 'Cancelada';
    row.history.push(history(req.user, 'Cancelamento', req.input.reason));
    await row.save({ session });
    await audit(req.user, 'Cancelamento', 'Occurrence', row._id, req.input.reason, session);
    return row;
  });
  changed('occurrences');
  res.json(row);
}
export async function upload(req, res) {
  requireValue(req.file, 'Selecione um arquivo PDF, JPEG ou PNG de até 5 MB.', 422, 'Anexos');
  const file = req.file;
  const head = file.buffer.subarray(0, 8).toString('hex');
  const mime = head.startsWith('25504446')
    ? 'application/pdf'
    : head.startsWith('ffd8ff')
      ? 'image/jpeg'
      : head === '89504e470d0a1a0a'
        ? 'image/png'
        : null;
  requireValue(mime, 'Formato não permitido. Use PDF, JPEG ou PNG.', 422, 'Anexos');
  const attachment = await transaction(async (session) => {
    const row = await getOccurrence(req.params.id, session);
    requireValue(
      req.user.role !== 'Praça' ||
        String(row.createdBy) === String(req.user._id) ||
        String(row.acceptedBy) === String(req.user._id),
      'Você não pode anexar arquivos a esta ocorrência.',
      403,
    );
    requireValue(
      !['Encerrada', 'Cancelada'].includes(row.status),
      'Não é possível alterar ocorrências finalizadas.',
      409,
    );
    requireValue(
      (await Attachment.countDocuments({ occurrence: row._id }).session(session)) < 10,
      'Limite de dez anexos por ocorrência.',
      422,
    );
    const [saved] = await Attachment.create(
      [
        {
          occurrence: row._id,
          name: file.originalname.replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 200) || 'anexo',
          mime,
          data: file.buffer,
          size: file.size,
          uploadedBy: req.user._id,
        },
      ],
      { session },
    );
    row.history.push(history(req.user, 'Anexo adicionado', saved.name));
    await row.save({ session });
    await audit(req.user, 'Anexo', 'Occurrence', row._id, saved.name, session);
    return saved;
  });
  res.status(201).json({ _id: attachment._id, name: attachment.name });
}
export async function download(req, res) {
  const row = await Attachment.findById(req.params.id).select('+data');
  requireValue(row, 'Anexo não encontrado.', 404);
  await getOccurrence(row.occurrence);
  res
    .set({
      'Content-Type': row.mime,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      'Cache-Control': 'no-store',
    })
    .send(row.data);
}
export async function note(req, res) {
  await transaction(async (session) => {
    const row = await getOccurrence(req.params.id, session);
    await canAttend(req.user, row, session);
    requireValue(row.status === 'Em atendimento', 'Atendimento não está ativo.', 409);
    await Attendance.updateOne(
      { occurrence: row._id },
      { $push: { notes: { text: req.input.text, actor: req.user._id } } },
      { session, runValidators: true },
    );
    row.history.push(history(req.user, 'Observação', req.input.text));
    await row.save({ session });
    await audit(
      req.user,
      'Observação',
      'Occurrence',
      row._id,
      req.input.text.slice(0, 1900),
      session,
    );
  });
  changed('occurrences');
  res.json({ message: 'Observação registrada.' });
}
export async function support(req, res) {
  const result = await transaction(async (session) => {
    const row = await getOccurrence(req.params.id, session);
    await canAttend(req.user, row, session);
    requireValue(
      row.status === 'Em atendimento',
      'Aceite a ocorrência antes de solicitar apoio.',
      409,
    );
    requireValue(String(row.crew) !== req.input.targetCrew, 'Selecione outra guarnição.');
    requireValue(
      await Crew.exists({
        _id: req.input.targetCrew,
        status: 'Disponível',
        shiftEnd: { $gt: new Date() },
      }).session(session),
      'Guarnição não está disponível.',
      409,
    );
    requireValue(
      !(await SupportRequest.exists({
        occurrence: row._id,
        targetCrew: req.input.targetCrew,
        status: { $in: ['Pendente', 'Autorizado'] },
      }).session(session)),
      'Já existe um pedido de apoio para esta guarnição.',
      409,
    );
    const [support] = await SupportRequest.create(
      [{ ...req.input, occurrence: row._id, requestedBy: req.user._id }],
      { session },
    );
    row.history.push(history(req.user, 'Apoio solicitado', req.input.reason));
    await row.save({ session });
    await audit(req.user, 'Solicitação de apoio', 'Occurrence', row._id, req.input.reason, session);
    return support;
  });
  changed('support');
  res.status(201).json(result);
}
