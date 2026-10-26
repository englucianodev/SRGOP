import { activeDuty, onDuty } from '../utils/duty.js';
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { auth, allow, essentialOnly } from '../middlewares/auth.js';
import { schemas as s, validate as v, id } from '../middlewares/validation.js';
import { asyncRoute as a, AppError, requireValue } from '../utils/errors.js';
import * as authentication from '../controllers/authController.js';
import * as account from '../controllers/accountController.js';
import * as occurrence from '../controllers/occurrenceController.js';
import * as resource from '../controllers/resourceController.js';
import * as chat from '../controllers/chatController.js';
import * as gps from '../controllers/gpsController.js';
import * as inspections from '../controllers/inspectionController.js';
import * as emergency from '../controllers/emergencyController.js';
import { reports } from '../controllers/reportController.js';
import { crewReports } from '../controllers/crewReportController.js';
import { vehicleReports } from '../controllers/vehicleReportController.js';
import {
  dispatchOccurrence,
  acceptOccurrence,
  rejectOccurrence,
  closeOccurrence,
  joinCrew,
  endShift,
  authorizeSupport,
} from '../services/operations.js';
import {
  City,
  Occurrence,
  Dispatch,
  SupportRequest,
  Crew,
  CrewMessage,
  VehicleHandover,
} from '../models/index.js';
import { manageMember, setAvailability, sendCrewMessage } from '../services/crewManagement.js';
import { provisionDefaultFleet } from '../services/defaultFleet.js';
import { requireDriverReturn } from '../services/vehicleInspections.js';
import { transaction } from '../services/operations.js';
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
router.put('/auth/me', v(s.account), a(account.update));
router.post('/auth/me/password', authLimit, v(s.ownPassword), a(account.password));
router.get('/auth/me/photo', a(account.photo));
router.put(
  '/auth/me/photo',
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  }).single('photo'),
  a(account.savePhoto),
);
router.delete('/auth/me/photo', a(account.removePhoto));
router.get('/service-cpu', a(resource.cpu));
router.get('/vehicle-checklists/pending', a(inspections.pending));
router.get('/vehicle-checklists/defaults', a(inspections.defaults));
router.post('/vehicle-checklists/:id', v(s.inspection), a(inspections.complete));
router.post('/auth/activity', a(authentication.activity));
router.post('/auth/logout', a(authentication.logout));
router.use(essentialOnly);
router.get('/dashboard', a(resource.dashboard));
router.get(
  '/cities',
  a(async (req, res) => res.json(await City.find({ deleted: { $ne: true } }).sort({ name: 1 }))),
);
router.post('/cities', admin, v(s.city), a(resource.saveCity));
router.put('/cities/:id', admin, v(s.city), a(resource.saveCity));
router.delete('/cities/:id', admin, a(resource.removeCity));
router.get('/emergencies', a(emergency.list));
router.post('/emergencies', v(s.emergency), a(emergency.create));
router.get('/emergencies/:id', a(emergency.detail));
router.post('/emergencies/:id/acknowledge', a(emergency.acknowledge));
router.post('/emergencies/:id/resolve', v(s.reason), a(emergency.resolve));
router.get('/users', management, a(resource.listUsers));
router.post('/users', admin, v(s.user), a(resource.saveUser));
router.put('/users/:id', admin, v(s.user), a(resource.saveUser));
router.delete('/users/:id', admin, a(resource.removeUser));
router.get('/occurrences', a(occurrence.list));
router.get('/occurrences/map', a(occurrence.mapPoints));
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
    const crew = req.user.crew ? await Crew.findOne({ _id: req.user.crew, ...activeDuty() }) : null;
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
router.get('/crews/:id/motorcycles', a(resource.motorcycles));
router.patch('/crews/:id/gps', v(s.gps), a(gps.location));
router.get('/crew-chats', a(chat.list));
router.post('/crew-chats', v(s.chat), a(chat.create));
router.post('/crew-chats/:id/crews', v(s.chatCrews), a(chat.addCrews));
router.post('/crew-chats/:id/access', admin, v(s.chatAccess), a(chat.access));
router.get('/crew-chats/:id/messages', a(chat.messages));
router.post('/crew-chats/:id/messages', v(s.chatText), a(chat.send));
router.post('/crews', admin, v(s.crew), a(resource.saveCrew));
router.put('/crews/:id', admin, v(s.crew), a(resource.saveCrew));
router.delete('/crews/:id', admin, a(resource.removeCrew));
router.post(
  '/crews/:id/join',
  v(s.join),
  a(async (req, res) =>
    res.json(await joinCrew(req.user, req.params.id, req.input.driver, req.input)),
  ),
);
router.post(
  '/crews/:id/leave',
  v(s.motorcycleLeave),
  a(async (req, res) => {
    const crew = await Crew.findOne({
      _id: req.params.id,
      members: req.user._id,
      shiftMode: 'Motocicleta',
      ...activeDuty(),
    });
    requireValue(
      crew,
      'Somente integrantes em serviço de motocicleta podem encerrar o próprio serviço.',
      403,
    );
    requireValue(
      (await VehicleHandover.countDocuments({
        crew: crew._id,
        driver: req.user._id,
        closedAt: null,
      })) === 0 ||
        req.input.checklist ||
        req.input.checklists?.length,
      'O motorista deve preencher o checklist de entrega.',
      422,
    );
    res.json(
      await manageMember(req.user, crew._id, {
        member: String(req.user._id),
        action: 'Saída',
        reason: 'Encerramento voluntário do serviço de motocicleta.',
        checklist: req.input.checklist,
        checklists: req.input.checklists,
      }),
    );
  }),
);
router.post(
  '/crews/:id/driver-return',
  a(async (req, res) => {
    await transaction(async (session) => {
      const crew = await Crew.findOne({
        _id: req.params.id,
        driver: req.user._id,
        members: req.user._id,
        ...activeDuty(),
      }).session(session);
      requireValue(crew, 'Somente o motorista em serviço pode registrar a entrega.', 403);
      await requireDriverReturn(crew, 'Entrega solicitada pelo motorista.', session);
      await crew.save({ session });
    });
    res.json({ message: 'Preencha o checklist obrigatório de entrega.' });
  }),
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
  a(async (req, res) => {
    requireValue(
      req.user.role !== 'Administrativo',
      'A consulta administrativa exige justificativa. Utilize o chat com acesso auditado.',
      403,
    );
    const crew = await Crew.findOne({ members: req.user._id, ...activeDuty() });
    res.json(
      await CrewMessage.find(
        crew
          ? {
              participants: req.user._id,
              $or: [{ sourceCrew: crew._id }, { targetCrew: crew._id }],
            }
          : { _id: null },
      )
        .populate('sender', 'name')
        .populate('sourceCrew targetCrew', 'name')
        .sort({ createdAt: -1 })
        .limit(100),
    );
  }),
);
router.post(
  '/crew-messages',
  v(s.message),
  a(async (req, res) => res.status(201).json(await sendCrewMessage(req.user, req.input))),
);
router.get('/vehicles', management, a(resource.listVehicles));
router.post(
  '/vehicles/provision-defaults',
  admin,
  a(async (req, res) => res.json(await provisionDefaultFleet(req.user))),
);
router.get('/vehicles/:id/checklists', management, a(inspections.history));
router.patch('/vehicles/:id/mileage', admin, v(s.mileage), a(resource.correctMileage));
router.post('/vehicles', admin, v(s.vehicle), a(resource.saveVehicle));
router.put('/vehicles/:id', admin, v(s.vehicle), a(resource.saveVehicle));
router.delete('/vehicles/:id', admin, a(resource.removeVehicle));
router.patch('/vehicles/:id/location', v(s.location), a(resource.location));
router.get('/reports', management, a(reports));
router.get('/reports/crews', management, a(crewReports));
router.get('/reports/vehicles', management, a(vehicleReports));
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
