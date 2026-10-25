import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { auth, allow, essentialOnly } from '../middlewares/auth.js';
import { schemas as s, validate as v, id } from '../middlewares/validation.js';
import { asyncRoute as a, AppError, requireValue } from '../utils/errors.js';
import * as authentication from '../controllers/authController.js';
import * as occurrence from '../controllers/occurrenceController.js';
import * as resource from '../controllers/resourceController.js';
import { reports } from '../controllers/reportController.js';
import {
  dispatchOccurrence,
  acceptOccurrence,
  rejectOccurrence,
  closeOccurrence,
  joinCrew,
  endShift,
  authorizeSupport,
} from '../services/operations.js';
import { City, Occurrence, Dispatch, SupportRequest, Crew, CrewMessage } from '../models/index.js';
import { manageMember, setAvailability, sendCrewMessage } from '../services/crewManagement.js';
const router = Router();
const management = allow('Administrativo', 'Oficial');
const admin = allow('Administrativo');
const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: 'Muitas tentativas. Aguarde 15 minutos.',
    origin: 'Proteção de autenticação',
    redirect: '/dashboard',
  },
});
router.param('id', (req, res, next, value) =>
  id.safeParse(value).success
    ? next()
    : next(new AppError('Identificador inválido.', 422, 'Parâmetros da API')),
);
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'SRGOP' }));
router.get(
  '/auth/cities',
  a(async (req, res) =>
    res.json(await City.find({ active: true }).select('name').sort({ name: 1 })),
  ),
);
router.post('/auth/register', authLimit, v(s.register), a(authentication.register));
router.post('/auth/login', authLimit, v(s.login), a(authentication.login));
router.use(auth);
router.get('/auth/me', a(authentication.me));
router.post('/auth/activity', a(authentication.activity));
router.post('/auth/logout', a(authentication.logout));
router.use(essentialOnly);
router.get('/dashboard', a(resource.dashboard));
router.get(
  '/cities',
  a(async (req, res) => res.json(await City.find().sort({ name: 1 }))),
);
router.post('/cities', admin, v(s.city), a(resource.saveCity));
router.put('/cities/:id', admin, v(s.city), a(resource.saveCity));
router.get('/users', management, a(resource.listUsers));
router.post('/users', admin, v(s.user), a(resource.saveUser));
router.put('/users/:id', admin, v(s.user), a(resource.saveUser));
router.delete('/users/:id', admin, a(resource.removeUser));
router.get('/occurrences', a(occurrence.list));
router.post('/occurrences', v(s.occurrence), a(occurrence.create));
router.get('/occurrences/:id', a(occurrence.detail));
router.put('/occurrences/:id', v(s.occurrence), a(occurrence.update));
router.delete('/occurrences/:id', management, a(occurrence.remove));
router.post('/occurrences/:id/cancel', management, v(s.reason), a(occurrence.cancel));
router.post(
  '/occurrences/:id/attachments',
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }).single('file'),
  a(occurrence.upload),
);
router.get('/attachments/:id', a(occurrence.download));
router.get(
  '/dispatches',
  management,
  a(async (req, res) =>
    res.json(
      await Dispatch.find()
        .populate('occurrence crew', 'protocol name status')
        .populate('dispatchedBy', 'name')
        .sort({ createdAt: -1 })
        .limit(100),
    ),
  ),
);
router.post(
  '/dispatches',
  management,
  v(s.dispatch),
  a(async (req, res) => res.status(201).json(await dispatchOccurrence(req.user, req.input))),
);
router.get(
  '/attendances',
  a(async (req, res) => {
    const mine = req.user.role === 'Praça';
    const crew = req.user.crew
      ? await Crew.findOne({ _id: req.user.crew, shiftEnd: { $gt: new Date() } })
      : null;
    const supports = crew
      ? await SupportRequest.find({ targetCrew: crew._id, status: 'Autorizado' }).select(
          'occurrence',
        )
      : [];
    const filter = {
      deleted: false,
      status: { $in: ['Despachada', 'Em atendimento'] },
      ...(mine
        ? {
            $or: [
              { acceptedBy: req.user._id },
              ...(crew
                ? [{ crew: crew._id }, { _id: { $in: supports.map((s) => s.occurrence) } }]
                : []),
            ],
          }
        : {}),
    };
    res.json(
      await occurrence.populateOccurrence(Occurrence.find(filter).sort({ dispatchedAt: -1 })),
    );
  }),
);
router.post(
  '/attendances/:id/accept',
  a(async (req, res) => res.json(await acceptOccurrence(req.user, req.params.id))),
);
router.post(
  '/attendances/:id/reject',
  v(s.reason),
  a(async (req, res) =>
    res.json(await rejectOccurrence(req.user, req.params.id, req.input.reason)),
  ),
);
router.post(
  '/attendances/:id/close',
  v(s.close),
  a(async (req, res) => res.json(await closeOccurrence(req.user, req.params.id, req.input))),
);
router.post('/attendances/:id/notes', v(s.note), a(occurrence.note));
router.post('/attendances/:id/support', v(s.support), a(occurrence.support));
router.get(
  '/attendances/support/requests',
  a(async (req, res) =>
    res.json(
      await SupportRequest.find(req.user.role === 'Praça' ? { requestedBy: req.user._id } : {})
        .populate('occurrence', 'protocol')
        .populate('targetCrew', 'name')
        .populate('requestedBy', 'name')
        .sort({ createdAt: -1 })
        .limit(100),
    ),
  ),
);
router.post(
  '/attendances/support/:id/authorize',
  management,
  a(async (req, res) => res.json(await authorizeSupport(req.user, req.params.id, true))),
);
router.post(
  '/attendances/support/:id/reject',
  management,
  a(async (req, res) => res.json(await authorizeSupport(req.user, req.params.id, false))),
);
router.get('/crews', a(resource.listCrews));
router.post('/crews', admin, v(s.crew), a(resource.saveCrew));
router.put('/crews/:id', admin, v(s.crew), a(resource.saveCrew));
router.delete('/crews/:id', admin, a(resource.removeCrew));
router.post(
  '/crews/:id/join',
  v(s.join),
  a(async (req, res) => res.json(await joinCrew(req.user, req.params.id, req.input.driver))),
);
router.post(
  '/crews/:id/end-shift',
  management,
  v(s.reason),
  a(async (req, res) => res.json(await endShift(req.params.id, req.user, req.input.reason))),
);
router.post(
  '/crews/:id/members',
  management,
  v(s.member),
  a(async (req, res) => res.json(await manageMember(req.user, req.params.id, req.input))),
);
router.patch(
  '/crews/:id/availability',
  admin,
  v(s.availability),
  a(async (req, res) => res.json(await setAvailability(req.user, req.params.id, req.input))),
);
router.get(
  '/crew-messages',
  a(async (req, res) =>
    res.json(
      await CrewMessage.find(req.user.role === 'Praça' ? { participants: req.user._id } : {})
        .populate('sender', 'name')
        .populate('sourceCrew targetCrew', 'name')
        .sort({ createdAt: -1 })
        .limit(100),
    ),
  ),
);
router.post(
  '/crew-messages',
  v(s.message),
  a(async (req, res) => res.status(201).json(await sendCrewMessage(req.user, req.input))),
);
router.get('/vehicles', management, a(resource.listVehicles));
router.post('/vehicles', admin, v(s.vehicle), a(resource.saveVehicle));
router.put('/vehicles/:id', admin, v(s.vehicle), a(resource.saveVehicle));
router.delete('/vehicles/:id', admin, a(resource.removeVehicle));
router.patch('/vehicles/:id/location', v(s.location), a(resource.location));
router.get('/reports', management, a(reports));
router.get('/settings', a(resource.settings));
router.put('/settings', admin, v(s.settings), a(resource.saveSettings));
router.get('/cpu', management, a(resource.cpu));
router.post('/cpu', allow('Oficial'), a(resource.assumeCpu));
router.put('/cpu', admin, v(s.cpu), a(resource.updateCpu));
router.get('/notifications', a(resource.notifications));
router.patch('/notifications/:id/read', a(resource.markNotification));
router.get('/audit-logs', admin, a(resource.auditLogs));
router.use((req, res, next) =>
  next(new AppError('Rota não encontrada.', 404, 'Roteamento da API')),
);
export default router;
