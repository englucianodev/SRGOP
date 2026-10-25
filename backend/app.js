import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import routes from './routes/index.js';
import { errorHandler } from './middlewares/errors.js';
import { AppError } from './utils/errors.js';
export const allowedOrigins = () =>
  (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim());
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) =>
        cb(
          origin && !allowedOrigins().includes(origin)
            ? new AppError('Origem não autorizada.', 403, 'CORS')
            : null,
          true,
        ),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.cookies.srgop_session &&
      !allowedOrigins().includes(req.headers.origin)
    )
      return next(new AppError('Origem da requisição não autorizada.', 403, 'Proteção CSRF'));
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        message: 'Limite de requisições atingido. Aguarde um minuto.',
        origin: 'API',
        redirect: '/dashboard',
      },
    }),
    routes,
  );
  app.use((req, res, next) => next(new AppError('Endereço não encontrado.', 404, 'Servidor')));
  app.use(errorHandler);
  return app;
}
