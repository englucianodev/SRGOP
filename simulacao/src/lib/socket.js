import { io } from 'socket.io-client';
import { config } from '../config.js';

/** Real-time connection of one simulated person, authenticated by the session cookie. */
export function connectSocket({ api, handlers = {} }) {
  const socket = io(config.apiUrl, {
    transports: ['websocket'],
    extraHeaders: { cookie: `srgop_session=${api.cookie}`, 'x-simulation-token': config.bypassToken },
    reconnectionDelay: 5000,
    reconnectionDelayMax: 60000,
    timeout: 20000,
  });
  let reported = false;
  socket.on('connect', () => {
    if (reported)
      api.collector.event({ ...api.context, severity: 'baixo', category: 'tempo-real', message: 'Conexão em tempo real restabelecida.' });
    reported = false;
  });
  socket.on('connect_error', (error) => {
    if (reported) return;
    reported = true;
    api.collector.event({ ...api.context, severity: 'medio', category: 'tempo-real', message: `Falha ao conectar em tempo real (Socket.IO): ${error.message}` });
  });
  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect' || reported) return;
    reported = true;
    api.collector.event({ ...api.context, severity: reason === 'io server disconnect' ? 'alto' : 'medio', category: 'tempo-real', message: `Conexão em tempo real caiu (${reason}).` });
  });
  for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
  return socket;
}
