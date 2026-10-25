import { Server } from 'socket.io';
import { authenticateToken } from '../middlewares/auth.js';
import { Notification, Crew, User } from '../models/index.js';
let io;
export function configureSocket(server, origins) {
  io = new Server(server, {
    cors: { origin: origins, credentials: true },
    allowRequest: (req, cb) =>
      cb(null, !req.headers.origin || origins.includes(req.headers.origin)),
  });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.headers.cookie
        ?.split('; ')
        .find((v) => v.startsWith('srgop_session='))
        ?.slice(14);
      socket.identity = await authenticateToken(token);
      socket.token = token;
      next();
    } catch (e) {
      next(new Error(e.message));
    }
  });
  io.on('connection', (socket) => {
    const user = socket.identity.user;
    socket.join(`user:${user._id}`);
    socket.join(`session:${socket.identity.session._id}`);
    if (['Oficial', 'Administrativo'].includes(user.role)) socket.join('command');
    const timer = setInterval(async () => {
      try {
        const current = await authenticateToken(socket.token);
        if (current.user.role !== user.role) socket.disconnect(true);
      } catch {
        socket.disconnect(true);
      }
    }, 15000);
    socket.on('disconnect', () => clearInterval(timer));
  });
  return io;
}
export function disconnectUser(userId) {
  io?.in(`user:${userId}`).disconnectSockets(true);
}
export function disconnectSession(sessionId) {
  io?.in(`session:${sessionId}`).disconnectSockets(true);
}
export function changed(kind = 'data', users = []) {
  io?.to('command').emit('data:changed', { kind });
  users.forEach((id) => io?.to(`user:${id}`).emit('data:changed', { kind }));
}
export async function queueCrewNotifications(
  crewId,
  occurrence,
  session,
  kind = 'despacho',
  message = 'Nova ocorrência encaminhada à sua guarnição.',
) {
  const crew = await Crew.findById(crewId).session(session);
  if (!crew || !crew.shiftEnd || +crew.shiftEnd <= Date.now()) return [];
  const members = await User.find({ _id: { $in: crew.members }, active: true, crew: crew._id })
    .select('_id')
    .session(session);
  return Notification.insertMany(
    members.map((u) => ({
      user: u._id,
      title: kind === 'apoio' ? 'Apoio autorizado' : 'Novo despacho',
      message,
      occurrence: occurrence._id,
      kind,
    })),
    { session },
  );
}
export function deliverNotifications(rows) {
  for (const row of rows) {
    io?.to(`user:${row.user}`).emit('notification', row);
    io?.to(`user:${row.user}`).emit('dispatch:new', {
      occurrenceId: row.occurrence,
      kind: row.kind,
    });
  }
}
export function attendanceChanged(occurrence) {
  occurrence.assignedMembers.forEach((id) =>
    io
      ?.to(`user:${id}`)
      .emit('attendance:changed', { occurrenceId: occurrence._id, status: occurrence.status }),
  );
  changed('occurrences', occurrence.assignedMembers);
}
